using System;
using CommunityToolkit.Mvvm.ComponentModel;

namespace SmartDm.Desktop.Avalonia.Models;

public partial class MediaFormatItem : ObservableObject
{
    [ObservableProperty]
    private string _formatId = string.Empty;

    [ObservableProperty]
    private string _resolution = string.Empty;

    [ObservableProperty]
    private string _ext = "mp4";

    [ObservableProperty]
    private long _fileSize = 0;

    [ObservableProperty]
    private bool _isAudioOnly = false;

    [ObservableProperty]
    private string _displayLabel = string.Empty;

    [ObservableProperty]
    private string _formattedSize = "Unknown size";

    [ObservableProperty]
    private string? _directUrl;

    [ObservableProperty]
    private string? _audioUrl;

    public static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "Unknown size";
        const double kb = 1024.0;
        const double mb = kb * 1024.0;
        const double gb = mb * 1024.0;

        if (bytes >= gb) return $"{bytes / gb:F2} GB";
        if (bytes >= mb) return $"{bytes / mb:F1} MB";
        if (bytes >= kb) return $"{bytes / kb:F1} KB";
        return $"{bytes} B";
    }
}
