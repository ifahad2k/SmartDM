using System;
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

            // Check Bearer Token
            string? auth = req.Headers["Authorization"];
            if (string.IsNullOrEmpty(auth) || auth != $"Bearer {_token}")
            {
                resp.StatusCode = 401;
                resp.Close();
                return;
            }

            using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
            string body = await reader.ReadToEndAsync();

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            string? url = null;
            string? fileName = null;
            string? cookies = null;
            string? userAgent = null;

            if (root.TryGetProperty("url", out var urlElem)) url = urlElem.GetString();
            if (root.TryGetProperty("fileName", out var fnElem)) fileName = fnElem.GetString();
            if (root.TryGetProperty("cookies", out var cElem)) cookies = cElem.GetString();
            if (root.TryGetProperty("userAgent", out var uaElem)) userAgent = uaElem.GetString();

            if (!string.IsNullOrEmpty(url))
            {
                DownloadRequestedFromBrowser?.Invoke(new BrowserDownloadRequest
                {
                    Url = url,
                    FileName = fileName,
                    Cookies = cookies,
                    UserAgent = userAgent
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
        using var socket = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        socket.Start();
        int port = ((IPEndPoint)socket.LocalEndpoint).Port;
        socket.Stop();
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
