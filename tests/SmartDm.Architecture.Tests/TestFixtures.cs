using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Architecture.Tests;

public sealed class InMemorySettingsService : ISettingsService
{
    public AppSettingsModel CurrentSettings { get; private set; } = new();
    public AiConfigModel CurrentAiConfig { get; private set; } = new();
    public Task<AppSettingsModel> LoadAppSettingsAsync() => Task.FromResult(CurrentSettings);
    public Task SaveAppSettingsAsync(AppSettingsModel settings)
    {
        CurrentSettings = settings;
        return Task.CompletedTask;
    }
    public Task<AiConfigModel> LoadAiConfigAsync() => Task.FromResult(CurrentAiConfig);
    public Task SaveAiConfigAsync(AiConfigModel config)
    {
        CurrentAiConfig = config;
        return Task.CompletedTask;
    }
    public bool SetStartup(bool enable) => true;
    public Task PerformUninstallAsync(bool eraseData) => Task.CompletedTask;
}

public class InMemoryDatabaseRepository : IDatabaseRepository
{
    private readonly Dictionary<string, DownloadModel> _items = new();

    public Task InitializeAsync() => Task.CompletedTask;
    public Task<List<DownloadModel>> GetAllDownloadsAsync() => Task.FromResult(new List<DownloadModel>(_items.Values));
    public Task SaveDownloadAsync(DownloadModel download)
    {
        _items[download.Id] = download;
        return Task.CompletedTask;
    }
    public Task DeleteDownloadAsync(string downloadId)
    {
        _items.Remove(downloadId);
        return Task.CompletedTask;
    }
    public Task UpdateDownloadProgressAsync(string id, long downloadedBytes, double speedMbps, double progress, int etaSeconds)
    {
        if (_items.TryGetValue(id, out var dl))
        {
            dl.DownloadedBytes = downloadedBytes;
            dl.SpeedMbps = speedMbps;
            dl.ProgressPercentage = progress;
        }
        return Task.CompletedTask;
    }
    public Task UpdateDownloadStatusAsync(string id, DownloadStatus status, string statusDetail, string subline)
    {
        if (_items.TryGetValue(id, out var dl))
        {
            dl.Status = status;
            dl.StatusDetail = statusDetail;
            dl.Subline = subline;
        }
        return Task.CompletedTask;
    }
    public Task UpdateChecksumAndSecurityAsync(string id, string sha256, bool isQuarantined, string statusDetail)
    {
        if (_items.TryGetValue(id, out var dl))
        {
            dl.Sha256Hash = sha256;
            dl.StatusDetail = statusDetail;
        }
        return Task.CompletedTask;
    }
    public Task SaveCrashReportAsync(CrashReport crash) => Task.CompletedTask;
    public void SaveCrashReportSync(CrashReport crash) { }
    public Task<List<CrashReport>> GetRecentCrashReportsAsync(int limit = 20) => Task.FromResult(new List<CrashReport>());
    public List<CrashReport> GetRecentCrashReportsSync(int limit = 20) => new();
}

public class DirectCleanSafetyScanner : ISafetyScanner
{
    public Task<SafetyScanResult> ScanFileAsync(string filePath, CancellationToken ct = default)
    {
        string hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        if (File.Exists(filePath))
        {
            using var sha = SHA256.Create();
            using var fs = File.OpenRead(filePath);
            hash = Convert.ToHexString(sha.ComputeHash(fs)).ToLowerInvariant();
        }

        return Task.FromResult(new SafetyScanResult
        {
            IsClean = true,
            HasThreat = false,
            ScannerName = "MockScanner",
            Sha256Hash = hash
        });
    }

    public async Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken = default)
    {
        var res = await ScanFileAsync(filePath, cancellationToken);
        return res.Sha256Hash;
    }

    public bool CheckRtloExploit(string fileName) => false;
}

public enum ServerFaultMode
{
    None,
    Return200OkOnSubrange,
    MalformedContentRangeBounds,
    ChangedResourceLength,
    TruncateStreamPrematurely
}

public class TestHttpServer : IAsyncDisposable
{
    private readonly TcpListener _listener;
    private readonly byte[] _content;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _listenTask;
    public ServerFaultMode FaultMode { get; set; } = ServerFaultMode.None;
    public string CustomContentType { get; set; } = "application/octet-stream";
    public int ChunkDelayMs { get; set; } = 0;
    public string? LastIfRange { get; private set; }
    public string? ResponseETag { get; set; }
    public bool AdvertiseRanges { get; set; } = true;
    public ConcurrentQueue<(long Start, long? End)> RangeRequests { get; } = new();

    public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;
    public string BaseUrl => $"http://127.0.0.1:{Port}";

    public TestHttpServer(byte[] content, ServerFaultMode faultMode = ServerFaultMode.None)
    {
        _content = content;
        FaultMode = faultMode;
        _listener = new TcpListener(IPAddress.Loopback, 0);
        _listener.Start();
        _listenTask = Task.Run(ListenLoopAsync);
    }

    private async Task ListenLoopAsync()
    {
        try
        {
            while (!_cts.Token.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(_cts.Token);
                _ = Task.Run(() => HandleClientAsync(client));
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception) { }
    }

    private async Task HandleClientAsync(TcpClient client)
    {
        try
        {
            using (client)
            await using (var stream = client.GetStream())
            {
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                await using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true);

                string? requestLine = await reader.ReadLineAsync();
                if (string.IsNullOrEmpty(requestLine)) return;

                string[] parts = requestLine.Split(' ');
                string method = parts[0];

                string? line;
                long? rangeStart = null;
                long? rangeEnd = null;

                while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync()))
                {
                    if (line.StartsWith("Range: bytes=", StringComparison.OrdinalIgnoreCase))
                    {
                        string rangeVal = line.Substring("Range: bytes=".Length).Trim();
                        int dash = rangeVal.IndexOf('-');
                        if (dash >= 0)
                        {
                            string s = rangeVal.Substring(0, dash);
                            string e = rangeVal.Substring(dash + 1);
                            if (long.TryParse(s, out long sVal)) rangeStart = sVal;
                            if (long.TryParse(e, out long eVal)) rangeEnd = eVal;
                        }
                    }
                    if (line.StartsWith("If-Range:", StringComparison.OrdinalIgnoreCase))
                    {
                        LastIfRange = line.Substring("If-Range:".Length).Trim();
                    }
                }

                if (rangeStart.HasValue) RangeRequests.Enqueue((rangeStart.Value, rangeEnd));

                if (method.Equals("HEAD", StringComparison.OrdinalIgnoreCase))
                {
                    string capabilities = AdvertiseRanges ? "Accept-Ranges: bytes\r\n" : "Accept-Ranges: none\r\n";
                    string validators = ResponseETag is null ? string.Empty : $"ETag: {ResponseETag}\r\n";
                    await writer.WriteAsync($"HTTP/1.1 200 OK\r\nContent-Type: {CustomContentType}\r\nContent-Length: {_content.Length}\r\n{capabilities}{validators}Connection: close\r\n\r\n");
                    await writer.FlushAsync();
                    return;
                }

                if (method.Equals("GET", StringComparison.OrdinalIgnoreCase))
                {
                    if (FaultMode == ServerFaultMode.Return200OkOnSubrange && rangeStart.HasValue)
                    {
                        // Flaw simulation: Server sends 200 OK with full file despite subrange request
                        await writer.WriteAsync($"HTTP/1.1 200 OK\r\nContent-Type: {CustomContentType}\r\nContent-Length: {_content.Length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n");
                        await writer.FlushAsync();
                        await stream.WriteAsync(_content, 0, _content.Length);
                        await stream.FlushAsync();
                        return;
                    }

                    if (FaultMode == ServerFaultMode.MalformedContentRangeBounds && rangeStart.HasValue)
                    {
                        // Flaw simulation: Server returns 206 but with wrong bounds (e.g. bytes 0-3/8 when 4-7 requested)
                        await writer.WriteAsync($"HTTP/1.1 206 Partial Content\r\nContent-Type: {CustomContentType}\r\nContent-Length: 4\r\nContent-Range: bytes 0-3/{_content.Length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n");
                        await writer.FlushAsync();
                        await stream.WriteAsync(_content, 0, 4);
                        await stream.FlushAsync();
                        return;
                    }

                    if (rangeStart.HasValue)
                    {
                        long start = rangeStart.Value;
                        long end = rangeEnd ?? (_content.Length - 1);
                        if (end >= _content.Length) end = _content.Length - 1;
                        long len = end - start + 1;

                        if (FaultMode == ServerFaultMode.TruncateStreamPrematurely)
                        {
                            // Flaw simulation: send header and 2 bytes, then abort TCP socket
                            await writer.WriteAsync($"HTTP/1.1 206 Partial Content\r\nContent-Type: {CustomContentType}\r\nContent-Length: {len}\r\nContent-Range: bytes {start}-{end}/{_content.Length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n");
                            await writer.FlushAsync();
                            if (len > 2)
                            {
                                await stream.WriteAsync(_content, (int)start, 2);
                                await stream.FlushAsync();
                            }
                            client.Client.LingerState = new LingerOption(true, 0);
                            client.Close();
                            return;
                        }

                        long reportedTotal = FaultMode == ServerFaultMode.ChangedResourceLength ? _content.Length + 1 : _content.Length;
                        string etagHeader = ResponseETag is null ? string.Empty : $"ETag: {ResponseETag}\r\n";
                        await writer.WriteAsync($"HTTP/1.1 206 Partial Content\r\nContent-Type: {CustomContentType}\r\nContent-Length: {len}\r\nContent-Range: bytes {start}-{end}/{reportedTotal}\r\nAccept-Ranges: bytes\r\n{etagHeader}Connection: close\r\n\r\n");
                        await writer.FlushAsync();

                        if (ChunkDelayMs > 0)
                        {
                            int chunkSize = 4096;
                            int offset = (int)start;
                            int remaining = (int)len;
                            while (remaining > 0)
                            {
                                int toSend = Math.Min(chunkSize, remaining);
                                await stream.WriteAsync(_content, offset, toSend);
                                await stream.FlushAsync();
                                offset += toSend;
                                remaining -= toSend;
                                if (remaining > 0)
                                {
                                    await Task.Delay(ChunkDelayMs);
                                }
                            }
                        }
                        else
                        {
                            await stream.WriteAsync(_content, (int)start, (int)len);
                            await stream.FlushAsync();
                        }
                        return;
                    }

                    if (FaultMode == ServerFaultMode.TruncateStreamPrematurely)
                    {
                        // Unknown length chunked or aborted stream
                        await writer.WriteAsync($"HTTP/1.1 200 OK\r\nContent-Type: {CustomContentType}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
                        await writer.FlushAsync();
                        // Send 4 bytes and abruptly close connection
                        await writer.WriteAsync("4\r\nTEST\r\n");
                        await writer.FlushAsync();
                        client.Client.LingerState = new LingerOption(true, 0);
                        client.Close();
                        return;
                    }

                    await writer.WriteAsync($"HTTP/1.1 200 OK\r\nContent-Type: {CustomContentType}\r\nContent-Length: {_content.Length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n");
                    await writer.FlushAsync();

                    if (ChunkDelayMs > 0)
                    {
                        int chunkSize = 4096;
                        int offset = 0;
                        int remaining = _content.Length;
                        while (remaining > 0)
                        {
                            int toSend = Math.Min(chunkSize, remaining);
                            await stream.WriteAsync(_content, offset, toSend);
                            await stream.FlushAsync();
                            offset += toSend;
                            remaining -= toSend;
                            if (remaining > 0)
                            {
                                await Task.Delay(ChunkDelayMs);
                            }
                        }
                    }
                    else
                    {
                        await stream.WriteAsync(_content, 0, _content.Length);
                        await stream.FlushAsync();
                    }
                }
            }
        }
        catch { }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _listener.Stop();
        try { await _listenTask; } catch { }
        _cts.Dispose();
    }
}
