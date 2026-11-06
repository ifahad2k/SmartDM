using System;

namespace SmartDm.Desktop.Avalonia.Models;

public class SegmentProgress
{
    public int SegmentIndex { get; set; }
    public long StartByte { get; set; }
    public long EndByte { get; set; }
    public long DownloadedBytes { get; set; }
    public double SpeedMbps { get; set; }
    public bool IsActive { get; set; }
    public bool IsCompleted { get; set; }
    public string? CheckpointSha256 { get; set; }

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
