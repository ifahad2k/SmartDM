using System;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public static class MediaCheckpoint
{
    public sealed record Entry(string Identity, long Length, string Sha256, string? ETag, long? WireLength);
    public static string Fingerprint(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static async Task SaveAsync(string path, string identity, string? etag, long? wireLength, CancellationToken token)
    {
        await using var file = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.Read, 65536, true);
        await file.FlushAsync(token);
        file.Flush(true);
        var hash = Convert.ToHexString(await SHA256.HashDataAsync(file, token));
        var entry = new Entry(Fingerprint(identity), file.Length, hash, etag, wireLength);
        string pending = path + ".checkpoint.tmp";
        await File.WriteAllTextAsync(pending, JsonSerializer.Serialize(entry), token);
        using (var journal = new FileStream(pending, FileMode.Open, FileAccess.Write, FileShare.None)) journal.Flush(true);
        File.Move(pending, path + ".checkpoint", true);
    }

    public static async Task<bool> CanReuseAsync(string path, string identity, HttpClient client, HttpRequestMessage probe, CancellationToken token)
    {
        try
        {
            if (!File.Exists(path) || !File.Exists(path + ".checkpoint")) return false;
            var entry = JsonSerializer.Deserialize<Entry>(await File.ReadAllTextAsync(path + ".checkpoint", token));
            if (entry == null || entry.Identity != Fingerprint(identity) || entry.ETag == null || entry.ETag.StartsWith("W/", StringComparison.Ordinal)) return false;
            using var response = await client.SendAsync(probe, HttpCompletionOption.ResponseHeadersRead, token);
            if (!response.IsSuccessStatusCode || response.Headers.ETag?.IsWeak != false || response.Headers.ETag.Tag != entry.ETag ||
                !entry.WireLength.HasValue || response.Content.Headers.ContentLength != entry.WireLength) return false;
            await using var file = File.OpenRead(path);
            return file.Length == entry.Length && Convert.ToHexString(await SHA256.HashDataAsync(file, token)) == entry.Sha256;
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch { return false; }
    }
}
