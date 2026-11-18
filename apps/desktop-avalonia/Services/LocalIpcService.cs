using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class LocalIpcService : ILocalIpcService
{
    private HttpListener? _listener;
    private string? _token;
    private string? _ipcInfoPath;
    private CancellationTokenSource? _cts;
    private NativeMessagingBridge? _nativeBridge;
    private readonly SemaphoreSlim _slots = new(8, 8);
    private readonly ConcurrentDictionary<int, Task> _requests = new();
    private int _requestId;
    private readonly object _manifestGate = new();
    private readonly Dictionary<string, (string Text, DateTime Expires)> _resolvedManifests = new();

    private static string ManifestCacheKey(string url, string? cookies) => url + "\n" +
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(cookies ?? "")));

    private void RetainResolvedManifest(MediaFormatDto format, string? cookies)
    {
        if (string.IsNullOrEmpty(format.ManifestText)) return;
        lock (_manifestGate)
        {
            // Eight complete snapshots, at most 32 MiB, stay inside the desktop.
            // Chrome native-host replies cannot exceed 1 MiB.
            if (_resolvedManifests.Count >= 8) _resolvedManifests.Clear();
            _resolvedManifests[ManifestCacheKey(format.DirectUrl ?? "", cookies)] = (format.ManifestText, DateTime.UtcNow.AddMinutes(15));
        }
        format.ManifestText = null;
        format.MediaKind = "hls";
    }

    private void RestoreResolvedManifest(MediaFormatDto format, string? cookies)
    {
        if (!string.IsNullOrEmpty(format.ManifestText)) return;
        lock (_manifestGate)
            if (_resolvedManifests.TryGetValue(ManifestCacheKey(format.DirectUrl ?? "", cookies), out var capture) && capture.Expires > DateTime.UtcNow)
            { format.ManifestText = capture.Text; format.MediaKind = "hls"; }
    }

    public event Action<BrowserDownloadRequest>? DownloadRequestedFromBrowser;
    public event Action<BrowserBatchDownloadRequest>? BatchDownloadRequestedFromBrowser;
    public event Action? WindowRestoreRequested;

    public Task StartAsync()
    {
        _cts = new CancellationTokenSource();

        // 1. Generate 32-byte secure random token
        byte[] tokenBytes = new byte[32];
        RandomNumberGenerator.Fill(tokenBytes);
        _token = Convert.ToBase64String(tokenBytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');

        // 2. Find free port
        int port = GetAvailablePort();

        // 3. Start HttpListener
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        _listener.Start();

        string pipeName = "smartdm-" + Guid.NewGuid().ToString("N");
        _ipcInfoPath = Path.Combine(AppProfile.DirectoryPath, "ipc.info");
        PrivateProfileFiles.WriteText(_ipcInfoPath, $"{port}\n{_token}\n{pipeName}\n");
        _nativeBridge = new NativeMessagingBridge(pipeName, _token, DispatchNativeAsync);

        // 5. Start listener loop
        _ = Task.Run(async () =>
        {
            while (!_cts.Token.IsCancellationRequested && _listener.IsListening)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    if (!_slots.Wait(0)) { context.Response.StatusCode = 503; context.Response.Close(); continue; }
                    int id = Interlocked.Increment(ref _requestId);
                    Task request = ServeRequestAsync(context);
                    _requests[id] = request;
                    _ = request.ContinueWith(_ => _requests.TryRemove(id, out var ignored), TaskScheduler.Default);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"IPC server error: {ex.Message}");
                }
            }
        }, _cts.Token);

        return Task.CompletedTask;
    }

    private async Task ProcessRequestAsync(HttpListenerContext context)
    {
        var req = context.Request;
        var resp = context.Response;

        try
        {
            string? origin = req.Headers["Origin"];
            if (origin != null && !BrowserProtocol.IsAllowedOrigin(origin)) { resp.StatusCode = 403; return; }
            if (origin != null) { resp.Headers["Access-Control-Allow-Origin"] = origin; resp.Headers["Vary"] = "Origin"; }
            if (req.HttpMethod == "OPTIONS")
            {
                resp.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-SmartDM-Protocol";
                resp.Headers["Access-Control-Allow-Methods"] = "POST";
                resp.StatusCode = 204; return;
            }

            if (req.Url?.AbsolutePath != "/api/browser" && req.Url?.AbsolutePath != "/api/download")
            {
                resp.StatusCode = 404;
                resp.Close();
                return;
            }

            if (req.HttpMethod == "GET" || req.HttpMethod == "HEAD")
            {
                byte[] pingBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"version\":\"2.0\"}");
                resp.ContentType = "application/json";
                resp.StatusCode = 200;
                resp.ContentLength64 = pingBytes.Length;
                if (req.HttpMethod == "GET")
                {
                    await resp.OutputStream.WriteAsync(pingBytes);
                }
                resp.Close();
                return;
            }

            if (req.HttpMethod != "POST")
            {
                resp.StatusCode = 405;
                resp.Close();
                return;
            }

            string? auth = req.Headers["Authorization"];
            if (auth == null || !auth.StartsWith("Bearer ", StringComparison.Ordinal) ||
                !NativeMessagingBridge.TokenMatches(auth[7..], _token ?? ""))
            { resp.StatusCode = 401; return; }
            if (req.Headers["X-SmartDM-Protocol"] != "1") { resp.StatusCode = 400; return; }
            using var readBudget = CancellationTokenSource.CreateLinkedTokenSource(_cts!.Token);
            readBudget.CancelAfter(TimeSpan.FromSeconds(20));
            string body = await BrowserProtocol.ReadBodyAsync(req.InputStream, req.ContentLength64, readBudget.Token);
            byte[] result = await DispatchNativeAsync(body, readBudget.Token);
            resp.ContentType = "application/json";
            resp.ContentLength64 = result.Length;
            await resp.OutputStream.WriteAsync(result, readBudget.Token);
        }
        catch (InvalidDataException) { resp.StatusCode = 413; }
        catch (OperationCanceledException) { resp.StatusCode = 408; }
        catch { resp.StatusCode = 400; }
        finally { resp.Close(); }
    }

    private async Task ServeRequestAsync(HttpListenerContext context)
    {
        try { await ProcessRequestAsync(context); }
        finally { _slots.Release(); }
    }

    private sealed class IpcReply : IDisposable
    {
        public int StatusCode { get; set; } = 200;
        public string ContentType { get; set; } = "application/json";
        public long ContentLength64
        {
            set { if (value > BrowserProtocol.MaximumResponseBytes) throw new InvalidDataException("Browser reply is too large."); }
        }
        public MemoryStream OutputStream { get; } = new();
        public void Dispose() => OutputStream.Dispose();
    }

    private async Task<byte[]> DispatchNativeAsync(string body, CancellationToken token)
    {
        using var reply = new IpcReply();
        await DispatchMessageAsync(body, reply, token);
        if (reply.StatusCode >= 400) return Encoding.UTF8.GetBytes("{\"status\":\"error\",\"success\":false,\"message\":\"Browser request refused.\"}");
        return reply.OutputStream.ToArray();
    }

    private async Task DispatchMessageAsync(string body, IpcReply resp, CancellationToken token)
    {
            using var doc = JsonDocument.Parse(body, new JsonDocumentOptions {MaxDepth = 32});
            BrowserProtocol.Validate(doc.RootElement);
            var root = doc.RootElement;

            string type = root.TryGetProperty("type", out var tElem) ? tElem.GetString() ?? "" : "";
            if (string.IsNullOrEmpty(type) && root.TryGetProperty("action", out var actElem))
            {
                type = actElem.GetString() ?? "";
            }

            if (type.Equals("SHOW_WINDOW", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("RESTORE_WINDOW", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("ACTIVATE_WINDOW", StringComparison.OrdinalIgnoreCase))
            {
                WindowRestoreRequested?.Invoke();
                byte[] okBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"action\":\"RESTORE_WINDOW\"}");
                resp.ContentType = "application/json";
                resp.StatusCode = 200;
                resp.ContentLength64 = okBytes.Length;
                await resp.OutputStream.WriteAsync(okBytes);
                return;
            }

            if (type.Equals("GET_MEDIA_FORMATS", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("extractMediaInfo", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("RESOLVE_M3U8_VARIANTS", StringComparison.OrdinalIgnoreCase))
            {
                string? queryUrl = null;
                if (root.TryGetProperty("url", out var qUrlElem)) queryUrl = qUrlElem.GetString();

                string? queryReferer = null;
                if (root.TryGetProperty("referer", out var rElem)) queryReferer = rElem.GetString();
                string? queryPageUrl = null;
                if (root.TryGetProperty("pageUrl", out var puElemQ)) queryPageUrl = puElemQ.GetString();
                string? queryUa = null;
                if (root.TryGetProperty("userAgent", out var uaElemQ)) queryUa = uaElemQ.GetString();
                string? queryCookies = null;
                if (root.TryGetProperty("cookies", out var cElemQ)) queryCookies = cElemQ.GetString();

                if (!string.IsNullOrEmpty(queryUrl))
                {
                    if (YouTubeMediaResolver.IsYouTubeUrl(queryUrl))
                    {
                        var ytRes = await YouTubeMediaResolver.ResolveYouTubeFormatsAsync(queryUrl, token: token);
                        if (ytRes.Success && ytRes.Formats.Count > 0)
                        {
                            var jsonPayload = JsonSerializer.Serialize(new
                            {
                                status = "ok",
                                success = true,
                                title = ytRes.Title,
                                formats = ytRes.Formats
                            }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                            byte[] ytBytes = Encoding.UTF8.GetBytes(jsonPayload);
                            resp.ContentType = "application/json";
                            resp.StatusCode = 200;
                            resp.ContentLength64 = ytBytes.Length;
                            await resp.OutputStream.WriteAsync(ytBytes);
                            return;
                        }
                    }
                    else if (type.Equals("RESOLVE_M3U8_VARIANTS", StringComparison.OrdinalIgnoreCase) ||
                             queryUrl.Contains(".m3u8", StringComparison.OrdinalIgnoreCase) ||
                             queryUrl.Contains("stream-embed", StringComparison.OrdinalIgnoreCase) ||
                             queryUrl.Contains("playlist", StringComparison.OrdinalIgnoreCase))
                    {
                        var hlsRes = await HlsMediaResolver.ResolveHlsFormatsAsync(queryUrl, queryReferer ?? queryPageUrl, queryUa, queryCookies, token: token, pageUrl: queryPageUrl ?? queryReferer);
                        if (hlsRes.Success && hlsRes.Formats.Count > 0)
                        {
                            foreach (var format in hlsRes.Formats) RetainResolvedManifest(format, queryCookies);
                            var jsonPayload = JsonSerializer.Serialize(new
                            {
                                status = "ok",
                                success = true,
                                masterUrl = hlsRes.MasterUrl,
                                formats = hlsRes.Formats
                            }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

                            byte[] hlsBytes = Encoding.UTF8.GetBytes(jsonPayload);
                            resp.ContentType = "application/json";
                            resp.StatusCode = 200;
                            resp.ContentLength64 = hlsBytes.Length;
                            await resp.OutputStream.WriteAsync(hlsBytes);
                            return;
                        }
                    }
                    else
                    {
                        // Immediate non-blocking response for non-stream queries
                        byte[] nonYtBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"success\":false,\"message\":\"Media stream is handled by browser media graph.\"}");
                        resp.ContentType = "application/json";
                        resp.StatusCode = 200;
                        resp.ContentLength64 = nonYtBytes.Length;
                        await resp.OutputStream.WriteAsync(nonYtBytes);
                        return;
                    }
                }

                byte[] notFoundBytes = Encoding.UTF8.GetBytes("{\"status\":\"error\",\"message\":\"Could not extract media formats.\"}");
                resp.ContentType = "application/json";
                resp.StatusCode = 200;
                resp.ContentLength64 = notFoundBytes.Length;
                await resp.OutputStream.WriteAsync(notFoundBytes);
                return;
            }

            string? url = null;
            string? videoUrl = null;
            string? audioUrl = null;
            string? formatId = null;
            string? fileName = null;
            string? title = null;
            string? cookies = null;
            string? userAgent = null;
            string? referer = null;
            string? pageUrl = null;
            string? mime = null;
            List<MediaFormatDto>? formats = null;

            if (root.TryGetProperty("url", out var urlElem)) url = urlElem.GetString();
            if (root.TryGetProperty("videoUrl", out var vElem)) videoUrl = vElem.GetString();
            if (root.TryGetProperty("audioUrl", out var aElem)) audioUrl = aElem.GetString();
            if (root.TryGetProperty("formatId", out var fmtElem))
            {
                formatId = fmtElem.ValueKind == JsonValueKind.String ? fmtElem.GetString() : fmtElem.ToString();
            }
            if (root.TryGetProperty("fileName", out var fnElem)) fileName = fnElem.GetString();
            if (root.TryGetProperty("title", out var titleElem)) title = titleElem.GetString();
            if (root.TryGetProperty("cookies", out var cElem)) cookies = cElem.GetString();
            if (root.TryGetProperty("userAgent", out var uaElem)) userAgent = uaElem.GetString();
            if (root.TryGetProperty("referer", out var refElem)) referer = refElem.GetString();
            if (root.TryGetProperty("pageUrl", out var puElem)) pageUrl = puElem.GetString();
            if (root.TryGetProperty("mime", out var mElem)) mime = mElem.GetString();

            if (root.TryGetProperty("formats", out var formatsElem) && formatsElem.ValueKind == JsonValueKind.Array)
            {
                formats = new List<MediaFormatDto>();
                foreach (var item in formatsElem.EnumerateArray())
                {
                    var dto = new MediaFormatDto();
                    if (item.TryGetProperty("formatId", out var fid))
                    {
                        dto.FormatId = fid.ValueKind == JsonValueKind.String ? fid.GetString() ?? "" : fid.ToString();
                    }
                    if (item.TryGetProperty("resolution", out var res))
                    {
                        dto.Resolution = res.ValueKind == JsonValueKind.String ? res.GetString() ?? "" : res.ToString();
                    }
                    if (item.TryGetProperty("ext", out var ext)) dto.Ext = ext.GetString() ?? "mp4";
                    if (item.TryGetProperty("fileSize", out var fs))
                    {
                        if (fs.ValueKind == JsonValueKind.Number) dto.FileSize = fs.GetInt64();
                        else if (fs.ValueKind == JsonValueKind.String && long.TryParse(fs.GetString(), out var s)) dto.FileSize = s;
                    }
                    if (item.TryGetProperty("isAudioOnly", out var ia))
                    {
                        dto.IsAudioOnly = ia.ValueKind == JsonValueKind.True;
                    }
                    if (item.TryGetProperty("title", out var tElemItem)) dto.Title = tElemItem.GetString();
                    if (item.TryGetProperty("url", out var u)) dto.DirectUrl = u.GetString();
                    else if (item.TryGetProperty("directUrl", out var du)) dto.DirectUrl = du.GetString();
                    if (item.TryGetProperty("audioUrl", out var au)) dto.AudioUrl = au.GetString();
                    if (item.TryGetProperty("mediaKind", out var mk)) dto.MediaKind = mk.GetString();
                    if (item.TryGetProperty("manifestText", out var mt) && mt.ValueKind == JsonValueKind.String)
                    {
                        dto.ManifestText = mt.GetString();
                        if (!HlsManifestSnapshot.IsWithinSizeLimit(dto.ManifestText!))
                        { resp.StatusCode = 413; return; }
                    }
                    if (item.TryGetProperty("audioManifestText", out var amt) && amt.ValueKind == JsonValueKind.String)
                    {
                        dto.AudioManifestText = amt.GetString();
                        if (!HlsManifestSnapshot.IsWithinSizeLimit(dto.AudioManifestText!))
                        { resp.StatusCode = 413; return; }
                    }
                    if (item.TryGetProperty("bandwidth", out var bwProp))
                    {
                        if (bwProp.ValueKind == JsonValueKind.Number) dto.Bandwidth = bwProp.GetInt64();
                        else if (bwProp.ValueKind == JsonValueKind.String && long.TryParse(bwProp.GetString(), out var bwVal)) dto.Bandwidth = bwVal;
                    }
                    if (item.TryGetProperty("totalDuration", out var durProp))
                    {
                        if (durProp.ValueKind == JsonValueKind.Number) dto.TotalDuration = durProp.GetDouble();
                        else if (durProp.ValueKind == JsonValueKind.String && double.TryParse(durProp.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var durVal)) dto.TotalDuration = durVal;
                    }
                    RestoreResolvedManifest(dto, cookies);
                    formats.Add(dto);
                }
            }

            // Check for batch requests (e.g. YouTube Music playlist, multi-file grabber)
            if (type.Equals("ADD_MEDIA_BATCH", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("ADD_BATCH", StringComparison.OrdinalIgnoreCase) ||
                (root.TryGetProperty("items", out var bItemsElem) && bItemsElem.ValueKind == JsonValueKind.Array))
            {
                var batchReq = new BrowserBatchDownloadRequest
                {
                    BatchTitle = title ?? "Playlist Download",
                    PlaylistTitle = root.TryGetProperty("playlistTitle", out var ptElem) ? ptElem.GetString() : title,
                    PlaylistId = root.TryGetProperty("playlistId", out var pidElem) ? pidElem.GetString() : null,
                    IsAudio = root.TryGetProperty("isAudio", out var iaElem) && iaElem.ValueKind == JsonValueKind.True,
                    Referer = referer ?? pageUrl,
                    PageUrl = pageUrl ?? referer,
                    Cookies = cookies,
                    UserAgent = userAgent
                };

                if (root.TryGetProperty("batchTitle", out var btElem) && !string.IsNullOrWhiteSpace(btElem.GetString()))
                {
                    batchReq.BatchTitle = btElem.GetString()!;
                }

                if (root.TryGetProperty("destinationFolder", out var dfElem) && !string.IsNullOrWhiteSpace(dfElem.GetString()))
                {
                    batchReq.DestinationFolder = dfElem.GetString()!;
                }
                else if (root.TryGetProperty("downloadFolder", out var dlfElem) && !string.IsNullOrWhiteSpace(dlfElem.GetString()))
                {
                    batchReq.DestinationFolder = dlfElem.GetString()!;
                }

                if (root.TryGetProperty("items", out var itemsArray) && itemsArray.ValueKind == JsonValueKind.Array)
                {
                    foreach (var itemElem in itemsArray.EnumerateArray())
                    {
                        string? itemUrl = itemElem.TryGetProperty("url", out var u) ? u.GetString() : null;
                        if (string.IsNullOrEmpty(itemUrl)) continue;

                        var itemReq = new BrowserDownloadRequest
                        {
                            Url = itemUrl,
                            Title = itemElem.TryGetProperty("title", out var it) ? it.GetString() : null,
                            FileName = itemElem.TryGetProperty("fileName", out var ifn) ? ifn.GetString() : null,
                            FormatId = itemElem.TryGetProperty("formatId", out var ifmt) ? ifmt.GetString() : (batchReq.IsAudio ? "bestaudio/best" : "1080p"),
                            Referer = itemElem.TryGetProperty("referer", out var ir) ? ir.GetString() : batchReq.Referer,
                            PageUrl = itemElem.TryGetProperty("pageUrl", out var ipu) ? ipu.GetString() : batchReq.PageUrl,
                            Cookies = cookies,
                            UserAgent = userAgent
                        };
                        batchReq.Items.Add(itemReq);
                    }
                }
                else if (root.TryGetProperty("urls", out var urlsArray) && urlsArray.ValueKind == JsonValueKind.Array)
                {
                    foreach (var uElem in urlsArray.EnumerateArray())
                    {
                        string? uStr = uElem.ValueKind == JsonValueKind.String ? uElem.GetString() : null;
                        if (!string.IsNullOrEmpty(uStr))
                        {
                            batchReq.Items.Add(new BrowserDownloadRequest
                            {
                                Url = uStr,
                                FormatId = batchReq.IsAudio ? "bestaudio/best" : "1080p",
                                Referer = batchReq.Referer,
                                PageUrl = batchReq.PageUrl,
                                Cookies = cookies,
                                UserAgent = userAgent
                            });
                        }
                    }
                }

                if (batchReq.Items.Count > 0)
                {
                    BatchDownloadRequestedFromBrowser?.Invoke(batchReq);
                }

                byte[] okBatchBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"version\":\"2.0\",\"queued\":" + batchReq.Items.Count + "}");
                resp.ContentType = "application/json";
                resp.StatusCode = 200;
                resp.ContentLength64 = okBatchBytes.Length;
                await resp.OutputStream.WriteAsync(okBatchBytes);
                return;
            }

            if (!string.IsNullOrEmpty(url))
            {
                if ((formats ??= new List<MediaFormatDto>()).Count == 0)
                {
                    var resolved = new MediaFormatDto {DirectUrl = url, FormatId = formatId ?? "", Resolution = title ?? "Video", Ext = "mp4"};
                    RestoreResolvedManifest(resolved, cookies);
                    if (resolved.ManifestText != null) formats.Add(resolved);
                }
                DownloadRequestedFromBrowser?.Invoke(new BrowserDownloadRequest
                {
                    Url = url,
                    VideoUrl = videoUrl,
                    AudioUrl = audioUrl,
                    FormatId = formatId,
                    FileName = fileName,
                    Title = title,
                    Referer = referer ?? pageUrl,
                    PageUrl = pageUrl ?? referer,
                    Cookies = cookies,
                    UserAgent = userAgent,
                    Mime = mime,
                    Formats = formats
                });
            }

            byte[] respBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"version\":\"2.0\"}");
            resp.ContentType = "application/json";
            resp.StatusCode = 200;
            resp.ContentLength64 = respBytes.Length;
            await resp.OutputStream.WriteAsync(respBytes);
    }

    private static int GetAvailablePort()
    {
        int[] preferredPorts = new int[] { 18420, 9191, 18421, 18422, 18423, 18424, 18425 };
        foreach (int p in preferredPorts)
        {
            try
            {
                using var socket = new System.Net.Sockets.TcpListener(IPAddress.Loopback, p);
                socket.Start();
                socket.Stop();
                return p;
            }
            catch { }
        }

        using var fallback = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        fallback.Start();
        int port = ((IPEndPoint)fallback.LocalEndpoint).Port;
        fallback.Stop();
        return port;
    }

    public void Stop()
    {
        _cts?.Cancel();
        if (_nativeBridge != null) { _nativeBridge.DisposeAsync().AsTask().GetAwaiter().GetResult(); _nativeBridge = null; }
        if (_listener != null && _listener.IsListening)
        {
            try { _listener.Stop(); } catch { }
            try { _listener.Close(); } catch { }
        }

        Task.WhenAll(_requests.Values).GetAwaiter().GetResult();
        if (!string.IsNullOrEmpty(_ipcInfoPath) && File.Exists(_ipcInfoPath))
        {
            try { File.Delete(_ipcInfoPath); } catch { }
        }
    }
}
