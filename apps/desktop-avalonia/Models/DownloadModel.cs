using System;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace SmartDm.Desktop.Avalonia.Models;

public enum DownloadStatus
{
    Active,
    Paused,
    Completed,
    Quarantined,
    Queued,
    Failed
}

public enum DestinationConflictAction
{
    DefaultNeverOverwrite,
    Rename,
    Replace,
    Skip
}

public partial class DownloadModel : ObservableObject
{
    [ObservableProperty]
    private string _id = Guid.NewGuid().ToString();

    [ObservableProperty]
    private Bitmap? _iconBitmap;

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private string _url = string.Empty;

    [ObservableProperty]
    private string? _sourcePageUrl;

    [ObservableProperty]
    private string? _videoUrl;

    [ObservableProperty]
    private string? _pageUrl;

    [ObservableProperty]
    private string? _audioUrl;

    [ObservableProperty]
    private string _formatId = string.Empty;

    public string? MediaKind { get; set; }
    public string? ManifestText { get; set; }
    public string? AudioManifestText { get; set; }
    public Services.SafetyVerdict SafetyVerdict { get; set; } = Services.SafetyVerdict.NotScanned;
    public string SafetyDetails { get; set; } = "No scan evidence recorded";
    public string? QuarantinePath { get; set; }

    [ObservableProperty]
    private string _domain = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    [NotifyPropertyChangedFor(nameof(FormattedTotalBytes))]
    private long _totalBytes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    [NotifyPropertyChangedFor(nameof(FormattedDownloaded))]
    private long _downloadedBytes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(FormattedEta))]
    [NotifyPropertyChangedFor(nameof(QueueSpeedText))]
    [NotifyPropertyChangedFor(nameof(QueueEtaText))]
    private double _speedMbps;

    [ObservableProperty]
    private double _progressPercentage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsActive))]
    [NotifyPropertyChangedFor(nameof(IsPaused))]
    [NotifyPropertyChangedFor(nameof(IsCompletedFile))]
    [NotifyPropertyChangedFor(nameof(IsQuarantined))]
    [NotifyPropertyChangedFor(nameof(IsFailed))]
    [NotifyPropertyChangedFor(nameof(IsQueued))]
    [NotifyPropertyChangedFor(nameof(IsNormalSublineVisible))]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(FormattedEta))]
    [NotifyPropertyChangedFor(nameof(StatusLabel))]
    [NotifyPropertyChangedFor(nameof(QueueSpeedText))]
    [NotifyPropertyChangedFor(nameof(QueueEtaText))]
    [NotifyPropertyChangedFor(nameof(HasCategoryBadge))]
    [NotifyPropertyChangedFor(nameof(HasSecondaryBadge))]
    [NotifyPropertyChangedFor(nameof(HasProgressBar))]
    private DownloadStatus _status = DownloadStatus.Active;

    [ObservableProperty]
    private string _category = "General";

    [ObservableProperty]
    private string _iconSource = "/Assets/Icons/disc-blue.png";

    [ObservableProperty]
    private string _iconBg = "#EAF2FF";

    [ObservableProperty]
    private string _secondaryBadge = string.Empty;

    [ObservableProperty]
    private int _parallelThreads = 16;

    [ObservableProperty]
    private int _activeMirrors = 3;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedEta))]
    [NotifyPropertyChangedFor(nameof(QueueEtaText))]
    private int _etaSeconds;

    [ObservableProperty]
    private string _sha256Hash = string.Empty;

    [ObservableProperty]
    private string _expectedSha256 = string.Empty;

    [ObservableProperty]
    private string _fileExtension = string.Empty;

    [ObservableProperty]
    private string _savePath = string.Empty;

    [ObservableProperty]
    private string _statusDetail = string.Empty;

    [ObservableProperty]
    private string _footerDetail = string.Empty;

    [ObservableProperty]
    private string _footerRight = string.Empty;

    [ObservableProperty]
    private string _subline = string.Empty;

    [ObservableProperty]
    private string? _referer;

    [ObservableProperty]
    private string? _userAgent;

    [ObservableProperty]
    private string? _cookies;

    [ObservableProperty]
    private DestinationConflictAction _conflictAction = DestinationConflictAction.DefaultNeverOverwrite;

    [ObservableProperty]
    private string? _lastModified;

    // Null means no capability evidence (including legacy records), not "supported".
    [ObservableProperty]
    private bool? _supportsRanges;

    [ObservableProperty]
    private bool _isStorage = false;

    // Advanced Forensics & Metadata
    [ObservableProperty]
    private string _httpProtocol = "Not measured";

    [ObservableProperty]
    private string _mimeType = "application/octet-stream";

    [ObservableProperty]
    private string _acceptsRanges = "Not measured";

    [ObservableProperty]
    private string _serverSoftware = "Not measured";

    [ObservableProperty]
    private string _eTag = string.Empty;

    [ObservableProperty]
    private string _startedAt = "Not recorded";

    [ObservableProperty]
    private string _completedAt = "--";

    [ObservableProperty]
    private string _smartRule = "by extension (*.* -> General)";

    [ObservableProperty]
    private string _allocationMethod = "Not measured";

    [ObservableProperty]
    private string _avScannerName = "Not scanned";

    [ObservableProperty]
    private bool _isSelected = false;

    public bool IsActive => Status == DownloadStatus.Active && !IsStorage;
    public string StatusLabel => Status switch
    {
        DownloadStatus.Active => "Downloading",
        DownloadStatus.Paused => "Paused",
        DownloadStatus.Completed => "Completed",
        DownloadStatus.Failed => "Needs attention",
        DownloadStatus.Quarantined => "Quarantined",
        DownloadStatus.Queued => "Queued",
        _ => Status.ToString()
    };
    public string QueueSpeedText => IsActive ? $"{SpeedMbps:F1} MB/s" : "—";
    public string QueueEtaText => IsActive && SpeedMbps > 0 ? $"{EtaSeconds}s" : "—";
    public bool IsPaused => Status == DownloadStatus.Paused && !IsStorage;
    public bool IsCompletedFile => Status == DownloadStatus.Completed && !IsStorage;
    public bool IsQuarantined => Status == DownloadStatus.Quarantined && !IsStorage;
    public bool IsFailed => Status == DownloadStatus.Failed && !IsStorage;
    public bool IsQueued => Status == DownloadStatus.Queued && !IsStorage;
    public bool IsNormalSublineVisible => !IsQuarantined && !IsFailed && !IsStorage;

    public bool HasCategoryBadge => !string.IsNullOrEmpty(Category) && Status != DownloadStatus.Quarantined && !IsStorage;
    public bool HasSecondaryBadge => !string.IsNullOrEmpty(SecondaryBadge) && Status == DownloadStatus.Active;
    public bool HasProgressBar => (Status == DownloadStatus.Active || Status == DownloadStatus.Paused || Status == DownloadStatus.Failed || Status == DownloadStatus.Queued) && !IsStorage;
    public bool HasFooter => !IsStorage;

    public string FormattedSpeed => Status switch
    {
        DownloadStatus.Active => $"{SpeedMbps:F1} MB/s",
        DownloadStatus.Completed => "Completed",
        DownloadStatus.Paused => "Paused",
        DownloadStatus.Quarantined => "Quarantined",
        DownloadStatus.Failed => "Failed",
        DownloadStatus.Queued => "Queued",
        _ => Status.ToString()
    };

    public Action<DownloadModel>? OnOpenMonitor { get; set; }
    public Action<DownloadModel>? OnOpenInspector { get; set; }
    public Action<DownloadModel>? OnPause { get; set; }
    public Action<DownloadModel>? OnResume { get; set; }
    public Action<DownloadModel>? OnCancel { get; set; }
    public Action<DownloadModel>? OnDelete { get; set; }
    public Action<DownloadModel>? OnOpenFile { get; set; }
    public Action<DownloadModel>? OnOpenFolder { get; set; }
    public Action<DownloadModel>? OnOpenWith { get; set; }
    public Action<DownloadModel>? OnMoveRename { get; set; }
    public Action<DownloadModel>? OnRedownload { get; set; }
    public Action<DownloadModel>? OnRefreshUrl { get; set; }
    public Action<DownloadModel>? OnProperties { get; set; }
    public Action<DownloadModel>? OnSelect { get; set; }

    [RelayCommand]
    public void OpenMonitor() => OnOpenMonitor?.Invoke(this);

    [RelayCommand]
    public void OpenInspector() => OnOpenInspector?.Invoke(this);

    [RelayCommand]
    public void Pause() => OnPause?.Invoke(this);

    [RelayCommand]
    public void Resume() => OnResume?.Invoke(this);

    [RelayCommand]
    public void Cancel() => OnCancel?.Invoke(this);

    [RelayCommand]
    public void Delete() => OnDelete?.Invoke(this);

    [RelayCommand]
    public void OpenFile() => OnOpenFile?.Invoke(this);

    [RelayCommand]
    public void OpenFolder() => OnOpenFolder?.Invoke(this);

    [RelayCommand]
    public void OpenWith() => OnOpenWith?.Invoke(this);

    [RelayCommand]
    public void MoveRename() => OnMoveRename?.Invoke(this);

    [RelayCommand]
    public void Redownload() => OnRedownload?.Invoke(this);

    [RelayCommand]
    public void RefreshUrl() => OnRefreshUrl?.Invoke(this);

    [RelayCommand]
    public void ShowProperties() => OnProperties?.Invoke(this);

    [RelayCommand]
    public void SelectItem() => OnSelect?.Invoke(this);

    public static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "0 B";
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        int digitGroups = (int)(Math.Log10(bytes) / Math.Log10(1024));
        digitGroups = Math.Clamp(digitGroups, 0, units.Length - 1);
        return $"{bytes / Math.Pow(1024, digitGroups):F1} {units[digitGroups]}";
    }

    public string FormattedDownloaded => FormatBytes(DownloadedBytes);
    public string FormattedTotalBytes => FormatBytes(TotalBytes);
    public string FormattedProgress => $"{DownloadedBytes / (1024.0 * 1024 * 1024):F2} GB / {TotalBytes / (1024.0 * 1024 * 1024):F2} GB";

    public string FormattedEta => Status == DownloadStatus.Active && SpeedMbps > 0 ? $"ETA ~{EtaSeconds}s" : "--";
}
