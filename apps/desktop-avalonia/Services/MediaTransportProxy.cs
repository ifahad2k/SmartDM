using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;

namespace SmartDm.Desktop.Avalonia.Services;

// FFmpeg sees only capability URLs. Remote TLS, redirects and credentials stay in
// the .NET transport. The proxy also rejects arbitrary absolute proxy requests.
public sealed class MediaTransportProxy : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _stop;
    private readonly HttpClient _client;
    private readonly string? _cookies, _referer, _userAgent;
    private readonly string _credentialSource;
    private readonly ConcurrentDictionary<string, Uri> _resources = new();
    private readonly ConcurrentDictionary<string, Uri> _inputs = new();
    private readonly ConcurrentDictionary<string, bool> _manifests = new();
    private readonly ConcurrentDictionary<string, string> _snapshots = new();
    private readonly ConcurrentDictionary<int, Task> _requests = new();
    private readonly SemaphoreSlim _slots = new(8);
    private readonly Task _runner;
    private int _nextId;
    private readonly string _capability = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public string Address { get; }

    public MediaTransportProxy(string credentialSource, string? cookies, string? referer, string? userAgent,
        CancellationToken token, HttpMessageHandler? transport = null)
    {
        _credentialSource = credentialSource; _cookies = cookies; _referer = referer; _userAgent = userAgent;
        _client = new HttpClient(new DownloadRedirectHandler(transport ?? new SocketsHttpHandler
            {AllowAutoRedirect = false, UseCookies = false, AutomaticDecompression = DecompressionMethods.All, ConnectTimeout = TimeSpan.FromSeconds(15)}))
            {Timeout = Timeout.InfiniteTimeSpan};
        _stop = CancellationTokenSource.CreateLinkedTokenSource(token);
        _listener.Start(8);
        Address = $"http://127.0.0.1:{((IPEndPoint)_listener.LocalEndpoint).Port}";
        _runner = RunAsync();
    }

    public string AddInput(string url, string? snapshot = null, bool manifest = false)
    {
        var uri = RequireHttp(url);
        if (manifest || snapshot != null || uri.AbsolutePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase) ||
            uri.AbsolutePath.EndsWith(".mpd", StringComparison.OrdinalIgnoreCase)) _manifests[uri.AbsoluteUri] = true;
        if (!string.IsNullOrWhiteSpace(snapshot))
        {
            if (!HlsManifestSnapshot.IsWithinSizeLimit(snapshot)) throw new InvalidDataException("Media playlist is too large.");
            _snapshots[uri.AbsoluteUri] = snapshot;
        }
        string extension = uri.AbsolutePath.EndsWith(".mpd", StringComparison.OrdinalIgnoreCase) ? ".mpd" :
            snapshot != null || uri.AbsolutePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase) ? ".m3u8" : ".media";
        string path = "/" + _capability + "/input-" + Guid.NewGuid().ToString("N") + extension;
        _inputs[path] = uri;
        return Address + path;
    }

    private static Uri RequireHttp(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") ||
            !string.IsNullOrEmpty(uri.UserInfo)) throw new InvalidDataException("Unsupported media resource.");
        return uri;
    }

    private string Map(Uri uri)
    {
        RequireHttp(uri.AbsoluteUri);
        // A directory capability preserves DASH template substitutions and query strings.
        var directory = new Uri(uri, ".");
        string key = directory.AbsoluteUri;
        string id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
        if (_resources.Count >= 4096 && !_resources.ContainsKey(id)) throw new InvalidDataException("Too many media origins.");
        _resources[id] = directory;
        return Address + "/" + _capability + "/" + id + "/" + uri.AbsoluteUri[directory.AbsoluteUri.Length..];
    }

    public string RewriteManifest(string text, Uri source)
    {
        if (!HlsManifestSnapshot.IsWithinSizeLimit(text)) throw new InvalidDataException("Media playlist is too large.");
        if (text.TrimStart().StartsWith("#EXTM3U", StringComparison.Ordinal))
        {
            bool nextIsPlaylist = false;
            return string.Join("\n", text.Split('\n').Select(raw => {
                string line = raw.Trim();
                if (line.Length == 0) return line;
                if (!line.StartsWith('#'))
                {
                    var target = RequireHttp(new Uri(source, line).AbsoluteUri);
                    if (nextIsPlaylist) _manifests[target.AbsoluteUri] = true;
                    nextIsPlaylist = false;
                    return Map(target);
                }
                if (line.StartsWith("#EXT-X-STREAM-INF:", StringComparison.Ordinal)) nextIsPlaylist = true;
                // URI attributes cover keys, maps, variants, rendition reports and media groups.
                bool playlistAttribute = line.StartsWith("#EXT-X-MEDIA:", StringComparison.Ordinal) || line.StartsWith("#EXT-X-I-FRAME-STREAM-INF:", StringComparison.Ordinal);
                line = Regex.Replace(line, "(?<=[:,])\\s*([A-Z0-9-]*URI)\\s*=\\s*\"([^\"]+)\"", m => {
                    var target = RequireHttp(new Uri(source, m.Groups[2].Value).AbsoluteUri);
                    if (playlistAttribute) _manifests[target.AbsoluteUri] = true;
                    return m.Groups[1].Value + "=\"" + Map(target) + "\"";
                }, RegexOptions.IgnoreCase);
                if (Regex.IsMatch(line, "(?<=[:,])\\s*[A-Z0-9-]*URI\\s*=\\s*(?!\")", RegexOptions.IgnoreCase)) throw new InvalidDataException("Invalid media URI attribute.");
                return line;
            }));
        }
        using var reader = XmlReader.Create(new StringReader(text), new XmlReaderSettings
            {DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = HlsManifestSnapshot.MaxBytes});
        var xml = XDocument.Load(reader);
        if (xml.Root?.Name.LocalName != "MPD") throw new InvalidDataException("Unsupported media manifest.");
        RewriteDash(xml.Root, source);
        return xml.ToString(SaveOptions.DisableFormatting);
    }

    private void RewriteDash(XElement node, Uri inherited)
    {
        var bases = node.Elements().Where(x => x.Name.LocalName == "BaseURL").ToArray();
        Uri resolved = bases.Length == 0 ? inherited : RequireHttp(new Uri(inherited, bases[0].Value.Trim()).AbsoluteUri);
        foreach (var element in bases) element.Value = Map(RequireHttp(new Uri(inherited, element.Value.Trim()).AbsoluteUri));
        // Make relative templates explicit so no reference escapes into FFmpeg's transport.
        foreach (var attribute in node.Attributes().Where(a => a.Name.LocalName is "media" or "initialization" or "sourceURL"))
            if (!string.IsNullOrWhiteSpace(attribute.Value)) attribute.Value = Map(RequireHttp(new Uri(resolved, attribute.Value).AbsoluteUri));
        if (node.Attributes().Any(a => a.Name.NamespaceName.Contains("xlink", StringComparison.Ordinal)))
            throw new InvalidDataException("External DASH document links are unsupported.");
        foreach (var child in node.Elements().Where(x => x.Name.LocalName != "BaseURL")) RewriteDash(child, resolved);
    }

    public void ConfigureInput(ProcessStartInfo psi, string input)
    {
        // Force all nested HTTP through this closed proxy. No credential or remote URL enters argv.
        psi.Environment["http_proxy"] = Address;
        psi.Environment["HTTP_PROXY"] = Address;
        psi.Environment["no_proxy"] = "";
        psi.Environment["NO_PROXY"] = "";
        psi.ArgumentList.Add("-protocol_whitelist"); psi.ArgumentList.Add("http,tcp,crypto");
        psi.ArgumentList.Add("-http_proxy"); psi.ArgumentList.Add(Address);
        psi.ArgumentList.Add("-i"); psi.ArgumentList.Add(input);
    }

    private async Task RunAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(_stop.Token);
                if (!_slots.Wait(0)) { client.Dispose(); continue; }
                int id = Interlocked.Increment(ref _nextId);
                Task request = ServeAsync(client);
                _requests[id] = request;
                _ = request.ContinueWith(_ => _requests.TryRemove(id, out var ignored), TaskScheduler.Default);
            }
        }
        catch (OperationCanceledException) { }
        catch (SocketException) when (_stop.IsCancellationRequested) { }
    }

    private async Task ServeAsync(TcpClient client)
    {
        using (client)
        using (var budget = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token))
        {
            var stream = client.GetStream();
            try
            {
                budget.CancelAfter(TimeSpan.FromSeconds(15));
                byte[] headers = new byte[16 * 1024]; int length = 0;
                string header;
                do {
                    int read = await stream.ReadAsync(headers.AsMemory(length, headers.Length - length), budget.Token);
                    if (read == 0) return;
                    length += read; header = Encoding.ASCII.GetString(headers, 0, length);
                    if (length == headers.Length && !header.Contains("\r\n\r\n")) return;
                } while (!header.Contains("\r\n\r\n"));
                var lines = header.Split("\r\n"); var request = lines[0].Split(' ');
                if (request.Length != 3 || request[0] is not ("GET" or "HEAD")) throw new InvalidDataException();
                string path = request[1];
                if (Uri.TryCreate(path, UriKind.Absolute, out var absolute))
                {
                    if (absolute.GetLeftPart(UriPartial.Authority) != Address) throw new InvalidDataException();
                    path = absolute.PathAndQuery;
                }
                string prefix = "/" + _capability + "/";
                if (!path.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidDataException();
                Uri target;
                if (_inputs.TryGetValue(path, out var input)) target = input;
                else
                {
                    string tail = path[prefix.Length..]; int separator = tail.IndexOf('/');
                    if (separator < 0 || !_resources.TryGetValue(tail[..separator], out var origin)) throw new InvalidDataException();
                    target = RequireHttp(new Uri(origin, tail[(separator + 1)..]).AbsoluteUri);
                    if (target.Scheme != origin.Scheme || target.Authority != origin.Authority) throw new InvalidDataException();
                }
                if (_snapshots.TryGetValue(target.AbsoluteUri, out string? snapshot))
                {
                    await WriteManifestAsync(stream, RewriteManifest(snapshot, target), request[0] == "HEAD", budget.Token); return;
                }
                using var outgoing = HttpTransferRequest.Create(new HttpMethod(request[0]), target.AbsoluteUri);
                string? cookie = CookieHeaderPolicy.Select(_cookies, target.AbsoluteUri, _credentialSource);
                DownloadRedirectHandler.ApplyCookies(outgoing, _cookies, _credentialSource);
                if (!string.IsNullOrEmpty(_referer)) outgoing.Headers.TryAddWithoutValidation("Referer", _referer);
                if (Uri.TryCreate(_referer, UriKind.Absolute, out var page) && page.Scheme is "http" or "https")
                    outgoing.Headers.TryAddWithoutValidation("Origin", page.GetLeftPart(UriPartial.Authority));
                if (!string.IsNullOrEmpty(_userAgent)) outgoing.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                foreach (string line in lines.Where(x => x.StartsWith("Range:", StringComparison.OrdinalIgnoreCase)))
                    if (!outgoing.Headers.TryAddWithoutValidation("Range", line[6..].Trim())) throw new InvalidDataException();
                using var response = await _client.SendAsync(outgoing, HttpCompletionOption.ResponseHeadersRead, budget.Token);
                response.EnsureSuccessStatusCode();
                Uri final = response.RequestMessage?.RequestUri ?? target;
                string type = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
                bool manifest = _manifests.ContainsKey(target.AbsoluteUri) || type.Contains("mpegurl", StringComparison.OrdinalIgnoreCase) || type.Contains("dash+xml", StringComparison.OrdinalIgnoreCase) ||
                    final.AbsolutePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase) || final.AbsolutePath.EndsWith(".mpd", StringComparison.OrdinalIgnoreCase);
                if (manifest && request[0] != "HEAD")
                {
                    string text = await HlsManifestSnapshot.ReadAsync(response.Content, budget.Token);
                    await WriteManifestAsync(stream, RewriteManifest(text, final), false, budget.Token); return;
                }
                await using var body = await response.Content.ReadAsStreamAsync(budget.Token);
                byte[] buffer = new byte[64 * 1024];
                int initial = request[0] == "HEAD" ? 0 : await body.ReadAtLeastAsync(buffer, 8192, false, budget.Token);
                string lead = Encoding.UTF8.GetString(buffer, 0, initial).TrimStart('\uFEFF', ' ', '\t', '\r', '\n');
                if (lead.StartsWith("#EXTM3U", StringComparison.Ordinal) || lead.StartsWith("<MPD", StringComparison.Ordinal) ||
                    lead.StartsWith("<?xml", StringComparison.Ordinal) || lead.StartsWith("<!DOCTYPE", StringComparison.Ordinal))
                {
                    using var content = new MemoryStream();
                    content.Write(buffer, 0, initial);
                    int read;
                    while ((read = await body.ReadAsync(buffer, budget.Token)) > 0)
                    {
                        if (content.Length + read > HlsManifestSnapshot.MaxBytes) throw new InvalidDataException("Media playlist is too large.");
                        content.Write(buffer, 0, read);
                    }
                    await WriteManifestAsync(stream, RewriteManifest(Encoding.UTF8.GetString(content.ToArray()), final), false, budget.Token); return;
                }
                string extra = response.Content.Headers.ContentRange is {} range ? "Content-Range: " + range + "\r\n" : "";
                if (response.Content.Headers.ContentLength is long size) extra += "Content-Length: " + size + "\r\n";
                await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 {(int)response.StatusCode} OK\r\n{extra}Connection: close\r\n\r\n"), budget.Token);
                if (request[0] == "HEAD") return;
                if (initial > 0) await stream.WriteAsync(buffer.AsMemory(0, initial), budget.Token);
                int count;
                while (true)
                {
                    budget.CancelAfter(TimeSpan.FromSeconds(30));
                    count = await body.ReadAsync(buffer, budget.Token);
                    if (count == 0) break;
                    await stream.WriteAsync(buffer.AsMemory(0, count), budget.Token);
                }
            }
            catch (Exception) when (!_stop.IsCancellationRequested)
            {
                try { await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 502 Media transport refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"), budget.Token); }
                catch (Exception) { }
            }
            catch (OperationCanceledException) { }
            finally { _slots.Release(); }
        }
    }

    private static async Task WriteManifestAsync(Stream stream, string text, bool head, CancellationToken token)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        if (bytes.Length > HlsManifestSnapshot.MaxBytes * 4) throw new InvalidDataException("Rewritten manifest is too large.");
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n"), token);
        if (!head) await stream.WriteAsync(bytes, token);
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel(); _listener.Stop(); await _runner;
        await Task.WhenAll(_requests.Values);
        _client.Dispose(); _slots.Dispose(); _stop.Dispose();
    }
}
