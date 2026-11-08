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

    public async Task EnqueueBatchAsync(BrowserBatchDownloadRequest batchRequest)
    {
        await Task.Yield();
        if (batchRequest.Items == null || batchRequest.Items.Count == 0 || _masterDownloads == null) return;

        string targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        if (!Directory.Exists(targetDir))
        {
            try { Directory.CreateDirectory(targetDir); } catch { }
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

            if (!fileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            {
                fileName += ext;
            }

            string fullSavePath = Path.Combine(targetDir, fileName);

            // Avoid path collision with existing downloads or files
            lock (_masterDownloads)
            {
                if (File.Exists(fullSavePath) || _masterDownloads.Any(d => string.Equals(d.SavePath, fullSavePath, StringComparison.OrdinalIgnoreCase)))
                {
                    if (_catalogService != null)
                    {
                        fullSavePath = _catalogService.GenerateUniquePath(fullSavePath, path =>
                            File.Exists(path) || _masterDownloads.Any(d => string.Equals(d.SavePath, path, StringComparison.OrdinalIgnoreCase)));
                    }
                    else
                    {
                        string dir = Path.GetDirectoryName(fullSavePath) ?? targetDir;
                        string nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
                        int count = 1;
                        while (File.Exists(fullSavePath) || _masterDownloads.Any(d => string.Equals(d.SavePath, fullSavePath, StringComparison.OrdinalIgnoreCase)))
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
                Status = DownloadStatus.Queued,
                ParallelThreads = 4,
                StatusDetail = "Queued • Waiting for transfer slot",
                Subline = $"Waiting in Queue • #{i + 1} of {total}",
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

        // Trigger queue processing to start up to 4 concurrent downloads
        TriggerQueueProcessing();
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

            foreach (var dl in toResume)
            {
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

    private static string SanitizeFileName(string raw)
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
