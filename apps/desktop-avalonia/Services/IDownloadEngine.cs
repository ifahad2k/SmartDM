using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IDownloadEngine
{
    Task StartDownloadAsync(DownloadModel download);
    Task<string> MoveDownloadAsync(DownloadModel model, string directory, string name) => Task.FromException<string>(new NotSupportedException("Destination changes are unavailable for this engine."));
    Task RefreshDownloadAddressAsync(DownloadModel model, string address) => Task.FromException(new NotSupportedException("Address refresh is unavailable for this engine."));
    Task PauseDownloadAsync(string downloadId);
    Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null);
    Task CancelDownloadAsync(string downloadId);
    IReadOnlyList<SegmentProgress> GetSegments(string downloadId);
    void SetSpeedLimitBytesPerSec(long limitBytesPerSec);

    event Action<DownloadModel>? DownloadProgressChanged;
    event Action<DownloadModel>? DownloadStatusChanged;
    event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;
}
