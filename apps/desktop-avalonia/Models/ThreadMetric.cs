using CommunityToolkit.Mvvm.ComponentModel;

namespace SmartDm.Desktop.Avalonia.Models;

public partial class ThreadMetric : ObservableObject
{
    [ObservableProperty]
    private int _threadIndex;

    [ObservableProperty]
    private double _speedMbps;

    [ObservableProperty]
    private bool _isActive = true;

    [ObservableProperty]
    private double _progress;

    public string ThreadName => $"T#{ThreadIndex:D2}";
    public string FormattedSpeed => IsActive ? $"{SpeedMbps:F1} M/s" : "0.0 M/s";
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
