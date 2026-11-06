using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// RFC 8216 identity AES-128 is transport encryption, not SAMPLE-AES/DRM.
// These records contain resource addresses and IVs; never key material.
public sealed record HlsSegmentEncryption(string KeyUrl, string IvHex);
public sealed record HlsMediaSegment(string Url, HlsSegmentEncryption? Encryption);

public static class HlsAes128
{
    public static (string? Url, string? Iv) ParseKey(string line, Uri origin)
    {
        string attributes = line["#EXT-X-KEY:".Length..];
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        int offset = 0;
        foreach (Match match in Regex.Matches(attributes, "([A-Z0-9-]+)=(\"[^\"]*\"|[^,]+)(?:,|$)"))
        {
            if (match.Index != offset || !values.TryAdd(match.Groups[1].Value, match.Groups[2].Value.Trim('"')))
                throw new InvalidDataException("Invalid HLS encryption attributes.");
            offset += match.Length;
        }
        if (offset != attributes.Length || !values.TryGetValue("METHOD", out string? method))
            throw new InvalidDataException("Invalid HLS encryption attributes.");
        if (method == "NONE" && values.Count == 1) return (null, null);
        if (method != "AES-128" || (values.TryGetValue("KEYFORMAT", out string? format) && format != "identity") ||
            (values.TryGetValue("KEYFORMATVERSIONS", out string? version) && version != "1"))
            throw new InvalidDataException("This stream uses unsupported DRM or sample encryption.");
        if (values.Keys.Any(k => k is not ("METHOD" or "URI" or "IV" or "KEYFORMAT" or "KEYFORMATVERSIONS")) ||
            !values.TryGetValue("URI", out string? address) || !Uri.TryCreate(origin, address, out var uri) ||
            uri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidDataException("HLS key resources must use HTTP or HTTPS.");
        values.TryGetValue("IV", out string? iv);
        if (iv != null)
        {
            if (!Regex.IsMatch(iv, "^0[xX][0-9a-fA-F]{1,32}$")) throw new InvalidDataException("Invalid HLS initialization vector.");
            iv = iv[2..].PadLeft(32, '0').ToUpperInvariant();
        }
        return (uri.AbsoluteUri, iv);
    }

    public static List<HlsMediaSegment> ParseSegments(string normalized, string baseUrl)
    {
        var segments = new List<HlsMediaSegment>();
        var origin = new Uri(baseUrl);
        ulong sequence = 0;
        string? keyUrl = null, explicitIv = null;
        foreach (string line in normalized.Split('\n').Select(l => l.Trim()))
        {
            if (line.StartsWith("#EXT-X-MEDIA-SEQUENCE:"))
            {
                if (segments.Count != 0 || !ulong.TryParse(line[22..], out sequence))
                    throw new InvalidDataException("Invalid HLS media sequence.");
            }
            else if (line.StartsWith("#EXT-X-KEY:")) (keyUrl, explicitIv) = ParseKey(line, origin);
            else if (line.Length != 0 && !line.StartsWith('#'))
            {
                byte[] iv = new byte[16];
                BinaryPrimitives.WriteUInt64BigEndian(iv.AsSpan(8), sequence);
                segments.Add(new(line, keyUrl == null ? null : new(keyUrl, explicitIv ?? Convert.ToHexString(iv))));
                if (sequence == ulong.MaxValue) throw new InvalidDataException("HLS media sequence exceeds the supported range.");
                sequence++;
            }
        }
        return segments;
    }
}

// Per-transfer, bounded key cache. Keys stay in memory, are copied for each
// decryptor, and are erased on eviction/disposal. Fetches use platform TLS.
public sealed class HlsAes128KeyCache : IDisposable
{
    private readonly HttpClient _client;
    private readonly bool _ownsClient;
    private readonly SemaphoreSlim _gate = new(1);
    private readonly Dictionary<string, byte[]> _keys = new();
    private readonly string? _referer, _userAgent;
    private readonly Func<string, string?> _cookies;

    public HlsAes128KeyCache(string? referer, string? userAgent, Func<string, string?> cookies, HttpClient? client = null)
    {
        _referer = referer; _userAgent = userAgent; _cookies = cookies;
        _ownsClient = client == null;
        _client = client ?? new HttpClient(new SocketsHttpHandler {AllowAutoRedirect = false, UseCookies = false,
            ConnectTimeout = TimeSpan.FromSeconds(5)}) {Timeout = Timeout.InfiniteTimeSpan};
    }

    private async Task<byte[]> GetKeyAsync(string address, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_keys.TryGetValue(address, out byte[]? cached)) return cached.ToArray();
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
            budget.CancelAfter(TimeSpan.FromSeconds(10));
            var uri = new Uri(address);
            for (int redirects = 0; redirects <= 5; redirects++)
            {
                using var request = HttpTransferRequest.Create(HttpMethod.Get, uri);
                void Header(string name, string? value)
                {
                    if (string.IsNullOrEmpty(value)) return;
                    if (value.IndexOfAny(new[] {'\r', '\n'}) >= 0) throw new InvalidDataException("Invalid media request headers.");
                    request.Headers.TryAddWithoutValidation(name, value);
                }
                Header("Referer", _referer); Header("User-Agent", _userAgent); Header("Cookie", _cookies(uri.AbsoluteUri));
                if (Uri.TryCreate(_referer, UriKind.Absolute, out var page) && page.Scheme is "http" or "https") Header("Origin", page.GetLeftPart(UriPartial.Authority));
                using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
                if ((int)response.StatusCode is >= 300 and <= 399 && response.Headers.Location is { } location)
                {
                    var next = new Uri(uri, location);
                    if (next.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(next.UserInfo) ||
                        (uri.Scheme == "https" && next.Scheme != "https"))
                        throw new InvalidDataException("Unsafe HLS key redirect.");
                    uri = next;
                    continue;
                }
                if (!response.IsSuccessStatusCode) throw new InvalidDataException("The HLS key is unavailable. Refresh the player and capture this stream again.");
                await using var stream = await response.Content.ReadAsStreamAsync(budget.Token);
                byte[] bytes = new byte[17];
                int length = await stream.ReadAtLeastAsync(bytes, bytes.Length, false, budget.Token);
                if (length != 16) { CryptographicOperations.ZeroMemory(bytes); throw new InvalidDataException("The HLS server returned an invalid AES-128 key."); }
                byte[] key = bytes[..16];
                CryptographicOperations.ZeroMemory(bytes);
                if (_keys.Count >= 32)
                {
                    string oldest = _keys.Keys.First();
                    CryptographicOperations.ZeroMemory(_keys[oldest]); _keys.Remove(oldest);
                }
                _keys.Add(address, key);
                return key.ToArray();
            }
            throw new InvalidDataException("Too many HLS key redirects.");
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (InvalidDataException) { throw; }
        catch { throw new InvalidDataException("The HLS key could not be retrieved. Refresh the player and try again."); }
        finally { _gate.Release(); }
    }

    public async Task DecryptAsync(string path, HlsSegmentEncryption encryption, CancellationToken token)
    {
        byte[] key = await GetKeyAsync(encryption.KeyUrl, token);
        string decoded = path + ".aes";
        try
        {
            using var aes = Aes.Create();
            aes.Key = key; aes.IV = Convert.FromHexString(encryption.IvHex);
            aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
            using var decryptor = aes.CreateDecryptor();
            await using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None, 65536, true))
            await using (var crypto = new CryptoStream(input, decryptor, CryptoStreamMode.Read))
            await using (var output = new FileStream(decoded, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
                await crypto.CopyToAsync(output, token);
            token.ThrowIfCancellationRequested();
            File.Move(decoded, path, true);
        }
        catch (CryptographicException) { throw new InvalidDataException("HLS segment decryption failed. Capture a fresh playlist."); }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            if (File.Exists(decoded)) File.Delete(decoded);
        }
    }

    public void Dispose()
    {
        foreach (var key in _keys.Values) CryptographicOperations.ZeroMemory(key);
        _keys.Clear(); _gate.Dispose();
        if (_ownsClient) _client.Dispose();
    }
}
