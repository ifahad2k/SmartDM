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

            await using var contentStream = await resp.Content.ReadAsStreamAsync(cancellationToken);
            await using var fileStream = new FileStream(_targetFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite, 65536, useAsync: true);
            fileStream.Seek(currentStart, SeekOrigin.Begin);

            byte[] buffer = new byte[65536];
            int read;

            while ((read = await contentStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)) > 0)
            {
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
        finally
        {
            Progress.IsActive = false;
            Progress.SpeedMbps = 0;
        }
    }
}
