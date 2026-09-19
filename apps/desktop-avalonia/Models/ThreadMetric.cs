using CommunityToolkit.Mvvm.ComponentModel;

namespace SmartDm.Desktop.Avalonia.Models;

public partial class ThreadMetric : ObservableObject
{
    [ObservableProperty]
    private int _threadIndex;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    private double _speedMbps;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(IsIdleDotVisible))]
    [NotifyPropertyChangedFor(nameof(IsCompletedDotVisible))]
    private bool _isActive = true;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    private double _progress;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedProgress))]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    [NotifyPropertyChangedFor(nameof(IsIdleDotVisible))]
    [NotifyPropertyChangedFor(nameof(IsCompletedDotVisible))]
    private bool _isCompleted;

    public string ThreadName => $"T#{ThreadIndex:D2}";
    public string FormattedSpeed => IsActive ? $"{SpeedMbps:F1} MB/s" : (IsCompleted ? "DONE" : "IDLE");
    public string FormattedProgress => IsCompleted ? "100%" : $"{Progress:F0}%";
    public bool IsCompletedDotVisible => IsCompleted && !IsActive;
    public bool IsIdleDotVisible => !IsActive && !IsCompleted;
}

public partial class MirrorNode : ObservableObject
{
    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private string _url = string.Empty;

    [ObservableProperty]
    private int _pingMs;

    [ObservableProperty]
    private bool _isPrimary;

    public string FormattedPing => $"{PingMs}ms ping";
}
