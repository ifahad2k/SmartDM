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

    public HttpProbeService(HttpClient? client = null)
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
                Timeout = TimeSpan.FromSeconds(15)
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
            using var headReq = new HttpRequestMessage(HttpMethod.Head, uri);
            headReq.Version = HttpVersion.Version20;
            headReq.VersionPolicy = HttpVersionPolicy.RequestVersionOrLower;

            try
            {
                response = await _httpClient.SendAsync(headReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }
            catch (HttpRequestException)
            {
                // Head failed, try GET
            }

            // 2. If HEAD returned 405 (Method Not Allowed) or failed, fall back to GET with Range 0-0
            if (response == null || response.StatusCode == HttpStatusCode.MethodNotAllowed || response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.NotFound)
            {
                response?.Dispose();
                using var getReq = new HttpRequestMessage(HttpMethod.Get, uri);
                getReq.Headers.Range = new RangeHeaderValue(0, 0);
                response = await _httpClient.SendAsync(getReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }

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
            bool acceptsRangesHeader = response.Headers.AcceptRanges.Contains("bytes");
            bool isPartialContent = response.StatusCode == HttpStatusCode.PartialContent;
            result.AcceptsRanges = acceptsRangesHeader || isPartialContent;

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
            result.ETag = response.Headers.ETag?.Tag ?? string.Empty;

            // Filename extraction
            string? extractedName = null;
            if (response.Content.Headers.ContentDisposition != null)
            {
                extractedName = response.Content.Headers.ContentDisposition.FileNameStar
                             ?? response.Content.Headers.ContentDisposition.FileName;
            }

            if (string.IsNullOrWhiteSpace(extractedName))
            {
                string rawPath = uri.AbsolutePath;
                if (!string.IsNullOrWhiteSpace(rawPath) && rawPath != "/")
                {
                    string leaf = Path.GetFileName(rawPath);
                    if (!string.IsNullOrWhiteSpace(leaf))
                    {
                        extractedName = Uri.UnescapeDataString(leaf);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(extractedName))
            {
                extractedName = $"download_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
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
}
