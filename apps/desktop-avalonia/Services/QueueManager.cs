using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class QueueManager : IQueueManager
{
    private IDownloadEngine? _engine;
    private IDatabaseRepository? _repository;
    private IFileCatalogService? _catalogService;
    private List<DownloadModel>? _masterDownloads;
    private Action<DownloadModel>? _wireCallbacksAction;
    private Action? _onStateChangedAction;

    private readonly SemaphoreSlim _pumpLock = new(1, 1);
    private int _pumpNeeded = 0;

    public int MaxConcurrentDownloads { get; set; } = 4;

    public void Initialize(
        IDownloadEngine engine,
        IDatabaseRepository repository,
        IFileCatalogService catalogService,
        List<DownloadModel> masterDownloads,
        Action<DownloadModel> wireCallbacksAction,
        Action onStateChangedAction)
    {
        _engine = engine;
        _repository = repository;
        _catalogService = catalogService;
        _masterDownloads = masterDownloads;
        _wireCallbacksAction = wireCallbacksAction;
        _onStateChangedAction = onStateChangedAction;

        _engine.DownloadCompleted += OnEngineDownloadCompleted;
        _engine.DownloadStatusChanged += OnEngineDownloadStatusChanged;
    }

    private void OnEngineDownloadCompleted(DownloadModel dl, SafetyScanResult scan)
    {
        TriggerQueueProcessing();
    }

    private void OnEngineDownloadStatusChanged(DownloadModel dl)
    {
        if (dl.Status is DownloadStatus.Failed or DownloadStatus.Paused or DownloadStatus.Quarantined or DownloadStatus.Completed)
        {
            TriggerQueueProcessing();
        }
    }

    public async Task EnqueueBatchAsync(BrowserBatchDownloadRequest batchRequest, bool startPaused = false)
    {
        await Task.Yield();
        if (batchRequest.Items == null || batchRequest.Items.Count == 0 || _masterDownloads == null) return;

        string defaultDownloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        string targetDir;

        if (!string.IsNullOrWhiteSpace(batchRequest.DestinationFolder))
        {
            targetDir = batchRequest.DestinationFolder.Trim();
        }
        else
        {
            string folderName = SanitizeFolderName(!string.IsNullOrWhiteSpace(batchRequest.PlaylistTitle) ? batchRequest.PlaylistTitle : batchRequest.BatchTitle);
            if (!string.IsNullOrWhiteSpace(folderName) && !folderName.Equals("Playlist Download", StringComparison.OrdinalIgnoreCase) && !folderName.Equals("Batch Download", StringComparison.OrdinalIgnoreCase))
            {
                targetDir = Path.Combine(defaultDownloads, folderName);
            }
            else
            {
                targetDir = defaultDownloads;
            }
        }

        // Validate and ensure targetDir
        try
        {
            targetDir = Path.GetFullPath(targetDir);
            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QueueManager] Cannot create destination directory '{targetDir}': {ex.Message}. Falling back to default downloads.");
            targetDir = defaultDownloads;
            try
            {
                targetDir = Path.GetFullPath(targetDir);
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }
            }
            catch { }
        }

        if (!Directory.Exists(targetDir))
        {
            targetDir = defaultDownloads;
        }

        int startPos = 1;
        lock (_masterDownloads)
        {
            int maxPos = _masterDownloads
                .Where(d => d.QueuePosition > 0)
                .Select(d => d.QueuePosition)
                .DefaultIfEmpty(0)
                .Max();
            startPos = maxPos + 1;
        }

        int total = batchRequest.Items.Count;
        var newModels = new List<DownloadModel>(total);

        for (int i = 0; i < total; i++)
        {
            var item = batchRequest.Items[i];
            if (string.IsNullOrWhiteSpace(item.Url)) continue;

            string ext = batchRequest.IsAudio ? ".mp3" : ".mp4";
            string rawTitle = !string.IsNullOrWhiteSpace(item.Title) ? item.Title.Trim() : $"Track {i + 1}";
            string cleanTitle = SanitizeFileName(rawTitle);
            string fileName = !string.IsNullOrWhiteSpace(item.FileName)
                ? SanitizeFileName(item.FileName.Trim())
                : $"{cleanTitle}{ext}";

            // If fileName ends with a mismatched media extension, replace it cleanly instead of chaining (e.g. .mp3.mp4)
            string currentExt = Path.GetExtension(fileName);
            if (string.Equals(currentExt, ".mp3", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentExt, ".mp4", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentExt, ".m4a", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentExt, ".webm", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentExt, ".mkv", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(currentExt, ".opus", StringComparison.OrdinalIgnoreCase))
            {
                fileName = Path.ChangeExtension(fileName, ext);
            }
            else if (!fileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            {
                fileName += ext;
            }

            string fullSavePath = Path.Combine(targetDir, fileName);

            // Avoid path collision with existing downloads, on-disk files, or items in this same batch
            Func<string, bool> isCollision = path =>
                File.Exists(path) ||
                _masterDownloads.Any(d => string.Equals(d.SavePath, path, StringComparison.OrdinalIgnoreCase)) ||
                newModels.Any(d => string.Equals(d.SavePath, path, StringComparison.OrdinalIgnoreCase));

            lock (_masterDownloads)
            {
                if (isCollision(fullSavePath))
                {
                    if (_catalogService != null)
                    {
                        fullSavePath = _catalogService.GenerateUniquePath(fullSavePath, isCollision);
                    }
                    else
                    {
                        string dir = Path.GetDirectoryName(fullSavePath) ?? targetDir;
                        string nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
                        int count = 1;
                        while (isCollision(fullSavePath))
                        {
                            fullSavePath = Path.Combine(dir, $"{nameWithoutExt} ({count++}){ext}");
                        }
                    }
                    fileName = Path.GetFileName(fullSavePath);
                }
            }

            string domain = "Direct Endpoint";
            string? checkUrl = item.Url ?? item.PageUrl ?? batchRequest.PageUrl;
            if (!string.IsNullOrWhiteSpace(checkUrl) && Uri.TryCreate(checkUrl, UriKind.Absolute, out var parsedUri))
            {
                domain = parsedUri.Host;
            }

            DownloadStatus initialStatus = startPaused ? DownloadStatus.Paused : DownloadStatus.Queued;
            string initialDetail = startPaused ? "Paused in Queue" : "Queued • Waiting for transfer slot";
            string initialSubline = startPaused ? $"Paused in Queue • #{i + 1} of {total}" : $"Waiting in Queue • #{i + 1} of {total}";

            var dl = new DownloadModel
            {
                Id = Guid.NewGuid().ToString("N"),
                Title = Path.GetFileNameWithoutExtension(fileName),
                Url = item.Url!.Trim(),
                Domain = domain,
                SourcePageUrl = item.PageUrl ?? item.Referer ?? batchRequest.PageUrl ?? batchRequest.Referer,
                FormatId = item.FormatId ?? (batchRequest.IsAudio ? "bestaudio/best" : "1080p"),
                Category = batchRequest.IsAudio ? "Audio" : "Media",
                IconSource = batchRequest.IsAudio ? "/Assets/Icons/pulse-blue.png" : "/Assets/Icons/disc-blue.png",
                IconBg = "#EAF2FF",
                SavePath = fullSavePath,
                FileExtension = ext,
                Status = initialStatus,
                ParallelThreads = 4,
                StatusDetail = initialDetail,
                Subline = initialSubline,
                FooterDetail = "Target: " + fullSavePath,
                FooterRight = "Allocated",
                QueuePosition = startPos + i,
                Cookies = item.Cookies ?? batchRequest.Cookies,
                UserAgent = item.UserAgent ?? batchRequest.UserAgent,
                Referer = item.Referer ?? batchRequest.Referer,
                PageUrl = item.PageUrl ?? batchRequest.PageUrl
            };

            _wireCallbacksAction?.Invoke(dl);
            newModels.Add(dl);
        }

        lock (_masterDownloads)
        {
            // Append batch items to preserve natural FIFO queue order
            _masterDownloads.AddRange(newModels);
        }

        // Persist to repository asynchronously
        if (_repository != null)
        {
            var repo = _repository;
            _ = Task.Run(async () =>
            {
                foreach (var dl in newModels)
                {
                    try { await repo.SaveDownloadAsync(dl); }
                    catch (Exception ex) { Debug.WriteLine($"[QueueManager] Save error: {ex.Message}"); }
                }
            });
        }

        _onStateChangedAction?.Invoke();

        if (!startPaused)
        {
            // Trigger queue processing to start up to 4 concurrent downloads
            TriggerQueueProcessing();
        }
    }

    public async Task EnqueueAsync(DownloadModel download)
    {
        if (_masterDownloads == null) return;

        download.Status = DownloadStatus.Queued;
        download.StatusDetail = "Queued • Waiting for transfer slot";
        download.Subline = "Waiting in Queue";

        lock (_masterDownloads)
        {
            if (!_masterDownloads.Contains(download))
            {
                int maxPos = _masterDownloads
                    .Where(d => d.QueuePosition > 0)
                    .Select(d => d.QueuePosition)
                    .DefaultIfEmpty(0)
                    .Max();
                download.QueuePosition = maxPos + 1;
                _wireCallbacksAction?.Invoke(download);
                _masterDownloads.Add(download);
            }
        }

        if (_repository != null)
        {
            try { await _repository.SaveDownloadAsync(download); }
            catch (Exception ex) { Debug.WriteLine($"[QueueManager] Save error: {ex.Message}"); }
        }

        _onStateChangedAction?.Invoke();
        TriggerQueueProcessing();
    }

    public async Task ProcessQueueAsync()
    {
        if (_engine == null || _masterDownloads == null) return;
        if (!await _pumpLock.WaitAsync(0))
        {
            Interlocked.Exchange(ref _pumpNeeded, 1);
            return;
        }

        try
        {
            do
            {
                Interlocked.Exchange(ref _pumpNeeded, 0);

                while (true)
                {
                    DownloadModel? nextToStart = null;
                    lock (_masterDownloads)
                    {
                        int activeCount = _masterDownloads.Count(d => d.Status == DownloadStatus.Active && !d.IsStorage);
                        if (activeCount >= MaxConcurrentDownloads)
                        {
                            break;
                        }

                        // Find next queued download in order
                        nextToStart = _masterDownloads
                            .Where(d => d.Status == DownloadStatus.Queued && !d.IsStorage)
                            .OrderBy(d => d.QueuePosition > 0 ? d.QueuePosition : int.MaxValue)
                            .FirstOrDefault();

                        if (nextToStart == null)
                        {
                            break;
                        }

                        nextToStart.Status = DownloadStatus.Active;
                        nextToStart.StatusDetail = "Starting transfer...";
                        nextToStart.Subline = "Connecting to media stream...";
                    }

                    if (_repository != null)
                    {
                        try { await _repository.SaveDownloadAsync(nextToStart); }
                        catch { }
                    }
                    _onStateChangedAction?.Invoke();

                    var target = nextToStart;
                    var engine = _engine;
                    var repo = _repository;
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await engine.StartDownloadAsync(target);
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"[QueueManager] Failed to start {target.Id}: {ex.Message}");
                            target.Status = DownloadStatus.Failed;
                            target.StatusDetail = "Failed: " + ex.Message;
                            if (repo != null)
                            {
                                try { await repo.SaveDownloadAsync(target); }
                                catch { }
                            }
                            _onStateChangedAction?.Invoke();
                            TriggerQueueProcessing();
                        }
                    });

                    await Task.Yield();
                }
            } while (Interlocked.Exchange(ref _pumpNeeded, 0) == 1);
        }
        finally
        {
            _pumpLock.Release();
            _onStateChangedAction?.Invoke();
        }
    }

    public void TriggerQueueProcessing()
    {
        Interlocked.Exchange(ref _pumpNeeded, 1);
        _ = Task.Run(async () =>
        {
            try { await ProcessQueueAsync(); }
            catch (Exception ex) { Debug.WriteLine($"[QueueManager] ProcessQueueAsync error: {ex.Message}"); }
        });
    }

    public async Task PauseAllQueueAsync()
    {
        if (_masterDownloads == null) return;

        List<DownloadModel> toPause;
        lock (_masterDownloads)
        {
            toPause = _masterDownloads
                .Where(d => (d.Status == DownloadStatus.Active || d.Status == DownloadStatus.Queued) && !d.IsStorage)
                .ToList();
        }

        foreach (var dl in toPause)
        {
            try
            {
                bool wasActive = dl.Status == DownloadStatus.Active;
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Paused by user";
                if (_repository != null) await _repository.SaveDownloadAsync(dl);
                if (_engine != null && wasActive) await _engine.PauseDownloadAsync(dl.Id);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[QueueManager.PauseAll] Error: {ex.Message}");
            }
        }

        _onStateChangedAction?.Invoke();
    }

    public async Task ResumeAllQueueAsync()
    {
        if (_masterDownloads == null) return;

        List<DownloadModel> toResume;
        lock (_masterDownloads)
        {
            toResume = _masterDownloads
                .Where(d => (d.Status == DownloadStatus.Paused || d.Status == DownloadStatus.Failed) && !d.IsStorage)
                .ToList();

            int maxPos = _masterDownloads
                .Where(d => d.QueuePosition > 0)
                .Select(d => d.QueuePosition)
                .DefaultIfEmpty(0)
                .Max();

            foreach (var dl in toResume)
            {
                if (dl.QueuePosition <= 0)
                {
                    dl.QueuePosition = ++maxPos;
                }
                dl.Status = DownloadStatus.Queued;
                dl.StatusDetail = "Queued • Waiting for transfer slot";
                dl.Subline = "Waiting in Queue";
            }
        }

        if (_repository != null)
        {
            foreach (var dl in toResume)
            {
                try { await _repository.SaveDownloadAsync(dl); }
                catch { }
            }
        }

        _onStateChangedAction?.Invoke();
        TriggerQueueProcessing();
    }

    public async Task ClearQueueAsync()
    {
        await Task.Yield();
        if (_masterDownloads == null) return;

        List<DownloadModel> toRemove;
        lock (_masterDownloads)
        {
            toRemove = _masterDownloads
                .Where(d => (d.Status == DownloadStatus.Queued || (d.Status == DownloadStatus.Paused && d.QueuePosition > 0)) && !d.IsStorage)
                .ToList();

            foreach (var dl in toRemove)
            {
                _masterDownloads.Remove(dl);
            }
        }

        if (_repository != null)
        {
            foreach (var dl in toRemove)
            {
                try { await _repository.DeleteDownloadAsync(dl.Id); }
                catch (Exception ex) { Debug.WriteLine($"[QueueManager] Clear error: {ex.Message}"); }
            }
        }

        _onStateChangedAction?.Invoke();
    }

    public static string SanitizeFolderName(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        string clean = raw.Trim().Trim('\"', '\'');
        clean = Uri.UnescapeDataString(clean);
        clean = clean.Replace('\\', '/');
        clean = Path.GetFileName(clean);
        foreach (char c in Path.GetInvalidFileNameChars())
        {
            clean = clean.Replace(c, '_');
        }
        foreach (char c in Path.GetInvalidPathChars())
        {
            clean = clean.Replace(c, '_');
        }
        clean = clean.Trim('.', ' ');
        clean = clean.Replace("\u202E", "").Replace("\u202D", "").Trim();
        return clean;
    }

    public static string SanitizeFileName(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "track";
        string clean = raw.Trim().Trim('\"', '\'');
        clean = Uri.UnescapeDataString(clean);
        clean = clean.Replace('\\', '/');
        clean = Path.GetFileName(clean);
        foreach (char c in Path.GetInvalidFileNameChars())
        {
            clean = clean.Replace(c, '_');
        }
        clean = clean.Replace("\u202E", "").Replace("\u202D", "");
        return string.IsNullOrWhiteSpace(clean) ? "track" : clean;
    }
}
