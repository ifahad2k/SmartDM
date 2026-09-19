using System;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class BrowserDownloadRequest
{
    public string Url { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public string? Cookies { get; set; }
    public string? UserAgent { get; set; }
}

public interface ILocalIpcService
{
    Task StartAsync();
    void Stop();
    event Action<BrowserDownloadRequest>? DownloadRequestedFromBrowser;
}
