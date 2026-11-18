using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace SmartDm.Desktop.Avalonia.Services;

public static class StreamRequestPolicy
{
    public static string GetHttpErrorMessage(int statusCode, string? reasonPhrase = null)
    {
        return statusCode switch
        {
            410 => "Stream link expired (HTTP 410 Gone). Please refresh the video page in your browser for a fresh link.",
            403 => "Access denied (HTTP 403 Forbidden). CDN token expired or signature invalid. Please refresh the page in browser.",
            404 => "Stream not found (HTTP 404). File is no longer available on the server.",
            401 => "Authentication required (HTTP 401 Unauthorized).",
            _ => $"Server returned HTTP {statusCode} ({reasonPhrase ?? "Error"})"
        };
    }

    public static string CombineHlsUri(string baseUrl, string relativeOrAbsoluteUri)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsoluteUri)) return baseUrl;

        Uri baseUri;
        try
        {
            baseUri = new Uri(baseUrl);
        }
        catch
        {
            return relativeOrAbsoluteUri;
        }

        Uri targetUri;
        if (!Uri.TryCreate(relativeOrAbsoluteUri, UriKind.Absolute, out var absUri))
        {
            targetUri = new Uri(baseUri, relativeOrAbsoluteUri);
        }
        else
        {
            targetUri = absUri;
        }

        string baseQuery = baseUri.Query.TrimStart('?');
        string targetQuery = targetUri.Query.TrimStart('?');

        if (string.IsNullOrEmpty(baseQuery))
        {
            return targetUri.ToString();
        }

        if (string.IsNullOrEmpty(targetQuery))
        {
            var builder = new UriBuilder(targetUri) { Query = baseQuery };
            return builder.Uri.ToString();
        }

        // Merge query parameters so security tokens and signatures from baseUri are preserved
        var paramMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in baseQuery.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string k = eq >= 0 ? pair[..eq] : pair;
            string v = eq >= 0 ? pair[(eq + 1)..] : "";
            paramMap[k] = v;
        }
        foreach (var pair in targetQuery.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string k = eq >= 0 ? pair[..eq] : pair;
            string v = eq >= 0 ? pair[(eq + 1)..] : "";
            paramMap[k] = v;
        }

        string mergedQuery = string.Join("&", paramMap.Select(kv => string.IsNullOrEmpty(kv.Value) ? kv.Key : $"{kv.Key}={kv.Value}"));
        var finalBuilder = new UriBuilder(targetUri) { Query = mergedQuery };
        return finalBuilder.Uri.ToString();
    }

    public static List<string> GetCandidateReferers(string targetUrl, string? primaryReferer, string? pageUrl = null)
    {
        var list = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? r)
        {
            if (string.IsNullOrWhiteSpace(r)) return;
            string trimmed = r.Trim();
            if (!seen.Contains(trimmed))
            {
                seen.Add(trimmed);
                list.Add(trimmed);
            }
        }

        // 0. Prioritize specific watch page permalink (e.g. viewkey=...) over generic category/listing referer
        bool isPornhubTarget = targetUrl.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) ||
                               targetUrl.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase);
        if (isPornhubTarget && !string.IsNullOrEmpty(pageUrl) && pageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrEmpty(primaryReferer) || !primaryReferer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            Add(pageUrl);
        }

        // 1. Primary authentic referer as supplied
        Add(primaryReferer);

        // 2. Origin of primary referer (e.g. https://embed-host.com/)
        if (!string.IsNullOrEmpty(primaryReferer))
        {
            try
            {
                var uri = new Uri(primaryReferer);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
            }
            catch { }
        }

        // 3. Page / Video URL if distinct
        Add(pageUrl);
        if (!string.IsNullOrEmpty(pageUrl))
        {
            try
            {
                var uri = new Uri(pageUrl);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
            }
            catch { }
        }

        void AddHostAndRoot(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return;
            try
            {
                var uri = new Uri(url);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
                string host = uri.Host;
                var parts = host.Split('.');
                if (parts.Length > 2)
                {
                    string rootDomain = string.Join(".", parts.Skip(parts.Length - 2));
                    Add($"{uri.Scheme}://{rootDomain}/");
                    Add($"{uri.Scheme}://{rootDomain}");
                }
            }
            catch { }
        }

        // 4. Target stream's own host origin and root domain origin (e.g. https://owocdn.top/, https://flixcloud.cc/)
        AddHostAndRoot(targetUrl);
        AddHostAndRoot(primaryReferer);
        AddHostAndRoot(pageUrl);

        // 4a. Meta / Facebook / Instagram CDN referer candidates
        bool isMetaCdn = targetUrl.Contains("fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
                         targetUrl.Contains("cdninstagram.com", StringComparison.OrdinalIgnoreCase) ||
                         targetUrl.Contains("instagram.com", StringComparison.OrdinalIgnoreCase) ||
                         targetUrl.Contains("facebook.com", StringComparison.OrdinalIgnoreCase);
        if (isMetaCdn)
        {
            if (targetUrl.Contains("instagram", StringComparison.OrdinalIgnoreCase) ||
                (pageUrl != null && pageUrl.Contains("instagram.com", StringComparison.OrdinalIgnoreCase)))
            {
                Add("https://www.instagram.com/");
                Add("https://www.facebook.com/");
            }
            else
            {
                Add("https://www.facebook.com/");
                Add("https://www.instagram.com/");
            }
        }

        // 4b. Specific Movie CDN to embedder/page mappings
        if (targetUrl.Contains("stellarconductornexus.com", StringComparison.OrdinalIgnoreCase) ||
            targetUrl.Contains("stellar", StringComparison.OrdinalIgnoreCase) ||
            (pageUrl != null && pageUrl.Contains("hydrahd", StringComparison.OrdinalIgnoreCase)) ||
            (primaryReferer != null && primaryReferer.Contains("hydrahd", StringComparison.OrdinalIgnoreCase)))
        {
            Add("https://hydrahd.gd/");
            Add("https://hydrahd.com/");
            Add("https://hydrahd.net/");
            Add("https://stellarconductornexus.com/");
        }
        if (targetUrl.Contains("goldenkite.top", StringComparison.OrdinalIgnoreCase) ||
            (pageUrl != null && (pageUrl.Contains("ramoflix", StringComparison.OrdinalIgnoreCase) || pageUrl.Contains("111movies", StringComparison.OrdinalIgnoreCase))) ||
            (primaryReferer != null && (primaryReferer.Contains("ramoflix", StringComparison.OrdinalIgnoreCase) || primaryReferer.Contains("111movies", StringComparison.OrdinalIgnoreCase))))
        {
            Add("https://ramoflix.net/");
            Add("https://111movies.com/");
            Add("https://111movies.net/");
            Add("https://moon.goldenkite.top/");
            Add("https://goldenkite.top/");
        }
        if (targetUrl.Contains("jabroni.mov", StringComparison.OrdinalIgnoreCase) ||
            (pageUrl != null && pageUrl.Contains("goojara", StringComparison.OrdinalIgnoreCase)) ||
            (primaryReferer != null && primaryReferer.Contains("goojara", StringComparison.OrdinalIgnoreCase)))
        {
            Add("https://ww1.goojara.to/");
            Add("https://goojara.to/");
            Add("https://drw.jabroni.mov/");
            Add("https://jabroni.mov/");
        }
        if (targetUrl.Contains("wmovies.nl", StringComparison.OrdinalIgnoreCase) ||
            (pageUrl != null && pageUrl.Contains("wmovies", StringComparison.OrdinalIgnoreCase)) ||
            (primaryReferer != null && primaryReferer.Contains("wmovies", StringComparison.OrdinalIgnoreCase)))
        {
            Add("https://wmovies.nl/");
        }

        // 4c. Known embed hosts and streaming video providers
        Add("https://jabroni.mov/");
        Add("https://drw.jabroni.mov/");
        Add("https://goldenkite.top/");
        Add("https://moon.goldenkite.top/");
        Add("https://stellarconductornexus.com/");
        Add("https://shiora.top/");
        Add("https://owocdn.top/");
        Add("https://111movies.com/");
        Add("https://111movies.net/");
        Add("https://goojara.to/");
        Add("https://hydrahd.gd/");
        Add("https://ramoflix.net/");
        Add("https://wmovies.nl/");
        Add("https://megacloud.tv/");
        Add("https://rapid-cloud.ru/");
        Add("https://rabbitstream.net/");
        Add("https://megaplay.buzz/");
        Add("https://gogoanime.com.by/");
        Add("https://streamtape.com/");
        Add("https://aniwave.gr/");
        Add("https://hianime.to/");
        Add("https://vidsrc.stream/");
        Add("https://2embed.stream/");

        // 4c. Anime specific CDN to embedder/page mappings
        if (targetUrl.Contains("owocdn.top", StringComparison.OrdinalIgnoreCase))
        {
            Add("https://kwik.cx/");
            Add("https://animepahe.pw/");
            Add("https://animepahe.org/");
            Add("https://animepahe.ru/");
            Add("https://animepahe.com/");
        }
        if (targetUrl.Contains("shiora.top", StringComparison.OrdinalIgnoreCase) || targetUrl.Contains("megap", StringComparison.OrdinalIgnoreCase))
        {
            Add("https://animesuge.tv/");
            Add("https://megaplay.buzz/");
            Add("https://megacloud.tv/");
        }
        if (targetUrl.Contains("sunwave", StringComparison.OrdinalIgnoreCase) || targetUrl.Contains("sunwaveclear.top", StringComparison.OrdinalIgnoreCase))
        {
            Add("https://miruro.to/");
            Add("https://miruro.online/");
        }
        if (targetUrl.Contains("nexus", StringComparison.OrdinalIgnoreCase) || (pageUrl != null && pageUrl.Contains("nexus", StringComparison.OrdinalIgnoreCase)))
        {
            Add("https://anime.nexus/");
        }
        if (targetUrl.Contains("anizone", StringComparison.OrdinalIgnoreCase) || (pageUrl != null && pageUrl.Contains("anizone", StringComparison.OrdinalIgnoreCase)))
        {
            Add("https://anizone.to/");
        }

        // 5. Blank / empty (no referer / anti-hotlink bypass)
        if (!seen.Contains(""))
        {
            list.Add("");
        }

        return list;
    }

    public static bool IsStreamingCdn(string? url, string? mediaKind = null)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (string.Equals(mediaKind, "hls", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mediaKind, "dash", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        string lower = url.ToLowerInvariant();
        if (lower.Contains(".m3u8") || lower.Contains(".mpd")) return true;

        string[] cdnIndicators = new string[]
        {
            "goldenkite.top", "stellarconductornexus.com", "jabroni.mov", "shiora.top", "owocdn.top",
            "shioricdn.top", "streamtape.com", "rabbitstream.net", "megacloud.tv", "rapid-cloud.ru",
            "vidsrc", "2embed", "autoembed", "superembed", "streamembed", "filemoon", "dood",
            "mixdrop", "streamwish", "mp4upload", "upstream", "vidcloud", "akamaized.net", "byteoversea.com",
            "111movies", "wmovies", "ramoflix", "hydrahd", "goojara", "sunwaveclear.top", "sunwave",
            "anime.nexus", "kwik.cx", "anizone"
        };

        foreach (var cdn in cdnIndicators)
        {
            if (lower.Contains(cdn)) return true;
        }

        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            string host = uri.Host.ToLowerInvariant();
            if (host.EndsWith(".top") || host.EndsWith(".mov") || host.EndsWith(".stream") || host.EndsWith(".buzz"))
            {
                return true;
            }
        }

        return false;
    }

    public static bool IsHtmlResponse(string? contentType, string? bodyPrefix)
    {
        if (!string.IsNullOrEmpty(contentType) && contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        if (!string.IsNullOrEmpty(bodyPrefix))
        {
            string trimmed = bodyPrefix.TrimStart();
            if (trimmed.StartsWith("<!DOCTYPE html", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase) ||
                trimmed.Contains("challenge-platform", StringComparison.OrdinalIgnoreCase) ||
                trimmed.Contains("Just a moment...", StringComparison.OrdinalIgnoreCase) ||
                trimmed.Contains("cf-browser-verification", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    public static string SanitizeMediaUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl)) return rawUrl ?? string.Empty;
        int query = rawUrl.IndexOf('?');
        int hash = rawUrl.IndexOf('#');
        if (query < 0 || (hash >= 0 && query > hash)) return rawUrl;
        string queryText = hash >= 0 ? rawUrl[(query + 1)..hash] : rawUrl[(query + 1)..];
        string[] parts = queryText.Split('&');
        var kept = parts.Where(p => !Regex.IsMatch(p, @"^(?:(?:bytestart|byteend)=\d+|range=\d+(?:-\d+)?)$", RegexOptions.IgnoreCase)).ToArray();
        if (kept.Length == parts.Length) return rawUrl;
        return rawUrl[..query] + (kept.Length > 0 ? "?" + string.Join("&", kept) : "") + (hash >= 0 ? rawUrl[hash..] : "");
    }


}
