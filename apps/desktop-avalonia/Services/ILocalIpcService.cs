using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class MediaFormatDto
{
    public string FormatId { get; set; } = string.Empty;
    public string Resolution { get; set; } = string.Empty;
    public string Ext { get; set; } = "mp4";
    public long FileSize { get; set; }
    public bool IsAudioOnly { get; set; }
    public string? Title { get; set; }
    public string? DirectUrl { get; set; }
    public string? AudioUrl { get; set; }
}

public class BrowserDownloadRequest
{
    public string Url { get; set; } = string.Empty;
    public string? VideoUrl { get; set; }
    public string? AudioUrl { get; set; }
    public string? FormatId { get; set; }
    public string? FileName { get; set; }
    public string? Title { get; set; }
    public string? Referer { get; set; }
    public string? PageUrl { get; set; }
    public string? Cookies { get; set; }
    public string? UserAgent { get; set; }
    public List<MediaFormatDto>? Formats { get; set; }
}

public interface ILocalIpcService
{
    Task StartAsync();
    void Stop();
    event Action<BrowserDownloadRequest>? DownloadRequestedFromBrowser;
    event Action? WindowRestoreRequested;
}
