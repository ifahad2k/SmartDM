using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class SegmentWorker
{
    private readonly HttpClient _httpClient;
    private readonly string _url;
    private readonly string _targetFilePath;
    private readonly string? _referer;
    private readonly string? _userAgent;
    private readonly string? _cookies;
    public SegmentProgress Progress { get; }
    public string? LastError { get; private set; }

    private long _bytesSinceLastCheck;
    private Stopwatch _speedStopwatch = new();

    public SegmentWorker(
        HttpClient httpClient,
        string url,
        string targetFilePath,
        int index,
        long startByte,
        long endByte,
        long initialDownloaded = 0,
        string? referer = null,
        string? userAgent = null,
        string? cookies = null)
    {
        _httpClient = httpClient;
        _url = url;
        _targetFilePath = targetFilePath;
        _referer = referer;
        _userAgent = userAgent;
        _cookies = cookies;

        bool completed = (endByte > 0 && startByte + initialDownloaded > endByte);
        Progress = new SegmentProgress
        {
            SegmentIndex = index,
            StartByte = startByte,
            EndByte = endByte,
            DownloadedBytes = initialDownloaded,
            IsActive = false,
            IsCompleted = completed
        };
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        long currentStart = Progress.StartByte + Progress.DownloadedBytes;
        if (Progress.EndByte > 0 && currentStart > Progress.EndByte)
        {
            Progress.IsActive = false;
            Progress.IsCompleted = true;
            return;
        }

        Progress.IsActive = true;
        _speedStopwatch.Restart();
        _bytesSinceLastCheck = 0;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, _url);
            req.Version = System.Net.HttpVersion.Version11;
            req.VersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            if (!string.IsNullOrEmpty(_referer))
            {
                req.Headers.TryAddWithoutValidation("Referer", _referer);
            }
            if (!string.IsNullOrEmpty(_userAgent))
            {
                req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
            }
            if (!string.IsNullOrEmpty(_cookies))
            {
                req.Headers.TryAddWithoutValidation("Cookie", _cookies);
            }

            if (Progress.EndByte > 0)
            {
                req.Headers.Range = new RangeHeaderValue(currentStart, Progress.EndByte);
            }
            else if (currentStart > 0)
            {
                req.Headers.Range = new RangeHeaderValue(currentStart, null);
            }

            using var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            resp.EnsureSuccessStatusCode();

            if (currentStart > 0 && resp.StatusCode == System.Net.HttpStatusCode.OK)
            {
                throw new HttpRequestException("Server does not support HTTP Range requests (returned 200 OK for sub-range)");
            }

            await using var contentStream = await resp.Content.ReadAsStreamAsync(cancellationToken);
            await using var fileStream = new FileStream(_targetFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite, 131072, useAsync: true);
            fileStream.Seek(currentStart, SeekOrigin.Begin);

            byte[] buffer = new byte[131072];
            int read;

            while (true)
            {
                int toRead = buffer.Length;
                if (Progress.EndByte > 0)
                {
                    long bytesNeeded = (Progress.EndByte - Progress.StartByte + 1) - Progress.DownloadedBytes;
                    if (bytesNeeded <= 0) break;
                    toRead = (int)Math.Min((long)buffer.Length, bytesNeeded);
                }

                read = await contentStream.ReadAsync(buffer.AsMemory(0, toRead), cancellationToken);
                if (read <= 0) break;

                await fileStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                Progress.DownloadedBytes += read;
                _bytesSinceLastCheck += read;

                if (_speedStopwatch.ElapsedMilliseconds >= 400)
                {
                    double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                    if (seconds > 0)
                    {
                        double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                        Progress.SpeedMbps = Progress.SpeedMbps <= 0.05
                            ? mbps
                            : (Progress.SpeedMbps * 0.72) + (mbps * 0.28);
                    }
                    _bytesSinceLastCheck = 0;
                    _speedStopwatch.Restart();
                }
            }

            Progress.IsCompleted = true;
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Debug.WriteLine($"Segment {Progress.SegmentIndex} worker error: {ex.Message}");
            Progress.IsActive = false;
        }
        finally
        {
            Progress.IsActive = false;
            Progress.SpeedMbps = 0;
        }
    }

    public async Task ExecuteChunkQueueAsync(
        System.Collections.Concurrent.ConcurrentQueue<ChunkRange> queue,
        CancellationToken cancellationToken,
        Action<ChunkRange>? onChunkCompleted = null)
    {
        Progress.IsActive = true;
        Progress.IsCompleted = false;
        _speedStopwatch.Restart();
        _bytesSinceLastCheck = 0;

        try
        {
            await using var fileStream = new FileStream(
                _targetFilePath,
                FileMode.OpenOrCreate,
                FileAccess.Write,
                FileShare.ReadWrite,
                131072,
                useAsync: true);

            byte[] buffer = new byte[131072];

            while (queue.TryDequeue(out var chunk))
            {
                if (cancellationToken.IsCancellationRequested) break;

                long chunkLength = chunk.EndByte - chunk.StartByte + 1;
                long chunkDownloaded = 0;
                bool success = false;

                try
                {
                    using var req = new HttpRequestMessage(HttpMethod.Get, _url);
                    req.Version = System.Net.HttpVersion.Version11;
                    req.VersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
                    if (!string.IsNullOrEmpty(_referer)) req.Headers.TryAddWithoutValidation("Referer", _referer);
                    if (!string.IsNullOrEmpty(_userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                    if (!string.IsNullOrEmpty(_cookies)) req.Headers.TryAddWithoutValidation("Cookie", _cookies);
                    req.Headers.Range = new RangeHeaderValue(chunk.StartByte, chunk.EndByte);

                    using var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                    resp.EnsureSuccessStatusCode();

                    if (chunk.StartByte > 0 && resp.StatusCode == System.Net.HttpStatusCode.OK)
                    {
                        throw new HttpRequestException("Server does not support HTTP Range requests (returned 200 OK for sub-range)");
                    }

                    await using var contentStream = await resp.Content.ReadAsStreamAsync(cancellationToken);
                    fileStream.Seek(chunk.StartByte, SeekOrigin.Begin);

                    while (chunkDownloaded < chunkLength)
                    {
                        int toRead = (int)Math.Min((long)buffer.Length, chunkLength - chunkDownloaded);
                        int read = await contentStream.ReadAsync(buffer.AsMemory(0, toRead), cancellationToken);
                        if (read <= 0) break;

                        await fileStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                        chunkDownloaded += read;
                        Progress.DownloadedBytes += read;
                        _bytesSinceLastCheck += read;

                        if (_speedStopwatch.ElapsedMilliseconds >= 400)
                        {
                            double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                            if (seconds > 0)
                            {
                                double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                                Progress.SpeedMbps = Progress.SpeedMbps <= 0.05
                                    ? mbps
                                    : (Progress.SpeedMbps * 0.72) + (mbps * 0.28);
                            }
                            _bytesSinceLastCheck = 0;
                            _speedStopwatch.Restart();
                        }
                    }

                    if (chunkDownloaded >= chunkLength)
                    {
                        success = true;
                        LastError = null;
                        onChunkCompleted?.Invoke(chunk);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SegmentWorker #{Progress.SegmentIndex}] Chunk error {chunk.StartByte}-{chunk.EndByte}: {ex.Message}");
                }

                if (!success && !cancellationToken.IsCancellationRequested)
                {
                    if (chunk.Retries < 3)
                    {
                        chunk.Retries++;
                        queue.Enqueue(chunk);
                    }
                    else
                    {
                        LastError = $"Chunk {chunk.StartByte}-{chunk.EndByte} failed after 3 retries.";
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Debug.WriteLine($"[SegmentWorker #{Progress.SegmentIndex}] Queue worker fatal error: {ex.Message}");
        }
        finally
        {
            Progress.IsActive = false;
            Progress.IsCompleted = !cancellationToken.IsCancellationRequested && string.IsNullOrEmpty(LastError);
            Progress.SpeedMbps = 0;
        }
    }
}

public class ChunkRange
{
    public long StartByte { get; }
    public long EndByte { get; }
    public int Retries { get; set; }

    public ChunkRange(long startByte, long endByte)
    {
        StartByte = startByte;
        EndByte = endByte;
    }
}
