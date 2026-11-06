using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
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
    private readonly TransferScheduler _scheduler = new();
    private static readonly ConcurrentDictionary<string, byte> LiveSessionIds = new();

    private readonly ConcurrentDictionary<string, DownloadSession> _sessions = new();
    private readonly DownloadCommandGate _commands = new();
    private readonly ConcurrentDictionary<string, List<SegmentProgress>> _segmentCache = new();
    private long _speedLimitBytesPerSec = 0;
    private readonly AggregateSpeedLimiter _speedLimiter = new();
    public AggregateSpeedLimiter SpeedLimiter => _speedLimiter;

    public event Action<DownloadModel>? DownloadProgressChanged;
    public event Action<DownloadModel>? DownloadStatusChanged;
    public event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;

    private class DownloadSession
    {
        public string Id { get; init; } = "";
        public object LifecycleSync { get; } = new();
        public bool StopRequested { get; set; }
        public bool CommitStarted { get; set; }
        public bool UsesSegmentJournal { get; set; }
        public DownloadModel Download { get; set; } = null!;
        public List<SegmentWorker> Workers { get; set; } = new();
        public CancellationTokenSource Cts { get; set; } = new();
        public Task? RunnerTask { get; set; }
        public string StagingDirectory { get; set; } = "";
        public string StagingFilePath { get; set; } = "";
    }

    public static string GetDownloadStagingDirectory(string downloadId)
    {
        string? isolated = Environment.GetEnvironmentVariable("SMARTDM_STAGING_DIR");
        if (!string.IsNullOrEmpty(isolated))
        {
            if (!Path.IsPathFullyQualified(isolated)) throw new InvalidOperationException("The staging root must be absolute.");
            string path = Path.Combine(isolated, "dl_" + MediaCheckpoint.Fingerprint(downloadId));
            Directory.CreateDirectory(path);
            return path;
        }
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

    public static void CleanupOrphanStagingDirectories(IEnumerable<string>? activeOrResumableIds = null, TimeSpan? retentionCutoff = null)
    {
        var safeSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (activeOrResumableIds != null)
        {
            foreach (var id in activeOrResumableIds)
            {
                if (!string.IsNullOrWhiteSpace(id))
                {
                    safeSet.Add("dl_" + string.Join("_", id.Replace(".", "_").Split(Path.GetInvalidFileNameChars())));
                }
            }
        }

        foreach (string id in LiveSessionIds.Keys) safeSet.Add("dl_" + string.Join("_", id.Replace(".", "_").Split(Path.GetInvalidFileNameChars())));

        DateTime cutoffTime = retentionCutoff.HasValue
            ? DateTime.UtcNow - retentionCutoff.Value
            : DateTime.MinValue;

        void CleanTempRoot(string tempRoot)
        {
            try
            {
                if (!Directory.Exists(tempRoot)) return;
                foreach (var dir in Directory.GetDirectories(tempRoot))
                {
                    try
                    {
                        string dirName = Path.GetFileName(dir);
                        if (safeSet.Contains(dirName))
                        {
                            continue;
                        }

                        if (retentionCutoff.HasValue)
                        {
                            var di = new DirectoryInfo(dir);
                            if (di.LastWriteTimeUtc > cutoffTime)
                            {
                                continue;
                            }
                        }

                        Directory.Delete(dir, recursive: true);
                    }
                    catch { }
                }
            }
            catch { }
        }

        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SMARTDM_STAGING_DIR"))) return;
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        CleanTempRoot(Path.Combine(baseDir, ".temp"));

        string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        CleanTempRoot(Path.Combine(appData, "SmartDM", ".temp"));
    }

    public class SegmentJournalEntry
    {
        public int SegmentIndex { get; set; }
        public long StartByte { get; set; }
        public long EndByte { get; set; }
        public long DownloadedBytes { get; set; }
        public bool IsCompleted { get; set; }
        public string? CheckpointSha256 { get; set; }
    }

    public class DownloadJournal
    {
        public string DownloadId { get; set; } = string.Empty;
        public string SourceUrl { get; set; } = string.Empty;
        public long TotalBytes { get; set; }
        public string? ETag { get; set; }
        public string? LastModified { get; set; }
        public List<SegmentJournalEntry> Segments { get; set; } = new();
    }

    public static string GetSegmentJournalPath(string stagingDirectory)
    {
        return Path.Combine(stagingDirectory, "segments.journal");
    }

    public static void SaveSegmentJournal(
        string stagingDirectory,
        IEnumerable<SegmentProgress> segments,
        string? downloadId = null,
        string? sourceUrl = null,
        long totalBytes = 0,
        string? etag = null,
        string? lastModified = null)
    {
        try
        {
            if (string.IsNullOrEmpty(stagingDirectory) || !Directory.Exists(stagingDirectory)) return;

            var journal = new DownloadJournal
            {
                DownloadId = downloadId ?? string.Empty,
                SourceUrl = sourceUrl ?? string.Empty,
                TotalBytes = totalBytes,
                ETag = etag,
                LastModified = lastModified,
                Segments = segments.Select(s => new SegmentJournalEntry
                {
                    SegmentIndex = s.SegmentIndex,
                    StartByte = s.StartByte,
                    EndByte = s.EndByte,
                    DownloadedBytes = s.DownloadedBytes,
                    IsCompleted = s.IsCompleted,
                    CheckpointSha256 = s.CheckpointSha256
                }).ToList()
            };

            string json = JsonSerializer.Serialize(journal, new JsonSerializerOptions { WriteIndented = true });
            string journalPath = GetSegmentJournalPath(stagingDirectory);
            string tmpPath = journalPath + ".tmp";
            File.WriteAllText(tmpPath, json);
            File.Move(tmpPath, journalPath, overwrite: true);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to save segment journal: {ex.Message}");
        }
    }

    public static void SaveSegmentJournal(string stagingDirectory, DownloadModel download, IEnumerable<SegmentProgress> segments)
    {
        SaveSegmentJournal(
            stagingDirectory,
            segments,
            downloadId: download.Id,
            sourceUrl: download.Url,
            totalBytes: download.TotalBytes,
            etag: download.ETag,
            lastModified: download.LastModified);
    }

    public static List<SegmentProgress>? LoadAndValidateJournal(
        string stagingDirectory,
        string downloadId,
        string sourceUrl,
        long totalBytes,
        string? currentETag = null,
        string? currentLastModified = null,
        string? stagingFilePath = null,
        bool allowCompletedReuse = false)
    {
        try
        {
            string journalPath = GetSegmentJournalPath(stagingDirectory);
            if (!File.Exists(journalPath)) return null;

            string json = File.ReadAllText(journalPath);
            DownloadJournal? journal = null;

            try
            {
                journal = JsonSerializer.Deserialize<DownloadJournal>(json);
            }
            catch { }

            if (journal == null || journal.Segments == null || journal.Segments.Count == 0)
            {
                try
                {
                    var fallbackEntries = JsonSerializer.Deserialize<List<SegmentJournalEntry>>(json);
                    if (fallbackEntries != null && fallbackEntries.Count > 0)
                    {
                        journal = new DownloadJournal { Segments = fallbackEntries };
                    }
                }
                catch { }
            }

            if (journal == null || journal.Segments == null || journal.Segments.Count == 0)
            {
                return null;
            }

            // 1. Source Identity Validation
            if (!string.IsNullOrEmpty(journal.DownloadId) && !string.IsNullOrEmpty(downloadId) &&
                !string.Equals(journal.DownloadId, downloadId, StringComparison.OrdinalIgnoreCase))
            {
                Debug.WriteLine("[JournalValidation] Rejecting journal: download identity mismatch");
                return null;
            }

            if (!string.IsNullOrEmpty(journal.SourceUrl) && !string.IsNullOrEmpty(sourceUrl) &&
                !string.Equals(journal.SourceUrl, sourceUrl, StringComparison.OrdinalIgnoreCase))
            {
                Debug.WriteLine("[JournalValidation] Rejecting journal: source URL mismatch");
                return null;
            }

            if (journal.TotalBytes > 0 && totalBytes > 0 && journal.TotalBytes != totalBytes)
            {
                Debug.WriteLine($"[JournalValidation] Rejecting journal: TotalBytes mismatch (journal {journal.TotalBytes} vs expected {totalBytes})");
                return null;
            }

            // 2. HTTP Validators Validation
            if (!string.IsNullOrEmpty(journal.ETag) && !string.IsNullOrEmpty(currentETag))
            {
                string normJ = journal.ETag.Trim().Trim('"');
                string normC = currentETag.Trim().Trim('"');
                if (!string.Equals(normJ, normC, StringComparison.OrdinalIgnoreCase))
                {
                    Debug.WriteLine("[JournalValidation] Rejecting journal: ETag validator changed");
                    return null;
                }
            }

            if (!string.IsNullOrEmpty(journal.LastModified) && !string.IsNullOrEmpty(currentLastModified))
            {
                if (!string.Equals(journal.LastModified.Trim(), currentLastModified.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    Debug.WriteLine("[JournalValidation] Rejecting journal: Last-Modified validator changed");
                    return null;
                }
            }

            allowCompletedReuse = allowCompletedReuse &&
                !string.IsNullOrWhiteSpace(downloadId) &&
                string.Equals(journal.DownloadId, downloadId, StringComparison.Ordinal) &&
                !string.IsNullOrWhiteSpace(sourceUrl) &&
                string.Equals(journal.SourceUrl, sourceUrl, StringComparison.Ordinal) &&
                totalBytes > 0 && journal.TotalBytes == totalBytes &&
                !string.IsNullOrWhiteSpace(currentETag) &&
                !currentETag.StartsWith("W/", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(journal.ETag, currentETag, StringComparison.Ordinal);

            // 3. Segment Range Bounds & Monotonicity Validation
            long prevEnd = -1;
            foreach (var seg in journal.Segments)
            {
                if (seg.StartByte < 0) return null;
                if (seg.EndByte >= 0 && seg.EndByte < seg.StartByte) return null;
                if (seg.StartByte <= prevEnd) return null; // Overlapping or non-monotonic
                if (totalBytes > 0 && seg.EndByte >= totalBytes) return null;
                prevEnd = seg.EndByte;
            }

            // A preallocated file length proves no bytes were written. Reuse only fully
            // flushed ranges whose saved digest still matches the bytes on disk.
            foreach (var seg in journal.Segments)
            {
                long length = seg.EndByte >= seg.StartByte ? seg.EndByte - seg.StartByte + 1 : 0;
                bool verified = false;
                if (allowCompletedReuse && length > 0 && seg.IsCompleted && seg.DownloadedBytes == length &&
                    seg.CheckpointSha256?.Length == 64 && !string.IsNullOrEmpty(stagingFilePath))
                {
                    try
                    {
                        string actual = SegmentCheckpointHash.Compute(stagingFilePath, seg.StartByte, length);
                        verified = string.Equals(actual, seg.CheckpointSha256, StringComparison.OrdinalIgnoreCase);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
                if (!verified)
                {
                    seg.DownloadedBytes = 0;
                    seg.IsCompleted = false;
                    seg.CheckpointSha256 = null;
                }
            }

            return journal.Segments.Select(e => new SegmentProgress
            {
                SegmentIndex = e.SegmentIndex,
                StartByte = e.StartByte,
                EndByte = e.EndByte,
                DownloadedBytes = e.DownloadedBytes,
                IsCompleted = e.IsCompleted,
                CheckpointSha256 = e.CheckpointSha256
            }).ToList();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to load and validate journal: {ex.Message}");
            return null;
        }
    }

    public static List<SegmentProgress>? LoadSegmentJournal(string stagingDirectory)
    {
        return LoadAndValidateJournal(stagingDirectory, string.Empty, string.Empty, 0);
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
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            _httpClient.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "*/*");
        }
    }

    public void SetSpeedLimitBytesPerSec(long limitBytesPerSec)
    {
        _speedLimitBytesPerSec = limitBytesPerSec;
        _speedLimiter.SetLimit(limitBytesPerSec);
    }

    public IReadOnlyList<SegmentProgress> GetSegments(string downloadId)
    {
        // Preparation can add workers after ownership is reserved. Publish only
        // stable list snapshots; never enumerate that mutable list from the UI.
        if (_segmentCache.TryGetValue(downloadId, out var cached))
        {
            return cached;
        }
        return Array.Empty<SegmentProgress>();
    }

    private async Task<(bool Matches, string? CurrentETag)> VerifyRemoteResumeIdentityAsync(DownloadModel download, CancellationToken token)
    {
        // Completed checkpoints may be reused only against the same strong ETag.
        // Missing/weak validators and failed probes cause a safe replay from zero.
        if (download.TotalBytes <= 0 || string.IsNullOrWhiteSpace(download.ETag) ||
            download.ETag.StartsWith("W/", StringComparison.OrdinalIgnoreCase)) return (false, null);

        try
        {
            using var request = HttpTransferRequest.Create(HttpMethod.Get, download.Url);
            request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 0);
            request.Headers.AcceptEncoding.ParseAdd("identity");
            if (!string.IsNullOrWhiteSpace(download.Referer))
                request.Headers.TryAddWithoutValidation("Referer", download.Referer);
            if (!string.IsNullOrWhiteSpace(download.UserAgent))
                request.Headers.TryAddWithoutValidation("User-Agent", download.UserAgent);
            string? cookies = FormatCookieHeader(download.Cookies, download.Url);
            if (!string.IsNullOrWhiteSpace(cookies))
                request.Headers.TryAddWithoutValidation("Cookie", cookies);

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
            var range = response.Content.Headers.ContentRange;
            bool validProbe = response.StatusCode == System.Net.HttpStatusCode.PartialContent &&
                   range?.From == 0 && range.To == 0 && range.Length == download.TotalBytes &&
                   string.Equals(range.Unit, "bytes", StringComparison.OrdinalIgnoreCase) &&
                   response.Content.Headers.ContentEncoding.All(value => string.Equals(value, "identity", StringComparison.OrdinalIgnoreCase));
            if (validProbe && response.Headers.ETag is { IsWeak: false } freshTag)
                return (string.Equals(freshTag.Tag, download.ETag, StringComparison.Ordinal), freshTag.Tag);
            return (false, null);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            return (false, null);
        }
    }

    public async Task StartDownloadAsync(DownloadModel download)
    {
        ArgumentNullException.ThrowIfNull(download);
        using var command = await _commands.EnterAsync(download.Id);
        await StartDownloadCoreAsync(download);
    }

    private async Task StartDownloadCoreAsync(DownloadModel download)
    {
        if (_sessions.TryGetValue(download.Id, out var existingSession))
        {
            if (!IsTerminal(existingSession.Download.Status) && existingSession.Download.Status != DownloadStatus.Failed) return;
            if (existingSession.RunnerTask != null) await existingSession.RunnerTask;
            if (IsTerminal(existingSession.Download.Status)) return;
        }
        if (IsTerminal(download.Status)) return;

        var session = new DownloadSession { Id = download.Id, Download = download };
        _segmentCache.TryRemove(download.Id, out _);
        if (!_sessions.TryAdd(download.Id, session))
        {
            session.Cts.Dispose();
            throw new InvalidOperationException("A download session already owns this transfer.");
        }
        LiveSessionIds[session.Id] = 0;
        // Reserve ownership before any asynchronous database/probe/filesystem work.
        session.RunnerTask = Task.Run(() => RunOwnedSessionAsync(session));
    }

    private async Task RunOwnedSessionAsync(DownloadSession session)
    {
        try
        {
            session.Download.StatusDetail = "Waiting for a transfer slot (4 total, 2 per host)...";
            DownloadProgressChanged?.Invoke(session.Download);
            using var slot = await _scheduler.EnterAsync(new Uri(session.Download.Url).IdnHost, session.Cts.Token);
            await PrepareAndRunSessionAsync(session);
        }
        catch (OperationCanceledException) when (session.Cts.IsCancellationRequested || session.StopRequested)
        {
            // The serialized stop command publishes the final paused/cancelled state.
        }
        catch (Exception error)
        {
            session.Download.Status = DownloadStatus.Failed;
            session.Download.SpeedMbps = 0;
            session.Download.StatusDetail = error is MediaRecoveryException or InvalidDataException ? error.Message : "Transfer setup or shutdown failed.";
            session.Download.Subline = "Failed • Transfer could not finish";
            await _repository.SaveDownloadAsync(session.Download);
            DownloadStatusChanged?.Invoke(session.Download);
        }
        finally
        {
            ((ICollection<KeyValuePair<string, DownloadSession>>)_sessions)
                .Remove(new KeyValuePair<string, DownloadSession>(session.Id, session));
            LiveSessionIds.TryRemove(session.Id, out _);
            session.Cts.Dispose();
        }
    }

    private static bool IsTerminal(DownloadStatus status) => status is DownloadStatus.Completed or DownloadStatus.Quarantined;

    private async Task<bool> FinalizeSessionIntegrityAsync(DownloadSession session, SafetyScanResult result)
    {
        lock (session.LifecycleSync)
        {
            // Observed threat evidence must never be downgraded by a stop request.
            if (session.StopRequested && !result.HasThreat && !result.IsQuarantined)
                throw new OperationCanceledException(session.Cts.Token);
            session.CommitStarted = true;
        }
        return await FinalizeDownloadIntegrityAsync(session.Download, result, session.StagingFilePath);
    }

    private static async Task StopMonitorAsync(CancellationTokenSource cancellation, Task monitor, bool dispose = false)
    {
        cancellation.Cancel();
        try { await monitor; }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        finally { if (dispose) cancellation.Dispose(); }
    }

    private static void StartSessionProcess(DownloadSession session, Process process)
    {
        lock (session.LifecycleSync)
        {
            if (session.StopRequested) throw new OperationCanceledException(session.Cts.Token);
            session.Cts.Token.ThrowIfCancellationRequested();
            process.Start();
        }
    }

    private sealed class SessionProcessLifetime(Process process) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try { if (process.HasExited) return; }
            catch (InvalidOperationException) { return; } // Start failed; no process exists.
            try { process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
            // If killing fails, retain ownership until actual exit. Never allow
            // a new writer just because a shutdown timeout elapsed.
            await process.WaitForExitAsync();
        }
    }

    private async Task PrepareAndRunSessionAsync(DownloadSession session)
    {
        var download = session.Download;
        session.Cts.Token.ThrowIfCancellationRequested();

        string destDir = Path.GetDirectoryName(download.SavePath) ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!Directory.Exists(destDir))
        {
            Directory.CreateDirectory(destDir);
        }

        if (YouTubeMediaResolver.IsYouTubeUrl(download.SourcePageUrl) && MediaRepresentation.IsExpired(download.Url, DateTimeOffset.UtcNow))
        {
            var refreshed = await YouTubeMediaResolver.ResolveYouTubeFormatsAsync(download.SourcePageUrl!, forceRefresh: true);
            var representation = MediaRepresentation.SelectExact(refreshed.Formats, download.FormatId);
            if (representation?.DirectUrl == null) throw new MediaRecoveryException("The selected media format is unavailable. Select a format again from the original page.");
            download.Url = representation.DirectUrl;
            download.AudioUrl = representation.AudioUrl;
            download.VideoUrl = representation.DirectUrl;
        }
        download.Status = DownloadStatus.Active;
        await _repository.SaveDownloadAsync(download);
        session.Cts.Token.ThrowIfCancellationRequested();
        DownloadStatusChanged?.Invoke(download);

        string stagingDir = GetDownloadStagingDirectory(download.Id);
        string finalFileName = Path.GetFileName(download.SavePath);
        string stagingFilePath = Path.Combine(stagingDir, finalFileName);

        session.StagingDirectory = stagingDir;
        session.StagingFilePath = stagingFilePath;

        // Clear duplicate AudioUrl if caller passed identical URL for both video and audio
        if (!string.IsNullOrWhiteSpace(download.AudioUrl) && string.Equals(download.Url, download.AudioUrl, StringComparison.OrdinalIgnoreCase))
        {
            download.AudioUrl = null;
        }

        if (!string.IsNullOrEmpty(download.ManifestText))
        {
            var manifest = HlsManifestSnapshot.Normalize(download.ManifestText, download.Url);
            if (!manifest.Contains("#EXT-X-MAP:") && !manifest.Contains("#EXT-X-BYTERANGE:"))
            {
                await RunParallelHlsSessionAsync(session, manifest);
                return;
            }
            session.StagingDirectory = GetDownloadStagingDirectory(download.Id);
            Directory.CreateDirectory(session.StagingDirectory);
            var manifestPath = Path.Combine(session.StagingDirectory, "browser-playlist.m3u8");
            await File.WriteAllTextAsync(manifestPath, manifest, session.Cts.Token);
            await RunFfmpegSessionAsync(session, manifestPath);
            return;
        }

        // Transport type takes precedence over separate-track URLs. A playlist
        // must never enter the byte-range MP4 worker just because audio exists.
        if (download.MediaKind == "hls" || download.Url.Contains(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            await RunParallelHlsSessionAsync(session);
            return;
        }

        // 1. Dual-stream video+audio (DASH / YouTube 1080p, 720p, etc.) -> High-Speed 24-Stream Parallel Transfer
        if (!string.IsNullOrWhiteSpace(download.AudioUrl))
        {
            await RunDualStreamSessionAsync(session);
            return;
        }

        // 2. Audio-only MP3 conversion (YouTube audio, etc.) -> High-Speed Parallel Download + Local Conversion
        if (download.Category == "Audio" && download.SavePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) && !download.Url.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
        {
            await RunAudioConversionSessionAsync(session);
            return;
        }

        // 4. DASH .mpd stream tasks -> FFmpeg Stream Session
        if (download.MediaKind == "dash" || download.Url.Contains(".mpd", StringComparison.OrdinalIgnoreCase))
        {
            if (_speedLimitBytesPerSec > 0)
            {
                download.StatusDetail = "Direct FFmpeg stream (global speed limiter applies to segmented HTTP transfers)";
                download.Subline = "Direct Stream • Unthrottled";
            }
            await RunFfmpegSessionAsync(session);
            return;
        }

        // Determine segments
        int threadCount = Math.Clamp(download.ParallelThreads > 0 ? download.ParallelThreads : 16, 1, 32);
        long totalBytes = download.TotalBytes;

        // Check for cached segments in memory or from durable journal on disk
        _segmentCache.TryGetValue(download.Id, out var cachedSegs);
        if (download.SupportsRanges == false)
        {
            // A full-body GET cannot resume at an offset. Never reuse range
            // checkpoints after a probe has explicitly ruled out ranges.
            _segmentCache.TryRemove(download.Id, out _);
            cachedSegs = null;
            download.DownloadedBytes = 0;
            download.ProgressPercentage = 0;
        }
        else if (cachedSegs == null || cachedSegs.Count == 0)
        {
            var remoteProbe = File.Exists(GetSegmentJournalPath(session.StagingDirectory))
                ? await VerifyRemoteResumeIdentityAsync(download, session.Cts.Token)
                : (Matches: false, CurrentETag: (string?)null);
            cachedSegs = await Task.Run(() => LoadAndValidateJournal(
                session.StagingDirectory,
                download.Id,
                download.Url,
                download.TotalBytes,
                currentETag: download.ETag,
                currentLastModified: download.LastModified,
                stagingFilePath: session.StagingFilePath,
                allowCompletedReuse: remoteProbe.Matches), session.Cts.Token);

            // A changed strong validator invalidates every old checkpoint. Only
            // after that decision may fresh workers use the new representation.
            if (remoteProbe.CurrentETag != null) download.ETag = remoteProbe.CurrentETag;

            if (cachedSegs != null && cachedSegs.Count > 0)
            {
                _segmentCache[download.Id] = cachedSegs;
                long recovered = cachedSegs.Sum(s => s.DownloadedBytes);
                if (recovered > download.DownloadedBytes)
                {
                    download.DownloadedBytes = recovered;
                    if (download.TotalBytes > 0)
                    {
                        download.ProgressPercentage = Math.Clamp(((double)download.DownloadedBytes / download.TotalBytes) * 100.0, 0, 100);
                    }
                }
            }
        }

        string? referer = download.Referer;
        if (string.IsNullOrEmpty(referer) && (download.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || download.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = !string.IsNullOrEmpty(download.PageUrl) ? download.PageUrl : "https://www.pornhub.com/";
        }
        else if (!string.IsNullOrEmpty(download.PageUrl) && download.PageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
                 (string.IsNullOrEmpty(referer) || !referer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            referer = download.PageUrl;
        }

        string? cookieHeader = FormatCookieHeader(download.Cookies, download.Url);

        string? uaString = !string.IsNullOrWhiteSpace(download.UserAgent)
            ? download.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        if (totalBytes > 0 && download.SupportsRanges != false)
        {
            // Pre-allocate file size in isolated staging directory without truncating existing valid bytes
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

            if (cachedSegs != null && cachedSegs.Count > 0)
            {
                // Resume from exact segment partitions recorded in the durable journal
                for (int i = 0; i < cachedSegs.Count; i++)
                {
                    var seg = cachedSegs[i];
                    long initialDownloaded = Math.Clamp(seg.DownloadedBytes, 0, seg.EndByte >= 0 ? seg.EndByte - seg.StartByte + 1 : seg.DownloadedBytes);
                    var worker = new SegmentWorker(_httpClient, download.Url, session.StagingFilePath, seg.SegmentIndex, seg.StartByte, seg.EndByte, initialDownloaded, referer, uaString, cookieHeader, _speedLimiter, totalBytes, download.ETag);
                    worker.Progress.CheckpointSha256 = seg.CheckpointSha256;
                    session.Workers.Add(worker);
                }
            }
            else
            {
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
                    var worker = new SegmentWorker(_httpClient, download.Url, session.StagingFilePath, i + 1, start, end, 0, referer, uaString, cookieHeader, _speedLimiter, totalBytes, download.ETag);
                    session.Workers.Add(worker);
                    currentOffset = end + 1;
                }
            }
        }
        else
        {
            long initialDownloaded = (cachedSegs != null && cachedSegs.Count > 0) ? cachedSegs[0].DownloadedBytes : 0;
            var worker = new SegmentWorker(_httpClient, download.Url, session.StagingFilePath, 1, 0, -1, initialDownloaded, referer, uaString, cookieHeader, _speedLimiter, totalBytes, download.ETag);
            session.Workers.Add(worker);
        }

        session.Cts.Token.ThrowIfCancellationRequested();
        _segmentCache[download.Id] = session.Workers.Select(w => w.Progress).ToList();
        session.UsesSegmentJournal = true;
        SaveSegmentJournal(session.StagingDirectory, session.Download, session.Workers.Select(w => w.Progress));

        await RunSessionAsync(session);
    }

    public static bool VerifyHashConstantTime(string actualHash, string expectedHash)
    {
        if (string.IsNullOrWhiteSpace(actualHash) || string.IsNullOrWhiteSpace(expectedHash))
            return false;

        string a = actualHash.Trim().ToLowerInvariant();
        string e = expectedHash.Trim().ToLowerInvariant();

        if (a.Length != e.Length)
            return false;

        byte[] aBytes = System.Text.Encoding.UTF8.GetBytes(a);
        byte[] eBytes = System.Text.Encoding.UTF8.GetBytes(e);

        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(aBytes, eBytes);
    }

    public static bool PromoteStagedFile(DownloadModel dl, string stagingFilePath)
    {
        if (string.IsNullOrEmpty(stagingFilePath) || !File.Exists(stagingFilePath))
            return false;

        if (string.Equals(stagingFilePath, dl.SavePath, StringComparison.OrdinalIgnoreCase))
            return true;

        string? targetDir = Path.GetDirectoryName(dl.SavePath);
        if (!string.IsNullOrEmpty(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        if (File.Exists(dl.SavePath))
        {
            switch (dl.ConflictAction)
            {
                case DestinationConflictAction.Replace:
                    File.Move(stagingFilePath, dl.SavePath, overwrite: true);
                    return true;

                case DestinationConflictAction.Skip:
                    try { File.Delete(stagingFilePath); } catch { }
                    dl.StatusDetail = "File already exists at destination (skipped)";
                    dl.Subline = "Completed • Skipped (File Exists)";
                    return false;

                case DestinationConflictAction.Rename:
                case DestinationConflictAction.DefaultNeverOverwrite:
                default:
                    var catalogService = new FileCatalogService();
                    string uniquePath = catalogService.GenerateUniquePath(dl.SavePath);
                    dl.SavePath = uniquePath;
                    File.Move(stagingFilePath, uniquePath, overwrite: false);
                    return true;
            }
        }
        else
        {
            File.Move(stagingFilePath, dl.SavePath, overwrite: false);
            return true;
        }
    }

    public async Task<bool> FinalizeDownloadIntegrityAsync(DownloadModel dl, SafetyScanResult scanResult, string? stagingFilePath = null)
    {
        dl.Sha256Hash = scanResult.Sha256Hash;
        dl.SafetyVerdict = scanResult.Verdict;
        dl.AvScannerName = scanResult.ScannerName;
        dl.SafetyDetails = scanResult.ThreatDetails;

        if (scanResult.HasThreat || scanResult.IsQuarantined)
        {
            dl.Status = DownloadStatus.Quarantined;
            dl.StatusDetail = scanResult.ThreatDetails;
            dl.Subline = $"Threat Blocked • {scanResult.ScannerName}";
            if (!string.IsNullOrEmpty(stagingFilePath) && File.Exists(stagingFilePath))
            {
                string quarantineDirectory = Path.Combine(Path.GetDirectoryName(stagingFilePath)!, "quarantine");
                Directory.CreateDirectory(quarantineDirectory);
                string blocked = Path.Combine(quarantineDirectory, Guid.NewGuid().ToString("N") + ".blocked");
                File.Move(stagingFilePath, blocked);
                dl.QuarantinePath = blocked;
            }
            await _repository.SaveDownloadAsync(dl);
            DownloadCompleted?.Invoke(dl, scanResult);
            DownloadStatusChanged?.Invoke(dl);
            return false;
        }

        if (scanResult.Verdict == SafetyVerdict.ScanFailed)
        {
            dl.Status = DownloadStatus.Failed;
            dl.StatusDetail = "Safety scan failed; staged output retained. Retry when the scanner is available.";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            return false;
        }

        if (!string.IsNullOrWhiteSpace(dl.ExpectedSha256))
        {
            bool matches = VerifyHashConstantTime(dl.Sha256Hash, dl.ExpectedSha256);
            if (!matches)
            {
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                dl.StatusDetail = $"Integrity Failure: Expected SHA-256 '{dl.ExpectedSha256}' does not match computed '{dl.Sha256Hash}'";
                dl.Subline = "Failed • Checksum Mismatch";

                // Purge ONLY the unverified staged file.
                // NEVER touch, delete, or overwrite a pre-existing user destination file!
                if (!string.IsNullOrEmpty(stagingFilePath) && File.Exists(stagingFilePath))
                {
                    try { File.Delete(stagingFilePath); } catch { }
                }

                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
                return false;
            }

            // Successfully verified against expected checksum: safely promote to destination
            bool promoted = true;
            if (!string.IsNullOrEmpty(stagingFilePath) && File.Exists(stagingFilePath))
            {
                promoted = PromoteStagedFile(dl, stagingFilePath);
            }

            dl.Status = DownloadStatus.Completed;
            if (dl.ConflictAction == DestinationConflictAction.Skip && !promoted)
            {
                dl.StatusDetail = "File already exists at destination (skipped)";
                dl.Subline = "Completed • Skipped (File Exists)";
            }
            else
            {
                dl.StatusDetail = $"Expected SHA-256 matched • {scanResult.Verdict}";
                dl.Subline = "Completed • Checksum Verified";
            }
        }
        else
        {
            // Confirmed clean: safely promote to destination
            bool promoted = true;
            if (!string.IsNullOrEmpty(stagingFilePath) && File.Exists(stagingFilePath))
            {
                promoted = PromoteStagedFile(dl, stagingFilePath);
            }

            dl.Status = DownloadStatus.Completed;
            if (dl.ConflictAction == DestinationConflictAction.Skip && !promoted)
            {
                dl.StatusDetail = "File already exists at destination (skipped)";
                dl.Subline = "Completed • Skipped (File Exists)";
            }
            else
            {
                string shortHash = dl.Sha256Hash.Length >= 8 ? dl.Sha256Hash[..8] : dl.Sha256Hash;
                dl.StatusDetail = $"SHA-256 computed: {shortHash}... • {scanResult.Verdict}";
                dl.Subline = "Completed";
            }
        }

        await _repository.SaveDownloadAsync(dl);
        DownloadCompleted?.Invoke(dl, scanResult);
        DownloadStatusChanged?.Invoke(dl);
        return true;
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

            while (!monitorCts.Token.IsCancellationRequested && !token.IsCancellationRequested && dl.Status != DownloadStatus.Paused)
            {
                try
                {
                    await Task.Delay(500, monitorCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;

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
                    SaveSegmentJournal(session.StagingDirectory, session.Download, session.Workers.Select(w => w.Progress));

                    if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;
                    DownloadProgressChanged?.Invoke(dl);
                }
            }
        }, monitorCts.Token);

        try
        {
            await Task.WhenAll(workerTasks);
            await StopMonitorAsync(monitorCts, monitorTask);

            long totalDownloaded = session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool allWorkersCompleted = session.Workers.Count > 0 && session.Workers.All(w => w.Progress.IsCompleted && string.IsNullOrEmpty(w.LastError));
            bool byteCountValid = dl.TotalBytes > 0 ? totalDownloaded >= dl.TotalBytes : totalDownloaded > 0;
            bool transferSucceeded = allWorkersCompleted && byteCountValid;

            var mediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".ts", ".m4v", ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"
            };
            string destExt = Path.GetExtension(dl.SavePath);
            bool isMediaTarget = !string.IsNullOrEmpty(destExt) && mediaExts.Contains(destExt);

            if (!token.IsCancellationRequested && transferSucceeded)
            {
                if (isMediaTarget && totalDownloaded < 1024)
                {
                    dl.Status = DownloadStatus.Failed;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = $"Media stream invalid ({totalDownloaded} bytes received). The server returned an empty or invalid stream.";
                    dl.Subline = $"Failed • {dl.StatusDetail}";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                    CleanupStagingDirectory(session.StagingDirectory);
                    return;
                }

                // Run Safety & Hash Scan on staged file BEFORE touching destination
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 100.0;
                dl.DownloadedBytes = dl.TotalBytes > 0 ? dl.TotalBytes : totalDownloaded;
                dl.StatusDetail = "Verifying staged file integrity & computing SHA-256...";
                DownloadProgressChanged?.Invoke(dl);

                var scanResult = await _safetyScanner.ScanFileAsync(session.StagingFilePath, token);
                bool finalized = await FinalizeSessionIntegrityAsync(session, scanResult);

                // Clean up hidden staging directory only on successful finalization
                if (finalized && !string.IsNullOrEmpty(session.StagingDirectory))
                {
                    CleanupStagingDirectory(session.StagingDirectory);
                }
            }
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Segment error: {firstWorkerError}" : "Segment transfer failed or 0 bytes received";
                dl.Subline = $"Failed • {dl.StatusDetail}";
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
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            dl.Subline = $"Failed • {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        finally
        {
            await StopMonitorAsync(monitorCts, monitorTask, dispose: true);
        }
    }

    public static string? ResolveFfmpegPath()
    {
        string? configuredPath = Environment.GetEnvironmentVariable("FFMPEG_PATH");
        string? configuredHash = Environment.GetEnvironmentVariable("FFMPEG_SHA256");
        if (OperatingSystem.IsWindows())
        {
            configuredPath ??= Environment.GetEnvironmentVariable("FFMPEG_PATH", EnvironmentVariableTarget.User);
            configuredHash ??= Environment.GetEnvironmentVariable("FFMPEG_SHA256", EnvironmentVariableTarget.User);
        }
        return ResolveVerifiedFfmpegPath(configuredPath, configuredHash);
    }

    public static string? ResolveVerifiedFfmpegPath(string? configuredPath, string? expectedSha256)
    {
        if (string.IsNullOrWhiteSpace(configuredPath) || string.IsNullOrWhiteSpace(expectedSha256) ||
            !Path.IsPathFullyQualified(configuredPath) || expectedSha256.Length != 64)
            return null;

        try
        {
            string path = Path.GetFullPath(configuredPath);
            string expectedName = OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg";
            if (!string.Equals(Path.GetFileName(path), expectedName, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
                return null;

            byte[] expected = Convert.FromHexString(expectedSha256);
            using var stream = File.OpenRead(path);
            byte[] actual = System.Security.Cryptography.SHA256.HashData(stream);
            return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(actual, expected) ? path : null;
        }
        catch
        {
            return null;
        }
    }

    private async Task<long> ProbeStreamLengthAsync(string url, string? referer, string? uaString, string? cookieHeader, CancellationToken token)
    {
        try
        {
            using var req = HttpTransferRequest.Create(HttpMethod.Get, url);

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

    private async Task<SafetyScanResult> ScanMediaOutputAsync(DownloadSession session, CancellationToken token)
    {
        string? ffmpeg = ResolveFfmpegPath();
        bool audioOnly = session.Download.SavePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) || session.Download.Category == "Audio";
        bool pairedAudio = !string.IsNullOrEmpty(session.Download.AudioUrl) || !string.IsNullOrEmpty(session.Download.AudioManifestText);
        if (ffmpeg == null || !await new MediaOutputVerifier().VerifyAsync(ffmpeg, session.StagingFilePath, !audioOnly, audioOnly || pairedAudio, token))
            throw new InvalidDataException("The processed media is missing an expected audio or video track, or could not be decoded. Staged parts are retained.");
        return await _safetyScanner.ScanFileAsync(session.StagingFilePath, token);
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
            referer = !string.IsNullOrEmpty(dl.PageUrl) ? dl.PageUrl : "https://www.pornhub.com/";
        }
        else if (!string.IsNullOrEmpty(dl.PageUrl) && dl.PageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
                 (string.IsNullOrEmpty(referer) || !referer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            referer = dl.PageUrl;
        }

        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string? cookieHeader = FormatCookieHeader(dl.Cookies, dl.Url);

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
                fs.SetLength(videoSize);
            }
            await using (var fs = new FileStream(audioStagingPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
            {
                fs.SetLength(audioSize);
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

        string vPartsFile = videoStagingPath + ".parts";
        string aPartsFile = audioStagingPath + ".parts";
        File.Delete(aPartsFile);
        File.Delete(vPartsFile);

        var completedVideoChunks = new HashSet<long>();
        long initialVideoBytes = 0;
        if (File.Exists(vPartsFile))
        {
            try
            {
                foreach (var line in File.ReadAllLines(vPartsFile))
                {
                    var parts = line.Split(',');
                    if (parts.Length == 2 && long.TryParse(parts[0], out long s) && long.TryParse(parts[1], out long e))
                    {
                        if (completedVideoChunks.Add(s))
                        {
                            initialVideoBytes += (e - s + 1);
                        }
                    }
                }
            }
            catch { }
        }

        var completedAudioChunks = new HashSet<long>();
        long initialAudioBytes = 0;
        if (File.Exists(aPartsFile))
        {
            try
            {
                foreach (var line in File.ReadAllLines(aPartsFile))
                {
                    var parts = line.Split(',');
                    if (parts.Length == 2 && long.TryParse(parts[0], out long s) && long.TryParse(parts[1], out long e))
                    {
                        if (completedAudioChunks.Add(s))
                        {
                            initialAudioBytes += (e - s + 1);
                        }
                    }
                }
            }
            catch { }
        }

        // 1. Build Dynamic Chunk Queue for Video (1 MB to 3 MB chunks to prevent CDN throttle & eliminate stragglers)
        var videoQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long vSliceSize = Math.Clamp(videoSize / 48, 1048576, 3145728);
        long vOffset = 0;
        while (vOffset < videoSize)
        {
            long end = Math.Min(vOffset + vSliceSize - 1, videoSize - 1);
            if (!completedVideoChunks.Contains(vOffset))
            {
                videoQueue.Enqueue(new ChunkRange(vOffset, end));
            }
            vOffset = end + 1;
        }

        // 2. Build Dynamic Chunk Queue for Audio (512 KB to 2 MB chunks)
        var audioQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long aSliceSize = Math.Clamp(audioSize / 16, 524288, 2097152);
        long aOffset = 0;
        while (aOffset < audioSize)
        {
            long end = Math.Min(aOffset + aSliceSize - 1, audioSize - 1);
            if (!completedAudioChunks.Contains(aOffset))
            {
                audioQueue.Enqueue(new ChunkRange(aOffset, end));
            }
            aOffset = end + 1;
        }

        // 3. Create Video Workers
        long videoPerWorker = videoSize / videoThreads;
        for (int i = 0; i < videoThreads; i++)
        {
            long start = i * videoPerWorker;
            long end = (i == videoThreads - 1) ? videoSize - 1 : (i + 1) * videoPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.Url, videoStagingPath, i + 1, start, end, 0, referer, uaString, cookieHeader, _speedLimiter, videoSize);
            session.Workers.Add(worker);
        }

        // 4. Create Audio Workers
        long audioPerWorker = audioSize / audioThreads;
        for (int i = 0; i < audioThreads; i++)
        {
            long start = i * audioPerWorker;
            long end = (i == audioThreads - 1) ? audioSize - 1 : (i + 1) * audioPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.AudioUrl!, audioStagingPath, videoThreads + i + 1, start, end, 0, referer, uaString, cookieHeader, _speedLimiter, audioSize);
            session.Workers.Add(worker);
        }

        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        object vLock = new object();
        Action<ChunkRange> onVideoChunkCompleted = c =>
        {
            lock (vLock)
            {
                try { File.AppendAllText(vPartsFile, $"{c.StartByte},{c.EndByte}{Environment.NewLine}"); } catch { }
            }
        };

        object aLock = new object();
        Action<ChunkRange> onAudioChunkCompleted = c =>
        {
            lock (aLock)
            {
                try { File.AppendAllText(aPartsFile, $"{c.StartByte},{c.EndByte}{Environment.NewLine}"); } catch { }
            }
        };

        var workerTasks = new List<Task>();
        for (int i = 0; i < videoThreads; i++)
        {
            workerTasks.Add(session.Workers[i].ExecuteChunkQueueAsync(videoQueue, token, onVideoChunkCompleted));
        }
        for (int i = 0; i < audioThreads; i++)
        {
            workerTasks.Add(session.Workers[videoThreads + i].ExecuteChunkQueueAsync(audioQueue, token, onAudioChunkCompleted));
        }

        // Telemetry monitor loop with Exponential Moving Average (EMA) smoothing
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        long baseDownloaded = initialVideoBytes + initialAudioBytes;
        var monitorTask = Task.Run(async () =>
        {
            long lastDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested && !token.IsCancellationRequested && dl.Status != DownloadStatus.Paused)
            {
                try
                {
                    await Task.Delay(400, monitorCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;

                long currentDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
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

                    if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;
                    DownloadProgressChanged?.Invoke(dl);
                }
            }
        }, monitorCts.Token);

        try
        {
            await Task.WhenAll(workerTasks);
            await StopMonitorAsync(monitorCts, monitorTask);

            long totalDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = totalDownloaded >= dl.TotalBytes || (videoQueue.IsEmpty && audioQueue.IsEmpty);
            bool hasError = session.Workers.Any(w => !string.IsNullOrEmpty(w.LastError)) || (!videoQueue.IsEmpty && !token.IsCancellationRequested) || (!audioQueue.IsEmpty && !token.IsCancellationRequested);

            if (!token.IsCancellationRequested && hasBytes && !hasError)
            {
                dl.StatusDetail = "Muxing high-speed video & audio streams...";
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 99.0;
                dl.DownloadedBytes = dl.TotalBytes;
                dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Fast Local Mux";
                DownloadProgressChanged?.Invoke(dl);

                string? ffmpegPath = ResolveFfmpegPath();
                if (ffmpegPath == null)
                {
                    dl.Status = DownloadStatus.Failed;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = "FFmpeg is unavailable or its checksum changed. Configure FFMPEG_PATH and FFMPEG_SHA256.";
                    dl.Subline = "Failed • FFmpeg Not Configured";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                    return;
                }
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
                await using var processLifetime = new SessionProcessLifetime(proc);

                using var reg = token.Register(() =>
                {
                    try { if (!proc.HasExited) proc.Kill(true); } catch { }
                });

                StartSessionProcess(session, proc);
                var stderrTask = ProcessOutput.ReadTailAsync(proc.StandardError, token);
                await proc.WaitForExitAsync(token);
                string stderr = await stderrTask;

                bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length > 0;
                if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
                {
                    var fi = new FileInfo(session.StagingFilePath);
                    dl.TotalBytes = fi.Length;
                    dl.DownloadedBytes = fi.Length;
                    dl.SpeedMbps = 0;
                    dl.ProgressPercentage = 100.0;
                    dl.StatusDetail = "Verifying muxed media & computing SHA-256...";
                    DownloadProgressChanged?.Invoke(dl);

                    var scanResult = await ScanMediaOutputAsync(session, token);
                    bool finalized = await FinalizeSessionIntegrityAsync(session, scanResult);
                    if (finalized && !string.IsNullOrEmpty(session.StagingDirectory))
                    {
                        CleanupStagingDirectory(session.StagingDirectory);
                    }
                }
                else
                {
                    dl.Status = DownloadStatus.Failed;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = proc.ExitCode != 0 ? $"Muxing failed (FFmpeg exit code {proc.ExitCode})" : "Muxing interrupted";
                    dl.Subline = $"Failed • {dl.StatusDetail}";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
            }
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Stream error: {firstWorkerError}" : "Transfer failed or stream interrupted";
                dl.Subline = $"Failed • {dl.StatusDetail}";
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
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            dl.Subline = $"Failed • {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            await StopMonitorAsync(monitorCts, monitorTask, dispose: true);
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

        string? cookieHeader = FormatCookieHeader(dl.Cookies, dl.Url);

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
                fs.SetLength(audioSize);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Pre-allocate audio error: {ex.Message}");
        }

        session.Workers.Clear();
        int threadCount = Math.Min(16, Math.Max(1, (int)(audioSize / (128 * 1024))));
        dl.ParallelThreads = threadCount;

        string aPartsFile = audioStagingPath + ".parts";
        File.Delete(aPartsFile);

        var completedAudioChunks = new HashSet<long>();
        long initialAudioBytes = 0;
        if (File.Exists(aPartsFile))
        {
            try
            {
                foreach (var line in File.ReadAllLines(aPartsFile))
                {
                    var parts = line.Split(',');
                    if (parts.Length == 2 && long.TryParse(parts[0], out long s) && long.TryParse(parts[1], out long e))
                    {
                        if (completedAudioChunks.Add(s))
                        {
                            initialAudioBytes += (e - s + 1);
                        }
                    }
                }
            }
            catch { }
        }

        // Build Dynamic Chunk Queue for Audio (512 KB to 2 MB chunks)
        var audioQueue = new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>();
        long aSliceSize = Math.Clamp(audioSize / 32, 524288, 2097152);
        long aOffset = 0;
        while (aOffset < audioSize)
        {
            long end = Math.Min(aOffset + aSliceSize - 1, audioSize - 1);
            if (!completedAudioChunks.Contains(aOffset))
            {
                audioQueue.Enqueue(new ChunkRange(aOffset, end));
            }
            aOffset = end + 1;
        }

        long audioPerWorker = audioSize / threadCount;
        for (int i = 0; i < threadCount; i++)
        {
            long start = i * audioPerWorker;
            long end = (i == threadCount - 1) ? audioSize - 1 : (i + 1) * audioPerWorker - 1;
            var worker = new SegmentWorker(_httpClient, dl.Url, audioStagingPath, i + 1, start, end, 0, referer, uaString, cookieHeader, _speedLimiter, probedSize);
            session.Workers.Add(worker);
        }

        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        object aLock = new object();
        Action<ChunkRange> onAudioChunkCompleted = c =>
        {
            lock (aLock)
            {
                try { File.AppendAllText(aPartsFile, $"{c.StartByte},{c.EndByte}{Environment.NewLine}"); } catch { }
            }
        };

        var workerTasks = session.Workers.Select(w => w.ExecuteChunkQueueAsync(audioQueue, token, onAudioChunkCompleted)).ToList();

        // Telemetry monitor loop with Exponential Moving Average (EMA) smoothing
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        long baseDownloaded = initialAudioBytes;
        var monitorTask = Task.Run(async () =>
        {
            long lastDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested && !token.IsCancellationRequested && dl.Status != DownloadStatus.Paused)
            {
                try
                {
                    await Task.Delay(400, monitorCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;

                long currentDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
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

                    if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;
                    DownloadProgressChanged?.Invoke(dl);
                }
            }
        }, monitorCts.Token);

        try
        {
            await Task.WhenAll(workerTasks);
            await StopMonitorAsync(monitorCts, monitorTask);

            long totalDownloaded = baseDownloaded + session.Workers.Sum(w => w.Progress.DownloadedBytes);
            bool hasBytes = totalDownloaded >= dl.TotalBytes || audioQueue.IsEmpty;
            bool hasError = session.Workers.Any(w => !string.IsNullOrEmpty(w.LastError)) || (!audioQueue.IsEmpty && !token.IsCancellationRequested);

            if (!token.IsCancellationRequested && hasBytes && !hasError)
            {
                dl.StatusDetail = "Converting audio to MP3...";
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 99.0;
                dl.DownloadedBytes = dl.TotalBytes;
                dl.Subline = $"{MediaFormatItem.FormatBytes(dl.TotalBytes)} • Fast Local Conversion";
                DownloadProgressChanged?.Invoke(dl);

                string? ffmpegPath = ResolveFfmpegPath();
                if (ffmpegPath == null)
                {
                    dl.Status = DownloadStatus.Failed;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = "FFmpeg is unavailable or its checksum changed. Configure FFMPEG_PATH and FFMPEG_SHA256.";
                    dl.Subline = "Failed • FFmpeg Not Configured";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                    return;
                }
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
                await using var processLifetime = new SessionProcessLifetime(proc);

                using var reg = token.Register(() =>
                {
                    try { if (!proc.HasExited) proc.Kill(true); } catch { }
                });

                StartSessionProcess(session, proc);
                var stderrTask = ProcessOutput.ReadTailAsync(proc.StandardError, token);
                await proc.WaitForExitAsync(token);
                string stderr = await stderrTask;

                bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length > 0;
                if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
                {
                    var fi = new FileInfo(session.StagingFilePath);
                    dl.TotalBytes = fi.Length;
                    dl.DownloadedBytes = fi.Length;
                    dl.SpeedMbps = 0;
                    dl.ProgressPercentage = 100.0;
                    dl.StatusDetail = "Verifying converted audio & computing SHA-256...";
                    DownloadProgressChanged?.Invoke(dl);

                    var scanResult = await ScanMediaOutputAsync(session, token);
                    bool finalized = await FinalizeSessionIntegrityAsync(session, scanResult);
                    if (finalized && !string.IsNullOrEmpty(session.StagingDirectory))
                    {
                        CleanupStagingDirectory(session.StagingDirectory);
                    }
                }
                else
                {
                    dl.Status = DownloadStatus.Failed;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = proc.ExitCode != 0 ? $"Audio conversion failed (FFmpeg exit code {proc.ExitCode})" : "Audio conversion interrupted";
                    dl.Subline = $"Failed • {dl.StatusDetail}";
                    await _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
            }
            else if (!token.IsCancellationRequested)
            {
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                string? firstWorkerError = session.Workers.FirstOrDefault(w => !string.IsNullOrEmpty(w.LastError))?.LastError;
                dl.StatusDetail = !string.IsNullOrEmpty(firstWorkerError) ? $"Stream error: {firstWorkerError}" : "Transfer failed or partial bytes received";
                dl.Subline = $"Failed • {dl.StatusDetail}";
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
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            dl.Subline = $"Failed • {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            await StopMonitorAsync(monitorCts, monitorTask, dispose: true);
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    private class HlsPlaylistInfo
    {
        public bool IsEncrypted { get; set; }
        public List<string> SegmentUrls { get; set; } = new();
        public List<HlsSegmentEncryption?> SegmentEncryption { get; set; } = new();
        public int HttpStatusCode { get; set; } = 200;
        public string? ErrorMessage { get; set; }
        public string? EffectiveReferer { get; set; }
    }

    private static string GetHttpErrorMessage(int statusCode, string? reasonPhrase = null)
    {
        return statusCode switch
        {
            410 => "Stream link expired (HTTP 410 Gone). Please refresh the video page in your browser for a fresh link.",
            403 => "Access denied (HTTP 403 Forbidden). CDN token expired or signature invalid. Please refresh the page in browser.",
            404 => "Stream not found (HTTP 404). File is no longer available on the server.",
            401 => "Authentication required (HTTP 401 Unauthorized).",
            _ => $"Server returned HTTP {statusCode} ({reasonPhrase ?? "Error"})"
        };
    }

    public static string CombineHlsUri(string baseUrl, string relativeOrAbsoluteUri)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsoluteUri)) return baseUrl;

        Uri baseUri;
        try
        {
            baseUri = new Uri(baseUrl);
        }
        catch
        {
            return relativeOrAbsoluteUri;
        }

        Uri targetUri;
        if (!Uri.TryCreate(relativeOrAbsoluteUri, UriKind.Absolute, out var absUri))
        {
            targetUri = new Uri(baseUri, relativeOrAbsoluteUri);
        }
        else
        {
            targetUri = absUri;
        }

        string baseQuery = baseUri.Query.TrimStart('?');
        string targetQuery = targetUri.Query.TrimStart('?');

        if (string.IsNullOrEmpty(baseQuery))
        {
            return targetUri.ToString();
        }

        if (string.IsNullOrEmpty(targetQuery))
        {
            var builder = new UriBuilder(targetUri) { Query = baseQuery };
            return builder.Uri.ToString();
        }

        // Merge query parameters so security tokens and signatures from baseUri are preserved
        var paramMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in baseQuery.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string k = eq >= 0 ? pair[..eq] : pair;
            string v = eq >= 0 ? pair[(eq + 1)..] : "";
            paramMap[k] = v;
        }
        foreach (var pair in targetQuery.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string k = eq >= 0 ? pair[..eq] : pair;
            string v = eq >= 0 ? pair[(eq + 1)..] : "";
            paramMap[k] = v;
        }

        string mergedQuery = string.Join("&", paramMap.Select(kv => string.IsNullOrEmpty(kv.Value) ? kv.Key : $"{kv.Key}={kv.Value}"));
        var finalBuilder = new UriBuilder(targetUri) { Query = mergedQuery };
        return finalBuilder.Uri.ToString();
    }

    public static List<string> GetCandidateReferers(string targetUrl, string? primaryReferer, string? pageUrl = null)
    {
        var list = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? r)
        {
            if (string.IsNullOrWhiteSpace(r)) return;
            string trimmed = r.Trim();
            if (!seen.Contains(trimmed))
            {
                seen.Add(trimmed);
                list.Add(trimmed);
            }
        }

        // 0. Prioritize specific watch page permalink (e.g. viewkey=...) over generic category/listing referer
        bool isPornhubTarget = targetUrl.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) ||
                               targetUrl.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase);
        if (isPornhubTarget && !string.IsNullOrEmpty(pageUrl) && pageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrEmpty(primaryReferer) || !primaryReferer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            Add(pageUrl);
        }

        // 1. Primary authentic referer as supplied
        Add(primaryReferer);

        // 2. Origin of primary referer (e.g. https://embed-host.com/)
        if (!string.IsNullOrEmpty(primaryReferer))
        {
            try
            {
                var uri = new Uri(primaryReferer);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
            }
            catch { }
        }

        // 3. Page / Video URL if distinct
        Add(pageUrl);
        if (!string.IsNullOrEmpty(pageUrl))
        {
            try
            {
                var uri = new Uri(pageUrl);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
            }
            catch { }
        }

        void AddHostAndRoot(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return;
            try
            {
                var uri = new Uri(url);
                Add(uri.GetLeftPart(UriPartial.Authority) + "/");
                Add(uri.GetLeftPart(UriPartial.Authority));
                string host = uri.Host;
                var parts = host.Split('.');
                if (parts.Length > 2)
                {
                    string rootDomain = string.Join(".", parts.Skip(parts.Length - 2));
                    Add($"{uri.Scheme}://{rootDomain}/");
                    Add($"{uri.Scheme}://{rootDomain}");
                }
            }
            catch { }
        }

        // 4. Target stream's own host origin and root domain origin (e.g. https://owocdn.top/, https://flixcloud.cc/)
        AddHostAndRoot(targetUrl);
        AddHostAndRoot(primaryReferer);
        AddHostAndRoot(pageUrl);

        // 4b. Known embed hosts and anime video streaming providers
        Add("https://megacloud.tv/");
        Add("https://rapid-cloud.ru/");
        Add("https://rabbitstream.net/");
        Add("https://megaplay.buzz/");
        Add("https://gogoanime.com.by/");
        Add("https://streamtape.com/");
        Add("https://aniwave.gr/");
        Add("https://hianime.to/");

        // 5. Blank / empty (no referer / anti-hotlink bypass)
        if (!seen.Contains(""))
        {
            list.Add("");
        }

        return list;
    }

    public static string? FormatCookieHeader(string? cookieData, string? targetUrl)
    {
        if (string.IsNullOrWhiteSpace(cookieData)) return null;

        if (!cookieData.Contains("\t"))
        {
            return cookieData.Trim();
        }

        string? targetHost = null;
        if (!string.IsNullOrWhiteSpace(targetUrl) && Uri.TryCreate(targetUrl, UriKind.Absolute, out var uri))
        {
            targetHost = uri.Host.ToLowerInvariant().Replace("www.", "");
        }

        var matchedPairs = new List<string>();
        var allPairs = new List<string>();
        var lines = cookieData.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

        foreach (var l in lines)
        {
            if (l.StartsWith("#") || string.IsNullOrWhiteSpace(l)) continue;
            var parts = l.Split('\t');
            if (parts.Length >= 7)
            {
                string cookieDomain = parts[0].TrimStart('.').ToLowerInvariant().Replace("www.", "");
                string pair = $"{parts[5]}={parts[6]}";
                allPairs.Add(pair);

                if (targetHost != null)
                {
                    if (targetHost == cookieDomain || targetHost.EndsWith("." + cookieDomain))
                    {
                        matchedPairs.Add(pair);
                    }
                }
            }
        }

        if (matchedPairs.Count > 0)
        {
            return string.Join("; ", matchedPairs);
        }

        return null;
    }

    private static async Task<string> ReadManifestAsync(HttpContent content, CancellationToken token)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        await using var stream = await content.ReadAsStreamAsync(budget.Token);
        using var data = new MemoryStream();
        byte[] buffer = new byte[8192]; int read;
        while ((read = await stream.ReadAsync(buffer, budget.Token)) > 0)
        {
            if (data.Length + read > 500_000) throw new InvalidDataException("The media playlist exceeds the supported size.");
            await data.WriteAsync(buffer.AsMemory(0, read), budget.Token);
        }
        return System.Text.Encoding.UTF8.GetString(data.ToArray());
    }

    private async Task<HlsPlaylistInfo?> ParseHlsPlaylistAsync(
        string playlistUrl,
        string? referer,
        string? userAgent,
        string? cookies,
        CancellationToken token,
        string? pageUrl = null,
        string? capturedPlaylist = null)
    {
        var info = new HlsPlaylistInfo { EffectiveReferer = referer };
        try
        {
            HttpResponseMessage? resp = capturedPlaylist == null ? null : new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            { Content = new StringContent(capturedPlaylist), RequestMessage = HttpTransferRequest.Create(HttpMethod.Get, playlistUrl) };
            string effectiveWorkingReferer = referer ?? "";

            var candidateReferers = GetCandidateReferers(playlistUrl, referer, pageUrl);
            foreach (var candRef in capturedPlaylist == null ? candidateReferers : new List<string>())
            {
                using var req = HttpTransferRequest.Create(HttpMethod.Get, playlistUrl);

                if (!string.IsNullOrEmpty(candRef))
                {
                    req.Headers.TryAddWithoutValidation("Referer", candRef);
                    try { req.Headers.TryAddWithoutValidation("Origin", new Uri(candRef).GetLeftPart(UriPartial.Authority)); } catch { }
                }
                if (!string.IsNullOrEmpty(userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", userAgent);
                if (!string.IsNullOrEmpty(cookies)) req.Headers.TryAddWithoutValidation("Cookie", cookies);
                req.Headers.TryAddWithoutValidation("Accept", "*/*");

                var candidateResp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, token);
                if (candidateResp.IsSuccessStatusCode)
                {
                    resp = candidateResp;
                    effectiveWorkingReferer = candRef;
                    info.EffectiveReferer = candRef;
                    break;
                }
                else if (candidateResp.StatusCode == System.Net.HttpStatusCode.Forbidden || candidateResp.StatusCode == System.Net.HttpStatusCode.Unauthorized || candidateResp.StatusCode == System.Net.HttpStatusCode.Gone)
                {
                    candidateResp.Dispose();
                    continue; // Try next candidate referer
                }
                else
                {
                    resp = candidateResp;
                    break;
                }
            }

            if (resp == null)
            {
                info.HttpStatusCode = 403;
                info.ErrorMessage = GetHttpErrorMessage(403, "Forbidden");
                return info;
            }

            using (resp)
            {
                if (!resp.IsSuccessStatusCode)
                {
                    int code = (int)resp.StatusCode;
                    info.HttpStatusCode = code;
                    info.ErrorMessage = GetHttpErrorMessage(code, resp.ReasonPhrase);
                    return info;
                }

                string content = await ReadManifestAsync(resp.Content, token);
                if (string.IsNullOrWhiteSpace(content) || !content.Contains("#EXTM3U"))
                {
                    info.ErrorMessage = "Invalid stream manifest: response is not a valid HLS playlist";
                    return info;
                }

                string currentBaseUrl = resp.RequestMessage?.RequestUri?.ToString() ?? playlistUrl;

                // If it's a master playlist with variant streams (#EXT-X-STREAM-INF), pick highest bandwidth stream
                if (content.Contains("#EXT-X-STREAM-INF"))
                {
                    var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    long maxBandwidth = -1;
                    string? bestStreamUri = null;

                    for (int i = 0; i < lines.Length; i++)
                    {
                        var line = lines[i].Trim();
                        if (line.StartsWith("#EXT-X-STREAM-INF", StringComparison.OrdinalIgnoreCase))
                        {
                            long bw = 0;
                            var bwMatch = Regex.Match(line, @"BANDWIDTH=(\d+)", RegexOptions.IgnoreCase);
                            if (bwMatch.Success) long.TryParse(bwMatch.Groups[1].Value, out bw);

                            if (i + 1 < lines.Length && !lines[i + 1].StartsWith("#"))
                            {
                                string streamUri = lines[i + 1].Trim();
                                if (bw > maxBandwidth || bestStreamUri == null)
                                {
                                    maxBandwidth = bw;
                                    bestStreamUri = streamUri;
                                }
                            }
                        }
                    }

                    if (!string.IsNullOrEmpty(bestStreamUri))
                    {
                        currentBaseUrl = CombineHlsUri(currentBaseUrl, bestStreamUri);
                        HttpResponseMessage? mediaResp = null;
                        var varCandidates = GetCandidateReferers(currentBaseUrl, effectiveWorkingReferer, pageUrl);

                        foreach (var candRef in varCandidates)
                        {
                            using var mediaReq = HttpTransferRequest.Create(HttpMethod.Get, currentBaseUrl);

                            if (!string.IsNullOrEmpty(candRef))
                            {
                                mediaReq.Headers.TryAddWithoutValidation("Referer", candRef);
                                try { mediaReq.Headers.TryAddWithoutValidation("Origin", new Uri(candRef).GetLeftPart(UriPartial.Authority)); } catch { }
                            }
                            if (!string.IsNullOrEmpty(userAgent)) mediaReq.Headers.TryAddWithoutValidation("User-Agent", userAgent);
                            if (!string.IsNullOrEmpty(cookies)) mediaReq.Headers.TryAddWithoutValidation("Cookie", cookies);
                            mediaReq.Headers.TryAddWithoutValidation("Accept", "*/*");

                            var cResp = await _httpClient.SendAsync(mediaReq, HttpCompletionOption.ResponseHeadersRead, token);
                            if (cResp.IsSuccessStatusCode)
                            {
                                mediaResp = cResp;
                                effectiveWorkingReferer = candRef;
                                info.EffectiveReferer = candRef;
                                break;
                            }
                            else if (cResp.StatusCode == System.Net.HttpStatusCode.Forbidden || cResp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                            {
                                cResp.Dispose();
                                continue;
                            }
                            else
                            {
                                mediaResp = cResp;
                                break;
                            }
                        }

                        if (mediaResp == null)
                        {
                            info.HttpStatusCode = 403;
                            info.ErrorMessage = GetHttpErrorMessage(403, "Forbidden");
                            return info;
                        }

                        using (mediaResp)
                        {
                            if (!mediaResp.IsSuccessStatusCode)
                            {
                                int code = (int)mediaResp.StatusCode;
                                info.HttpStatusCode = code;
                                info.ErrorMessage = GetHttpErrorMessage(code, mediaResp.ReasonPhrase);
                                return info;
                            }
                            content = await ReadManifestAsync(mediaResp.Content, token);
                            string newBase = mediaResp.RequestMessage?.RequestUri?.ToString() ?? currentBaseUrl;
                            currentBaseUrl = CombineHlsUri(currentBaseUrl, newBase);
                        }
                    }
                }

                content = HlsManifestSnapshot.Normalize(content, currentBaseUrl);
                // Byte-range/fMP4 layouts still require a demuxer. Identity
                // AES-128 TS segments use the native bounded transfer workers.
                if (content.Contains("#EXT-X-BYTERANGE") ||
                    content.Contains("#EXT-X-MAP"))
                {
                    info.IsEncrypted = true;
                    return info;
                }

                // Check for separate audio streams (#EXT-X-MEDIA:TYPE=AUDIO with URI) -> require FFmpeg native demuxing
                if (Regex.IsMatch(content, @"#EXT-X-MEDIA:TYPE=AUDIO.*?URI=""([^""]+)""", RegexOptions.IgnoreCase))
                {
                    info.IsEncrypted = true;
                    return info;
                }

                // Parse media segments
                foreach (var segment in HlsAes128.ParseSegments(content, currentBaseUrl))
                {
                    info.SegmentUrls.Add(segment.Url);
                    info.SegmentEncryption.Add(segment.Encryption);
                }

                return info;
            }
        }
        catch (OperationCanceledException)
        {
            return null;
        }
        catch (InvalidDataException) { throw; }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] ParseHlsPlaylistAsync error: {ex.Message}");
            info.ErrorMessage = $"Network error while contacting stream host: {ex.Message}";
            return info;
        }
    }

    private async Task RunParallelHlsSessionAsync(DownloadSession session, string? capturedPlaylist = null)
    {
        var dl = session.Download;
        var token = session.Cts.Token;

        // Force extension to .mp4 if it's .m3u8 so assembled output file is a playable MP4 container
        if (dl.SavePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            dl.SavePath = Path.ChangeExtension(dl.SavePath, ".mp4");
            dl.Title = Path.GetFileName(dl.SavePath);
        }

        // Ensure staging directory and chunk staging folder are configured
        if (string.IsNullOrEmpty(session.StagingDirectory))
        {
            session.StagingDirectory = GetDownloadStagingDirectory(dl.Id);
        }
        session.StagingFilePath = Path.Combine(session.StagingDirectory, Path.GetFileName(dl.SavePath));
        string chunksDir = Path.Combine(session.StagingDirectory, "chunks");
        Directory.CreateDirectory(chunksDir);

        string referer = dl.Referer ?? "";
        if (string.IsNullOrEmpty(referer) && (dl.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || dl.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = !string.IsNullOrEmpty(dl.PageUrl) ? dl.PageUrl : "https://www.pornhub.com/";
        }
        else if (!string.IsNullOrEmpty(dl.PageUrl) && dl.PageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
                 (string.IsNullOrEmpty(referer) || !referer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            referer = dl.PageUrl;
        }

        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string? cookieHeader = FormatCookieHeader(dl.Cookies, dl.Url);

        dl.StatusDetail = "Resolving stream segments...";
        dl.Status = DownloadStatus.Active;
        DownloadProgressChanged?.Invoke(dl);

        var playlistInfo = await ParseHlsPlaylistAsync(dl.Url, referer, uaString, cookieHeader, token, dl.PageUrl, capturedPlaylist);
        if (playlistInfo == null && token.IsCancellationRequested)
        {
            return;
        }

        if (playlistInfo == null || !string.IsNullOrEmpty(playlistInfo.ErrorMessage))
        {
            Debug.WriteLine($"[DownloadEngine] ParseHlsPlaylistAsync could not parse playlist ({playlistInfo?.ErrorMessage}), delegating to FFmpeg native pipeline.");
            await RunFfmpegSessionAsync(session);
            return;
        }

        if (playlistInfo.EffectiveReferer != null)
        {
            referer = playlistInfo.EffectiveReferer;
            dl.Referer = playlistInfo.EffectiveReferer;
            session.Download.Referer = playlistInfo.EffectiveReferer;
        }

        if (playlistInfo.IsEncrypted || playlistInfo.SegmentUrls.Count == 0)
        {
            Debug.WriteLine("[DownloadEngine] HLS stream requires FFmpeg native handling, delegating to FFmpeg.");
            await RunFfmpegSessionAsync(session);
            return;
        }

        var segmentUrls = playlistInfo.SegmentUrls.ToList();
        var segmentEncryption = playlistInfo.SegmentEncryption.ToList();
        int videoSegmentCount = segmentUrls.Count;
        bool pairedAudio = !string.IsNullOrEmpty(dl.AudioManifestText) || !string.IsNullOrEmpty(dl.AudioUrl);
        if (pairedAudio)
        {
            if (string.IsNullOrEmpty(dl.AudioUrl)) throw new InvalidDataException("The audio playlist address is missing.");
            string? audioText = dl.AudioManifestText == null ? null : HlsManifestSnapshot.Normalize(dl.AudioManifestText, dl.AudioUrl);
            var audioInfo = await ParseHlsPlaylistAsync(dl.AudioUrl, referer, uaString, cookieHeader, token, dl.PageUrl, audioText);
            if (audioInfo == null || audioInfo.IsEncrypted || audioInfo.SegmentUrls.Count == 0 || !string.IsNullOrEmpty(audioInfo.ErrorMessage))
                throw new InvalidDataException("The captured audio playlist cannot be downloaded as a clear segmented stream.");
            segmentUrls.AddRange(audioInfo.SegmentUrls);
            segmentEncryption.AddRange(audioInfo.SegmentEncryption);
        }
        int totalSegments = segmentUrls.Count;
        int threadCount = Math.Clamp(dl.ParallelThreads > 0 ? dl.ParallelThreads : 8, 1, 10);
        threadCount = Math.Min(threadCount, totalSegments);
        dl.ParallelThreads = threadCount;

        // Adaptively test candidate referers on segment CDN host (anti-hotlink bypass)
        bool segmentAccessible = false;
        if (segmentUrls.Count > 0)
        {
            var segCandidates = GetCandidateReferers(segmentUrls[0], referer, dl.PageUrl);
            foreach (var cand in segCandidates)
            {
                try
                {
                    using var testReq = HttpTransferRequest.Create(HttpMethod.Get, segmentUrls[0]);

                    if (!string.IsNullOrEmpty(cand))
                    {
                        testReq.Headers.TryAddWithoutValidation("Referer", cand);
                        try { testReq.Headers.TryAddWithoutValidation("Origin", new Uri(cand).GetLeftPart(UriPartial.Authority)); } catch { }
                    }
                    if (!string.IsNullOrEmpty(uaString)) testReq.Headers.TryAddWithoutValidation("User-Agent", uaString);
                    if (!string.IsNullOrEmpty(cookieHeader)) testReq.Headers.TryAddWithoutValidation("Cookie", cookieHeader);
                    testReq.Headers.TryAddWithoutValidation("Accept", "*/*");
                    using var testCts = new CancellationTokenSource(3500);
                    using var testResp = await _httpClient.SendAsync(testReq, HttpCompletionOption.ResponseHeadersRead, testCts.Token);
                    if (testResp.IsSuccessStatusCode)
                    {
                        segmentAccessible = true;
                        referer = cand;
                        dl.Referer = cand;
                        session.Download.Referer = cand;
                        break;
                    }
                }
                catch
                {
                    // Continue trying next candidate
                }
            }
        }

        // If primary segment CDN is blocked (e.g. Cloudflare 403 / banned CDN host), probe alternate stream variants
        if (!segmentAccessible && segmentUrls.Count > 0)
        {
            if (capturedPlaylist != null) throw new InvalidDataException("The captured stream is no longer accessible. Play the video and capture it again.");
            Debug.WriteLine($"[DownloadEngine] Primary segment CDN for {dl.Url} is blocked or unreachable. Probing alternate stream variants...");
            dl.StatusDetail = "Checking alternate stream qualities...";
            DownloadProgressChanged?.Invoke(dl);

            var hlsDiscovery = await HlsMediaResolver.ResolveHlsFormatsAsync(dl.Url, referer, uaString, cookieHeader, token);
            if (hlsDiscovery.Success && hlsDiscovery.Formats.Count > 0)
            {
                foreach (var variant in hlsDiscovery.Formats)
                {
                    if (token.IsCancellationRequested) break;
                    if (string.Equals(variant.DirectUrl, dl.Url, StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.IsNullOrEmpty(variant.DirectUrl)) continue;

                    var candidateInfo = await ParseHlsPlaylistAsync(variant.DirectUrl, referer, uaString, cookieHeader, token, dl.PageUrl);
                    if (candidateInfo != null && candidateInfo.SegmentUrls.Count > 0)
                    {
                        var candSegCandidates = GetCandidateReferers(candidateInfo.SegmentUrls[0], referer, dl.PageUrl);
                        foreach (var cCand in candSegCandidates)
                        {
                            try
                            {
                                using var cReq = HttpTransferRequest.Create(HttpMethod.Get, candidateInfo.SegmentUrls[0]);

                                if (!string.IsNullOrEmpty(cCand))
                                {
                                    cReq.Headers.TryAddWithoutValidation("Referer", cCand);
                                    try { cReq.Headers.TryAddWithoutValidation("Origin", new Uri(cCand).GetLeftPart(UriPartial.Authority)); } catch { }
                                }
                                if (!string.IsNullOrEmpty(uaString)) cReq.Headers.TryAddWithoutValidation("User-Agent", uaString);
                                if (!string.IsNullOrEmpty(cookieHeader)) cReq.Headers.TryAddWithoutValidation("Cookie", cookieHeader);
                                cReq.Headers.TryAddWithoutValidation("Accept", "*/*");
                                using var cCts = new CancellationTokenSource(3000);
                                using var cResp = await _httpClient.SendAsync(cReq, HttpCompletionOption.ResponseHeadersRead, cCts.Token);
                                if (cResp.IsSuccessStatusCode)
                                {
                                    Debug.WriteLine($"[DownloadEngine] Auto-failover: switched from blocked stream to working variant ({variant.Resolution}) -> {variant.DirectUrl}");
                                    dl.Url = variant.DirectUrl;
                                    session.Download.Url = variant.DirectUrl;
                                    playlistInfo = candidateInfo;
                                    segmentUrls = candidateInfo.SegmentUrls;
                                    segmentEncryption = candidateInfo.SegmentEncryption;
                                    totalSegments = segmentUrls.Count;
                                    segmentAccessible = true;
                                    referer = cCand;
                                    dl.Referer = cCand;
                                    session.Download.Referer = cCand;
                                    dl.StatusDetail = $"Switched to available {variant.Resolution} stream";
                                    DownloadProgressChanged?.Invoke(dl);
                                    break;
                                }
                            }
                            catch { }
                        }
                        if (segmentAccessible) break;
                    }
                }
            }
        }

        // If direct parallel segments probe was unverified or blocked, delegate cleanly to native FFmpeg engine with authentic credentials
        if (!segmentAccessible && segmentUrls.Count > 0)
        {
            if (capturedPlaylist != null) throw new InvalidDataException("The captured stream is no longer accessible. Play the video and capture it again.");
            Debug.WriteLine("[DownloadEngine] Direct segment probe was blocked or unverified. Delegating to native FFmpeg engine with full headers...");
            dl.StatusDetail = "Delegating to stream processor with authentic credentials...";
            DownloadProgressChanged?.Invoke(dl);
            session.Workers.Clear();
            await RunFfmpegSessionAsync(session);
            return;
        }

        var segmentQueue = new System.Collections.Concurrent.ConcurrentQueue<HlsSegmentTask>();
        var allTasks = new List<HlsSegmentTask>(totalSegments);
        long baseDownloadedBytes = 0;
        int completedChunksCount = 0;

        string playlistIdentity = MediaCheckpoint.Fingerprint(dl.SourcePageUrl + dl.FormatId + string.Join("\n", segmentUrls) +
            string.Join("\n", segmentEncryption.Select(e => e == null ? "clear" : e.KeyUrl + e.IvHex)));
        for (int i = 0; i < totalSegments; i++)
        {
            string chunkFile = Path.Combine(chunksDir, $"seg_{i:D5}.ts");
            var taskItem = new HlsSegmentTask
            {
                Index = i,
                Identity = playlistIdentity,
                Url = segmentUrls[i],
                Encryption = segmentEncryption[i],
                TargetPath = chunkFile
            };
            allTasks.Add(taskItem);

            using var chunkProbe = HttpTransferRequest.Create(HttpMethod.Head, taskItem.Url);
            if (!string.IsNullOrEmpty(referer)) chunkProbe.Headers.TryAddWithoutValidation("Referer", referer);
            if (!string.IsNullOrEmpty(uaString)) chunkProbe.Headers.TryAddWithoutValidation("User-Agent", uaString);
            using var checkpointBudget = CancellationTokenSource.CreateLinkedTokenSource(token);
            checkpointBudget.CancelAfter(TimeSpan.FromSeconds(5));
            bool reusable = false;
            // A key can rotate behind a stable key URI. Do not reuse decrypted
            // bytes based on the segment ETag alone.
            try { if (taskItem.Encryption == null) reusable = await MediaCheckpoint.CanReuseAsync(chunkFile, taskItem.Identity + taskItem.Url, _httpClient, chunkProbe, checkpointBudget.Token); }
            catch (OperationCanceledException) when (!token.IsCancellationRequested) { }
            if (reusable)
            {
                baseDownloadedBytes += new FileInfo(chunkFile).Length;
                completedChunksCount++;
                continue;
            }
            segmentQueue.Enqueue(taskItem);
        }

        int remainingToDownload = totalSegments - completedChunksCount;

        // Initialize parallel workers for Transfer Monitor UI
        session.Workers.Clear();
        for (int i = 0; i < threadCount; i++)
        {
            var worker = new SegmentWorker(
                _httpClient,
                dl.Url,
                session.StagingFilePath,
                i + 1,
                startByte: 0,
                endByte: 0,
                initialDownloaded: 0,
                referer: referer,
                userAgent: uaString,
                cookies: cookieHeader,
                speedLimiter: _speedLimiter);
            session.Workers.Add(worker);
        }
        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        object hlsLock = new object();
        long dynamicCompletedBytes = baseDownloadedBytes;
        int dynamicCompletedCount = completedChunksCount;

        Action<HlsSegmentTask, long> onChunkDone = (chunk, bytes) =>
        {
            lock (hlsLock)
            {
                dynamicCompletedBytes += bytes;
                dynamicCompletedCount++;
                Interlocked.Decrement(ref remainingToDownload);
            }
        };

        Func<bool> isCompletedCheck = () => Volatile.Read(ref remainingToDownload) <= 0;

        using var workerFailure = CancellationTokenSource.CreateLinkedTokenSource(token);
        string? fatalSegmentError = null;
        void FailSegment(string error) { Interlocked.CompareExchange(ref fatalSegmentError, error, null); workerFailure.Cancel(); }
        using var keys = new HlsAes128KeyCache(referer, uaString, keyUrl =>
            dl.Cookies?.Contains('\t') == true || new Uri(keyUrl).Host == new Uri(dl.Url).Host ? FormatCookieHeader(dl.Cookies, keyUrl) : null);
        var workerTasks = session.Workers.Select(w => w.ExecuteHlsChunkQueueAsync(segmentQueue, isCompletedCheck, workerFailure.Token, onChunkDone, FailSegment, keys.DecryptAsync)).ToList();

        // High-precision Telemetry Monitor loop with EMA smoothing & dynamic total size estimation
        var monitorCts = CancellationTokenSource.CreateLinkedTokenSource(token);
        var monitorTask = Task.Run(async () =>
        {
            long lastReportedBytes = baseDownloadedBytes;
            var sw = Stopwatch.StartNew();

            while (!monitorCts.Token.IsCancellationRequested && !token.IsCancellationRequested && dl.Status != DownloadStatus.Paused)
            {
                try
                {
                    await Task.Delay(350, monitorCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;

                long inFlightBytes = session.Workers.Sum(w => w.Progress.DownloadedBytes);
                long totalDownloaded;
                int completedCount;
                lock (hlsLock)
                {
                    totalDownloaded = dynamicCompletedBytes + inFlightBytes;
                    completedCount = dynamicCompletedCount;
                }

                double elapsedSec = sw.Elapsed.TotalSeconds;
                if (elapsedSec > 0)
                {
                    long delta = totalDownloaded - lastReportedBytes;
                    double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsedSec);
                    dl.SpeedMbps = dl.SpeedMbps <= 0.05
                        ? rawSpeed
                        : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);
                    lastReportedBytes = totalDownloaded;
                    sw.Restart();
                }

                // Estimate total bytes dynamically based on average segment size
                if (completedCount > 0)
                {
                    long avgBytesPerChunk = dynamicCompletedBytes / completedCount;
                    dl.TotalBytes = avgBytesPerChunk * totalSegments;
                }
                else if (dl.TotalBytes <= 0 && inFlightBytes > 0)
                {
                    dl.TotalBytes = 4_500_000L * totalSegments;
                }

                dl.DownloadedBytes = dl.TotalBytes > 0 ? Math.Min(dl.TotalBytes, totalDownloaded) : totalDownloaded;

                if (dl.TotalBytes > 0)
                {
                    dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 99.0);
                    if (dl.SpeedMbps > 0.05)
                    {
                        long remaining = Math.Max(0, dl.TotalBytes - dl.DownloadedBytes);
                        dl.EtaSeconds = (int)(remaining / (dl.SpeedMbps * 1024 * 1024));
                    }
                }

                dl.StatusDetail = $"Accelerated Stream ({dl.ProgressPercentage:F1}% • {completedCount}/{totalSegments} chunks)...";
                dl.Subline = dl.TotalBytes > 0
                    ? $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} / ~{MediaFormatItem.FormatBytes(dl.TotalBytes)} • {dl.SpeedMbps:F1} MB/s"
                    : $"{MediaFormatItem.FormatBytes(dl.DownloadedBytes)} • {dl.SpeedMbps:F1} MB/s";

                _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;
                DownloadProgressChanged?.Invoke(dl);
            }
        }, monitorCts.Token);

        try
        {
            await Task.WhenAll(workerTasks);
            await StopMonitorAsync(monitorCts, monitorTask);

            if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused)
            {
                return;
            }

            if (fatalSegmentError != null) throw new InvalidDataException(fatalSegmentError);
            bool allChunksPresent = allTasks.All(t => File.Exists(t.TargetPath) && new FileInfo(t.TargetPath).Length > 0);
            bool hasFatalError = session.Workers.Any(w => !string.IsNullOrEmpty(w.LastError)) || (!segmentQueue.IsEmpty && !token.IsCancellationRequested);

            if (!allChunksPresent || hasFatalError)
            {
                if (capturedPlaylist != null) throw new InvalidDataException("A captured video segment failed. Play the video and capture a fresh download.");
                Debug.WriteLine("[DownloadEngine] Direct parallel HLS download encountered segment errors. Falling back to native FFmpeg stream engine...");
                dl.StatusDetail = "Parallel stream throttled; switching to native FFmpeg engine...";
                dl.SpeedMbps = 0;
                DownloadProgressChanged?.Invoke(dl);

                // Seamlessly fall back to native FFmpeg stream session
                session.Workers.Clear();
                await RunFfmpegSessionAsync(session);
                return;
            }

            // All segments downloaded successfully -> Fast lossless FFmpeg Concat remux
            dl.StatusDetail = "Remuxing stream to MP4 container...";
            dl.SpeedMbps = 0;
            dl.ProgressPercentage = 99.5;
            DownloadProgressChanged?.Invoke(dl);

            string concatFile = Path.Combine(session.StagingDirectory, "concat.txt");
            var concatLines = allTasks.Take(videoSegmentCount).Select(t => $"file '{t.TargetPath.Replace("\\", "/")}'");
            await File.WriteAllLinesAsync(concatFile, concatLines, token);
            string audioConcatFile = Path.Combine(session.StagingDirectory, "audio-concat.txt");
            if (pairedAudio)
                await File.WriteAllLinesAsync(audioConcatFile, allTasks.Skip(videoSegmentCount).Select(t => $"file '{t.TargetPath.Replace("\\", "/")}'"), token);

            string? ffmpegPath = ResolveFfmpegPath();
            if (ffmpegPath == null)
            {
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "FFmpeg is unavailable or its checksum changed. Configure FFMPEG_PATH and FFMPEG_SHA256.";
                dl.Subline = "Failed • FFmpeg Not Configured";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
                return;
            }
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
            psi.ArgumentList.Add("-f");
            psi.ArgumentList.Add("concat");
            psi.ArgumentList.Add("-safe");
            psi.ArgumentList.Add("0");
            psi.ArgumentList.Add("-i");
            psi.ArgumentList.Add(concatFile);
            if (pairedAudio)
            {
                psi.ArgumentList.Add("-f"); psi.ArgumentList.Add("concat");
                psi.ArgumentList.Add("-safe"); psi.ArgumentList.Add("0");
                psi.ArgumentList.Add("-i"); psi.ArgumentList.Add(audioConcatFile);
                psi.ArgumentList.Add("-map"); psi.ArgumentList.Add("0:v:0");
                psi.ArgumentList.Add("-map"); psi.ArgumentList.Add("1:a:0");
            }
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add("copy");
            psi.ArgumentList.Add("-bsf:a");
            psi.ArgumentList.Add("aac_adtstoasc");
            psi.ArgumentList.Add("-movflags");
            psi.ArgumentList.Add("+faststart");
            psi.ArgumentList.Add(session.StagingFilePath);

            using var proc = new Process { StartInfo = psi };
            await using var processLifetime = new SessionProcessLifetime(proc);
            using var reg = token.Register(() => { try { if (!proc.HasExited) proc.Kill(true); } catch { } });

            StartSessionProcess(session, proc);
            var stderrTask = ProcessOutput.ReadTailAsync(proc.StandardError, token);
            await proc.WaitForExitAsync();
            string errOutput = await stderrTask;

            bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length >= 1024;
            if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
            {
                var fi = new FileInfo(session.StagingFilePath);
                dl.TotalBytes = fi.Length;
                dl.DownloadedBytes = fi.Length;
                dl.ProgressPercentage = 100.0;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Verifying HLS stream & computing SHA-256...";
                DownloadProgressChanged?.Invoke(dl);

                var scanResult = await ScanMediaOutputAsync(session, token);
                bool finalized = await FinalizeSessionIntegrityAsync(session, scanResult);
                if (finalized && !string.IsNullOrEmpty(session.StagingDirectory))
                {
                    CleanupStagingDirectory(session.StagingDirectory);
                }
            }
            else
            {
                string errMsg = (errOutput.Length > 80 ? errOutput.Substring(0, 80) : errOutput);
                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                dl.StatusDetail = string.IsNullOrWhiteSpace(errMsg) ? "Stream remux failed" : $"Stream remux error: {errMsg}";
                dl.Subline = $"Failed • {dl.StatusDetail}";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal pause or cancellation
        }
        catch (Exception ex)
        {
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            dl.Subline = $"Failed • {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        finally
        {
            await StopMonitorAsync(monitorCts, monitorTask, dispose: true);
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    private async Task RunFfmpegSessionAsync(DownloadSession session, string? capturedInput = null)
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
        session.Workers.Add(new SegmentWorker(_httpClient, dl.Url, session.StagingFilePath, 1, 0, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, 0, speedLimiter: _speedLimiter));
        session.Workers.Add(new SegmentWorker(_httpClient, dl.AudioUrl ?? dl.Url, session.StagingFilePath, 2, dl.TotalBytes > 0 ? dl.TotalBytes / 2 : 0, dl.TotalBytes, 0, speedLimiter: _speedLimiter));
        _segmentCache[dl.Id] = session.Workers.Select(w => w.Progress).ToList();

        string referer = dl.Referer ?? "";
        if (string.IsNullOrEmpty(referer) && (dl.Url.Contains("phncdn.com", StringComparison.OrdinalIgnoreCase) || dl.Url.Contains("pornhub.com", StringComparison.OrdinalIgnoreCase)))
        {
            referer = !string.IsNullOrEmpty(dl.PageUrl) ? dl.PageUrl : "https://www.pornhub.com/";
        }
        else if (!string.IsNullOrEmpty(dl.PageUrl) && dl.PageUrl.Contains("viewkey=", StringComparison.OrdinalIgnoreCase) &&
                 (string.IsNullOrEmpty(referer) || !referer.Contains("viewkey=", StringComparison.OrdinalIgnoreCase)))
        {
            referer = dl.PageUrl;
        }

        string uaString = !string.IsNullOrWhiteSpace(dl.UserAgent)
            ? dl.UserAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        string? cookieHeader = FormatCookieHeader(dl.Cookies, dl.Url);

        // Test candidate referers before starting FFmpeg to ensure working Referer/Origin headers are passed
        var ffmpegCandidates = GetCandidateReferers(dl.Url, referer, dl.PageUrl);
        foreach (var cand in capturedInput == null ? ffmpegCandidates : new List<string>())
        {
            try
            {
                using var pReq = HttpTransferRequest.Create(HttpMethod.Get, dl.Url);

                if (!string.IsNullOrEmpty(cand))
                {
                    pReq.Headers.TryAddWithoutValidation("Referer", cand);
                    try { pReq.Headers.TryAddWithoutValidation("Origin", new Uri(cand).GetLeftPart(UriPartial.Authority)); } catch { }
                }
                if (!string.IsNullOrEmpty(uaString)) pReq.Headers.TryAddWithoutValidation("User-Agent", uaString);
                if (!string.IsNullOrEmpty(cookieHeader)) pReq.Headers.TryAddWithoutValidation("Cookie", cookieHeader);
                pReq.Headers.TryAddWithoutValidation("Accept", "*/*");
                using var pCts = new CancellationTokenSource(3500);
                using var pResp = await _httpClient.SendAsync(pReq, HttpCompletionOption.ResponseHeadersRead, pCts.Token);
                if (pResp.IsSuccessStatusCode)
                {
                    referer = cand;
                    dl.Referer = cand;
                    session.Download.Referer = cand;
                    break;
                }
            }
            catch { }
        }

        string customHeaders = "";
        if (!string.IsNullOrEmpty(referer))
        {
            customHeaders += $"Referer: {referer}\r\n";
            try
            {
                var uri = new Uri(referer);
                customHeaders += $"Origin: {uri.GetLeftPart(UriPartial.Authority)}\r\n";
            }
            catch { }
        }
        if (!string.IsNullOrEmpty(cookieHeader))
        {
            customHeaders += $"Cookie: {cookieHeader}\r\n";
        }

        string? ffmpegPath = ResolveFfmpegPath();
        if (ffmpegPath == null)
        {
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = _speedLimitBytesPerSec > 0
                ? "Direct FFmpeg stream (global speed limiter applies to segmented HTTP transfers): FFmpeg is unavailable or its checksum changed. Configure FFMPEG_PATH and FFMPEG_SHA256."
                : "FFmpeg is unavailable or its checksum changed. Configure FFMPEG_PATH and FFMPEG_SHA256.";
            dl.Subline = "Failed • FFmpeg Not Configured";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            return;
        }

        if (_speedLimitBytesPerSec > 0)
        {
            dl.StatusDetail = "Direct FFmpeg stream (global speed limiter applies to segmented HTTP transfers)";
            dl.Subline = "Direct Stream • Unthrottled";
            DownloadStatusChanged?.Invoke(dl);
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
        psi.ArgumentList.Add("-allowed_segment_extensions");
        psi.ArgumentList.Add("ALL");
        psi.ArgumentList.Add("-extension_picky");
        psi.ArgumentList.Add("0");
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
        if (capturedInput != null)
        {
            psi.ArgumentList.Add("-protocol_whitelist");
            psi.ArgumentList.Add("file,http,https,tcp,tls");
        }
        psi.ArgumentList.Add("-i");
        psi.ArgumentList.Add(capturedInput ?? dl.Url);

        if (!string.IsNullOrWhiteSpace(dl.AudioUrl))
        {
            psi.ArgumentList.Add("-allowed_segment_extensions");
            psi.ArgumentList.Add("ALL");
            psi.ArgumentList.Add("-extension_picky");
            psi.ArgumentList.Add("0");
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
        await using var processLifetime = new SessionProcessLifetime(proc);

        using var reg = token.Register(() =>
        {
            try { if (!proc.HasExited) proc.Kill(true); } catch { }
        });

        try
        {
            StartSessionProcess(session, proc);
            var sw = Stopwatch.StartNew();
            long lastBytes = 0;
            long lastParsedBytes = 0;

            string? line;
            string? lastError = null;
            while ((line = await proc.StandardError.ReadLineAsync()) != null)
            {
                if (token.IsCancellationRequested || dl.Status == DownloadStatus.Paused) break;

                if (line.Contains("403 Forbidden", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Server returned 403", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Server returned 4XX", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("Server returned 410", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("410 Gone", StringComparison.OrdinalIgnoreCase) ||
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
                    lastParsedBytes = currentBytes;
                }

                if (currentBytes > 0)
                {
                    double elapsed = sw.Elapsed.TotalSeconds;
                    if (elapsed >= 0.35)
                    {
                        dl.DownloadedBytes = currentBytes;
                        long delta = currentBytes - lastBytes;
                        double rawSpeed = Math.Max(0, (delta / (1024.0 * 1024.0)) / elapsed);
                        dl.SpeedMbps = dl.SpeedMbps <= 0.05
                            ? rawSpeed
                            : (dl.SpeedMbps * 0.72) + (rawSpeed * 0.28);
                        lastBytes = currentBytes;
                        sw.Restart();

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

                        if (dl.Status != DownloadStatus.Paused && !token.IsCancellationRequested)
                        {
                            DownloadProgressChanged?.Invoke(dl);
                        }
                    }
                }
            }

            if (lastParsedBytes > 0 && dl.DownloadedBytes != lastParsedBytes && dl.Status != DownloadStatus.Paused && !token.IsCancellationRequested)
            {
                dl.DownloadedBytes = lastParsedBytes;
                if (dl.TotalBytes > 0)
                {
                    dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);
                }
                DownloadProgressChanged?.Invoke(dl);
            }

            await proc.WaitForExitAsync();

            bool fileHasData = File.Exists(session.StagingFilePath) && new FileInfo(session.StagingFilePath).Length >= 1024;
            if (proc.ExitCode == 0 && !token.IsCancellationRequested && fileHasData)
            {
                var fi = new FileInfo(session.StagingFilePath);
                dl.TotalBytes = fi.Length;
                dl.DownloadedBytes = fi.Length;
                dl.SpeedMbps = 0;
                dl.ProgressPercentage = 100.0;
                dl.StatusDetail = "Verifying FFmpeg stream integrity & computing SHA-256...";
                DownloadProgressChanged?.Invoke(dl);

                var scanResult = await ScanMediaOutputAsync(session, token);
                bool finalized = await FinalizeSessionIntegrityAsync(session, scanResult);
                if (finalized && !string.IsNullOrEmpty(session.StagingDirectory))
                {
                    CleanupStagingDirectory(session.StagingDirectory);
                }
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
                string friendlyError = "FFmpeg stream transfer interrupted";
                if (!string.IsNullOrEmpty(lastError))
                {
                    if (lastError.Contains("Server returned 4XX Client Error, but not one of 40{0,1,3,4}", StringComparison.OrdinalIgnoreCase) ||
                        lastError.Contains("410", StringComparison.OrdinalIgnoreCase))
                    {
                        friendlyError = "Stream link expired (HTTP 410 Gone). Please refresh the video page in your browser for a fresh link.";
                    }
                    else if (lastError.Contains("403", StringComparison.OrdinalIgnoreCase))
                    {
                        friendlyError = "Access denied (HTTP 403 Forbidden). CDN token expired or signature invalid. Please refresh the page in browser.";
                    }
                    else if (lastError.Contains("404", StringComparison.OrdinalIgnoreCase))
                    {
                        friendlyError = "Stream not found (HTTP 404). File is no longer available on the server.";
                    }
                    else
                    {
                        friendlyError = $"Stream error: {lastError}";
                    }
                }

                dl.Status = DownloadStatus.Failed;
                dl.SpeedMbps = 0;
                dl.StatusDetail = friendlyError;
                dl.Subline = $"Failed • {friendlyError}";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        catch (OperationCanceledException)
        {
            await processLifetime.DisposeAsync();
            dl.Status = DownloadStatus.Paused;
            dl.SpeedMbps = 0;
            dl.StatusDetail = "Paused by user";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
        }
        catch (Exception ex)
        {
            await processLifetime.DisposeAsync();
            dl.Status = DownloadStatus.Failed;
            dl.SpeedMbps = 0;
            dl.StatusDetail = $"Error: {ex.Message}";
            dl.Subline = $"Failed • {ex.Message}";
            await _repository.SaveDownloadAsync(dl);
            DownloadStatusChanged?.Invoke(dl);
            if (!File.Exists(session.StagingFilePath) || new FileInfo(session.StagingFilePath).Length == 0)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
        finally
        {
            await processLifetime.DisposeAsync();
            if (dl.Status == DownloadStatus.Completed)
            {
                CleanupStagingDirectory(session.StagingDirectory);
            }
        }
    }

    public async Task RefreshDownloadAddressAsync(DownloadModel model, string address)
    {
        using var command = await _commands.EnterAsync(model.Id);
        if (_sessions.ContainsKey(model.Id) || model.IsActive) throw new InvalidOperationException("Pause and wait for the transfer to stop before refreshing its address.");
        if (!Uri.TryCreate(address, UriKind.Absolute, out var fresh) || fresh.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(fresh.UserInfo))
            throw new ArgumentException("Enter an HTTP or HTTPS address without embedded credentials.");
        if (!Uri.TryCreate(model.Url, UriKind.Absolute, out var old) || old.GetLeftPart(UriPartial.Path) != fresh.GetLeftPart(UriPartial.Path))
            throw new InvalidOperationException("The new address does not identify the same resource. Add it as a separate download.");
        if (model.ManifestText != null || model.AudioManifestText != null || !string.IsNullOrEmpty(model.AudioUrl))
            throw new InvalidOperationException("Capture this media again from its original page so its audio, video and format can be verified together.");
        string previous = model.Url, etag = model.ETag; string? modified = model.LastModified; bool? ranges = model.SupportsRanges;
        model.Url = fresh.AbsoluteUri; model.ETag = ""; model.LastModified = null; model.SupportsRanges = null;
        try { await _repository.SaveDownloadAsync(model); }
        catch { model.Url = previous; model.ETag = etag; model.LastModified = modified; model.SupportsRanges = ranges; throw; }
    }

    public async Task<string> MoveDownloadAsync(DownloadModel model, string directory, string name)
    {
        using var command = await _commands.EnterAsync(model.Id);
        if (_sessions.ContainsKey(model.Id)) throw new InvalidOperationException("Pause and wait for this transfer to stop before moving it.");
        return await new DownloadDestinationService(_repository).MoveAsync(model, directory, name);
    }

    public async Task PauseDownloadAsync(string downloadId)
    {
        using var command = await _commands.EnterAsync(downloadId);
        await Task.Run(() => StopDownloadCoreAsync(downloadId, cancel: false));
    }

    public async Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null)
    {
        if (existingModel != null && !string.Equals(existingModel.Id, downloadId, StringComparison.Ordinal))
            throw new ArgumentException("The supplied download does not match the command ID.", nameof(existingModel));
        using var command = await _commands.EnterAsync(downloadId);
        await Task.Run(async () =>
        {
            // Resume of an owned transfer is idempotent. A preceding pause/cancel
            // holds this command gate until its old runner is completely finished.
            if (_sessions.TryGetValue(downloadId, out var owned))
            {
                if (owned.Download.Status != DownloadStatus.Failed) return;
                if (owned.RunnerTask != null) await owned.RunnerTask;
                if (IsTerminal(owned.Download.Status)) return;
            }
            var persisted = (await _repository.GetAllDownloadsAsync()).FirstOrDefault(item => item.Id == downloadId);
            if (persisted != null && IsTerminal(persisted.Status)) return;
            var target = existingModel ?? persisted;
            if (target == null || IsTerminal(target.Status)) return;
            // Recovery must revalidate the durable journal, not mutable UI cache.
            _segmentCache.TryRemove(downloadId, out _);
            await StartDownloadCoreAsync(target);
        });
    }

    public async Task CancelDownloadAsync(string downloadId)
    {
        using var command = await _commands.EnterAsync(downloadId);
        await Task.Run(() => StopDownloadCoreAsync(downloadId, cancel: true));
    }

    private async Task StopDownloadCoreAsync(string downloadId, bool cancel)
    {
        DownloadModel? target;
        string? staging = null;
        if (_sessions.TryGetValue(downloadId, out var session))
        {
            bool requestStop;
            lock (session.LifecycleSync)
            {
                requestStop = !session.CommitStarted;
                if (requestStop) session.StopRequested = true;
            }
            if (requestStop)
            {
                try { session.Cts.Cancel(); }
                catch (ObjectDisposedException) { } // Natural completion won the race.
                catch (AggregateException)
                {
                    Debug.WriteLine("[DownloadEngine] A cancellation callback failed; waiting for session shutdown.");
                }
            }
            // No timeout: ownership cannot be handed to a new writer while the
            // old worker, scanner, telemetry task or child process still runs.
            if (session.RunnerTask != null) await session.RunnerTask;
            target = session.Download;
            if (IsTerminal(target.Status) || session.CommitStarted) return;
            staging = session.StagingDirectory;
            if (!cancel)
            {
                _segmentCache[downloadId] = session.Workers.Select(worker => worker.Progress).ToList();
                if (session.UsesSegmentJournal && !string.IsNullOrEmpty(staging))
                    SaveSegmentJournal(staging, target, session.Workers.Select(worker => worker.Progress));
            }
        }
        else
        {
            target = (await _repository.GetAllDownloadsAsync()).FirstOrDefault(item => item.Id == downloadId);
            if (target == null || IsTerminal(target.Status)) return;
            if (cancel) staging = GetDownloadStagingDirectory(downloadId);
        }

        target.Status = DownloadStatus.Paused;
        target.SpeedMbps = 0;
        target.StatusDetail = cancel ? "Cancelled" : "Paused by user";
        await _repository.SaveDownloadAsync(target);
        DownloadStatusChanged?.Invoke(target);
        if (cancel)
        {
            _segmentCache.TryRemove(downloadId, out _);
            if (!string.IsNullOrEmpty(staging)) CleanupStagingDirectory(staging);
        }
    }
}
