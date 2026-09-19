using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IDownloadEngine
{
    Task StartDownloadAsync(DownloadModel download);
    Task PauseDownloadAsync(string downloadId);
    Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null);
    Task CancelDownloadAsync(string downloadId);
    IReadOnlyList<SegmentProgress> GetSegments(string downloadId);
    void SetSpeedLimitBytesPerSec(long limitBytesPerSec);

    event Action<DownloadModel>? DownloadProgressChanged;
    event Action<DownloadModel>? DownloadStatusChanged;
    event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;
}
