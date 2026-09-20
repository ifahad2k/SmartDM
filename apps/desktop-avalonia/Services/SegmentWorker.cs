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

                if (_speedStopwatch.ElapsedMilliseconds >= 500)
                {
                    double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                    if (seconds > 0)
                    {
                        double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                        Progress.SpeedMbps = mbps;
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
}
