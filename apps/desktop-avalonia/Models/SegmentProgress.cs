using System;
using CommunityToolkit.Mvvm.ComponentModel;

namespace SmartDm.Desktop.Avalonia.Models;

public partial class SegmentProgress : ObservableObject
{
    [ObservableProperty]
    private int _segmentIndex;

    [ObservableProperty]
    private long _startByte;

    [ObservableProperty]
    private long _endByte;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ProgressPercentage))]
    private long _downloadedBytes;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    private double _speedMbps;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    private bool _isActive;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ProgressPercentage))]
    [NotifyPropertyChangedFor(nameof(FormattedSpeed))]
    private bool _isCompleted;

    public double ProgressPercentage
    {
        get
        {
            long total = EndByte - StartByte + 1;
            if (total <= 0) return IsCompleted ? 100.0 : 0.0;
            return Math.Clamp((double)DownloadedBytes / total * 100.0, 0.0, 100.0);
        }
    }

    public string FormattedSpeed => IsActive ? $"{SpeedMbps:F1} M/s" : (IsCompleted ? "DONE" : "IDLE");
    public string ThreadName => $"T#{SegmentIndex:D2}";
}
