using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
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
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("SmartDM/2.0 (Compatible; Mozilla/5.0; Windows NT 10.0; Win64; x64)");
        }
    }

    public async Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken cancellationToken = default)
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

        try
        {
            // 1. Try HEAD request first
            using var headReq = HttpTransferRequest.Create(HttpMethod.Head, uri);
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
            // may advertise bytes on HEAD but ignore Range on GET.
            bool usedRangeProbe = response == null || response.StatusCode == HttpStatusCode.MethodNotAllowed ||
                response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.NotFound ||
                (response.IsSuccessStatusCode && response.Headers.AcceptRanges.Contains("bytes"));
            if (usedRangeProbe)
            {
                response?.Dispose();
                using var getReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                getReq.Headers.Range = new RangeHeaderValue(0, 0);
                getReq.Headers.AcceptEncoding.ParseAdd("identity");
                response = await _httpClient.SendAsync(getReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
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
            string? extractedName = null;
            if (response.Content.Headers.ContentDisposition != null)
            {
                extractedName = response.Content.Headers.ContentDisposition.FileNameStar
                             ?? response.Content.Headers.ContentDisposition.FileName;
            }

            if (!string.IsNullOrWhiteSpace(extractedName))
            {
                extractedName = extractedName.Trim('\"', '\'');
            }

            // Fallback 1: Extract from URL path basename if Content-Disposition is absent or generic
            if (string.IsNullOrWhiteSpace(extractedName) || IsGenericName(extractedName))
            {
                try
                {
                    string pathBaseName = Path.GetFileName(uri.AbsolutePath);
                    if (!string.IsNullOrWhiteSpace(pathBaseName) && !IsGenericName(pathBaseName))
                    {
                        extractedName = pathBaseName;
                    }
                }
                catch { }
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
                                if (ext == ".bin" || ext == ".html") ext = ".mp4";
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

        return ext switch
        {
            ".iso" or ".img" or ".vmdk" or ".qcow2" => "ISO",
            ".zip" or ".tar" or ".gz" or ".bz2" or ".xz" or ".7z" or ".rar" => "ZIP",
            ".mp4" or ".mkv" or ".avi" or ".mov" or ".webm" or ".png" or ".jpg" or ".jpeg" or ".webp" => "Media",
            ".mp3" or ".flac" or ".wav" or ".aac" or ".ogg" or ".m4a" => "Audio",
            ".exe" or ".msi" or ".dmg" or ".pkg" or ".deb" or ".rpm" or ".AppImage" => "Software",
            ".whl" or ".jar" or ".gem" or ".patch" => "Code",
            ".pdf" or ".doc" or ".docx" or ".epub" or ".xlsx" or ".pptx" => "Documents",
            ".gguf" or ".safetensors" or ".bin" or ".onnx" or ".pt" => "AI",
            ".torrent" => "Torrents",
            _ => mimeType.ToLowerInvariant() switch
            {
                var m when m.StartsWith("video/") => "Media",
                var m when m.StartsWith("audio/") => "Audio",
                var m when m.StartsWith("image/") => "Media",
                var m when m.Contains("zip") || m.Contains("compressed") || m.Contains("tar") => "Archives",
                var m when m.Contains("executable") || m.Contains("x-msdownload") => "Software",
                _ => "Other"
            }
        };
    }

    public static bool IsGenericName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string clean = Path.GetFileNameWithoutExtension(name).Trim().ToLowerInvariant();
        return clean is "" or "watch" or "video" or "videoplayback" or "index" or "index.html" or "download" or "downloads" or "stream" or "media" or "bin";
    }

    public static string GetExtensionFromMimeType(string mimeType)
    {
        if (string.IsNullOrWhiteSpace(mimeType)) return ".bin";
        string lower = mimeType.Split(';')[0].Trim().ToLowerInvariant();
        return lower switch
        {
            "application/pdf" => ".pdf",
            "application/zip" or "application/x-zip-compressed" => ".zip",
            "application/x-tar" => ".tar",
            "application/gzip" or "application/x-gzip" => ".gz",
            "application/x-7z-compressed" => ".7z",
            "application/x-rar-compressed" or "application/vnd.rar" => ".rar",
            "application/json" => ".json",
            "application/xml" or "text/xml" => ".xml",
            "text/plain" => ".txt",
            "text/csv" => ".csv",
            "text/html" => ".html",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            "video/mp4" => ".mp4",
            "video/x-matroska" => ".mkv",
            "video/webm" => ".webm",
            "audio/mpeg" => ".mp3",
            "audio/flac" => ".flac",
            "audio/wav" or "audio/x-wav" => ".wav",
            "audio/ogg" => ".ogg",
            "audio/mp4" or "audio/m4a" => ".m4a",
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
