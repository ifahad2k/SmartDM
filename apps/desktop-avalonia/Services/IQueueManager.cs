using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IQueueManager
{
    int MaxConcurrentDownloads { get; set; }
    void Initialize(
        IDownloadEngine engine,
        IDatabaseRepository repository,
        IFileCatalogService catalogService,
        List<DownloadModel> masterDownloads,
        Action<DownloadModel> wireCallbacksAction,
        Action onStateChangedAction);
    Task EnqueueBatchAsync(BrowserBatchDownloadRequest batchRequest, bool startPaused = false);
    Task EnqueueAsync(DownloadModel download);
    Task ProcessQueueAsync();
    void TriggerQueueProcessing();
    Task PauseAllQueueAsync();
    Task ResumeAllQueueAsync();
    Task ClearQueueAsync();
}
