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
    Queued
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
    private string? _audioUrl;

    [ObservableProperty]
    private string _formatId = string.Empty;

    [ObservableProperty]
    private string _domain = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    private long _totalBytes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    private long _downloadedBytes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(FormattedEta))]
    private double _speedMbps;

    [ObservableProperty]
    private double _progressPercentage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsActive))]
    [NotifyPropertyChangedFor(nameof(IsPaused))]
    [NotifyPropertyChangedFor(nameof(IsCompletedFile))]
    [NotifyPropertyChangedFor(nameof(IsQuarantined))]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(FormattedEta))]
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
    private int _etaSeconds;

    [ObservableProperty]
    private string _sha256Hash = string.Empty;

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
    private bool _isStorage = false;

    // Advanced Forensics & Metadata
    [ObservableProperty]
    private string _httpProtocol = "HTTP/2 TLS 1.3";

    [ObservableProperty]
    private string _mimeType = "application/octet-stream";

    [ObservableProperty]
    private string _acceptsRanges = "bytes (Multi-part enabled)";

    [ObservableProperty]
    private string _serverSoftware = "cloudflare-nginx";

    [ObservableProperty]
    private string _eTag = "\"66228ba7-18d223c\"";

    [ObservableProperty]
    private string _startedAt = "Today 10:14 PM";

    [ObservableProperty]
    private string _completedAt = "--";

    [ObservableProperty]
    private string _smartRule = "by extension (*.* -> General)";

    [ObservableProperty]
    private string _allocationMethod = "Pre-allocated Sparse (Zero Frag)";

    [ObservableProperty]
    private string _avScannerName = "Windows Defender Engine 1.1.24080";

    [ObservableProperty]
    private bool _isSelected = false;

    public bool IsActive => Status == DownloadStatus.Active && !IsStorage;
    public bool IsPaused => Status == DownloadStatus.Paused && !IsStorage;
    public bool IsCompletedFile => Status == DownloadStatus.Completed && !IsStorage;
    public bool IsQuarantined => Status == DownloadStatus.Quarantined && !IsStorage;

    public bool HasCategoryBadge => !string.IsNullOrEmpty(Category) && Status != DownloadStatus.Quarantined && !IsStorage;
    public bool HasSecondaryBadge => !string.IsNullOrEmpty(SecondaryBadge) && Status == DownloadStatus.Active;
    public bool HasProgressBar => (Status == DownloadStatus.Active || Status == DownloadStatus.Paused) && !IsStorage;
    public bool HasFooter => !IsStorage;

    public string FormattedSpeed => Status switch
    {
        DownloadStatus.Active => $"{SpeedMbps:F1} MB/s",
        DownloadStatus.Completed => "Completed",
        DownloadStatus.Paused => "Paused",
        DownloadStatus.Quarantined => "Quarantined",
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

    public string FormattedProgress => $"{DownloadedBytes / (1024.0 * 1024 * 1024):F2} GB / {TotalBytes / (1024.0 * 1024 * 1024):F2} GB";

    public string FormattedEta => Status == DownloadStatus.Active && SpeedMbps > 0 ? $"ETA ~{EtaSeconds}s" : "--";
}
