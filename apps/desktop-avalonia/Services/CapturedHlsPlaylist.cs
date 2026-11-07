using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// FFmpeg inherits HTTP options from its playlist input. A file: snapshot loses
// those options on init/segment requests. Serve only this normalized snapshot,
// on loopback with an unguessable per-session path; this is not a media proxy.
public sealed class CapturedHlsPlaylist : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _stop;
    private readonly Task _runner;
    private readonly byte[] _body;
    private readonly string _path = "/" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)) + ".m3u8";
    public string Url { get; }

    public CapturedHlsPlaylist(string normalizedPlaylist, CancellationToken token)
    {
        if (!HlsManifestSnapshot.IsWithinSizeLimit(normalizedPlaylist))
            throw new InvalidDataException("The media playlist exceeds the supported size.");
        _body = Encoding.UTF8.GetBytes(normalizedPlaylist);
        _stop = CancellationTokenSource.CreateLinkedTokenSource(token);
        _listener.Start(4);
        Url = $"http://127.0.0.1:{((IPEndPoint)_listener.LocalEndpoint).Port}{_path}";
        _runner = RunAsync();
    }

    private async Task RunAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested)
            {
                using var client = await _listener.AcceptTcpClientAsync(_stop.Token);
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token);
                budget.CancelAfter(TimeSpan.FromSeconds(3));
                try { await ServeAsync(client.GetStream(), budget.Token); }
                catch (OperationCanceledException) { }
                catch (IOException) { }
                catch (SocketException) { }
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) when (_stop.IsCancellationRequested) { }
        catch (SocketException) when (_stop.IsCancellationRequested) { }
        finally { _listener.Stop(); }
    }

    private async Task ServeAsync(NetworkStream stream, CancellationToken token)
    {
        // Bound unauthenticated headers, including clients that never finish a
        // request. Never interpret a filesystem path or fetch a supplied URL.
        byte[] buffer = new byte[16 * 1024];
        int length = 0;
        string header;
        while (true)
        {
            int read = await stream.ReadAsync(buffer.AsMemory(length), token);
            if (read == 0) return;
            length += read;
            header = Encoding.ASCII.GetString(buffer, 0, length);
            if (header.Contains("\r\n\r\n", StringComparison.Ordinal)) break;
            if (length == buffer.Length) return;
        }
        string[] request = header.Split("\r\n", 2)[0].Split(' ');
        bool head = request.Length == 3 && request[0] == "HEAD";
        bool accepted = request.Length == 3 && (request[0] == "GET" || head) && request[1] == _path;
        byte[] response = Encoding.ASCII.GetBytes(accepted
            ? $"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: {_body.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
            : "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        await stream.WriteAsync(response, token);
        if (accepted && !head) await stream.WriteAsync(_body, token);
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        _listener.Stop();
        await _runner;
        _stop.Dispose();
    }
}
