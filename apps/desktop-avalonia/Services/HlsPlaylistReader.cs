using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public sealed class HlsPlaylistReader(HttpClient httpClient)
{
    private readonly HttpClient _httpClient = httpClient;

    public sealed class HlsPlaylistInfo
    {
        public bool IsEncrypted { get; set; }
        public string? FragmentedPlaylist { get; set; }
        public List<string> SegmentUrls { get; set; } = new();
        public List<HlsSegmentEncryption?> SegmentEncryption { get; set; } = new();
        public List<double> SegmentDurations { get; set; } = new();
        public double TotalDuration { get; set; }
        public long Bandwidth { get; set; }
        public long ExpectedBytes { get; set; }
        public string? AudioPlaylistUrl { get; set; }
        public int HttpStatusCode { get; set; } = 200;
        public string? ErrorMessage { get; set; }
        public string? EffectiveReferer { get; set; }
    }

    private static Task<string> ReadManifestAsync(HttpContent content, CancellationToken token)
        => HlsManifestSnapshot.ReadAsync(content, token);

    public async Task<HlsPlaylistInfo?> ReadAsync(
        string playlistUrl,
        string? referer,
        string? userAgent,
        string? cookies,
        CancellationToken token,
        string? pageUrl = null,
        string? capturedPlaylist = null,
        string? credentialSourceUrl = null)
    {
        credentialSourceUrl ??= playlistUrl;
        var info = new HlsPlaylistInfo { EffectiveReferer = referer };
        try
        {
            HttpResponseMessage? resp = capturedPlaylist == null ? null : new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            { Content = new StringContent(capturedPlaylist), RequestMessage = HttpTransferRequest.Create(HttpMethod.Get, playlistUrl) };
            string effectiveWorkingReferer = referer ?? "";

            var candidateReferers = StreamRequestPolicy.GetCandidateReferers(playlistUrl, referer, pageUrl);
            foreach (var candRef in capturedPlaylist == null ? candidateReferers : new List<string>())
            {
                using var req = HttpTransferRequest.Create(HttpMethod.Get, playlistUrl);

                if (!string.IsNullOrEmpty(candRef))
                {
                    req.Headers.TryAddWithoutValidation("Referer", candRef);
                    try { req.Headers.TryAddWithoutValidation("Origin", new Uri(candRef).GetLeftPart(UriPartial.Authority)); } catch { }
                }
                if (!string.IsNullOrEmpty(userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", userAgent);
                var scopedCookies = CookieHeaderPolicy.Select(cookies, req.RequestUri?.AbsoluteUri, credentialSourceUrl);
                DownloadRedirectHandler.ApplyCookies(req, cookies, credentialSourceUrl);
                req.Headers.TryAddWithoutValidation("Accept", "*/*");

                var candidateResp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, token);
                if (candidateResp.IsSuccessStatusCode)
                {
                    string? mediaType = candidateResp.Content.Headers.ContentType?.MediaType;
                    if (mediaType != null && mediaType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
                    {
                        candidateResp.Dispose();
                        continue; // Skip HTML bot check/error pages
                    }
                    resp = candidateResp;
                    effectiveWorkingReferer = candRef;
                    info.EffectiveReferer = candRef;
                    break;
                }
                else if (candidateResp.StatusCode == System.Net.HttpStatusCode.Forbidden || candidateResp.StatusCode == System.Net.HttpStatusCode.Unauthorized || candidateResp.StatusCode == System.Net.HttpStatusCode.Gone)
                {
                    candidateResp.Dispose();
                    continue; // Try next candidate referer
                }
                else if (candidateResp.StatusCode == (System.Net.HttpStatusCode)429)
                {
                    int delayMs = 1500;
                    if (candidateResp.Headers.RetryAfter?.Delta.HasValue == true)
                    {
                        delayMs = (int)Math.Max(delayMs, candidateResp.Headers.RetryAfter.Delta.Value.TotalMilliseconds);
                    }
                    candidateResp.Dispose();
                    await Task.Delay(Math.Min(delayMs, 5000), token);
                    continue; // Wait and try next candidate or retry
                }
                else
                {
                    resp = candidateResp;
                    break;
                }
            }

            if (resp == null)
            {
                info.HttpStatusCode = 403;
                info.ErrorMessage = StreamRequestPolicy.GetHttpErrorMessage(403, "Forbidden");
                return info;
            }

            using (resp)
            {
                if (!resp.IsSuccessStatusCode)
                {
                    int code = (int)resp.StatusCode;
                    info.HttpStatusCode = code;
                    info.ErrorMessage = StreamRequestPolicy.GetHttpErrorMessage(code, resp.ReasonPhrase);
                    return info;
                }

                string content = await ReadManifestAsync(resp.Content, token);
                if (StreamRequestPolicy.IsHtmlResponse(resp.Content.Headers.ContentType?.MediaType, content))
                {
                    info.ErrorMessage = "Stream CDN returned a bot verification or challenge page (HTML) instead of a video manifest. The stream requires browser verification or the access token has expired.";
                    return info;
                }

                if (string.IsNullOrWhiteSpace(content) || !content.Contains("#EXTM3U"))
                {
                    info.ErrorMessage = "Invalid stream manifest: response is not a valid HLS playlist";
                    return info;
                }

                string currentBaseUrl = resp.RequestMessage?.RequestUri?.ToString() ?? playlistUrl;

                // If it's a master playlist with variant streams (#EXT-X-STREAM-INF), pick highest bandwidth stream
                if (content.Contains("#EXT-X-STREAM-INF"))
                {
                    var variant = HlsMediaResolver.ParseMasterManifest(content, currentBaseUrl)
                        .MaxBy(format => format.Bandwidth);
                    if (variant?.DirectUrl is { Length: > 0 } variantUrl)
                    {
                        info.Bandwidth = variant.Bandwidth;
                        info.AudioPlaylistUrl = variant.AudioUrl;
                        currentBaseUrl = variantUrl;
                        HttpResponseMessage? mediaResp = null;
                        var varCandidates = StreamRequestPolicy.GetCandidateReferers(currentBaseUrl, effectiveWorkingReferer, pageUrl);

                        foreach (var candRef in varCandidates)
                        {
                            using var mediaReq = HttpTransferRequest.Create(HttpMethod.Get, currentBaseUrl);

                            if (!string.IsNullOrEmpty(candRef))
                            {
                                mediaReq.Headers.TryAddWithoutValidation("Referer", candRef);
                                try { mediaReq.Headers.TryAddWithoutValidation("Origin", new Uri(candRef).GetLeftPart(UriPartial.Authority)); } catch { }
                            }
                            if (!string.IsNullOrEmpty(userAgent)) mediaReq.Headers.TryAddWithoutValidation("User-Agent", userAgent);
                            var scopedCookies = CookieHeaderPolicy.Select(cookies, currentBaseUrl, credentialSourceUrl);
                            DownloadRedirectHandler.ApplyCookies(mediaReq, cookies, credentialSourceUrl);
                            mediaReq.Headers.TryAddWithoutValidation("Accept", "*/*");

                            var cResp = await _httpClient.SendAsync(mediaReq, HttpCompletionOption.ResponseHeadersRead, token);
                            if (cResp.IsSuccessStatusCode)
                            {
                                mediaResp = cResp;
                                effectiveWorkingReferer = candRef;
                                info.EffectiveReferer = candRef;
                                break;
                            }
                            else if (cResp.StatusCode == System.Net.HttpStatusCode.Forbidden || cResp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                            {
                                cResp.Dispose();
                                continue;
                            }
                            else
                            {
                                mediaResp = cResp;
                                break;
                            }
                        }

                        if (mediaResp == null)
                        {
                            info.HttpStatusCode = 403;
                            info.ErrorMessage = StreamRequestPolicy.GetHttpErrorMessage(403, "Forbidden");
                            return info;
                        }

                        using (mediaResp)
                        {
                            if (!mediaResp.IsSuccessStatusCode)
                            {
                                int code = (int)mediaResp.StatusCode;
                                info.HttpStatusCode = code;
                                info.ErrorMessage = StreamRequestPolicy.GetHttpErrorMessage(code, mediaResp.ReasonPhrase);
                                return info;
                            }
                            content = await ReadManifestAsync(mediaResp.Content, token);
                            string newBase = mediaResp.RequestMessage?.RequestUri?.ToString() ?? currentBaseUrl;
                            currentBaseUrl = StreamRequestPolicy.CombineHlsUri(currentBaseUrl, newBase);
                        }
                    }
                }

                content = HlsManifestSnapshot.Normalize(content, currentBaseUrl);

                // Parse duration and bitrate from media manifest
                info.TotalDuration = HlsMediaResolver.ParseTotalDuration(content);
                if (info.Bandwidth <= 0)
                {
                    info.Bandwidth = HlsMediaResolver.ParseBitrate(content);
                }

                // Whole-file fMP4 fragments can use the same bounded workers as TS.
                // Byte ranges and encrypted initialization sections still use FFmpeg.
                bool fragmented = content.Contains("#EXT-X-MAP:");
                if (content.Contains("#EXT-X-BYTERANGE:") ||
                    (fragmented && (content.Contains("BYTERANGE=") || content.Contains("#EXT-X-KEY:METHOD=AES-128"))))
                {
                    int segCount = Regex.Matches(content, @"#EXTINF", RegexOptions.IgnoreCase).Count;
                    info.ExpectedBytes = HlsMediaResolver.CalculateExpectedTotalBytes(info.TotalDuration, info.Bandwidth, 0, segCount);
                    info.IsEncrypted = true;
                    return info;
                }

                // Parse media segments
                if (fragmented)
                {
                    info.FragmentedPlaylist = content;
                    RewriteFragmentedPlaylist(content, url =>
                    {
                        info.SegmentUrls.Add(url);
                        info.SegmentEncryption.Add(null);
                        return url;
                    });
                }
                else foreach (var segment in HlsAes128.ParseSegments(content, currentBaseUrl))
                {
                    info.SegmentUrls.Add(segment.Url);
                    info.SegmentEncryption.Add(segment.Encryption);
                }

                // Calculate expected total bytes
                info.ExpectedBytes = HlsMediaResolver.CalculateExpectedTotalBytes(info.TotalDuration, info.Bandwidth, 0, info.SegmentUrls.Count);

                return info;
            }
        }
        catch (OperationCanceledException)
        {
            return null;
        }
        catch (InvalidDataException) { throw; }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] ParseHlsPlaylistAsync error: {ex.Message}");
            info.ErrorMessage = $"Network error while contacting stream host: {ex.Message}";
            return info;
        }
    }

    internal static string RewriteFragmentedPlaylist(string normalizedPlaylist, Func<string, string> mapResource)
    {
        return string.Join('\n', normalizedPlaylist.Split('\n').Select(raw =>
        {
            var line = raw.Trim();
            if (line.StartsWith("#EXT-X-MAP:", StringComparison.Ordinal))
                return Regex.Replace(line, "URI=\"([^\"]+)\"", match => "URI=\"" + mapResource(match.Groups[1].Value) + "\"");
            return line.Length == 0 || line.StartsWith('#') ? line : mapResource(line);
        }));
    }

}
