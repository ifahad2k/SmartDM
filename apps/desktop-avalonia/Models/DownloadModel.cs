using System;
using CommunityToolkit.Mvvm.ComponentModel;

namespace SmartDm.Desktop.Avalonia.Models;

public enum DownloadStatus
{
    Active,
    Paused,
    Completed,
    Quarantined,
    Queued
}

public partial class DownloadModel : ObservableObject
{
    [ObservableProperty]
    private string _id = Guid.NewGuid().ToString();

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private string _url = string.Empty;

    [ObservableProperty]
    private long _totalBytes;

    [ObservableProperty]
    private long _downloadedBytes;

    [ObservableProperty]
    private double _speedMbps;

    [ObservableProperty]
    private double _progressPercentage;

    [ObservableProperty]
    private DownloadStatus _status = DownloadStatus.Active;

    [ObservableProperty]
    private string _category = "General";

    [ObservableProperty]
    private int _parallelThreads = 16;

    [ObservableProperty]
    private int _activeMirrors = 3;

    [ObservableProperty]
    private int _etaSeconds;

    [ObservableProperty]
    private string _sha256Hash = string.Empty;

    [ObservableProperty]
    private string _fileExtension = string.Empty;

    [ObservableProperty]
    private string _savePath = string.Empty;

    [ObservableProperty]
    private string _statusDetail = string.Empty;

    public string FormattedSpeed => Status == DownloadStatus.Active ? $"{SpeedMbps:F1} MB/s" : Status.ToString();

    public string FormattedProgress => $"{DownloadedBytes / (1024.0 * 1024 * 1024):F2} GB / {TotalBytes / (1024.0 * 1024 * 1024):F2} GB ({ProgressPercentage:F1}%)";

    public string FormattedEta => Status == DownloadStatus.Active && SpeedMbps > 0 ? $"ETA: {EtaSeconds}s" : "--";
}
