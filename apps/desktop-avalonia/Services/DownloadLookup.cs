using System;
using System.Collections.Generic;
using System.IO;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public static class DownloadLookup
{
    public static DownloadModel? FindActiveByUrl(IEnumerable<DownloadModel> downloads, string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;

        var normalizedUrl = url.Trim();
        string? targetYtId = YouTubeMediaResolver.ExtractYouTubeVideoId(normalizedUrl);

        string? targetBaseUrl = null;
        bool isCdnStreamEndpoint = false;
        Uri? parsedUri = null;
        if (targetYtId == null && Uri.TryCreate(normalizedUrl, UriKind.Absolute, out parsedUri))
        {
            targetBaseUrl = $"{parsedUri.Scheme}://{parsedUri.Authority}{parsedUri.AbsolutePath}";
            string absPath = parsedUri.AbsolutePath.ToLowerInvariant();
            isCdnStreamEndpoint = absPath.Contains("videoplayback") ||
                                  absPath.Contains("/seg-") ||
                                  absPath.Contains("segment") ||
                                  absPath.EndsWith("/stream") ||
                                  absPath.EndsWith("/video") ||
                                  absPath.EndsWith("/manifest");
        }

        foreach (var dl in downloads)
        {
            if (dl.Status != DownloadStatus.Active &&
                dl.Status != DownloadStatus.Queued &&
                dl.Status != DownloadStatus.Paused)
            {
                continue;
            }

            // 1. Direct URL or SourcePageUrl match
            if (string.Equals(dl.Url, normalizedUrl, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(dl.SourcePageUrl) && string.Equals(dl.SourcePageUrl, normalizedUrl, StringComparison.OrdinalIgnoreCase)))
            {
                return dl;
            }

            // 2. YouTube Video ID match
            if (!string.IsNullOrEmpty(targetYtId))
            {
                string? dlYtId = YouTubeMediaResolver.ExtractYouTubeVideoId(dl.SourcePageUrl ?? dl.Url);
                if (!string.IsNullOrEmpty(dlYtId) && string.Equals(targetYtId, dlYtId, StringComparison.OrdinalIgnoreCase))
                {
                    return dl;
                }
            }

            // 3. For CDN / stream endpoints (like Googlevideo videoplayback), match only if resource identifiers match
            if (parsedUri != null && Uri.TryCreate(dl.Url, UriKind.Absolute, out var dlUri))
            {
                string targetPath = parsedUri.AbsolutePath.ToLowerInvariant();
                string dlPath = dlUri.AbsolutePath.ToLowerInvariant();

                if (targetPath.Contains("videoplayback") && dlPath.Contains("videoplayback"))
                {
                    var targetQuery = System.Web.HttpUtility.ParseQueryString(parsedUri.Query);
                    var dlQuery = System.Web.HttpUtility.ParseQueryString(dlUri.Query);
                    string? targetId = targetQuery["id"];
                    string? dlId = dlQuery["id"];
                    if (!string.IsNullOrEmpty(targetId) && !string.IsNullOrEmpty(dlId) &&
                        string.Equals(targetId, dlId, StringComparison.OrdinalIgnoreCase))
                    {
                        return dl;
                    }
                    continue;
                }

                if (isCdnStreamEndpoint)
                {
                    continue;
                }

                // 4. Static downloads with concrete filenames: match base URL without tracking query parameters
                if (targetBaseUrl != null)
                {
                    string dlBaseUrl = $"{dlUri.Scheme}://{dlUri.Authority}{dlUri.AbsolutePath}";
                    string targetFileName = Path.GetFileName(parsedUri.AbsolutePath);
                    if (!string.IsNullOrEmpty(targetFileName) &&
                        targetFileName.Contains('.') &&
                        !HttpProbeService.IsGenericName(targetFileName) &&
                        string.Equals(targetBaseUrl, dlBaseUrl, StringComparison.OrdinalIgnoreCase))
                    {
                        return dl;
                    }
                }
            }
        }

        return null;
    }

    public static bool IsPathInUse(IEnumerable<DownloadModel> downloads, string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;

        string normalizedPath;
        try
        {
            normalizedPath = Path.GetFullPath(path);
        }
        catch
        {
            normalizedPath = path;
        }

        if (File.Exists(normalizedPath))
        {
            return true;
        }

        foreach (var dl in downloads)
        {
            if (dl.Status == DownloadStatus.Completed || dl.Status == DownloadStatus.Quarantined)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(dl.SavePath))
            {
                try
                {
                    string dlFullPath = Path.GetFullPath(dl.SavePath);
                    if (string.Equals(normalizedPath, dlFullPath, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
                catch { }
            }
        }

        return false;
    }

}
