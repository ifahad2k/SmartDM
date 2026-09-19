using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class SmartDmIpcClient : IAsyncDisposable
{
    private Stream? _stream;
    private TcpClient? _tcpClient;
    private NamedPipeClientStream? _pipeStream;
    private CancellationTokenSource? _cts;
    private bool _isConnected;

    public bool IsConnected => _isConnected;

    public event Action<string>? MessageReceived;
    public event Action? Connected;
    public event Action? Disconnected;

    public async Task<bool> ConnectAsync(CancellationToken cancellationToken = default)
    {
        if (_isConnected) return true;

        try
        {
            // 1. Check for ~/.smartdm/engine.port
            string portFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm", "engine.port");
            if (File.Exists(portFile))
            {
                try
                {
                    string[] lines = await File.ReadAllLinesAsync(portFile, cancellationToken);
                    if (lines.Length > 0 && int.TryParse(lines[0].Trim(), out int port))
                    {
                        var tcp = new TcpClient();
                        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
                        await tcp.ConnectAsync("127.0.0.1", port, linkedCts.Token);

                        _tcpClient = tcp;
                        _stream = tcp.GetStream();
                        _isConnected = true;
                        Connected?.Invoke();

                        _cts = new CancellationTokenSource();
                        _ = ReceiveLoopAsync(_cts.Token);
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to connect to engine TCP port: {ex.Message}");
                }
            }

            // 2. Fallback to Named Pipe on Windows or Unix Domain Socket on Linux
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var pipe = new NamedPipeClientStream(".", "smartdm_ipc", PipeDirection.InOut, PipeOptions.Asynchronous);
                await pipe.ConnectAsync(1500, cancellationToken);
                _pipeStream = pipe;
                _stream = pipe;
            }
            else
            {
                var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
                var endpoint = new UnixDomainSocketEndPoint("/tmp/smartdm_ipc.sock");
                await socket.ConnectAsync(endpoint, cancellationToken);
                _stream = new NetworkStream(socket, ownsSocket: true);
            }

            _isConnected = true;
            Connected?.Invoke();

            _cts = new CancellationTokenSource();
            _ = ReceiveLoopAsync(_cts.Token);
            return true;
        }
        catch
        {
            _isConnected = false;
            return false;
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var lenBuffer = new byte[4];
        try
        {
            while (!ct.IsCancellationRequested && _stream != null)
            {
                int read = await _stream.ReadAsync(lenBuffer.AsMemory(0, 4), ct);
                if (read < 4) break;

                int msgLength = (lenBuffer[0] << 24) | (lenBuffer[1] << 16) | (lenBuffer[2] << 8) | lenBuffer[3];
                if (msgLength <= 0 || msgLength > 10 * 1024 * 1024) continue; // 10MB sanity limit

                byte[] payload = new byte[msgLength];
                int totalRead = 0;
                while (totalRead < msgLength)
                {
                    int chunk = await _stream.ReadAsync(payload.AsMemory(totalRead, msgLength - totalRead), ct);
                    if (chunk == 0) break;
                    totalRead += chunk;
                }

                string json = Encoding.UTF8.GetString(payload, 0, totalRead);
                MessageReceived?.Invoke(json);
            }
        }
        catch
        {
            // Socket or pipe disconnected
        }
        finally
        {
            _isConnected = false;
            Disconnected?.Invoke();
        }
    }

    public async Task<bool> SendAsync(object message, CancellationToken ct = default)
    {
        if (_stream == null || !_isConnected) return false;

        try
        {
            string json = JsonSerializer.Serialize(message);
            byte[] payload = Encoding.UTF8.GetBytes(json);
            byte[] lenBuffer = new byte[4]
            {
                (byte)((payload.Length >> 24) & 0xFF),
                (byte)((payload.Length >> 16) & 0xFF),
                (byte)((payload.Length >> 8) & 0xFF),
                (byte)(payload.Length & 0xFF)
            };

            await _stream.WriteAsync(lenBuffer, ct);
            await _stream.WriteAsync(payload, ct);
            await _stream.FlushAsync(ct);
            return true;
        }
        catch
        {
            _isConnected = false;
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts?.Cancel();
        if (_stream != null)
        {
            await _stream.DisposeAsync();
            _stream = null;
        }
        _tcpClient?.Dispose();
        _tcpClient = null;
        if (_pipeStream != null)
        {
            await _pipeStream.DisposeAsync();
            _pipeStream = null;
        }
        _isConnected = false;
    }
}
