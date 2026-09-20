using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using YoutubeExplode;
using YoutubeExplode.Videos.Streams;

namespace SmartDm.Desktop.Avalonia.Services;

public class YouTubeResolveResult
{
    public bool Success { get; set; }
    public string Title { get; set; } = "YouTube Video";
    public string VideoId { get; set; } = string.Empty;
    public List<MediaFormatDto> Formats { get; set; } = new();
}

public static class YouTubeMediaResolver
{
    private static readonly YoutubeClient _ytClient = new();

    private static readonly HttpClient _httpClient = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(12)
    };

    public static string? ExtractYouTubeVideoId(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;

        try
        {
            if (Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
            {
                var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
                string? v = query["v"];
                if (!string.IsNullOrEmpty(v) && v.Length >= 5) return v;

                if (uri.AbsolutePath.Contains("/shorts/"))
                {
                    var segs = uri.AbsolutePath.Split("/shorts/")[1].Split('/');
                    if (segs.Length > 0 && segs[0].Length >= 5) return segs[0];
                }

                if (uri.Host.Contains("youtu.be"))
                {
                    string id = uri.AbsolutePath.TrimStart('/').Split('?')[0].Split('/')[0];
                    if (id.Length >= 5) return id;
                }
            }
        }
        catch { }

        var match = System.Text.RegularExpressions.Regex.Match(url, @"[?&]v=([^&#]+)");
        if (match.Success && match.Groups[1].Value.Length >= 5) return match.Groups[1].Value;

        var shortMatch = System.Text.RegularExpressions.Regex.Match(url, @"/shorts/([^?&#/]+)");
        if (shortMatch.Success && shortMatch.Groups[1].Value.Length >= 5) return shortMatch.Groups[1].Value;

        var beMatch = System.Text.RegularExpressions.Regex.Match(url, @"youtu\.be/([^?&#/]+)");
        if (beMatch.Success && beMatch.Groups[1].Value.Length >= 5) return beMatch.Groups[1].Value;

        return null;
    }

    public static async Task<YouTubeResolveResult> ResolveYouTubeFormatsAsync(string targetUrl)
    {
        var result = new YouTubeResolveResult();
        string? videoId = ExtractYouTubeVideoId(targetUrl);
        if (string.IsNullOrEmpty(videoId)) return result;

        result.VideoId = videoId;

        // --- METHOD 1: Native YoutubeExplode Resolver (Bypasses bot check, full 4K/1080p/audio extraction) ---
        try
        {
            var video = await _ytClient.Videos.GetAsync(videoId);
            string title = !string.IsNullOrWhiteSpace(video.Title) ? video.Title : "YouTube Video";
            result.Title = title;

            var streamManifest = await _ytClient.Videos.Streams.GetManifestAsync(videoId);

            // Find best audio stream (prefer m4a/mp4 for broad muxing compatibility)
            var audioStreams = streamManifest.GetAudioOnlyStreams().OrderByDescending(s => s.Bitrate).ToList();
            var bestAudio = audioStreams.FirstOrDefault(s => s.Container.Name.Equals("mp4", StringComparison.OrdinalIgnoreCase)) ?? audioStreams.FirstOrDefault();
            string? bestAudioUrl = bestAudio?.Url;
            long bestAudioSize = bestAudio?.Size.Bytes ?? 0;

            var list = new List<MediaFormatDto>();
            var videoStreams = streamManifest.GetVideoStreams().ToList();

            // Group/Distinct by resolution + container, ordered highest resolution first
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var stream in videoStreams.OrderByDescending(s => s.VideoQuality.MaxHeight).ThenByDescending(s => s.Bitrate))
            {
                string qualityLabel = stream.VideoQuality.Label;
                string ext = stream.Container.Name.ToLowerInvariant();
                string key = $"{qualityLabel}_{ext}";
                if (!seen.Add(key)) continue;

                long totalBytes = stream.Size.Bytes;
                bool isVideoOnly = stream is VideoOnlyStreamInfo;
                if (isVideoOnly && bestAudioSize > 0)
                {
                    totalBytes += bestAudioSize;
                }

                list.Add(new MediaFormatDto
                {
                    FormatId = qualityLabel,
                    Resolution = qualityLabel,
                    Ext = ext,
                    FileSize = totalBytes,
                    IsAudioOnly = false,
                    Title = title,
                    DirectUrl = stream.Url,
                    AudioUrl = isVideoOnly ? bestAudioUrl : null
                });
            }

            // Append MP3 option
            if (!string.IsNullOrEmpty(bestAudioUrl))
            {
                list.Add(new MediaFormatDto
                {
                    FormatId = "bestaudio/best",
                    Resolution = "Audio (MP3 / High Quality)",
                    Ext = "mp3",
                    FileSize = bestAudioSize,
                    IsAudioOnly = true,
                    Title = title,
                    DirectUrl = bestAudioUrl,
                    AudioUrl = null
                });
            }

            // Append HD Thumbnail option
            list.Add(new MediaFormatDto
            {
                FormatId = "thumbnail",
                Resolution = "Thumbnail (Cover Image / HD)",
                Ext = "jpg",
                FileSize = 0,
                IsAudioOnly = false,
                Title = title,
                DirectUrl = $"https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg",
                AudioUrl = null
            });

            if (list.Count > 0)
            {
                result.Success = true;
                result.Formats = list;
                return result;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"YoutubeClient resolution failed for {videoId}: {ex.Message}. Falling back to Innertube...");
        }

        // --- METHOD 2: Direct Innertube ANDROID_VR fallback ---
        try
        {
            var reqObj = new
            {
                videoId = videoId,
                contentCheckOk = true,
                racyCheckOk = true,
                context = new
                {
                    client = new
                    {
                        clientName = "ANDROID_VR",
                        clientVersion = "1.56.21",
                        androidSdkVersion = 32
                    }
                }
            };

            using var message = new HttpRequestMessage(HttpMethod.Post, "https://www.youtube.com/youtubei/v1/player")
            {
                Content = new StringContent(JsonSerializer.Serialize(reqObj), Encoding.UTF8, "application/json")
            };
            message.Headers.Add("User-Agent", "com.google.android.youtube/1.56.21 (Linux; U; Android 11)");

            var response = await _httpClient.SendAsync(message);
            if (!response.IsSuccessStatusCode) return result;

            var body = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (!root.TryGetProperty("streamingData", out var streamingData)) return result;

            string title = "YouTube Video";
            if (root.TryGetProperty("videoDetails", out var videoDetails) &&
                videoDetails.TryGetProperty("title", out var titleElem))
            {
                title = titleElem.GetString() ?? title;
            }

            result.Title = title;

            // 1. Identify best audio stream
            string? defaultAudioUrl = null;
            long defaultAudioSize = 0;
            if (streamingData.TryGetProperty("adaptiveFormats", out var adaptiveElem))
            {
                foreach (var f in adaptiveElem.EnumerateArray())
                {
                    string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                    if (mime.Contains("audio/"))
                    {
                        string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                        if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                        {
                            long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                            string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                            if (defaultAudioUrl == null || itag == "140")
                            {
                                defaultAudioUrl = streamUrl;
                                defaultAudioSize = clen;
                            }
                        }
                    }
                }
            }

            var list = new List<MediaFormatDto>();

            // 2. Video streams from adaptiveFormats (4K, 1440p, 1080p, 720p, etc.)
            if (streamingData.TryGetProperty("adaptiveFormats", out adaptiveElem))
            {
                foreach (var f in adaptiveElem.EnumerateArray())
                {
                    string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                    if (mime.Contains("video/"))
                    {
                        string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                        if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                        {
                            string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                            string quality = f.TryGetProperty("qualityLabel", out var ql) ? ql.GetString() ?? "" : "Video";
                            long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                            long totalSize = defaultAudioSize > 0 ? clen + defaultAudioSize : clen;
                            string ext = mime.Contains("webm") ? "webm" : "mp4";

                            list.Add(new MediaFormatDto
                            {
                                FormatId = itag,
                                Resolution = quality,
                                Ext = ext,
                                FileSize = totalSize,
                                IsAudioOnly = false,
                                Title = title,
                                DirectUrl = streamUrl,
                                AudioUrl = defaultAudioUrl
                            });
                        }
                    }
                }
            }

            // 3. Combined direct formats (360p, 720p)
            if (streamingData.TryGetProperty("formats", out var combinedElem))
            {
                foreach (var f in combinedElem.EnumerateArray())
                {
                    string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                    if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                    {
                        string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                        string quality = f.TryGetProperty("qualityLabel", out var ql) ? ql.GetString() ?? "" : "360p";
                        long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                        string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                        string ext = mime.Contains("webm") ? "webm" : "mp4";

                        list.Add(new MediaFormatDto
                        {
                            FormatId = itag,
                            Resolution = quality + " (Direct)",
                            Ext = ext,
                            FileSize = clen,
                            IsAudioOnly = false,
                            Title = title,
                            DirectUrl = streamUrl,
                            AudioUrl = null
                        });
                    }
                }
            }

            if (list.Count > 0)
            {
                // 4. Dynamic MP3 audio option
                list.Add(new MediaFormatDto
                {
                    FormatId = "bestaudio/best",
                    Resolution = "Audio (MP3 / High Quality)",
                    Ext = "mp3",
                    FileSize = defaultAudioSize,
                    IsAudioOnly = true,
                    Title = title,
                    DirectUrl = defaultAudioUrl,
                    AudioUrl = null
                });

                // 5. Dynamic HD Thumbnail option
                list.Add(new MediaFormatDto
                {
                    FormatId = "thumbnail",
                    Resolution = "Thumbnail (Cover Image / HD)",
                    Ext = "jpg",
                    FileSize = 0,
                    IsAudioOnly = false,
                    Title = title,
                    DirectUrl = $"https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg",
                    AudioUrl = null
                });

                result.Formats = list;
                result.Success = true;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"YouTubeMediaResolver error: {ex.Message}");
        }

        return result;
    }
}
