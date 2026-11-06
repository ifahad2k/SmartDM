using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace SmartDm.Desktop.Avalonia.Services;

// Browser-provided playlists are untrusted input. Only complete HTTP(S)
// media playlists may become input; HTTP identity AES-128 is handled natively.
public static class HlsManifestSnapshot
{
    public static string Normalize(string text, string baseUrl)
    {
        if (text.Length > 500_000 || !text.TrimStart().StartsWith("#EXTM3U", StringComparison.Ordinal) ||
            !text.Contains("#EXTINF:") || !text.Contains("#EXT-X-ENDLIST"))
            throw new InvalidDataException("A complete media playlist is required. Play the video and capture it again.");
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var origin) || !IsHttp(origin))
            throw new InvalidDataException("Invalid playlist address.");

        var output = new StringBuilder();
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0) continue;
            if (line.IndexOfAny(new[] { '\0', '\r' }) >= 0)
                throw new InvalidDataException("Invalid playlist characters.");
            if (!line.StartsWith('#')) line = Resolve(line, origin);
            else if (line.StartsWith("#EXT-X-KEY:", StringComparison.Ordinal))
            {
                var key = HlsAes128.ParseKey(line, origin);
                line = key.Url == null ? "#EXT-X-KEY:METHOD=NONE" :
                    "#EXT-X-KEY:METHOD=AES-128,URI=\"" + key.Url + "\"" + (key.Iv == null ? "" : ",IV=0x" + key.Iv);
            }
            else if (line is "#EXT-X-ALLOW-CACHE:YES" or "#EXT-X-ALLOW-CACHE:NO" ||
                line.StartsWith("#EXT-X-PROGRAM-DATE-TIME:", StringComparison.Ordinal) ||
                line.StartsWith("#EXT-X-DATERANGE:", StringComparison.Ordinal) ||
                (line.StartsWith('#') && !line.StartsWith("#EXT", StringComparison.Ordinal))) continue;
            else if (line.StartsWith("#EXT-X-MAP:", StringComparison.Ordinal))
            {
                if (!Regex.IsMatch(line, "URI=\"[^\"]+\"")) throw new InvalidDataException("Invalid initialization segment.");
                line = Regex.Replace(line, "URI=\"([^\"]+)\"", m => "URI=\"" + Resolve(m.Groups[1].Value, origin) + "\"");
            }
            else if (!(line == "#EXTM3U" || line == "#EXT-X-ENDLIST" || line == "#EXT-X-DISCONTINUITY" ||
                line == "#EXT-X-INDEPENDENT-SEGMENTS" || line.StartsWith("#EXTINF:", StringComparison.Ordinal) ||
                Regex.IsMatch(line, "^#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE):[0-9]+$") ||
                Regex.IsMatch(line, "^#EXT-X-BYTERANGE:[0-9]+(@[0-9]+)?$") || line == "#EXT-X-PLAYLIST-TYPE:VOD"))
                throw new InvalidDataException("This captured playlist contains unsupported features. Use a clear, complete stream.");
            output.AppendLine(line);
        }
        return output.ToString();
    }

    private static bool IsHttp(Uri uri) => uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo);
    private static string Resolve(string value, Uri origin)
    {
        if (!Uri.TryCreate(origin, value, out var uri) || !IsHttp(uri) || value.Contains('"'))
            throw new InvalidDataException("Playlist resources must use HTTP or HTTPS.");
        return uri.AbsoluteUri;
    }
}
