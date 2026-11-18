using System;
using System.Collections.Generic;
using System.Linq;

namespace SmartDm.Desktop.Avalonia.Services;

public static class CookieHeaderPolicy
{
    public static string? Select(string? cookieData, string? targetUrl, string? sourceUrl = null)
    {
        if (string.IsNullOrWhiteSpace(cookieData)) return null;

        if (!cookieData.Contains("\t"))
        {
            // Raw headers have no domain/path/Secure metadata: bind them to the observed request.
            if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var source) ||
                !Uri.TryCreate(targetUrl, UriKind.Absolute, out var destination) ||
                source.Scheme != destination.Scheme || source.IdnHost != destination.IdnHost ||
                source.Port != destination.Port || source.AbsolutePath != destination.AbsolutePath) return null;
            return cookieData.IndexOfAny(new[] {'\r', '\n'}) >= 0 ? null : cookieData.Trim();
        }

        if (!Uri.TryCreate(targetUrl, UriKind.Absolute, out var target)) return null;
        var pairs = new List<(string Pair, int PathLength)>();
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        foreach (var raw in cookieData.Split(new[] {'\r', '\n'}, StringSplitOptions.RemoveEmptyEntries))
        {
            string line = raw.StartsWith("#HttpOnly_", StringComparison.Ordinal) ? raw[10..] : raw;
            if (line.StartsWith('#')) continue;
            string[] parts = line.Split('\t');
            if (parts.Length < 7) continue;
            string domain = parts[0].TrimStart('.');
            bool domainMatch = target.Host.Equals(domain, StringComparison.OrdinalIgnoreCase) ||
                (parts[1].Equals("TRUE", StringComparison.OrdinalIgnoreCase) && target.Host.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase));
            string path = string.IsNullOrEmpty(parts[2]) ? "/" : parts[2];
            bool pathMatch = target.AbsolutePath == path || (target.AbsolutePath.StartsWith(path, StringComparison.Ordinal) &&
                (path.EndsWith('/') || (target.AbsolutePath.Length > path.Length && target.AbsolutePath[path.Length] == '/')));
            if (!domainMatch || !pathMatch || (parts[3].Equals("TRUE", StringComparison.OrdinalIgnoreCase) && target.Scheme != "https") ||
                (long.TryParse(parts[4], out long expires) && expires > 0 && expires <= now)) continue;
            if (string.IsNullOrEmpty(parts[5]) || parts[5].IndexOfAny(new[] {'\r', '\n', ';'}) >= 0 || parts[6].IndexOfAny(new[] {'\r', '\n'}) >= 0) continue;
            pairs.Add(($"{parts[5]}={parts[6]}", path.Length));
        }
        return pairs.Count > 0 ? string.Join("; ", pairs.OrderByDescending(p => p.PathLength).Select(p => p.Pair)) : null;
    }

}
