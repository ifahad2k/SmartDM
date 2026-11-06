using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class HlsResolutionResult
{
    public bool Success { get; set; }
    public string? MasterUrl { get; set; }
    public List<MediaFormatDto> Formats { get; set; } = new();
    public string? ErrorMessage { get; set; }
}

public static class HlsMediaResolver
{
    private static HttpClient _httpClient = CreateDefaultHttpClient();

    public static HttpClient CreateDefaultHttpClient() => new HttpClient(CreateDefaultHandler())
    {
        Timeout = TimeSpan.FromSeconds(8)
    };

    public static SocketsHttpHandler CreateDefaultHandler() => new SocketsHttpHandler
    {
        AutomaticDecompression = System.Net.DecompressionMethods.All,
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
        ConnectTimeout = TimeSpan.FromSeconds(5)
    };

    internal static void SetHttpClientForTesting(HttpClient? client) => _httpClient = client ?? CreateDefaultHttpClient();

    public static async Task<HlsResolutionResult> ResolveHlsFormatsAsync(
        string streamUrl,
        string? referer = null,
        string? userAgent = null,
        string? cookies = null,
        CancellationToken token = default)
    {
        var result = new HlsResolutionResult();
        if (string.IsNullOrWhiteSpace(streamUrl) || !streamUrl.Contains(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            result.ErrorMessage = "Not an HLS .m3u8 URL";
            return result;
        }

        string uaString = !string.IsNullOrWhiteSpace(userAgent)
            ? userAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

        var (initialText, effectiveUrl, workingReferer) = await FetchPlaylistWithCandidatesAsync(streamUrl, referer, uaString, cookies, token);
        if (string.IsNullOrWhiteSpace(initialText))
        {
            result.ErrorMessage = "Could not fetch playlist";
            return result;
        }

        // 1. If already a master playlist with #EXT-X-STREAM-INF, parse immediately!
        if (initialText.Contains("#EXT-X-STREAM-INF", StringComparison.OrdinalIgnoreCase))
        {
            result.MasterUrl = effectiveUrl;
            result.Formats = ParseMasterManifest(initialText, effectiveUrl);
            result.Success = result.Formats.Count > 0;
            return result;
        }

        // 2. If it's a child media playlist (#EXTINF), probe potential master candidates!
        if (initialText.Contains("#EXTINF", StringComparison.OrdinalIgnoreCase))
        {
            var candidates = GenerateMasterCandidates(streamUrl);
            foreach (var candUrl in candidates)
            {
                if (token.IsCancellationRequested) break;
                var (candText, candEffectiveUrl, _) = await FetchPlaylistWithCandidatesAsync(candUrl, workingReferer ?? referer, uaString, cookies, token);
                if (!string.IsNullOrWhiteSpace(candText) && candText.Contains("#EXT-X-STREAM-INF", StringComparison.OrdinalIgnoreCase))
                {
                    result.MasterUrl = candEffectiveUrl;
                    result.Formats = ParseMasterManifest(candText, candEffectiveUrl);
                    if (result.Formats.Count > 0)
                    {
                        result.Success = true;
                        return result;
                    }
                }
            }

            // Fallback: child playlist with no discoverable master -> return single format
            int singleHeight = ExtractResolutionNumber(streamUrl);
            if (singleHeight <= 0) singleHeight = 720;
            result.Formats.Add(new MediaFormatDto
            {
                FormatId = "hls_" + singleHeight + "p",
                Resolution = GetResolutionLabel(singleHeight),
                Ext = "mp4",
                DirectUrl = streamUrl,
                Title = GetResolutionLabel(singleHeight)
            });
            result.Success = true;
            return result;
        }

        result.ErrorMessage = "Unrecognized HLS playlist structure";
        return result;
    }

    private static async Task<(string? text, string effectiveUrl, string? workingReferer)> FetchPlaylistWithCandidatesAsync(
        string targetUrl,
        string? baseReferer,
        string userAgent,
        string? cookies,
        CancellationToken token)
    {
        var candidates = DownloadEngine.GetCandidateReferers(targetUrl, baseReferer, null);
        foreach (var candRef in candidates)
        {
            if (token.IsCancellationRequested) break;
            try
            {
                using var req = HttpTransferRequest.Create(HttpMethod.Get, targetUrl);


                if (!string.IsNullOrEmpty(candRef))
                {
                    req.Headers.TryAddWithoutValidation("Referer", candRef);
                    try
                    {
                        var uri = new Uri(candRef);
                        req.Headers.TryAddWithoutValidation("Origin", uri.GetLeftPart(UriPartial.Authority));
                    }
                    catch { }
                }

                if (!string.IsNullOrEmpty(userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", userAgent);
                if (!string.IsNullOrEmpty(cookies)) req.Headers.TryAddWithoutValidation("Cookie", cookies);
                req.Headers.TryAddWithoutValidation("Accept", "*/*");

                using var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
                cts.CancelAfter(TimeSpan.FromSeconds(4));

                using var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseContentRead, cts.Token);
                if (resp.IsSuccessStatusCode)
                {
                    string content = await resp.Content.ReadAsStringAsync(cts.Token);
                    if (content.Contains("#EXTM3U", StringComparison.OrdinalIgnoreCase))
                    {
                        string effective = resp.RequestMessage?.RequestUri?.ToString() ?? targetUrl;
                        return (content, effective, candRef);
                    }
                }
            }
            catch
            {
                // Try next candidate
            }
        }

        return (null, targetUrl, null);
    }

    private static List<string> GenerateMasterCandidates(string childUrl)
    {
        var list = new List<string>();
        void Add(string? cand)
        {
            if (!string.IsNullOrEmpty(cand) && cand != childUrl && !list.Contains(cand))
            {
                list.Add(cand);
            }
        }

        // 1. Sibling master / playlist / index in same directory
        Add(Regex.Replace(childUrl, @"\/[^/?#]+\.m3u8(\?[^#]*)?$", "/master.m3u8$1", RegexOptions.IgnoreCase));
        Add(Regex.Replace(childUrl, @"\/[^/?#]+\.m3u8(\?[^#]*)?$", "/playlist.m3u8$1", RegexOptions.IgnoreCase));
        Add(Regex.Replace(childUrl, @"\/[^/?#]+\.m3u8(\?[^#]*)?$", "/index.m3u8$1", RegexOptions.IgnoreCase));

        // 2. Strip format slug (e.g. index-f1.m3u8 -> index.m3u8, stream_720p.m3u8 -> stream.m3u8)
        Add(Regex.Replace(childUrl, @"[-_]?(?:f\d+|v\d+|a\d+|\d+p|\d+)(?=\.m3u8)", "", RegexOptions.IgnoreCase));

        // 3. Parent directory master (e.g. /1080/index.m3u8 -> /master.m3u8)
        // Guard: Only probe parent directory if the folder is a short quality tier or stream tag, NOT an HMAC hash/token (>16 chars)
        var parentMatch = Regex.Match(childUrl, @"\/([^\/?#]+)\/[^\/?#]+\.m3u8(\?[^#]*)?$", RegexOptions.IgnoreCase);
        if (parentMatch.Success)
        {
            string parentDir = parentMatch.Groups[1].Value;
            bool isSecurityToken = parentDir.Length > 16 || (parentDir.Length >= 8 && Regex.IsMatch(parentDir, @"^[a-f0-9]{8,}$|^[a-zA-Z0-9_\-]{20,}$"));
            if (!isSecurityToken)
            {
                Add(Regex.Replace(childUrl, @"\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$", "/master.m3u8$1", RegexOptions.IgnoreCase));
                Add(Regex.Replace(childUrl, @"\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$", "/playlist.m3u8$1", RegexOptions.IgnoreCase));
                Add(Regex.Replace(childUrl, @"\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$", "/index.m3u8$1", RegexOptions.IgnoreCase));
            }
        }

        return list;
    }

    public static List<MediaFormatDto> ParseMasterManifest(string content, string masterUrl)
    {
        var formats = new List<MediaFormatDto>();
        var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var seenHeights = new HashSet<int>();

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (line.StartsWith("#EXT-X-STREAM-INF", StringComparison.OrdinalIgnoreCase))
            {
                int height = 0;
                long bandwidth = 0;

                var resMatch = Regex.Match(line, @"RESOLUTION=(\d+)x(\d+)", RegexOptions.IgnoreCase);
                if (resMatch.Success)
                {
                    int.TryParse(resMatch.Groups[2].Value, out height);
                }

                var bwMatch = Regex.Match(line, @"BANDWIDTH=(\d+)", RegexOptions.IgnoreCase);
                if (bwMatch.Success)
                {
                    long.TryParse(bwMatch.Groups[1].Value, out bandwidth);
                }

                if (height <= 0)
                {
                    var nameMatch = Regex.Match(line, @"NAME=""?(\d+)p?""?", RegexOptions.IgnoreCase);
                    if (nameMatch.Success)
                    {
                        int.TryParse(nameMatch.Groups[1].Value, out height);
                    }
                }

                // Bandwidth estimation fallback if resolution is missing from attributes
                if (height <= 0 && bandwidth > 0)
                {
                    if (bandwidth >= 3_800_000) height = 1080;
                    else if (bandwidth >= 1_800_000) height = 720;
                    else if (bandwidth >= 950_000) height = 480;
                    else if (bandwidth >= 500_000) height = 360;
                    else height = 240;
                }

                if (i + 1 < lines.Length && !lines[i + 1].StartsWith("#"))
                {
                    string streamPath = lines[i + 1].Trim();
                    string fullStreamUrl = DownloadEngine.CombineHlsUri(masterUrl, streamPath);

                    // Inherit master URL query parameters (e.g. ?token=...) if variant has no query
                    if (!fullStreamUrl.Contains('?') && masterUrl.Contains('?'))
                    {
                        int qIdx = masterUrl.IndexOf('?');
                        fullStreamUrl += masterUrl.Substring(qIdx);
                    }

                    if (height <= 0)
                    {
                        height = ExtractResolutionNumber(fullStreamUrl);
                    }
                    if (height <= 0) height = 720;

                    if (!seenHeights.Contains(height))
                    {
                        seenHeights.Add(height);
                        string label = GetResolutionLabel(height);
                        formats.Add(new MediaFormatDto
                        {
                            FormatId = "hls_" + height + "p",
                            Resolution = label,
                            Ext = "mp4",
                            DirectUrl = fullStreamUrl,
                            Title = label
                        });
                    }
                }
            }
        }

        // Sort descending by resolution (2160p -> 1440p -> 1080p -> 720p -> 480p -> 360p)
        formats.Sort((a, b) => ExtractResolutionNumber(b.Resolution).CompareTo(ExtractResolutionNumber(a.Resolution)));
        return formats;
    }

    public static int ExtractResolutionNumber(string str)
    {
        if (string.IsNullOrWhiteSpace(str)) return 0;
        var m = Regex.Match(str, @"\b(2160|1440|1080|720|540|480|360|240)p?\b", RegexOptions.IgnoreCase);
        if (m.Success && int.TryParse(m.Groups[1].Value, out int res)) return res;
        var dimMatch = Regex.Match(str, @"\d+x(\d+)", RegexOptions.IgnoreCase);
        if (dimMatch.Success && int.TryParse(dimMatch.Groups[1].Value, out int dim)) return dim;
        return 0;
    }

    public static string GetResolutionLabel(int height)
    {
        return height switch
        {
            >= 2160 => "4K UHD (2160p) (MP4)",
            >= 1440 => "1440p Quad HD (MP4)",
            >= 1080 => "1080p Full HD (MP4)",
            >= 720 => "720p HD (MP4)",
            640 => "640p (MP4)",
            540 => "540p (MP4)",
            >= 480 => "480p SD (MP4)",
            >= 360 => "360p SD (MP4)",
            _ => $"{height}p (MP4)"
        };
    }
}
