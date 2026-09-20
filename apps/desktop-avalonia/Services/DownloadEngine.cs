using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
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
        public Process? ActiveProcess { get; set; }
        public string StagingDirectory { get; set; } = "";
        public string StagingFilePath { get; set; } = "";
    }

    public static string GetDownloadStagingDirectory(string downloadId)
    {
        string safeId = "dl_" + string.Join("_", downloadId.Replace(".", "_").Split(Path.GetInvalidFileNameChars()));
        string stagingDir;
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string tempRoot = Path.Combine(baseDir, ".temp");
            Directory.CreateDirectory(tempRoot);
            try
            {
                var di = new DirectoryInfo(tempRoot);
                if ((di.Attributes & FileAttributes.Hidden) != FileAttributes.Hidden)
                {
                    di.Attributes |= FileAttributes.Hidden;
                }
            }
            catch { }

            stagingDir = Path.Combine(tempRoot, safeId);
            Directory.CreateDirectory(stagingDir);
            return stagingDir;
        }
        catch
        {
            // Fallback to LocalApplicationData if BaseDirectory is read-only
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string tempRoot = Path.Combine(appData, "SmartDM", ".temp");
            Directory.CreateDirectory(tempRoot);
            try
            {
                var di = new DirectoryInfo(tempRoot);
                if ((di.Attributes & FileAttributes.Hidden) != FileAttributes.Hidden)
                {
                    di.Attributes |= FileAttributes.Hidden;
                }
            }
            catch { }

            stagingDir = Path.Combine(tempRoot, safeId);
            Directory.CreateDirectory(stagingDir);
            return stagingDir;
        }
    }

    public static void CleanupStagingDirectory(string stagingDir)
    {
        try
        {
            if (Directory.Exists(stagingDir))
            {
                Directory.Delete(stagingDir, recursive: true);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to clean staging directory '{stagingDir}': {ex.Message}");
        }
    }

    public static void CleanupOrphanStagingDirectories()
    {
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string tempRoot = Path.Combine(baseDir, ".temp");
            if (Directory.Exists(tempRoot))
            {
                foreach (var dir in Directory.GetDirectories(tempRoot))
                {
                    try { Directory.Delete(dir, recursive: true); } catch { }
                }
            }
        }
        catch { }

        try
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string tempRoot = Path.Combine(appData, "SmartDM", ".temp");
            if (Directory.Exists(tempRoot))
            {
                foreach (var dir in Directory.GetDirectories(tempRoot))
                {
                    try { Directory.Delete(dir, recursive: true); } catch { }
                }
            }
        }
        catch { }
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

        string stagingDir = GetDownloadStagingDirectory(download.Id);
        string finalFileName = Path.GetFileName(download.SavePath);
        string stagingFilePath = Path.Combine(stagingDir, finalFileName);

        var session = new DownloadSession
        {
            Download = download,
            Cts = new CancellationTokenSource(),
            StagingDirectory = stagingDir,
            StagingFilePath = stagingFilePath
        };

        // 1. Dual-stream video+audio (DASH / YouTube 1080p, 720p, etc.) -> High-Speed 24-Stream Parallel Transfer
        if (!string.IsNullOrWhiteSpace(download.AudioUrl))
        {
            _sessions[download.Id] = session;
            session.RunnerTask = Task.Run(async () =>
            {
                await RunDualStreamSessionAsync(session);
            });
            return;
        }

        // 2. Audio-only MP3 conversion (YouTube audio, etc.) -> High-Speed Parallel Download + Local Conversion
        if (download.Category == "Audio" && download.SavePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) && !download.Url.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
        {
            _sessions[download.Id] = session;
            session.RunnerTask = Task.Run(async () =>
            {
                await RunAudioConversionSessionAsync(session);
            });
            return;
        }

        // 3. HLS .m3u8 stream tasks (Pornhub, etc.) -> FFmpeg Stream Session
        if (download.Url.Contains(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            _sessions[download.Id] = session;
            session.RunnerTask = Task.Run(async () =>
            {
                await RunFfmpegSessionAsync(session);
            });
            return;
        }

        // Determine segments
        int threadCount = Math.Clamp(download.ParallelThreads > 0 ? download.ParallelThreads : 16, 1, 32);
        long totalBytes = download.TotalBytes;

        _segmentCache.TryGetValue(download.Id, out var cachedSegs);

        string? referer = download.Referer;
        if (string.IsNullOrEmpty(referer) && (download.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || download.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = "https://www.pornhub.com/";
        }

        string? cookieHeader = null;
        if (!string.IsNullOrEmpty(download.Cookies))
        {
            var cookiePairs = new List<string>();
            var lines = download.Cookies.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var l in lines)
            {
                if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
                var parts = l.Split('\t');
                if (parts.Length >= 7)
                {
                    cookiePairs.Add($"{parts[5]}={parts[6]}");
                }
            }
            if (cookiePairs.Count > 0)
            {
                cookieHeader = string.Join("; ", cookiePairs);
            }
            else if (!download.Cookies.Contains("\t"))
            {
                cookieHeader = download.Cookies;
            }
        }

        string? uaString = !string.IsNullOrWhiteSpace(download.UserAgent)
            ? download.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        if (totalBytes > 0)
        {
            // Pre-allocate file size in isolated staging directory
            try
            {
                await using (var fs = new FileStream(session.StagingFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
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
                var worker = new SegmentWorker(_httpClient, download.Url, session.StagingFilePath, i + 1, start, end, initialDownloaded, referer, uaString, cookieHeader);
                session.Workers.Add(worker);
                currentOffset = end + 1;
            }
        }
        else
        {
            long initialDownloaded = (cachedSegs != null && cachedSegs.Count > 0) ? cachedSegs[0].DownloadedBytes : 0;
            var worker = new SegmentWorker(_httpClient, download.Url, session.StagingFilePath, 1, 0, -1, initialDownloaded, referer, uaString, cookieHeader);
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
                    double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsedSec);

                    // Exponential Moving Average (EMA) smoothing removes packet arrival jitter
                    dl.SpeedMbps = dl.SpeedMbps <= 0.05
                        ? rawSpeed
                        : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);

                    if (dl.TotalBytes > 0)
                    {
                        dl.DownloadedBytes = Math.Min(dl.TotalBytes, currentDownloaded);
                        dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);

                        long remainingBytes = dl.TotalBytes - dl.DownloadedBytes;
                        if (dl.SpeedMbps > 0.05)
                        {
                            dl.EtaSeconds = (int)(remainingBytes / (dl.SpeedMbps * 1024 * 1024));
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

            long totalDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = (dl.TotalBytes > 0 && totalDownloaded >= dl.TotalBytes) || (dl.TotalBytes <= 0 && totalDownloaded > 0);

            if (!token.IsCancellationRequested && hasBytes)
            {
                // Atomically move assembled file from hidden staging directory to user's final save path
                if (!string.IsNullOrEmpty(session.StagingFilePath) && File.Exists(session.StagingFilePath))
                {
                    string? targetDir = Path.GetDirectoryName(dl.SavePath);
                    if (!string.IsNullOrEmpty(targetDir))
                    {
                        Directory.CreateDirectory(targetDir);
                    }
                    File.Move(session.StagingFilePath, dl.SavePath, overwrite: true);
                }

                // Clean up hidden staging directory and any intermediate segment chunks
                if (!string.IsNullOrEmpty(session.StagingDirectory))
                {
                    CleanupStagingDirectory(session.StagingDirectory);
                }

                // Download successfully completed
                dl.Status = DownloadStatus.Completed;
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 100.0;
                dl.DownloadedBytes = dl.TotalBytes > 0 ? dl.TotalBytes : totalDownloaded;
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
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Segment error: {firstWorkerError}" : "Segment transfer interrupted or 0 bytes received";
                await _repository.SaveDownloadAsync(dl);
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
            dl.SpeedMbps = 0;
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

    private static string ResolveFfmpegPath()
    {
        string ffmpegPath = "ffmpeg";
        string? envFfmpeg = Environment.GetEnvironmentVariable("FFMPEG_PATH");
        if (!string.IsNullOrEmpty(envFfmpeg) && File.Exists(envFfmpeg))
        {
            return envFfmpeg;
        }
        string wingetPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            @"Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-125365-g9a01c1cb6a-win64-gpl\bin\ffmpeg.exe");
        if (File.Exists(wingetPath))
        {
            return wingetPath;
        }
        return ffmpegPath;
    }

    private async Task<long> ProbeStreamLengthAsync(string url, string? referer, string? uaString, string? cookieHeader, CancellationToken token)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Version = System.Net.HttpVersion.Version11;
            req.VersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
            req.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 0);
            if (!string.IsNullOrEmpty(referer)) req.Headers.TryAddWithoutValidation("Referer", referer);
            if (!string.IsNullOrEmpty(uaString)) req.Headers.TryAddWithoutValidation("User-Agent", uaString);
            if (!string.IsNullOrEmpty(cookieHeader)) req.Headers.TryAddWithoutValidation("Cookie", cookieHeader);

            using var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, token);
            if (!resp.IsSuccessStatusCode)
            {
                return -1;
            }
            if (resp.Content.Headers.ContentRange?.Length.HasValue == true)
            {
                return resp.Content.Headers.ContentRange.Length.Value;
            }
            if (resp.Content.Headers.ContentLength.HasValue && resp.Content.Headers.ContentLength.Value > 1)
            {
                return resp.Content.Headers.ContentLength.Value;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] ProbeStreamLengthAsync failed for {url}: {ex.Message}");
        }
        return -1;
    }

    private async Task RunDualStreamSessionAsync(DownloadSession session)
    {
        var dl = session.Download;
        var token = session.Cts.Token;

        if (dl.SavePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase) || dl.SavePath.EndsWith(".webm", StringComparison.OrdinalIgnoreCase))
        {
            dl.SavePath = Path.ChangeExtension(dl.SavePath, ".mp4");
            dl.Title = Path.GetFileName(dl.SavePath);
        }

        if (string.IsNullOrEmpty(session.StagingDirectory))
        {
            session.StagingDirectory = GetDownloadStagingDirectory(dl.Id);
        }
        session.StagingFilePath = Path.Combine(session.StagingDirectory, Path.GetFileName(dl.SavePath));

        string referer = dl.Referer ?? "";
        if (string.IsNullOrEmpty(referer) && (dl.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || dl.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = "https://www.pornhub.com/";
        }

        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string? cookieHeader = null;
        if (!string.IsNullOrEmpty(dl.Cookies))
        {
            var cookiePairs = new List<string>();
            var lines = dl.Cookies.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var l in lines)
            {
                if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
                var parts = l.Split('\t');
                if (parts.Length >= 7) cookiePairs.Add($"{parts[5]}={parts[6]}");
            }
            if (cookiePairs.Count > 0) cookieHeader = string.Join("; ", cookiePairs);
            else if (!dl.Cookies.Contains("\t")) cookieHeader = dl.Cookies;
        }

        dl.StatusDetail = "Probing video & audio stream boundaries...";
        DownloadStatusChanged?.Invoke(dl);

        long videoSize = await ProbeStreamLengthAsync(dl.Url, referer, uaString, cookieHeader, token);
        long audioSize = await ProbeStreamLengthAsync(dl.AudioUrl!, referer, uaString, cookieHeader, token);

        if (videoSize <= 0 || audioSize <= 0)
        {
            Debug.WriteLine($"[DownloadEngine] Dual stream probing returned video={videoSize}, audio={audioSize}. Falling back to FFmpeg.");
            await RunFfmpegSessionAsync(session);
            return;
        }

        dl.TotalBytes = videoSize + audioSize;

        string videoStagingPath = Path.Combine(session.StagingDirectory, "video_stream.tmp");
        string audioStagingPath = Path.Combine(session.StagingDirectory, "audio_stream.tmp");

        try
        {
            await using (var fs = new FileStream(videoStagingPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
            {
                if (fs.Length < videoSize) fs.SetLength(videoSize);
            }
            await using (var fs = new FileStream(audioStagingPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
            {
                if (fs.Length < audioSize) fs.SetLength(audioSize);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Pre-allocate error: {ex.Message}");
        }

        session.Workers.Clear();
        int videoThreads = Math.Min(16, Math.Max(1, (int)(videoSize / (128 * 1024))));
        int audioThreads = Math.Min(8, Math.Max(1, (int)(audioSize / (128 * 1024))));
        dl.ParallelThreads = videoThreads + audioThreads;

        // 1. Build Dynamic Chunk Queue for Video (1 MB to 3 MB chunks to prevent CDN throttle & eliminate stragglers)
        var videoQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long vSliceSize = Math.Clamp(videoSize / 48, 1048576, 3145728);
        long vOffset = 0;
        while (vOffset < videoSize)
        {
            long end = Math.Min(vOffset + vSliceSize - 1, videoSize - 1);
            videoQueue.Enqueue(new ChunkRange(vOffset, end));
            vOffset = end + 1;
        }

        // 2. Build Dynamic Chunk Queue for Audio (512 KB to 2 MB chunks)
        var audioQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long aSliceSize = Math.Clamp(audioSize / 16, 524288, 2097152);
        long aOffset = 0;
        while (aOffset < audioSize)
        {
            long end = Math.Min(aOffset + aSliceSize - 1, audioSize - 1);
            audioQueue.Enqueue(new ChunkRange(aOffset, end));
            aOffset = end + 1;
        }

        // 3. Create Video Workers
        long videoPerWorker = videoSize / videoThreads;
        for (int i = 0; i < videoThreads; i++)
        {
            long start = i * videoPerWorker;
            long end = (i == videoThreads - 1) ? videoSize - 1 : (i + 1) * videoPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.Url, videoStagingPath, i + 1, start, end, 0, referer, uaString, cookieHeader);
            session.Workers.Add(worker);
        }

        // 4. Create Audio Workers
        long audioPerWorker = audioSize / audioThreads;
        for (int i = 0; i < audioThreads; i++)
        {
            long start = i * audioPerWorker;
            long end = (i == audioThreads - 1) ? audioSize - 1 : (i + 1) * audioPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.AudioUrl!, audioStagingPath, videoThreads + i + 1, start, end, 0, referer, uaString, cookieHeader);
            session.Workers.Add(worker);
        }

        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        var workerTasks = new List<Task>();
        for (int i = 0; i < videoThreads; i++)
        {
            workerTasks.Add(session.Workers[i].ExecuteChunkQueueAsync(videoQueue, token));
        }
        for (int i = 0; i < audioThreads; i++)
        {
            workerTasks.Add(session.Workers[videoThreads + i].ExecuteChunkQueueAsync(audioQueue, token));
        }

        // Telemetry monitor loop with Exponential Moving Average (EMA) smoothing
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        var monitorTask = Task.Run(async () =>
        {
            long lastDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(400, monitorCts.Token);
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
                    double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsedSec);

                    // Exponential Moving Average (EMA) removes packet arrival jitter
                    dl.SpeedMbps = dl.SpeedMbps <= 0.05
                        ? rawSpeed
                        : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);

                    dl.DownloadedBytes = Math.Min(dl.TotalBytes, currentDownloaded);
                    dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);

                    long remainingBytes = dl.TotalBytes - dl.DownloadedBytes;
                    if (dl.SpeedMbps > 0.05)
                    {
                        dl.EtaSeconds = (int)(remainingBytes / (dl.SpeedMbps * 1024 * 1024));
                    }

                    dl.StatusDetail = $"Accelerated {dl.ParallelThreads}-Stream Transfer ({dl.SpeedMbps:F1} MB/s)...";
                    dl.Subline = $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} / {MediaFormatItem.FormatBytes(dl.TotalBytes)} • {dl.SpeedMbps:F1} MB/s";

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

            long totalDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = totalDownloaded >= dl.TotalBytes;
            bool hasError = session.Workers.Any(w => !string.IsNullOrEmpty(w.LastError)) || !videoQueue.IsEmpty || !audioQueue.IsEmpty;

            if (!token.IsCancellationRequested && hasBytes && !hasError)
            {
                dl.StatusDetail = "Muxing high-speed video & audio streams...";
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 99.0;
                dl.DownloadedBytes = dl.TotalBytes;
                dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Fast Local Mux";
                DownloadProgressChanged?.Invoke(dl);

                string ffmpegPath = ResolveFfmpegPath();
                var psi = new ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    WorkingDirectory = session.StagingDirectory,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                psi.ArgumentList.Add("-y");
                psi.ArgumentList.Add("-nostdin");
                psi.ArgumentList.Add("-i");
                psi.ArgumentList.Add(videoStagingPath);
                psi.ArgumentList.Add("-i");
                psi.ArgumentList.Add(audioStagingPath);
                psi.ArgumentList.Add("-c:v");
                psi.ArgumentList.Add("copy");
                psi.ArgumentList.Add("-c:a");
                psi.ArgumentList.Add("aac");
                psi.ArgumentList.Add("-movflags");
                psi.ArgumentList.Add("+faststart");
                psi.ArgumentList.Add(session.StagingFilePath);

                using var proc = new Process { StartInfo = psi };
                session.ActiveProcess = proc;

                using var reg = token.Register(() =>
                {
                    try { if (!proc.HasExited) proc.Kill(true); } catch { }
                });

                proc.Start();
                var stderrTask = proc.StandardError.ReadToEndAsync(token);
                await proc.WaitForExitAsync(token);
                string stderr = await stderrTask;

                bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length > 0;
                if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
                {
                    var fi = new FileInfo(session.StagingFilePath);
                    dl.TotalBytes = fi.Length;
                    dl.DownloadedBytes = fi.Length;

                    string? targetDir = Path.GetDirectoryName(dl.SavePath);
                    if (!string.IsNullOrEmpty(targetDir)) Directory.CreateDirectory(targetDir);

                    File.Move(session.StagingFilePath, dl.SavePath, overwrite: true);
                    CleanupStagingDirectory(session.StagingDirectory);

                    dl.Status = DownloadStatus.Completed;
                    dl.SpeedMbps = 0;
                    dl.ProgressPercentage = 100.0;
                    dl.StatusDetail = "High-speed media downloaded & muxed successfully";
                    dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Completed";
                    DownloadProgressChanged?.Invoke(dl);

                    var scanResult = await _safetyScanner.ScanFileAsync(dl.SavePath);
                    dl.Sha256Hash = scanResult.Sha256Hash;
                    await _repository.SaveDownloadAsync(dl);
                    DownloadCompleted?.Invoke(dl, scanResult);
                    DownloadStatusChanged?.Invoke(dl);
                }
                else
                {
                    dl.Status = DownloadStatus.Paused;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = proc.ExitCode != 0 ? $"Muxing failed (exit code {proc.ExitCode})" : "Muxing interrupted";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
            }
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Stream error: {firstWorkerError}" : "Transfer interrupted or partial bytes received";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
            else if (token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        catch (OperationCanceledException)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = "Paused by user";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        catch (Exception ex)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            monitorCts.Cancel();
            _sessions.TryRemove(dl.Id, out _);
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    private async Task RunAudioConversionSessionAsync(DownloadSession session)
    {
        var dl = session.Download;
        var token = session.Cts.Token;

        if (string.IsNullOrEmpty(session.StagingDirectory))
        {
            session.StagingDirectory = GetDownloadStagingDirectory(dl.Id);
        }
        session.StagingFilePath = Path.Combine(session.StagingDirectory, Path.GetFileName(dl.SavePath));

        string referer = dl.Referer ?? "";
        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string? cookieHeader = null;
        if (!string.IsNullOrEmpty(dl.Cookies))
        {
            var cookiePairs = new List<string>();
            var lines = dl.Cookies.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var l in lines)
            {
                if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
                var parts = l.Split('\t');
                if (parts.Length >= 7) cookiePairs.Add($"{parts[5]}={parts[6]}");
            }
            if (cookiePairs.Count > 0) cookieHeader = string.Join("; ", cookiePairs);
            else if (!dl.Cookies.Contains("\t")) cookieHeader = dl.Cookies;
        }

        long probedSize = await ProbeStreamLengthAsync(dl.Url, referer, uaString, cookieHeader, token);
        long audioSize = probedSize > 0 ? probedSize : dl.TotalBytes;

        if (audioSize <= 0)
        {
            await RunFfmpegSessionAsync(session);
            return;
        }

        dl.TotalBytes = audioSize;
        string audioStagingPath = Path.Combine(session.StagingDirectory, "audio_raw.tmp");

        try
        {
            await using (var fs = new FileStream(audioStagingPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
            {
                if (fs.Length < audioSize) fs.SetLength(audioSize);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Pre-allocate audio error: {ex.Message}");
        }

        session.Workers.Clear();
        int threadCount = Math.Min(16, Math.Max(1, (int)(audioSize / (128 * 1024))));
        dl.ParallelThreads = threadCount;

        // Build Dynamic Chunk Queue for Audio (512 KB to 2 MB chunks)
        var audioQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long aSliceSize = Math.Clamp(audioSize / 32, 524288, 2097152);
        long aOffset = 0;
        while (aOffset < audioSize)
        {
            long end = Math.Min(aOffset + aSliceSize - 1, audioSize - 1);
            audioQueue.Enqueue(new ChunkRange(aOffset, end));
            aOffset = end + 1;
        }

        long audioPerWorker = audioSize / threadCount;
        for (int i = 0; i < threadCount; i++)
        {
            long start = i * audioPerWorker;
            long end = (i == threadCount - 1) ? audioSize - 1 : (i + 1) * audioPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.Url, audioStagingPath, i + 1, start, end, 0, referer, uaString, cookieHeader);
            session.Workers.Add(worker);
        }

        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();
        var workerTasks = session.Workers.Select(w => w.ExecuteChunkQueueAsync(audioQueue, token)).ToList();

        // Telemetry monitor loop with Exponential Moving Average (EMA) smoothing
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        var monitorTask = Task.Run(async () =>
        {
            long lastDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested)
            {
                try { await Task.Delay(400, monitorCts.Token); } catch { break; }

                long currentDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
                double elapsedSec = sw.Elapsed.TotalSeconds;

                if (elapsedSec > 0)
                {
                    long delta = currentDownloaded - lastDownloaded;
                    double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsedSec);

                    // Exponential Moving Average (EMA) removes packet arrival jitter
                    dl.SpeedMbps = dl.SpeedMbps <= 0.05
                        ? rawSpeed
                        : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);

                    dl.DownloadedBytes = Math.Min(dl.TotalBytes, currentDownloaded);
                    dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);

                    long remainingBytes = dl.TotalBytes - dl.DownloadedBytes;
                    if (dl.SpeedMbps > 0.05)
                    {
                        dl.EtaSeconds = (int)(remainingBytes / (dl.SpeedMbps * 1024 * 1024));
                    }

                    dl.StatusDetail = $"Accelerated Audio Transfer ({dl.SpeedMbps:F1} MB/s)...";
                    dl.Subline = $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} / {MediaFormatItem.FormatBytes(dl.TotalBytes)} • {dl.SpeedMbps:F1} MB/s";

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

            long totalDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = totalDownloaded >= dl.TotalBytes;
            bool hasError = session.Workers.Any(w => !string.IsNullOrEmpty(w.LastError)) || !audioQueue.IsEmpty;

            if (!token.IsCancellationRequested && hasBytes && !hasError)
            {
                dl.StatusDetail = "Converting audio to MP3...";
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 99.0;
                dl.DownloadedBytes = dl.TotalBytes;
                dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Fast Local Conversion";
                DownloadProgressChanged?.Invoke(dl);

                string ffmpegPath = ResolveFfmpegPath();
                var psi = new ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    WorkingDirectory = session.StagingDirectory,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                psi.ArgumentList.Add("-y");
                psi.ArgumentList.Add("-nostdin");
                psi.ArgumentList.Add("-i");
                psi.ArgumentList.Add(audioStagingPath);
                psi.ArgumentList.Add("-vn");
                psi.ArgumentList.Add("-acodec");
                psi.ArgumentList.Add("libmp3lame");
                psi.ArgumentList.Add("-q:a");
                psi.ArgumentList.Add("2");
                psi.ArgumentList.Add(session.StagingFilePath);

                using var proc = new Process { StartInfo = psi };
                session.ActiveProcess = proc;

                using var reg = token.Register(() =>
                {
                    try { if (!proc.HasExited) proc.Kill(true); } catch { }
                });

                proc.Start();
                var stderrTask = proc.StandardError.ReadToEndAsync(token);
                await proc.WaitForExitAsync(token);
                string stderr = await stderrTask;

                bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length > 0;
                if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
                {
                    var fi = new FileInfo(session.StagingFilePath);
                    dl.TotalBytes = fi.Length;
                    dl.DownloadedBytes = fi.Length;

                    string? targetDir = Path.GetDirectoryName(dl.SavePath);
                    if (!string.IsNullOrEmpty(targetDir)) Directory.CreateDirectory(targetDir);

                    File.Move(session.StagingFilePath, dl.SavePath, overwrite: true);
                    CleanupStagingDirectory(session.StagingDirectory);

                    dl.Status = DownloadStatus.Completed;
                    dl.SpeedMbps = 0;
                    dl.ProgressPercentage = 100.0;
                    dl.StatusDetail = "Audio stream downloaded & converted to MP3 successfully";
                    dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Completed";
                    DownloadProgressChanged?.Invoke(dl);

                    var scanResult = await _safetyScanner.ScanFileAsync(dl.SavePath);
                    dl.Sha256Hash = scanResult.Sha256Hash;
                    await _repository.SaveDownloadAsync(dl);
                    DownloadCompleted?.Invoke(dl, scanResult);
                    DownloadStatusChanged?.Invoke(dl);
                }
                else
                {
                    dl.Status = DownloadStatus.Paused;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = proc.ExitCode != 0 ? $"Audio conversion failed (code {proc.ExitCode})" : "Audio conversion interrupted";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
            }
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Stream error: {firstWorkerError}" : "Transfer interrupted or partial bytes received";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
            else if (token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        catch (OperationCanceledException)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = "Paused by user";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        catch (Exception ex)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            monitorCts.Cancel();
            _sessions.TryRemove(dl.Id, out _);
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    private async Task RunFfmpegSessionAsync(DownloadSession session)
    {
        var dl = session.Download;
        var token = session.Cts.Token;

        // Force extension to .mp4 if it's .m3u8 or HLS stream so FFmpeg remuxes into a single playable MP4 container
        if (dl.SavePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            dl.SavePath = Path.ChangeExtension(dl.SavePath, ".mp4");
            dl.Title = Path.GetFileName(dl.SavePath);
        }

        // Ensure staging directory and output path are configured
        if (string.IsNullOrEmpty(session.StagingDirectory))
        {
            session.StagingDirectory = GetDownloadStagingDirectory(dl.Id);
        }
        session.StagingFilePath = Path.Combine(session.StagingDirectory, Path.GetFileName(dl.SavePath));

        // Initialize synthetic segment workers for Transfer Monitor UI
        session.Workers.Clear();
        session.Workers.Add(new SegmentWorker(_httpClient, dl.Url, session.StagingFilePath, 1, 0, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, 0));
        session.Workers.Add(new SegmentWorker(_httpClient, dl.AudioUrl ?? dl.Url, session.StagingFilePath, 2, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, dl.TotalBytes, 0));
        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        string referer = dl.Referer ?? "";
        if (string.IsNullOrEmpty(referer) && (dl.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || dl.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = "https://www.pornhub.com/";
        }

        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string customHeaders = "";
        if (!string.IsNullOrEmpty(referer))
        {
            customHeaders += $"Referer: {referer}\r\n";
        }
        if (!string.IsNullOrEmpty(dl.Cookies))
        {
            var cookiePairs = new List<string>();
            var lines = dl.Cookies.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var l in lines)
            {
                if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
                var parts = l.Split('\t');
                if (parts.Length >= 7)
                {
                    cookiePairs.Add($"{parts[5]}={parts[6]}");
                }
            }
            if (cookiePairs.Count > 0)
            {
                customHeaders += $"Cookie: {string.Join("; ", cookiePairs)}\r\n";
            }
            else if (!dl.Cookies.Contains("\t"))
            {
                customHeaders += $"Cookie: {dl.Cookies}\r\n";
            }
        }

        string ffmpegPath = "ffmpeg";
        string? envFfmpeg = Environment.GetEnvironmentVariable("FFMPEG_PATH");
        if (!string.IsNullOrEmpty(envFfmpeg) && File.Exists(envFfmpeg))
        {
            ffmpegPath = envFfmpeg;
        }
        else
        {
            string wingetPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-125365-g9a01c1cb6a-win64-gpl\bin\ffmpeg.exe");
            if (File.Exists(wingetPath))
            {
                ffmpegPath = wingetPath;
            }
        }

        var psi = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            WorkingDirectory = session.StagingDirectory, // Strict containment: all chunks, caches, and demux buffers stay in .temp
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        psi.ArgumentList.Add("-y");
        psi.ArgumentList.Add("-nostdin");
        if (!string.IsNullOrEmpty(customHeaders))

        {
            psi.ArgumentList.Add("-headers");
            psi.ArgumentList.Add(customHeaders);
        }
        if (!string.IsNullOrEmpty(uaString))
        {
            psi.ArgumentList.Add("-user_agent");
            psi.ArgumentList.Add(uaString);
        }
        psi.ArgumentList.Add("-i");
        psi.ArgumentList.Add(dl.Url);

        if (!string.IsNullOrWhiteSpace(dl.AudioUrl))
        {
            if (!string.IsNullOrEmpty(customHeaders))
            {
                psi.ArgumentList.Add("-headers");
                psi.ArgumentList.Add(customHeaders);
            }
            if (!string.IsNullOrEmpty(uaString))
            {
                psi.ArgumentList.Add("-user_agent");
                psi.ArgumentList.Add(uaString);
            }
            psi.ArgumentList.Add("-i");
            psi.ArgumentList.Add(dl.AudioUrl);
            psi.ArgumentList.Add("-c:v");
            psi.ArgumentList.Add("copy");
            psi.ArgumentList.Add("-c:a");
            psi.ArgumentList.Add("aac");
            psi.ArgumentList.Add("-movflags");
            psi.ArgumentList.Add("+faststart");
        }
        else if (dl.Category == "Audio" && dl.SavePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
        {
            psi.ArgumentList.Add("-vn");
            psi.ArgumentList.Add("-acodec");
            psi.ArgumentList.Add("libmp3lame");
            psi.ArgumentList.Add("-q:a");
            psi.ArgumentList.Add("2");
        }
        else
        {
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add("copy");
            psi.ArgumentList.Add("-bsf:a");
            psi.ArgumentList.Add("aac_adtstoasc");
            psi.ArgumentList.Add("-movflags");
            psi.ArgumentList.Add("+faststart");
        }
        psi.ArgumentList.Add(session.StagingFilePath);

        using var proc = new Process { StartInfo = psi };
        session.ActiveProcess = proc;

        using var reg = token.Register(() =>
        {
            try { if (!proc.HasExited) proc.Kill(true); } catch { }
        });

        try
        {
            proc.Start();
            var sw = Stopwatch.StartNew();
            long lastBytes = 0;

            string? line;
            string? lastError = null;
            while ((line = await proc.StandardError.ReadLineAsync()) != null)
            {
                if (token.IsCancellationRequested) break;

                if (line.Contains("403 Forbidden", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Server returned 403", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Error opening input", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Invalid data found", StringComparison.OrdinalIgnoreCase))
                {
                    lastError = line.Trim();
                }

                // FFmpeg output format example:
                // frame=  462 fps=0.0 q=-1.0 size=    2677KiB time=00:00:05.01 bitrate=4371.7kbits/s speed=7.46x
                var sizeMatch = Regex.Match(line, @"size=\s*(\d+)(KiB|kB|B)", RegexOptions.IgnoreCase);
                var timeMatch = Regex.Match(line, @"time=\s*(\d+:\d+:\d+\.\d+)", RegexOptions.IgnoreCase);

                long currentBytes = 0;
                if (sizeMatch.Success)
                {
                    long val = long.Parse(sizeMatch.Groups[1].Value);
                    string unit = sizeMatch.Groups[2].Value.ToUpperInvariant();
                    currentBytes = unit.Contains("K") ? val * 1024 : val;
                }

                if (currentBytes > 0)
                {
                    dl.DownloadedBytes = currentBytes;
                    double elapsed = sw.Elapsed.TotalSeconds;
                    if (elapsed >= 0.5)
                    {
                        long delta = currentBytes - lastBytes;
                        double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsed);
                        dl.SpeedMbps = dl.SpeedMbps <= 0.05
                            ? rawSpeed
                            : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);
                        lastBytes = currentBytes;
                        sw.Restart();
                    }

                    string timeStr = timeMatch.Success ? timeMatch.Groups[1].Value : "";

                    if (dl.TotalBytes > 0)
                    {
                        dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);
                        if (dl.SpeedMbps > 0.01)
                        {
                            long remaining = dl.TotalBytes - dl.DownloadedBytes;
                            dl.EtaSeconds = (int)(remaining / (dl.SpeedMbps * 1024 * 1024));
                        }
                        dl.StatusDetail = $"Streaming via FFmpeg ({dl.ProgressPercentage:F1}%)...";
                        dl.Subline = $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} / {MediaFormatItem.FormatBytes(dl.TotalBytes)} • {dl.SpeedMbps:F1} MB/s";
                    }
                    else
                    {
                        // Live HLS stream with unknown total size: display streamed bytes, speed, and time
                        dl.StatusDetail = !string.IsNullOrEmpty(timeStr)
                            ? $"Streaming via FFmpeg: {timeStr} ({MediaFormatItem.FormatBytes(dl.DownloadedBytes)})..."
                            : $"Streaming via FFmpeg: {MediaFormatItem.FormatBytes(dl.DownloadedBytes)}...";
                        dl.Subline = $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} • {dl.SpeedMbps:F1} MB/s";
                        // Active visual pulse so UI shows ongoing transfer rather than static 0%
                        dl.ProgressPercentage = Math.Min(99.0, Math.Max(1.0, (dl.DownloadedBytes % (100 * 1024 * 1024)) / (double)(100 * 1024 * 1024) * 100.0));
                    }

                    // Update synthetic segment progress for visualizer
                    if (session.Workers.Count >= 2)
                    {
                        session.Workers[0].Progress.DownloadedBytes = currentBytes / 2;
                        session.Workers[1].Progress.DownloadedBytes = currentBytes / 2;
                        session.Workers[0].Progress.IsActive = true;
                        session.Workers[1].Progress.IsActive = true;
                        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();
                    }

                    DownloadProgressChanged?.Invoke(dl);
                }
            }

            await proc.WaitForExitAsync();

            bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length > 0;
            if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
            {
                var fi = new FileInfo(session.StagingFilePath);
                dl.TotalBytes = fi.Length;
                dl.DownloadedBytes = fi.Length;

                // Ensure target folder exists
                string? targetDir = Path.GetDirectoryName(dl.SavePath);
                if (!string.IsNullOrEmpty(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                // Atomically move final assembled file from hidden staging directory to user's SavePath
                File.Move(session.StagingFilePath, dl.SavePath, overwrite: true);

                // Instantly purge all segment chunks, demuxer caches, and temporary staging files
                CleanupStagingDirectory(session.StagingDirectory);

                dl.Status = DownloadStatus.Completed;
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 100.0;
                dl.StatusDetail = "Media stream downloaded & muxed successfully";
                dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Completed";
                DownloadProgressChanged?.Invoke(dl);

                var scanResult = await _safetyScanner.ScanFileAsync(dl.SavePath);
                dl.Sha256Hash = scanResult.Sha256Hash;
                await _repository.SaveDownloadAsync(dl);
                DownloadCompleted?.Invoke(dl, scanResult);
                DownloadStatusChanged?.Invoke(dl);
            }
            else if (token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
            else
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = !string.IsNullOrEmpty(lastError) ? $"Stream error: {lastError}" : "FFmpeg stream transfer interrupted";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        catch (OperationCanceledException)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = "Paused by user";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        catch (Exception ex)
        {
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            _sessions.TryRemove(dl.Id, out _);
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    public async Task PauseDownloadAsync(string downloadId)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            session.Cts.Cancel();
            try
            {
                if (session.ActiveProcess != null && !session.ActiveProcess.HasExited)
                {
                    session.ActiveProcess.Kill(true);
                }
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
        else
        {
            var all = await _repository.GetAllDownloadsAsync();
            var target = all.FirstOrDefault(d => d.Id == downloadId);
            if (target != null && target.Status != DownloadStatus.Completed && target.Status != DownloadStatus.Quarantined)
            {
                target.Status = DownloadStatus.Paused;
                target.SpeedMbps = 0;
                target.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(target);
                DownloadStatusChanged?.Invoke(target);
            }
        }
    }

    public async Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null)
    {
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            session.Cts.Cancel();
            try
            {
                if (session.ActiveProcess != null && !session.ActiveProcess.HasExited)
                {
                    session.ActiveProcess.Kill(true);
                }
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
            try
            {
                if (session.ActiveProcess != null && !session.ActiveProcess.HasExited)
                {
                    session.ActiveProcess.Kill(true);
                }
                if (session.RunnerTask != null)
                {
                    await Task.WhenAny(session.RunnerTask, Task.Delay(800));
                }
            }
            catch { }
            session.Download.Status = DownloadStatus.Paused;
            session.Download.SpeedMbps = 0;
            session.Download.StatusDetail = "Cancelled";
            await _repository.SaveDownloadAsync(session.Download);
            DownloadStatusChanged?.Invoke(session.Download);
            _sessions.TryRemove(downloadId, out _);
        }
        else
        {
            var all = await _repository.GetAllDownloadsAsync();
            var target = all.FirstOrDefault(d => d.Id == downloadId);
            if (target != null && target.Status != DownloadStatus.Completed && target.Status != DownloadStatus.Quarantined)
            {
                target.Status = DownloadStatus.Paused;
                target.SpeedMbps = 0;
                target.StatusDetail = "Cancelled";
                await _repository.SaveDownloadAsync(target);
                DownloadStatusChanged?.Invoke(target);
            }
        }
        CleanupStagingDirectory(GetDownloadStagingDirectory(downloadId));
    }
}
