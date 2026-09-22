using System;
using System.Collections.Concurrent;
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

    // In-memory cache with 15-minute TTL: enables sub-millisecond instant responses for repeated queries
    private static readonly ConcurrentDictionary<string, (DateTime ExpireAt, YouTubeResolveResult Result)> _cache = new(StringComparer.OrdinalIgnoreCase);

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
                    if (!string.IsNullOrEmpty(id) && id.Length >= 5) return id;
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

    public static bool IsYouTubeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        return !string.IsNullOrEmpty(ExtractYouTubeVideoId(url));
    }

    public static async Task<YouTubeResolveResult> ResolveYouTubeFormatsAsync(string targetUrl)
    {
        var result = new YouTubeResolveResult();
        string? videoId = ExtractYouTubeVideoId(targetUrl);
        if (string.IsNullOrEmpty(videoId)) return result;

        result.VideoId = videoId;

        // Check memory cache first
        if (_cache.TryGetValue(videoId, out var cached) && DateTime.UtcNow < cached.ExpireAt && cached.Result.Success)
        {
            return cached.Result;
        }

        // Native YoutubeExplode Resolver with signature deciphering (Concurrent execution for 2x speed)
        try
        {
            var manifestTask = _ytClient.Videos.Streams.GetManifestAsync(videoId).AsTask();
            var videoTask = _ytClient.Videos.GetAsync(videoId).AsTask();

            YoutubeExplode.Videos.Streams.StreamManifest streamManifest;
            try
            {
                streamManifest = await manifestTask;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to get stream manifest for {videoId}: {ex.Message}");
                return result;
            }

            string title = "YouTube Video";
            try
            {
                var video = await videoTask;
                if (!string.IsNullOrWhiteSpace(video.Title)) title = video.Title;
            }
            catch { }
            result.Title = title;

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
                _cache[videoId] = (DateTime.UtcNow.AddMinutes(15), result);
                return result;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"YoutubeClient resolution failed for {videoId}: {ex.Message}");
        }

        return result;
    }
}
