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

                // If still 403/Forbidden, 401, or 429, test candidate referers
                if (response != null && (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == (HttpStatusCode)429))
                {
                    var candidates = DownloadEngine.GetCandidateReferers(url, effectiveRef, null);
                    foreach (var candRef in candidates)
                    {
                        if (string.Equals(effectiveRef, candRef, StringComparison.OrdinalIgnoreCase)) continue;
                        if (response.StatusCode == (HttpStatusCode)429)
                        {
                            await Task.Delay(500, cancellationToken);
                        }
                        response.Dispose();
                        using var altGetReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                        ApplyHeaders(altGetReq, candRef);
                        altGetReq.Headers.AcceptEncoding.ParseAdd("identity");
                        try
                        {
                            response = await _httpClient.SendAsync(altGetReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                            if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.PartialContent)
                            {
                                effectiveRef = candRef;
                                break;
                            }
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
                string? urlExtracted = ExtractFileNameFromUrl(uri, effectiveRef);
                if (!string.IsNullOrWhiteSpace(urlExtracted) && !IsGenericName(urlExtracted))
                {
                    extractedName = urlExtracted;
                }
            }

            string? googleExportExt = InferGoogleExportExtension(uri, effectiveRef, result.MimeType);
            bool isGoogleDocs = IsGoogleDocsOrSheetsUrl(uri);

            // Fallback 2: For HTML/video site pages, attempt HTML title extraction
            if (string.IsNullOrWhiteSpace(extractedName) || IsGenericName(extractedName) || (isGoogleDocs && result.MimeType.Contains("text/html")))
            {
                if (result.MimeType.Contains("text/html") || uri.Host.Contains("youtube.com") || uri.Host.Contains("youtu.be") || uri.Host.Contains("bilibili.com") || uri.Host.Contains("bilibili.tv") || uri.Host.Contains("tiktok.com"))
                {
                    try
                    {
                        using var getTitleReq = HttpTransferRequest.Create(HttpMethod.Get, uri);
                        ApplyHeaders(getTitleReq, effectiveRef);
                        using var htmlResp = await _httpClient.SendAsync(getTitleReq, HttpCompletionOption.ResponseContentRead, cancellationToken);
                        if (htmlResp.IsSuccessStatusCode)
                        {
                            string html = await htmlResp.Content.ReadAsStringAsync(cancellationToken);
                            string pageTitle = ExtractTitleFromHtml(html);
                            if (!string.IsNullOrWhiteSpace(pageTitle))
                            {
                                string ext = GetExtensionFromMimeType(result.MimeType);
                                if (isGoogleDocs && !string.IsNullOrEmpty(googleExportExt) && googleExportExt != ".html")
                                {
                                    ext = googleExportExt;
                                }
                                else if (uri.Host.Contains("youtube.com") || uri.Host.Contains("youtu.be") || uri.Host.Contains("bilibili.com") || uri.Host.Contains("bilibili.tv") || uri.Host.Contains("tiktok.com"))
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
                string ext = isGoogleDocs && !string.IsNullOrEmpty(googleExportExt)
                    ? googleExportExt
                    : GetExtensionFromMimeType(result.MimeType);
                string baseStem = isGoogleDocs
                    ? (ExtractFileNameFromUrl(uri, effectiveRef) is { } f && !string.IsNullOrEmpty(Path.GetFileNameWithoutExtension(f)) && !IsGenericName(f) ? Path.GetFileNameWithoutExtension(f) : "spreadsheet")
                    : $"download_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
                extractedName = $"{baseStem}{ext}";
            }
            else
            {
                // Ensure filename has an appropriate extension if missing
                string existingExt = Path.GetExtension(extractedName);
                if (string.IsNullOrEmpty(existingExt))
                {
                    string ext = isGoogleDocs && !string.IsNullOrEmpty(googleExportExt)
                        ? googleExportExt
                        : GetExtensionFromMimeType(result.MimeType);
                    extractedName += ext;
                }
                else if (isGoogleDocs && !string.IsNullOrEmpty(googleExportExt) &&
                         (existingExt.Equals(".html", StringComparison.OrdinalIgnoreCase) || existingExt.Equals(".htm", StringComparison.OrdinalIgnoreCase)) &&
                         googleExportExt != ".html")
                {
                    // Never replace an intended Google Docs/Sheets export with .html!
                    extractedName = Path.GetFileNameWithoutExtension(extractedName) + googleExportExt;
                }
            }

            result.FileName = SanitizeFileName(extractedName);

            // If this is a Google Docs/Sheets export and the probe returned text/html, do NOT treat it as Code!
            if (isGoogleDocs && !string.IsNullOrEmpty(googleExportExt) && googleExportExt != ".html")
            {
                result.SuggestedCategory = "Documents";
                if (result.MimeType.Contains("text/html"))
                {
                    result.MimeType = googleExportExt switch
                    {
                        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        ".pdf" => "application/pdf",
                        ".csv" => "text/csv",
                        ".tsv" => "text/tab-separated-values",
                        ".ods" => "application/vnd.oasis.opendocument.spreadsheet",
                        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        _ => result.MimeType
                    };
                }
            }
            else
            {
                result.SuggestedCategory = DetectCategory(result.FileName, result.MimeType);
            }
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

    public static bool IsGoogleDocsOrSheetsUrl(Uri uri)
    {
        if (uri == null) return false;
        string host = uri.Host.ToLowerInvariant();
        string path = uri.AbsolutePath.ToLowerInvariant();
        return host.Contains("googleusercontent.com") ||
               host.Contains("docs.google.com") ||
               host.Contains("drive.google.com") ||
               path.Contains("/spreadsheets/") ||
               path.Contains("/document/") ||
               path.Contains("/presentation/") ||
               (path.Contains("/export") && (host.Contains("google.com") || host.Contains("googleusercontent.com")));
    }

    public static string? InferGoogleExportExtension(Uri uri, string? referer = null, string? mimeType = null)
    {
        if (uri == null) return null;
        try
        {
            if (!string.IsNullOrWhiteSpace(mimeType))
            {
                string m = mimeType.Split(';')[0].Trim().ToLowerInvariant();
                if (m == "application/pdf") return ".pdf";
                if (m.Contains("spreadsheetml") || m == "application/vnd.ms-excel") return ".xlsx";
                if (m == "text/csv") return ".csv";
                if (m == "text/tab-separated-values") return ".tsv";
                if (m.Contains("opendocument.spreadsheet")) return ".ods";
                if (m.Contains("wordprocessingml") || m == "application/msword") return ".docx";
                if (m.Contains("opendocument.text")) return ".odt";
                if (m.Contains("presentationml") || m == "application/vnd.ms-powerpoint") return ".pptx";
                if (m.Contains("opendocument.presentation")) return ".odp";
                if (m == "application/zip" || m == "application/x-zip-compressed") return ".zip";
            }

            if (!string.IsNullOrWhiteSpace(uri.Query))
            {
                var queryParams = HttpUtility.ParseQueryString(uri.Query);
                string? format = queryParams["format"] ?? queryParams["exportFormat"] ?? queryParams["output"];
                if (!string.IsNullOrWhiteSpace(format))
                {
                    string fmt = format.Trim().ToLowerInvariant().TrimStart('.');
                    return fmt switch
                    {
                        "xlsx" => ".xlsx",
                        "pdf" => ".pdf",
                        "csv" => ".csv",
                        "tsv" => ".tsv",
                        "ods" => ".ods",
                        "docx" => ".docx",
                        "doc" => ".doc",
                        "pptx" => ".pptx",
                        "ppt" => ".ppt",
                        "txt" => ".txt",
                        "rtf" => ".rtf",
                        "odt" => ".odt",
                        "odp" => ".odp",
                        "zip" => ".zip",
                        "epub" => ".epub",
                        "html" or "htm" or "zip-html" => ".html",
                        _ => $".{fmt}"
                    };
                }
            }

            if (!string.IsNullOrWhiteSpace(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refUri) && !string.IsNullOrWhiteSpace(refUri.Query))
            {
                var refParams = HttpUtility.ParseQueryString(refUri.Query);
                string? refFormat = refParams["format"] ?? refParams["exportFormat"] ?? refParams["output"];
                if (!string.IsNullOrWhiteSpace(refFormat))
                {
                    string fmt = refFormat.Trim().ToLowerInvariant().TrimStart('.');
                    return fmt switch
                    {
                        "xlsx" => ".xlsx",
                        "pdf" => ".pdf",
                        "csv" => ".csv",
                        "tsv" => ".tsv",
                        "ods" => ".ods",
                        "docx" => ".docx",
                        "doc" => ".doc",
                        "pptx" => ".pptx",
                        "ppt" => ".ppt",
                        "txt" => ".txt",
                        "rtf" => ".rtf",
                        "odt" => ".odt",
                        "odp" => ".odp",
                        "zip" => ".zip",
                        "epub" => ".epub",
                        "html" or "htm" or "zip-html" => ".html",
                        _ => $".{fmt}"
                    };
                }
            }

            string path = uri.AbsolutePath.ToLowerInvariant();
            if (path.EndsWith("/pdf") || path.Contains("/export/pdf")) return ".pdf";
            if (path.EndsWith("/xlsx") || path.Contains("/export/xlsx")) return ".xlsx";
            if (path.EndsWith("/csv") || path.Contains("/export/csv")) return ".csv";
            if (path.EndsWith("/tsv") || path.Contains("/export/tsv")) return ".tsv";
            if (path.EndsWith("/docx") || path.Contains("/export/docx")) return ".docx";
            if (path.EndsWith("/ods") || path.Contains("/export/ods")) return ".ods";
            if (path.EndsWith("/pptx") || path.Contains("/export/pptx")) return ".pptx";

            string host = uri.Host.ToLowerInvariant();
            string refStr = referer?.ToLowerInvariant() ?? string.Empty;

            if (host.Contains("sheets") || path.Contains("/spreadsheets/") || refStr.Contains("/spreadsheets/"))
            {
                return ".xlsx";
            }
            if (host.Contains("docs.googleusercontent.com") || (host.Contains("docs.google.com") && path.Contains("/document/")) || refStr.Contains("/document/"))
            {
                return ".docx";
            }
            if (host.Contains("presentation") || path.Contains("/presentation/") || refStr.Contains("/presentation/") || path.Contains("slides"))
            {
                return ".pptx";
            }
            if (host.Contains("googleusercontent.com") && path.Contains("/export"))
            {
                return ".xlsx";
            }
        }
        catch { }
        return null;
    }

    public static string? ExtractFileNameFromUrl(Uri uri, string? referer = null)
    {
        if (uri == null) return null;

        // Check Google Docs/Sheets export endpoints first
        if (IsGoogleDocsOrSheetsUrl(uri))
        {
            string? googleExt = InferGoogleExportExtension(uri, referer);
            if (!string.IsNullOrEmpty(googleExt))
            {
                string? docId = null;
                var match = Regex.Match(uri.AbsolutePath, @"/(?:spreadsheets|document|presentation|file)(?:/u/\d+)?/d/([a-zA-Z0-9_-]+)", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    docId = match.Groups[1].Value;
                }
                else
                {
                    var matchGeneral = Regex.Match(uri.AbsolutePath, @"/d/([a-zA-Z0-9_-]{20,})", RegexOptions.IgnoreCase);
                    if (matchGeneral.Success)
                    {
                        docId = matchGeneral.Groups[1].Value;
                    }
                }

                if (string.IsNullOrWhiteSpace(docId) && !string.IsNullOrWhiteSpace(uri.Query))
                {
                    try
                    {
                        var qp = HttpUtility.ParseQueryString(uri.Query);
                        docId = qp["id"] ?? qp["docId"];
                    }
                    catch { }
                }

                if (string.IsNullOrWhiteSpace(docId) && !string.IsNullOrWhiteSpace(referer))
                {
                    var refMatch = Regex.Match(referer, @"/d/([a-zA-Z0-9_-]{20,})", RegexOptions.IgnoreCase);
                    if (refMatch.Success)
                    {
                        docId = refMatch.Groups[1].Value;
                    }
                }

                if (string.IsNullOrWhiteSpace(docId))
                {
                    string pBase = Path.GetFileName(uri.AbsolutePath);
                    if (!string.IsNullOrWhiteSpace(pBase))
                    {
                        if (Path.HasExtension(pBase) && !pBase.EndsWith(".html", StringComparison.OrdinalIgnoreCase) && !pBase.EndsWith(".htm", StringComparison.OrdinalIgnoreCase))
                        {
                            return pBase;
                        }
                        docId = pBase;
                    }
                    else if (uri.Host.Contains("sheets", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.Contains("spreadsheets", StringComparison.OrdinalIgnoreCase))
                    {
                        docId = "spreadsheet";
                    }
                    else if (uri.Host.Contains("presentation", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.Contains("presentation", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.Contains("slides", StringComparison.OrdinalIgnoreCase))
                    {
                        docId = "presentation";
                    }
                    else
                    {
                        docId = "document";
                    }
                }

                return $"{docId}{googleExt}";
            }
        }

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

    public string? InferFileNameFromUrl(string url, string? referer = null)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return null;
        }

        string? candidate = ExtractFileNameFromUrl(uri, referer);
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

        // Clean SEO junk from base name if present
        string ext = Path.GetExtension(clean);
        string nameWithoutExt = Path.GetFileNameWithoutExtension(clean);
        string cleanedBase = CleanWebTitle(nameWithoutExt);
        if (!string.IsNullOrWhiteSpace(cleanedBase) && !IsGenericName(cleanedBase))
        {
            clean = string.IsNullOrEmpty(ext) ? cleanedBase : $"{cleanedBase}{ext}";
        }

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

    public static bool IsGenericStem(string? stem)
    {
        if (string.IsNullOrWhiteSpace(stem)) return true;
        string lower = stem.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(lower) || lower.Length < 2) return true;

        var genericExact = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "youtube", "youtube music", "watch", "videoplayback", "video", "media stream",
            "download", "downloads", "notifications", "notification", "facebook", "pornhub",
            "bin", "player", "embed", "video stream", "stream", "kwik", "megaplay",
            "strm", "master", "playlist", "manifest", "chunklist", "media", "main", "track",
            "segment", "segment-0", "video-0", "stream-0", "stream-1", "init", "audio", "audio-0",
            "untitled", "null", "undefined", "feed", "newsfeed", "stories", "reels", "reel",
            "index", "play", "html5 player", "video player", "file"
        };

        if (genericExact.Contains(lower)) return true;

        if (System.Text.RegularExpressions.Regex.IsMatch(lower, @"^file[\s_-]*\d+")) return true;

        if (System.Text.RegularExpressions.Regex.IsMatch(lower, @"^(?:strm|stream|video|master|playlist|manifest|index|chunklist|seg|fragment|chunk|track|audio|play|player|embed|iframe)[_\-\d]*$")) return true;

        if (System.Text.RegularExpressions.Regex.IsMatch(lower, @"^(?:seg|fragment|chunk|track|stream|video|audio)[_-]?\d+")) return true;

        if (lower.Contains("megaplay") || lower.Contains("kwik") || lower.Contains("streamwish") ||
            lower.Contains("vidcloud") || lower.Contains("upcloud") || lower.Contains("filemoon") ||
            lower.Contains("doodstream") || lower.Contains("streamtape") || lower.Contains("mp4upload"))
        {
            if (lower.StartsWith("file") || lower.StartsWith("player") || lower.StartsWith("embed") || lower.StartsWith("video") || lower.Contains("server") || lower == "megaplay" || lower == "kwik")
            {
                return true;
            }
        }

        // Detect Facebook CDN tokens (e.g. AQPEv8rliM4qIQGkbci...)
        if (lower.StartsWith("aq") && lower.Length >= 12 && !lower.Contains(' '))
        {
            return true;
        }

        return false;
    }

    public static bool IsGenericName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string clean = name.Trim().Trim('\"', '\'');
        string ext = Path.GetExtension(clean).ToLowerInvariant();
        string stem = Path.GetFileNameWithoutExtension(clean).Trim().ToLowerInvariant();

        if (IsGenericStem(stem)) return true;

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

        string cleanTitle = string.Empty;

        // 1. JSON-LD Structured Data
        var jsonLdMatches = Regex.Matches(html, @"<script[^>]*type=[""']application\/ld\+json[""'][^>]*>(.*?)<\/script>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        foreach (Match jm in jsonLdMatches)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(jm.Groups[1].Value);
                var root = doc.RootElement;
                IEnumerable<System.Text.Json.JsonElement> items = root.ValueKind == System.Text.Json.JsonValueKind.Array ? root.EnumerateArray() : new[] { root };
                foreach (var item in items)
                {
                    if (item.TryGetProperty("@type", out var typeElem))
                    {
                        string t = typeElem.GetString() ?? "";
                        if (t.Equals("Movie", StringComparison.OrdinalIgnoreCase) ||
                            t.Equals("VideoObject", StringComparison.OrdinalIgnoreCase) ||
                            t.Equals("TVEpisode", StringComparison.OrdinalIgnoreCase))
                        {
                            if (item.TryGetProperty("name", out var nElem) && !string.IsNullOrWhiteSpace(nElem.GetString()))
                            {
                                string baseName = CleanWebTitle(nElem.GetString()!);
                                string yearStr = "";
                                if (item.TryGetProperty("datePublished", out var dp) && !string.IsNullOrWhiteSpace(dp.GetString()))
                                {
                                    var ym = Regex.Match(dp.GetString()!, @"\b(19\d\d|20\d\d)\b");
                                    if (ym.Success) yearStr = $" ({ym.Groups[1].Value})";
                                }
                                if (!string.IsNullOrEmpty(baseName))
                                {
                                    cleanTitle = (!baseName.Contains("(") && !string.IsNullOrEmpty(yearStr)) ? $"{baseName}{yearStr}" : baseName;
                                    return cleanTitle;
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }

        // 2. OpenGraph
        var ogMatch = Regex.Match(html, @"<meta\s+property=""og:title""\s+content=""([^""]+)""", RegexOptions.IgnoreCase);
        if (ogMatch.Success && !string.IsNullOrWhiteSpace(ogMatch.Groups[1].Value))
        {
            cleanTitle = CleanWebTitle(ogMatch.Groups[1].Value);
        }

        // 3. Document Title
        if (string.IsNullOrWhiteSpace(cleanTitle))
        {
            var titleMatch = Regex.Match(html, @"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (titleMatch.Success && !string.IsNullOrWhiteSpace(titleMatch.Groups[1].Value))
            {
                cleanTitle = CleanWebTitle(titleMatch.Groups[1].Value);
            }
        }

        // 4. Try appending release year if missing
        if (!string.IsNullOrWhiteSpace(cleanTitle) && !Regex.IsMatch(cleanTitle, @"\b(?:19|20)\d{2}\b"))
        {
            var yearMatch = Regex.Match(html, @"(?:class=[""'][^""']*(?:year|release)[^""']*[""']|itemprop=[""'](?:dateCreated|copyrightYear)[""']|href=[""'][^""']*\/year\/\d+[^""']*[""'])[^>]*>\s*(\b(?:19|20)\d{2}\b)", RegexOptions.IgnoreCase);
            if (yearMatch.Success)
            {
                cleanTitle = $"{cleanTitle} ({yearMatch.Groups[1].Value})";
            }
        }

        return cleanTitle;
    }

    public static string CleanWebTitle(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        string clean = WebUtility.HtmlDecode(raw).Trim();

        // Strip trailing extension if present (e.g. .mp4, .mkv)
        clean = Regex.Replace(clean, @"\.(?:mp4|mkv|webm|avi|mov|ts|m4v|mp3|m4a|aac|wav|flac)$", "", RegexOptions.IgnoreCase).Trim();

        // 1. Strip leading action verbs: Stream, Watch, Streaming, Play, Download, Free Online
        clean = Regex.Replace(clean, @"^(?:stream|watch|streaming|play|download)\s+", "", RegexOptions.IgnoreCase).Trim();
        clean = Regex.Replace(clean, @"^free\s+(?:watch|streaming|stream|download|movie|movies|hd|online|full)\s+", "", RegexOptions.IgnoreCase).Trim();

        // 2. Strip leading site brands (e.g. "67movies - ", "HydraHD | ", "Miruro - ")
        clean = Regex.Replace(clean, @"^(?:67movies(?:\.[a-z]+)?|123movies(?:\.[a-z]+)?|solarmovie|fmovies|ramoflix(?:\.[a-z]+)?|hydrahd(?:\.[a-z]+)?|goojara(?:\.[a-z]+)?|wmovies(?:\.[a-z]+)?|miruro(?:\.[a-z]+)?|anime(?:\.|\s*)nexus|animesuge(?:\.[a-z]+)?|anizone(?:\.[a-z]+)?)\s*[\-\|\:·–—\s]\s*", "", RegexOptions.IgnoreCase).Trim();

        // 3. Strip resolution brackets [1080p], (1080p), [Full HD], etc.
        clean = Regex.Replace(clean, @"\[\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\]", "", RegexOptions.IgnoreCase).Trim();
        clean = Regex.Replace(clean, @"\(\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\)", "", RegexOptions.IgnoreCase).Trim();

        // 4. Strip site suffixes separated by ::
        clean = Regex.Replace(clean, @"\s*::\s*.*$", "").Trim();

        // 5. Strip site/brand suffixes separated by - or | or • or —
        clean = Regex.Replace(clean, @"\s*[\-\|\:·–—]\s*(?:RamoFlix(?:\.[a-z]+)?.*|HydraHD(?:\.[a-z]+)?.*|Goojara(?:\.[a-z]+)?.*|111movies(?:\.[a-z]+)?.*|Wmovies(?:\.[a-z]+)?.*|Unlimited\s+Movies\s+&.*|Watch\s+(?:Free\s+)?Online.*|Watch\s+on\s+.*|Watch\s+Online.*|Watch\s*.*|Full\s+Movie.*|(?:English\s+)?(?:Subbed|Sub|Dubbed|Dub)(?:\s+at\s+.*)?|AnimePahe.*|Miruro(?:\.[a-z]+)?.*|Anime(?:\.|\s*)Nexus.*|AnimeSuge(?:\.[a-z]+)?.*|AniZone(?:\.[a-z]+)?.*|HiAnime.*|123movies.*|67movies.*|SolarMovie.*|FMovies.*|Crunchyroll.*|Funimation.*|YouTube\s*Music.*|YouTube.*|Pornhub.*|Facebook.*|Bilibili.*|TikTok.*|Vimeo.*|Instagram.*|Twitter.*|X.*|Reddit.*|Dailymotion.*|Google\s+(?:Sheets|Docs|Slides|Drive|Forms|Spreadsheets|Documents|Presentations).*)$", "", RegexOptions.IgnoreCase).Trim();

        // 6. Strip trailing SEO junk phrases and sub/dub markers
        clean = Regex.Replace(clean, @"\s+(?:online\s+free\s+watch\s+full\s+(?:now\s+)?hd|online\s+free\s+watch\s+full|watch\s+full\s+now\s+hd|watch\s+full\s+movie\s+(?:online\s+)?(?:free\s+)?hd|watch\s+full\s+movie\s+online|watch\s+full\s+movie|watch\s+online\s+free|watch\s+online\s+hd|watch\s+free\s+online|watch\s+free\s+hd|watch\s+online|online\s+free|free\s+online|full\s+movie\s+hd|full\s+movie|full\s+hd|watch\s+now\s+hd|watch\s+now|full\s+now\s+hd|unlimited\s+movies\s+&\s+tv\s+shows\s+online.*|(?:online\s+)?sub\/(?:dub|subbed)|(?:english\s+)?subbed\s+online|(?:english\s+)?(?:subbed|sub|dubbed|dub)\b)\b.*$", "", RegexOptions.IgnoreCase).Trim();
        clean = Regex.Replace(clean, @"\s+(?:at|on)\s+[a-z0-9.-]+\.[a-z]{2,}\b.*$", "", RegexOptions.IgnoreCase).Trim();
        clean = Regex.Replace(clean, @"\s+(?:on|at)\s+(?:67movies|ramoflix|hydrahd|goojara|wmovies|vidqueen|vidsrc|2embed|autoembed|superembed|streamembed|miruro|animesuge|animepahe|anizone|nexus)\b.*$", "", RegexOptions.IgnoreCase).Trim();

        // 7. Strip trailing delimiters
        clean = Regex.Replace(clean, @"[\s\-\|\:·–—]+$", "").Trim();

        clean = Regex.Replace(clean, @"[\\/:*?""<>|]", "_");
        clean = Regex.Replace(clean, @"\s+", " ").Trim();
        return clean;
    }
}
