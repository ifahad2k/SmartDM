using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class HttpProbeService : IHttpProbeService
{
    private readonly HttpClient _httpClient;

    public HttpProbeService(HttpClient? client = null, AppSettingsModel? settings = null)
    {
        if (client != null)
        {
            _httpClient = client;
        }
        else
        {
            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = true,
                MaxAutomaticRedirections = 10,
                PooledConnectionLifetime = TimeSpan.FromMinutes(15),
                EnableMultipleHttp2Connections = true
            };
            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(Math.Clamp(settings?.ConnectionTimeoutSeconds ?? 15, 1, 300))
            };
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        }
    }

    public Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken cancellationToken = default)
        => ProbeUrlAsync(url, null, null, null, cancellationToken);

    public async Task<ProbeResult> ProbeUrlAsync(string url, string? referer, string? userAgent, string? cookies, CancellationToken cancellationToken = default)
    {
        var result = new ProbeResult { Url = url };

        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            result.IsSuccess = false;
            result.ErrorMessage = "Invalid URL format.";
            return result;
        }

        var sw = Stopwatch.StartNew();
        HttpResponseMessage? response = null;

        string effectiveUa = !string.IsNullOrWhiteSpace(userAgent)
            ? userAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

        string? effectiveRef = !string.IsNullOrWhiteSpace(referer)
            ? referer
            : $"{uri.Scheme}://{uri.Authority}/";

        void ApplyHeaders(HttpRequestMessage req, string? rHeader)
        {
            req.Headers.TryAddWithoutValidation("User-Agent", effectiveUa);
            req.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,application/x-bittorrent,*/*;q=0.8");
            req.Headers.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9");
            if (!string.IsNullOrWhiteSpace(cookies))
            {
                string cookieVal = cookies;
                if (cookieVal.StartsWith("# Netscape", StringComparison.OrdinalIgnoreCase))
                {
                    var pairs = new List<string>();
                    foreach (var line in cookieVal.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        if (line.StartsWith("#") || string.IsNullOrWhiteSpace(line)) continue;
                        var parts = line.Split('\t');
                        if (parts.Length >= 7)
                        {
                            pairs.Add($"{parts[5]}={parts[6]}");
                        }
                    }
                    if (pairs.Count > 0) cookieVal = string.Join("; ", pairs);
                }
                req.Headers.TryAddWithoutValidation("Cookie", cookieVal);
            }
            if (!string.IsNullOrWhiteSpace(rHeader))
            {
                req.Headers.TryAddWithoutValidation("Referer", rHeader);
                try { req.Headers.TryAddWithoutValidation("Origin", new Uri(rHeader).GetLeftPart(UriPartial.Authority)); } catch { }
            }
        }

        try
        {
            // 1. Try HEAD request first
            using var headReq = HttpTransferRequest.Create(HttpMethod.Head, uri);
            ApplyHeaders(headReq, effectiveRef);
            headReq.Headers.AcceptEncoding.ParseAdd("identity");

            try
            {
                response = await _httpClient.SendAsync(headReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }
            catch (HttpRequestException)
            {
                // Head failed, try GET
            }

            // Verify advertised ranges with an actual one-byte GET. A server
            // may advertise bytes on HEAD but ignore Range on GET, or reject HEAD (e.g. 403 Forbidden on PHP scripts).
            bool usedRangeProbe = response == null || response.StatusCode == HttpStatusCode.MethodNotAllowed ||
                response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.NotFound ||
                (response.IsSuccessStatusCode && response.Headers.AcceptRanges.Contains("bytes"));
            if (usedRangeProbe)
            {
                response?.Dispose();
                using var getReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                ApplyHeaders(getReq, effectiveRef);
                getReq.Headers.Range = new RangeHeaderValue(0, 0);
                getReq.Headers.AcceptEncoding.ParseAdd("identity");
                try
                {
                    response = await _httpClient.SendAsync(getReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                }
                catch { }

                // Dynamic download scripts (e.g. download.php on TorrentBD) often return 403 or 400 when Range: bytes=0-0 is present.
                // Fall back to a standard GET without Range header, reading response headers only.
                if (response == null || !response.IsSuccessStatusCode)
                {
                    response?.Dispose();
                    using var fullGetReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                    ApplyHeaders(fullGetReq, effectiveRef);
                    fullGetReq.Headers.AcceptEncoding.ParseAdd("identity");
                    try
                    {
                        response = await _httpClient.SendAsync(fullGetReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                    }
                    catch { }
                }

                // If still 403/Forbidden, test site root origin referer fallback
                if (response != null && (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.Unauthorized))
                {
                    string siteRootRef = $"{uri.Scheme}://{uri.Authority}/";
                    if (!string.Equals(effectiveRef, siteRootRef, StringComparison.OrdinalIgnoreCase))
                    {
                        response.Dispose();
                        using var altGetReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                        ApplyHeaders(altGetReq, siteRootRef);
                        altGetReq.Headers.AcceptEncoding.ParseAdd("identity");
                        try
                        {
                            response = await _httpClient.SendAsync(altGetReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                        }
                        catch { }
                    }
                }
            }

            if (response == null) throw new HttpRequestException("Server returned no probe response.");
            sw.Stop();
            result.LatencyMs = sw.ElapsedMilliseconds;
            result.StatusCode = (int)response.StatusCode;

            if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.PartialContent)
            {
                result.IsSuccess = false;
                result.ErrorMessage = $"Server returned {(int)response.StatusCode} {response.ReasonPhrase}";
                return result;
            }

            result.IsSuccess = true;
            result.HttpVersion = response.Version switch
            {
                { Major: 3 } => "HTTP/3",
                { Major: 2 } => "HTTP/2 ALPN",
                _ => "HTTP/1.1"
            };

            // Range support
            bool isPartialContent = response.StatusCode == HttpStatusCode.PartialContent;
            var contentRange = response.Content.Headers.ContentRange;
            if (isPartialContent && (!usedRangeProbe || contentRange?.Unit != "bytes" ||
                contentRange.From != 0 || contentRange.To != 0 || contentRange.Length is not > 0))
            {
                result.IsSuccess = false;
                result.ErrorMessage = "Server returned an invalid one-byte range probe response.";
                return result;
            }
            result.AcceptsRanges = usedRangeProbe && isPartialContent;

            // Content length
            if (response.Content.Headers.ContentRange?.Length.HasValue == true)
            {
                result.TotalBytes = response.Content.Headers.ContentRange.Length.Value;
            }
            else if (response.Content.Headers.ContentLength.HasValue && response.StatusCode != HttpStatusCode.PartialContent)
            {
                result.TotalBytes = response.Content.Headers.ContentLength.Value;
            }
            else
            {
                result.TotalBytes = -1;
            }

            // MIME type
            result.MimeType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";

            // ETag
            result.ETag = response.Headers.ETag?.ToString() ?? string.Empty;
            result.LastModified = response.Content.Headers.LastModified?.ToString("R");

            // Filename extraction
            string? extractedName = ExtractFileNameFromContentDisposition(response);

            // Fallback 1: Extract from URL path basename or query parameters if Content-Disposition is absent or generic
            if (string.IsNullOrWhiteSpace(extractedName) || IsGenericName(extractedName))
            {
                string? urlExtracted = ExtractFileNameFromUrl(uri);
                if (!string.IsNullOrWhiteSpace(urlExtracted) && !IsGenericName(urlExtracted))
                {
                    extractedName = urlExtracted;
                }
            }

            // Fallback 2: For HTML/video site pages, attempt HTML title extraction
            if (string.IsNullOrWhiteSpace(extractedName) || IsGenericName(extractedName))
            {
                if (result.MimeType.Contains("text/html") || uri.Host.Contains("youtube.com") || uri.Host.Contains("youtu.be") || uri.Host.Contains("bilibili.com") || uri.Host.Contains("tiktok.com"))
                {
                    try
                    {
                        using var getTitleReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                        getTitleReq.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                        using var htmlResp = await _httpClient.SendAsync(getTitleReq, HttpCompletionOption.ResponseContentRead, cancellationToken);
                        if (htmlResp.IsSuccessStatusCode)
                        {
                            string html = await htmlResp.Content.ReadAsStringAsync(cancellationToken);
                            string pageTitle = ExtractTitleFromHtml(html);
                            if (!string.IsNullOrWhiteSpace(pageTitle))
                            {
                                string ext = GetExtensionFromMimeType(result.MimeType);
                                if (uri.Host.Contains("youtube.com") || uri.Host.Contains("youtu.be") || uri.Host.Contains("bilibili.com") || uri.Host.Contains("tiktok.com"))
                                {
                                    if (ext == ".bin" || ext == ".html") ext = ".mp4";
                                }
                                else if (ext == ".bin")
                                {
                                    ext = ".html";
                                }
                                extractedName = pageTitle + ext;
                            }
                        }
                    }
                    catch { }
                }
            }

            // Fallback 3: Inferred name with extension from MIME type
            if (string.IsNullOrWhiteSpace(extractedName) || IsGenericName(extractedName))
            {
                string ext = GetExtensionFromMimeType(result.MimeType);
                extractedName = $"download_{DateTime.UtcNow:yyyyMMdd_HHmmss}{ext}";
            }
            else
            {
                // Ensure filename has an appropriate extension if missing
                string existingExt = Path.GetExtension(extractedName);
                if (string.IsNullOrEmpty(existingExt))
                {
                    string ext = GetExtensionFromMimeType(result.MimeType);
                    extractedName += ext;
                }
            }

            result.FileName = SanitizeFileName(extractedName);
            result.SuggestedCategory = DetectCategory(result.FileName, result.MimeType);
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.LatencyMs = sw.ElapsedMilliseconds;
            result.IsSuccess = false;
            result.ErrorMessage = ex.Message;
        }
        finally
        {
            response?.Dispose();
        }

        return result;
    }

    public static string? ExtractFileNameFromContentDisposition(HttpResponseMessage response)
    {
        string? extracted = null;
        try
        {
            if (response.Content.Headers.ContentDisposition != null)
            {
                extracted = response.Content.Headers.ContentDisposition.FileNameStar
                         ?? response.Content.Headers.ContentDisposition.FileName;
            }
        }
        catch { }

        if (string.IsNullOrWhiteSpace(extracted))
        {
            // Fallback to raw header value parsing
            if (response.Content.Headers.TryGetValues("Content-Disposition", out var values))
            {
                string raw = string.Join(";", values);
                // RFC 5987 filename*=UTF-8''filename.ext
                var matchStar = Regex.Match(raw, @"filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)", RegexOptions.IgnoreCase);
                if (matchStar.Success)
                {
                    extracted = Uri.UnescapeDataString(matchStar.Groups[1].Value.Trim().Trim('\"', '\''));
                }
                else
                {
                    // filename="quoted" or filename=unquoted
                    var matchFn = Regex.Match(raw, @"filename\s*=\s*(?:""([^""]+)""|'([^']+)'|([^;]+))", RegexOptions.IgnoreCase);
                    if (matchFn.Success)
                    {
                        extracted = (matchFn.Groups[1].Success ? matchFn.Groups[1].Value
                                   : matchFn.Groups[2].Success ? matchFn.Groups[2].Value
                                   : matchFn.Groups[3].Value).Trim();
                    }
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(extracted))
        {
            extracted = extracted.Trim('\"', '\'').Trim();
            try { extracted = Uri.UnescapeDataString(extracted); } catch { }
        }

        return string.IsNullOrWhiteSpace(extracted) ? null : extracted;
    }

    public static string? ExtractFileNameFromUrl(Uri uri)
    {
        if (uri == null) return null;

        bool isTorrentContext = uri.Host.Contains("torrent", StringComparison.OrdinalIgnoreCase) ||
                                uri.AbsolutePath.Contains("torrent", StringComparison.OrdinalIgnoreCase) ||
                                uri.Query.Contains("torrent", StringComparison.OrdinalIgnoreCase);

        // 1. Check query parameters e.g. ?filename=setup.exe or ?file=installer.msi or ?name=sintel.torrent
        if (!string.IsNullOrWhiteSpace(uri.Query))
        {
            try
            {
                var queryParams = HttpUtility.ParseQueryString(uri.Query);
                foreach (string key in new[] { "filename", "file", "name", "fn", "path", "attachment" })
                {
                    string? val = queryParams[key];
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        string candidate = Path.GetFileName(val.Trim().Trim('\"', '\''));
                        if (!string.IsNullOrWhiteSpace(candidate) && !IsGenericName(candidate) && Path.HasExtension(candidate))
                        {
                            try { candidate = Uri.UnescapeDataString(candidate); } catch { }
                            return candidate;
                        }
                    }
                }

                // If in torrent context and has id e.g. download.php?id=1338395
                string? id = queryParams["id"] ?? queryParams["tid"] ?? queryParams["torrent_id"];
                if (!string.IsNullOrWhiteSpace(id) && (isTorrentContext || uri.AbsolutePath.EndsWith(".php", StringComparison.OrdinalIgnoreCase)))
                {
                    return $"torrent_{id.Trim()}.torrent";
                }
            }
            catch { }
        }

        // 2. Basename of AbsolutePath
        try
        {
            string absPath = uri.AbsolutePath;
            string pathBaseName = Path.GetFileName(absPath);
            if (!string.IsNullOrWhiteSpace(pathBaseName) && !IsGenericName(pathBaseName))
            {
                string ext = Path.GetExtension(pathBaseName).ToLowerInvariant();
                if (ext is not (".php" or ".asp" or ".aspx" or ".jsp" or ".cgi" or ".html" or ".htm"))
                {
                    try { pathBaseName = Uri.UnescapeDataString(pathBaseName); } catch { }
                    return pathBaseName;
                }
            }

            if (isTorrentContext)
            {
                return "download.torrent";
            }
        }
        catch { }

        return null;
    }

    public string? InferFileNameFromUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return null;
        }

        string? candidate = ExtractFileNameFromUrl(uri);
        if (!string.IsNullOrWhiteSpace(candidate))
        {
            return SanitizeFileName(candidate);
        }
        return null;
    }

    public string SanitizeFileName(string rawFileName)
    {
        if (string.IsNullOrWhiteSpace(rawFileName)) return "download.dat";
        string clean = rawFileName.Trim().Trim('\"', '\'');
        // Decode once, then enforce basename rules on the decoded value.
        clean = Uri.UnescapeDataString(clean);
        clean = clean.Replace('\\', '/');
        
        // Remove path traversal and illegal chars
        clean = Path.GetFileName(clean);
        foreach (char c in Path.GetInvalidFileNameChars())
        {
            clean = clean.Replace(c, '_');
        }

        // Prevent RTLO exploit in filename
        clean = clean.Replace("\u202E", "").Replace("\u202D", "");

        return string.IsNullOrWhiteSpace(clean) ? "download.dat" : clean;
    }

    public string DetectCategory(string fileName, string mimeType)
    {
        string ext = Path.GetExtension(fileName).ToLowerInvariant();

        if (fileName.EndsWith(".torrent", StringComparison.OrdinalIgnoreCase) ||
            fileName.Contains(".torrent", StringComparison.OrdinalIgnoreCase) ||
            (ext is ".torrent" or ".php" or "" && fileName.Contains("torrent", StringComparison.OrdinalIgnoreCase)))
        {
            return "Torrents";
        }

        return ext switch
        {
            ".exe" or ".msi" or ".apk" or ".dmg" or ".pkg" or ".deb" or ".rpm" or ".appx" or ".msix" or ".appimage" => "Software",
            ".torrent" => "Torrents",
            ".zip" or ".rar" or ".7z" or ".tar" or ".gz" or ".tgz" or ".bz2" or ".tbz2" or ".xz" or ".txz" or ".zst" or ".iso" or ".img" or ".vmdk" or ".qcow2" or ".cab" => "Archives",
            ".pdf" or ".doc" or ".docx" or ".epub" or ".mobi" or ".xlsx" or ".xls" or ".pptx" or ".ppt" or ".txt" or ".csv" or ".tsv" or ".rtf" or ".odt" or ".ods" or ".odp" => "Documents",
            ".mp3" or ".flac" or ".wav" or ".aac" or ".ogg" or ".opus" or ".m4a" or ".wma" => "Audio",
            ".mp4" or ".mkv" or ".avi" or ".mov" or ".webm" or ".wmv" or ".flv" or ".ts" or ".m4v" or ".3gp" or
            ".png" or ".jpg" or ".jpeg" or ".webp" or ".gif" or ".svg" or ".ico" or ".bmp" or ".avif" or ".tiff" => "Media",
            ".whl" or ".jar" or ".gem" or ".patch" or ".json" or ".xml" or ".html" or ".css" or ".js" or ".py" or ".sh" or ".yaml" or ".yml" or ".sql" or ".wasm" => "Code",
            ".gguf" or ".safetensors" or ".bin" or ".onnx" or ".pt" or ".pth" => "AI",
            _ => mimeType.ToLowerInvariant() switch
            {
                var m when m.StartsWith("video/") => "Media",
                var m when m.StartsWith("audio/") => "Audio",
                var m when m.StartsWith("image/") => "Media",
                var m when m.Contains("bittorrent") || m.Contains("torrent") => "Torrents",
                var m when m.Contains("zip") || m.Contains("compressed") || m.Contains("tar") || m.Contains("archive") || m.Contains("bzip2") || m.Contains("gzip") || m.Contains("iso9660") => "Archives",
                var m when m.Contains("executable") || m.Contains("x-msdownload") || m.Contains("x-msi") || m.Contains("debian") || m.Contains("rpm") || m.Contains("android.package") || m.Contains("apple-diskimage") => "Software",
                var m when m.Contains("pdf") || m.Contains("document") || m.Contains("spreadsheet") || m.Contains("presentation") || m.Contains("wordprocessing") => "Documents",
                var m when m.Contains("javascript") || m.Contains("json") || m.Contains("xml") || m.Contains("python") || m.Contains("yaml") || m.Contains("shellscript") => "Code",
                _ => "Other"
            }
        };
    }

    public static bool IsGenericName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string clean = name.Trim().Trim('\"', '\'');
        string ext = Path.GetExtension(clean).ToLowerInvariant();
        string stem = Path.GetFileNameWithoutExtension(clean).Trim().ToLowerInvariant();

        var nonGenericExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".exe", ".msi", ".apk", ".dmg", ".pkg", ".deb", ".rpm", ".appx", ".msix", ".appimage",
            ".torrent",
            ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".tbz2", ".xz", ".txz", ".zst", ".iso", ".img", ".vmdk", ".qcow2", ".cab",
            ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".epub", ".mobi", ".odt", ".ods", ".odp", ".txt", ".csv", ".tsv", ".rtf",
            ".mp3", ".flac", ".wav", ".aac", ".ogg", ".opus", ".m4a", ".wma",
            ".mp4", ".mkv", ".webm", ".avi", ".mov", ".wmv", ".flv", ".ts", ".m4v", ".3gp",
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".bmp", ".avif", ".tiff",
            ".json", ".xml", ".html", ".css", ".js", ".py", ".sh", ".yaml", ".yml", ".sql", ".wasm", ".whl", ".jar", ".gem", ".patch",
            ".gguf", ".safetensors", ".onnx", ".pt", ".pth"
        };

        if (!string.IsNullOrEmpty(ext) && nonGenericExtensions.Contains(ext))
        {
            return string.IsNullOrEmpty(stem);
        }

        return stem is "" or "watch" or "video" or "videoplayback" or "index" or "download" or "downloads" or "stream" or "media" or "bin" or "file";
    }

    public static string GetExtensionFromMimeType(string mimeType)
    {
        if (string.IsNullOrWhiteSpace(mimeType)) return ".bin";
        string lower = mimeType.Split(';')[0].Trim().ToLowerInvariant();
        return lower switch
        {
            // Executables & Installers
            "application/vnd.microsoft.portable-executable" or "application/x-msdownload" or "application/x-msdos-program" or "application/x-executable" or "application/x-dosexec" => ".exe",
            "application/x-msi" or "application/x-ms-installer" => ".msi",
            "application/vnd.android.package-archive" => ".apk",
            "application/x-apple-diskimage" => ".dmg",
            "application/x-pkg" or "application/vnd.apple.installer+xml" => ".pkg",
            "application/x-debian-package" or "application/vnd.debian.binary-package" => ".deb",
            "application/x-rpm" or "application/x-redhat-package-manager" => ".rpm",
            "application/appx" or "application/x-appx" => ".appx",
            "application/msix" or "application/x-msix" => ".msix",
            "application/vnd.appimage" or "application/x-appimage" => ".appimage",

            // Torrents
            "application/x-bittorrent" or "application/x-torrent" => ".torrent",

            // Archives & Disk Images
            "application/zip" or "application/x-zip-compressed" => ".zip",
            "application/x-tar" => ".tar",
            "application/gzip" or "application/x-gzip" => ".gz",
            "application/x-7z-compressed" => ".7z",
            "application/x-rar-compressed" or "application/vnd.rar" or "application/x-rar" => ".rar",
            "application/x-bzip2" or "application/x-bz2" => ".bz2",
            "application/x-xz" => ".xz",
            "application/zstd" => ".zst",
            "application/x-iso9660-image" => ".iso",
            "application/vnd.ms-cab-compressed" => ".cab",

            // Documents
            "application/pdf" => ".pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
            "application/msword" => ".doc",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => ".xlsx",
            "application/vnd.ms-excel" => ".xls",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" => ".pptx",
            "application/vnd.ms-powerpoint" => ".ppt",
            "text/plain" => ".txt",
            "text/csv" => ".csv",
            "text/tab-separated-values" => ".tsv",
            "application/rtf" or "text/rtf" => ".rtf",
            "application/epub+zip" => ".epub",
            "application/x-mobipocket-ebook" => ".mobi",
            "application/vnd.oasis.opendocument.text" => ".odt",
            "application/vnd.oasis.opendocument.spreadsheet" => ".ods",
            "application/vnd.oasis.opendocument.presentation" => ".odp",

            // Media - Video
            "video/mp4" => ".mp4",
            "video/x-matroska" => ".mkv",
            "video/webm" => ".webm",
            "video/x-msvideo" => ".avi",
            "video/quicktime" => ".mov",
            "video/x-ms-wmv" => ".wmv",
            "video/x-flv" => ".flv",
            "video/mp2t" => ".ts",
            "video/x-m4v" => ".m4v",
            "video/3gpp" => ".3gp",

            // Media - Audio
            "audio/mpeg" => ".mp3",
            "audio/flac" => ".flac",
            "audio/wav" or "audio/x-wav" => ".wav",
            "audio/aac" => ".aac",
            "audio/ogg" or "audio/vorbis" => ".ogg",
            "audio/opus" => ".opus",
            "audio/mp4" or "audio/m4a" or "audio/x-m4a" => ".m4a",
            "audio/x-ms-wma" => ".wma",

            // Media - Image
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            "image/svg+xml" => ".svg",
            "image/x-icon" or "image/vnd.microsoft.icon" => ".ico",
            "image/bmp" or "image/x-ms-bmp" => ".bmp",
            "image/avif" => ".avif",
            "image/tiff" => ".tiff",

            // Developer / Code
            "application/json" => ".json",
            "application/xml" or "text/xml" => ".xml",
            "text/html" => ".html",
            "text/css" => ".css",
            "text/javascript" or "application/javascript" or "application/x-javascript" => ".js",
            "text/x-python" or "application/x-python-code" => ".py",
            "text/x-shellscript" or "application/x-sh" => ".sh",
            "text/yaml" or "text/x-yaml" or "application/x-yaml" => ".yaml",
            "application/sql" => ".sql",
            "application/wasm" => ".wasm",
            "application/java-archive" => ".jar",
            "application/x-wheel+zip" => ".whl",

            _ => ".bin"
        };
    }

    private static string ExtractTitleFromHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;

        var ogMatch = Regex.Match(html, @"<meta\s+property=""og:title""\s+content=""([^""]+)""", RegexOptions.IgnoreCase);
        if (ogMatch.Success && !string.IsNullOrWhiteSpace(ogMatch.Groups[1].Value))
        {
            return CleanWebTitle(ogMatch.Groups[1].Value);
        }

        var titleMatch = Regex.Match(html, @"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (titleMatch.Success && !string.IsNullOrWhiteSpace(titleMatch.Groups[1].Value))
        {
            return CleanWebTitle(titleMatch.Groups[1].Value);
        }

        return string.Empty;
    }

    private static string CleanWebTitle(string raw)
    {
        string clean = WebUtility.HtmlDecode(raw).Trim();
        clean = Regex.Replace(clean, @"\s*[\-\|\:·]\s*(YouTube|Bilibili|TikTok|Vimeo|Instagram|Facebook).*$", "", RegexOptions.IgnoreCase).Trim();
        clean = Regex.Replace(clean, @"[\\/:*?""<>|]", "_");
        clean = Regex.Replace(clean, @"\s+", " ").Trim();
        return clean;
    }
}
