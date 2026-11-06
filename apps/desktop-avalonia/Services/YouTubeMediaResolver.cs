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
        if (!Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")) return null;
        string host = uri.IdnHost.ToLowerInvariant();
        string? id = null;
        if (host == "youtu.be") id = uri.AbsolutePath.Trim('/').Split('/')[0];
        else if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "music.youtube.com" or "www.youtube-nocookie.com")
        {
            if (uri.AbsolutePath == "/watch") id = System.Web.HttpUtility.ParseQueryString(uri.Query)["v"];
            else
            {
                var pieces = uri.AbsolutePath.Trim('/').Split('/');
                if (pieces.Length == 2 && pieces[0] is "shorts" or "embed" or "live") id = pieces[1];
            }
        }
        return id != null && System.Text.RegularExpressions.Regex.IsMatch(id, "^[A-Za-z0-9_-]{11}$") ? id : null;
    }

    public static bool IsYouTubeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        return !string.IsNullOrEmpty(ExtractYouTubeVideoId(url));
    }

    public static async Task<YouTubeResolveResult> ResolveYouTubeFormatsAsync(string targetUrl, bool forceRefresh = false)
    {
        var result = new YouTubeResolveResult();
        string? videoId = ExtractYouTubeVideoId(targetUrl);
        if (string.IsNullOrEmpty(videoId)) return result;

        result.VideoId = videoId;

        // Check memory cache first
        if (!forceRefresh && _cache.TryGetValue(videoId, out var cached) && DateTime.UtcNow < cached.ExpireAt && cached.Result.Success)
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
                Console.WriteLine($"[YouTubeMediaResolver] Failed to get stream manifest for {videoId}: {ex.GetType().Name} - {ex.Message}");
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
                string videoIdPart = System.Web.HttpUtility.ParseQueryString(new Uri(stream.Url).Query)["itag"] ?? qualityLabel + "_" + ext;
                string audioIdPart = bestAudioUrl != null ? System.Web.HttpUtility.ParseQueryString(new Uri(bestAudioUrl).Query)["itag"] ?? "unknown" : "none";
                string key = $"{videoIdPart}_{ext}_{(stream is VideoOnlyStreamInfo ? audioIdPart : "muxed")}";
                if (!seen.Add(key)) continue;

                long totalBytes = stream.Size.Bytes;
                bool isVideoOnly = stream is VideoOnlyStreamInfo;
                if (isVideoOnly && bestAudioSize > 0)
                {
                    totalBytes += bestAudioSize;
                }

                list.Add(new MediaFormatDto
                {
                    FormatId = key,
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
                    FormatId = "audio_" + (System.Web.HttpUtility.ParseQueryString(new Uri(bestAudioUrl).Query)["itag"] ?? "unknown"),
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
