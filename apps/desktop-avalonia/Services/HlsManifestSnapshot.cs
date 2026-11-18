using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// Browser-provided playlists are untrusted input. Only complete HTTP(S)
// media playlists may become input; HTTP identity AES-128 is handled natively.
public static class HlsManifestSnapshot
{
    // Match the browser capture/read budget, including long signed-URL VOD.
    public const int MaxBytes = 4 * 1024 * 1024;

    public static bool IsWithinSizeLimit(string text) => text.Length <= MaxBytes && Encoding.UTF8.GetByteCount(text) <= MaxBytes;

    public static bool IsCompleteMediaPlaylist(string text) =>
        text.TrimStart().StartsWith("#EXTM3U", StringComparison.Ordinal) &&
        !text.Contains("#EXT-X-STREAM-INF:", StringComparison.Ordinal) &&
        text.Contains("#EXTINF:", StringComparison.Ordinal) &&
        text.Split('\n').Any(line => line.Trim() == "#EXT-X-ENDLIST");

    public static async Task<string> ReadAsync(HttpContent content, CancellationToken token)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        await using var stream = await content.ReadAsStreamAsync(budget.Token);
        using var data = new MemoryStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(buffer, budget.Token)) > 0)
        {
            if (data.Length + read > MaxBytes)
                throw new InvalidDataException("The media playlist exceeds the supported size.");
            await data.WriteAsync(buffer.AsMemory(0, read), budget.Token);
        }
        return Encoding.UTF8.GetString(data.ToArray());
    }

    public static string Normalize(string text, string baseUrl)
    {
        if (!IsWithinSizeLimit(text) || !IsCompleteMediaPlaylist(text))
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
            else if (line is "#EXT-X-ALLOW-CACHE:YES" or "#EXT-X-ALLOW-CACHE:NO" or "#EXT-X-I-FRAMES-ONLY" ||
                line.StartsWith("#EXT-X-PROGRAM-DATE-TIME:", StringComparison.Ordinal) ||
                line.StartsWith("#EXT-X-DATERANGE:", StringComparison.Ordinal) ||
                line.StartsWith("#EXT-X-START:", StringComparison.Ordinal) ||
                line.StartsWith("#EXT-X-MEDIA:", StringComparison.Ordinal) ||
                (line.StartsWith('#') && !line.StartsWith("#EXT", StringComparison.Ordinal))) continue;
            else if (line.StartsWith("#EXT-X-MAP:", StringComparison.Ordinal))
            {
                if (!Regex.IsMatch(line, "URI=\"[^\"]+\"")) throw new InvalidDataException("Invalid initialization segment.");
                line = Regex.Replace(line, "URI=\"([^\"]+)\"", m => "URI=\"" + Resolve(m.Groups[1].Value, origin) + "\"");
            }
            else if (!(line == "#EXTM3U" || line == "#EXT-X-ENDLIST" || line == "#EXT-X-DISCONTINUITY" ||
                line == "#EXT-X-INDEPENDENT-SEGMENTS" || line.StartsWith("#EXTINF:", StringComparison.Ordinal) ||
                Regex.IsMatch(line, "^#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE|BITRATE):[0-9]+$") ||
                Regex.IsMatch(line, "^#EXT-X-BYTERANGE:[0-9]+(@[0-9]+)?$") ||
                Regex.IsMatch(line, "^#EXT-X-PLAYLIST-TYPE:(VOD|EVENT)$")))
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
