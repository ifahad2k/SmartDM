using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class DownloadEngine : IDownloadEngine
{
    private readonly HttpClient _httpClient;
    private readonly IDatabaseRepository _repository;
    private readonly ISafetyScanner _safetyScanner;

    private readonly ConcurrentDictionary<string, DownloadSession> _sessions = new();
    private readonly ConcurrentDictionary<string, List<SegmentProgress>> _segmentCache = new();
    private long _speedLimitBytesPerSec = 0;

    public event Action<DownloadModel>? DownloadProgressChanged;
    public event Action<DownloadModel>? DownloadStatusChanged;
    public event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;

    private class DownloadSession
    {
        public DownloadModel Download { get; set; } = null!;
        public List<SegmentWorker> Workers { get; set; } = new();
        public CancellationTokenSource Cts { get; set; } = new();
        public Task? RunnerTask { get; set; }
    }

    public DownloadEngine(IDatabaseRepository repository, ISafetyScanner safetyScanner, HttpClient? httpClient = null)
    {
        _repository = repository;
        _safetyScanner = safetyScanner;

        if (httpClient != null)
        {
            _httpClient = httpClient;
        }
        else
        {
            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = true,
                MaxAutomaticRedirections = 10,
                PooledConnectionLifetime = TimeSpan.FromMinutes(15),
                EnableMultipleHttp2Connections = true
            };
            _httpClient = new HttpClient(handler)
            {
                Timeout = Timeout.InfiniteTimeSpan
            };
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("SmartDM/2.0 (Compatible; Mozilla/5.0; Windows NT 10.0; Win64; x64)");
        }
    }

    public void SetSpeedLimitBytesPerSec(long limitBytesPerSec)
    {
        _speedLimitBytesPerSec = limitBytesPerSec;
    }

    public IReadOnlyList<SegmentProgress> GetSegments(string downloadId)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            return session.Workers.Select(w => w.Progress).ToList();
        }
        if (_segmentCache.TryGetValue(downloadId, out var cached))
        {
            return cached;
        }
        return Array.Empty<SegmentProgress>();
    }

    public async Task StartDownloadAsync(DownloadModel download)
    {
        if (_sessions.TryGetValue(download.Id, out var existingSession))
        {
            if (!existingSession.Cts.IsCancellationRequested)
            {
                return;
            }
            _sessions.TryRemove(download.Id, out _);
        }

        string destDir = Path.GetDirectoryName(download.SavePath) ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!Directory.Exists(destDir))
        {
            Directory.CreateDirectory(destDir);
        }

        download.Status = DownloadStatus.Active;
        await _repository.SaveDownloadAsync(download);
        DownloadStatusChanged?.Invoke(download);

        var session = new DownloadSession
        {
            Download = download,
            Cts = new CancellationTokenSource()
        };

        // Determine segments
        int threadCount = Math.Clamp(download.ParallelThreads > 0 ? download.ParallelThreads : 16, 1, 32);
        long totalBytes = download.TotalBytes;

        _segmentCache.TryGetValue(download.Id, out var cachedSegs);

        if (totalBytes > 0)
        {
            // Pre-allocate file size
            try
            {
                await using (var fs = new FileStream(download.SavePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
                {
                    if (fs.Length < totalBytes)
                    {
                        fs.SetLength(totalBytes);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to pre-allocate file length: {ex.Message}");
            }

            long chunkSize = totalBytes / threadCount;
            if (chunkSize < 262144 && threadCount > 1) // Min 256 KB chunk
            {
                threadCount = Math.Max(1, (int)(totalBytes / 262144));
                chunkSize = totalBytes / threadCount;
            }

            long currentOffset = 0;
            for (int i = 0; i < threadCount; i++)
            {
                long start = currentOffset;
                long end = (i == threadCount - 1) ? totalBytes - 1 : (currentOffset + chunkSize - 1);
                long initialDownloaded = 0;
                if (cachedSegs != null && i < cachedSegs.Count)
                {
                    initialDownloaded = Math.Clamp(cachedSegs[i].DownloadedBytes, 0, end - start + 1);
                }
                var worker = new SegmentWorker(_httpClient, download.Url, download.SavePath, i + 1, start, end, initialDownloaded);
                session.Workers.Add(worker);
                currentOffset = end + 1;
            }
        }
        else
        {
            long initialDownloaded = (cachedSegs != null && cachedSegs.Count > 0) ? cachedSegs[0].DownloadedBytes : 0;
            var worker = new SegmentWorker(_httpClient, download.Url, download.SavePath, 1, 0, -1, initialDownloaded);
            session.Workers.Add(worker);
        }

        _sessions[download.Id] = session;
        _segmentCache[download.Id] = session.Workers.Select(w => w.Progress).ToList();

        session.RunnerTask = Task.Run(async () =>
        {
            await RunSessionAsync(session);
        });
    }

    private async Task RunSessionAsync(DownloadSession session)
    {
        var dl = session.Download;
        var token = session.Cts.Token;

        var workerTasks = session.Workers.Select(w => w.ExecuteAsync(token)).ToList();

        // Telemetry monitor loop
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        var monitorTask = Task.Run(async () =>
        {
            long lastDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(500, monitorCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                long currentDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
                double elapsedSec = sw.Elapsed.TotalSeconds;

                if (elapsedSec > 0)
                {
                    long delta = currentDownloaded - lastDownloaded;
                    double speedMbps = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsedSec);
                    dl.SpeedMbps = speedMbps;

                    if (dl.TotalBytes > 0)
                    {
                        dl.DownloadedBytes = Math.Min(dl.TotalBytes, currentDownloaded);
                        dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);

                        long remainingBytes = dl.TotalBytes - dl.DownloadedBytes;
                        if (speedMbps > 0.01)
                        {
                            dl.EtaSeconds = (int)(remainingBytes / (speedMbps * 1024 * 1024));
                        }
                    }
                    else
                    {
                        dl.DownloadedBytes = currentDownloaded;
                    }

                    lastDownloaded = currentDownloaded;
                    sw.Restart();

                    _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

                    DownloadProgressChanged?.Invoke(dl);
                }
            }
        }, monitorCts.Token);

        try
        {
            await Task.WhenAll(workerTasks);
            monitorCts.Cancel();

            if (!token.IsCancellationRequested)
            {
                // Download successfully completed
                dl.Status = DownloadStatus.Completed;
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 100.0;
                dl.DownloadedBytes = dl.TotalBytes > 0 ? dl.TotalBytes : session.Workers.Sum(w => w.Progress.DownloadedBytes);
                dl.StatusDetail = "Reconstructing file & performing integrity scan...";

                DownloadProgressChanged?.Invoke(dl);

                // Run Safety & Hash Scan
                var scanResult = await _safetyScanner.ScanFileAsync(dl.SavePath);
                dl.Sha256Hash = scanResult.Sha256Hash;

                if (scanResult.HasThreat || scanResult.IsQuarantined)
                {
                    dl.Status = DownloadStatus.Quarantined;
                    dl.StatusDetail = scanResult.ThreatDetails;
                    dl.Subline = $"Threat Blocked • {scanResult.ScannerName}";
                }
                else
                {
                    dl.Status = DownloadStatus.Completed;
                    dl.StatusDetail = $"Clean file • Checksum verified ({scanResult.ScannerName})";
                }

                await _repository.SaveDownloadAsync(dl);
                DownloadCompleted?.Invoke(dl, scanResult);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            dl.Status = DownloadStatus.Paused;
            dl.StatusDetail = $"Error: {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        finally
        {
            monitorCts.Cancel();
            _sessions.TryRemove(dl.Id, out _);
        }
    }

    public async Task PauseDownloadAsync(string downloadId)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            session.Cts.Cancel();
            try
            {
                if (session.RunnerTask != null)
                {
                    await Task.WhenAny(session.RunnerTask, Task.Delay(800));
                }
            }
            catch { }

            _segmentCache[downloadId] = session.Workers.Select(w => w.Progress).ToList();

            session.Download.Status = DownloadStatus.Paused;
            session.Download.SpeedMbps = 0;
            session.Download.StatusDetail = "Paused by user";
            await _repository.SaveDownloadAsync(session.Download);
            DownloadStatusChanged?.Invoke(session.Download);
            _sessions.TryRemove(downloadId, out _);
        }
    }

    public async Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            session.Cts.Cancel();
            try
            {
                if (session.RunnerTask != null)
                {
                    await Task.WhenAny(session.RunnerTask, Task.Delay(800));
                }
            }
            catch { }
            _sessions.TryRemove(downloadId, out _);
        }

        DownloadModel? target = existingModel;
        if (target == null)
        {
            var all = await _repository.GetAllDownloadsAsync();
            target = all.FirstOrDefault(d => d.Id == downloadId);
        }

        if (target != null && target.Status != DownloadStatus.Completed && target.Status != DownloadStatus.Quarantined)
        {
            target.Status = DownloadStatus.Active;
            target.StatusDetail = "Resuming multi-socket download...";
            await StartDownloadAsync(target);
        }
    }

    public async Task CancelDownloadAsync(string downloadId)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            session.Cts.Cancel();
            session.Download.Status = DownloadStatus.Paused;
            session.Download.SpeedMbps = 0;
            session.Download.StatusDetail = "Cancelled";
            await _repository.SaveDownloadAsync(session.Download);
            DownloadStatusChanged?.Invoke(session.Download);
        }
    }
}
