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

        // Check if this stream requires FFmpeg muxing/copying (HLS .m3u8, dual stream video+audio, or MP3 audio conversion)
        bool isFfmpegTask = download.Url.Contains(".m3u8", StringComparison.OrdinalIgnoreCase) ||
                            !string.IsNullOrWhiteSpace(download.AudioUrl) ||
                            (download.Category == "Audio" && download.SavePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) && !download.Url.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase));

        if (isFfmpegTask)
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
                var worker = new SegmentWorker(_httpClient, download.Url, download.SavePath, i + 1, start, end, initialDownloaded, referer, uaString, cookieHeader);
                session.Workers.Add(worker);
                currentOffset = end + 1;
            }
        }
        else
        {
            long initialDownloaded = (cachedSegs != null && cachedSegs.Count > 0) ? cachedSegs[0].DownloadedBytes : 0;
            var worker = new SegmentWorker(_httpClient, download.Url, download.SavePath, 1, 0, -1, initialDownloaded, referer, uaString, cookieHeader);
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

            long totalDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = (dl.TotalBytes > 0 && totalDownloaded >= dl.TotalBytes) || (dl.TotalBytes <= 0 && totalDownloaded > 0);

            if (!token.IsCancellationRequested && hasBytes)
            {
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

        // Initialize synthetic segment workers for Transfer Monitor UI
        session.Workers.Clear();
        session.Workers.Add(new SegmentWorker(_httpClient, dl.Url, dl.SavePath, 1, 0, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, 0));
        session.Workers.Add(new SegmentWorker(_httpClient, dl.AudioUrl ?? dl.Url, dl.SavePath, 2, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, dl.TotalBytes, 0));
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
        psi.ArgumentList.Add(dl.SavePath);

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
                        dl.SpeedMbps = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsed);
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

            bool fileHasData = File.Exists(dl.SavePath) && new FileInfo(dl.SavePath).Length > 0;
            if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
            {
                var fi = new FileInfo(dl.SavePath);
                dl.TotalBytes = fi.Length;
                dl.DownloadedBytes = fi.Length;


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
        }
        finally
        {
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
            }
            catch { }
            session.Download.Status = DownloadStatus.Paused;
            session.Download.SpeedMbps = 0;
            session.Download.StatusDetail = "Cancelled";
            await _repository.SaveDownloadAsync(session.Download);
            DownloadStatusChanged?.Invoke(session.Download);
        }
    }
}
