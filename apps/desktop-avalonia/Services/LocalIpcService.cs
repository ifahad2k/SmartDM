using System;
using System.Collections.Generic;
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

    public event Action<BrowserDownloadRequest>? DownloadRequestedFromBrowser;

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

        // 4. Write ipc.info
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
        Directory.CreateDirectory(dir);
        _ipcInfoPath = Path.Combine(dir, "ipc.info");
        File.WriteAllText(_ipcInfoPath, $"{port}\n{_token}\n");

        // Restrict file permissions
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "icacls",
                    Arguments = $"\"{_ipcInfoPath}\" /inheritance:r /grant:r \"{Environment.UserName}:F\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi)?.WaitForExit(2000);
            }
            else if (OperatingSystem.IsLinux())
            {
                File.SetUnixFileMode(_ipcInfoPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
        }
        catch
        {
            // Ignore permission setting errors on platforms without icacls
        }

        // 5. Start listener loop
        _ = Task.Run(async () =>
        {
            while (!_cts.Token.IsCancellationRequested && _listener.IsListening)
            {
                try
                {
                    var context = await _listener.GetContextAsync();
                    _ = ProcessRequestAsync(context);
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
            resp.Headers.Add("Access-Control-Allow-Origin", "*");
            resp.Headers.Add("Access-Control-Allow-Headers", "Authorization, Content-Type, X-SmartDM-Token");
            resp.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS");

            if (req.HttpMethod == "OPTIONS")
            {
                resp.StatusCode = 200;
                resp.Close();
                return;
            }

            if (req.Url?.AbsolutePath != "/api/browser")
            {
                resp.StatusCode = 404;
                resp.Close();
                return;
            }

            if (req.HttpMethod != "POST")
            {
                resp.StatusCode = 405;
                resp.Close();
                return;
            }

            // Check Bearer Token or Loopback caller verification
            string? auth = req.Headers["Authorization"];
            bool isAuthorized = (!string.IsNullOrEmpty(auth) && auth == $"Bearer {_token}") ||
                                (req.IsLocal || IPAddress.IsLoopback(req.RemoteEndPoint.Address));

            if (!isAuthorized)
            {
                resp.StatusCode = 401;
                resp.Close();
                return;
            }

            using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
            string body = await reader.ReadToEndAsync();

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            string type = root.TryGetProperty("type", out var tElem) ? tElem.GetString() ?? "" : "";
            if (string.IsNullOrEmpty(type) && root.TryGetProperty("action", out var actElem))
            {
                type = actElem.GetString() ?? "";
            }

            if (type.Equals("GET_MEDIA_FORMATS", StringComparison.OrdinalIgnoreCase) ||
                type.Equals("extractMediaInfo", StringComparison.OrdinalIgnoreCase))
            {
                string? queryUrl = null;
                if (root.TryGetProperty("url", out var qUrlElem)) queryUrl = qUrlElem.GetString();

                if (!string.IsNullOrEmpty(queryUrl))
                {
                    var ytRes = await YouTubeMediaResolver.ResolveYouTubeFormatsAsync(queryUrl);
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
            string? cookies = null;
            string? userAgent = null;
            List<MediaFormatDto>? formats = null;

            if (root.TryGetProperty("url", out var urlElem)) url = urlElem.GetString();
            if (root.TryGetProperty("videoUrl", out var vElem)) videoUrl = vElem.GetString();
            if (root.TryGetProperty("audioUrl", out var aElem)) audioUrl = aElem.GetString();
            if (root.TryGetProperty("formatId", out var fmtElem))
            {
                formatId = fmtElem.ValueKind == JsonValueKind.String ? fmtElem.GetString() : fmtElem.ToString();
            }
            if (root.TryGetProperty("fileName", out var fnElem)) fileName = fnElem.GetString();
            if (root.TryGetProperty("cookies", out var cElem)) cookies = cElem.GetString();
            if (root.TryGetProperty("userAgent", out var uaElem)) userAgent = uaElem.GetString();

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
                    if (item.TryGetProperty("url", out var u)) dto.DirectUrl = u.GetString();
                    else if (item.TryGetProperty("directUrl", out var du)) dto.DirectUrl = du.GetString();
                    if (item.TryGetProperty("audioUrl", out var au)) dto.AudioUrl = au.GetString();
                    formats.Add(dto);
                }
            }

            if (!string.IsNullOrEmpty(url))
            {
                DownloadRequestedFromBrowser?.Invoke(new BrowserDownloadRequest
                {
                    Url = url,
                    VideoUrl = videoUrl,
                    AudioUrl = audioUrl,
                    FormatId = formatId,
                    FileName = fileName,
                    Cookies = cookies,
                    UserAgent = userAgent,
                    Formats = formats
                });
            }

            byte[] respBytes = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"version\":\"2.0\"}");
            resp.ContentType = "application/json";
            resp.StatusCode = 200;
            resp.ContentLength64 = respBytes.Length;
            await resp.OutputStream.WriteAsync(respBytes);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to process IPC request: {ex.Message}");
            resp.StatusCode = 500;
        }
        finally
        {
            resp.Close();
        }
    }

    private static int GetAvailablePort()
    {
        int[] preferredPorts = new int[] { 18420, 18421, 18422, 18423, 18424, 18425 };
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
        if (_listener != null && _listener.IsListening)
        {
            try { _listener.Stop(); } catch { }
            try { _listener.Close(); } catch { }
        }

        if (!string.IsNullOrEmpty(_ipcInfoPath) && File.Exists(_ipcInfoPath))
        {
            try { File.Delete(_ipcInfoPath); } catch { }
        }
    }
}
