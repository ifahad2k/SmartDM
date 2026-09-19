using System;
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class AddDownloadViewModel : ViewModelBase
{
    [ObservableProperty]
    private string _url = "https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso";

    [ObservableProperty]
    private string _fileName = "Ubuntu-24.04.1-desktop-amd64.iso";

    [ObservableProperty]
    private string _category = "Disc Images (.iso)";

    [ObservableProperty]
    private string _savePath = @"C:\Users\ifaha\Downloads\OS_Images\";

    [ObservableProperty]
    private int _parallelThreads = 16;

    [ObservableProperty]
    private string _expectedHash = string.Empty;

    [ObservableProperty]
    private string _probeStatus = "â— 200 OK â€¢ HTTP/2 ALPN â€¢ 5.51 GB â€¢ Range Requests Supported";

    [ObservableProperty]
    private bool _isProbeSuccessful = true;

    public ObservableCollection<MirrorNode> MirrorNodes { get; } = new();

    public event Action<DownloadModel>? DownloadCreated;
    public event Action? RequestClose;

    public AddDownloadViewModel()
    {
        MirrorNodes.Add(new MirrorNode { Name = "Node 1", Url = "https://releases.ubuntu.com/24.04/", PingMs = 14, IsPrimary = true });
        MirrorNodes.Add(new MirrorNode { Name = "Node 2", Url = "https://mirrors.kernel.org/ubuntu-releases/24.04/", PingMs = 18, IsPrimary = false });
        MirrorNodes.Add(new MirrorNode { Name = "Node 3", Url = "https://mirror.cloudflare.com/ubuntu/24.04/", PingMs = 9, IsPrimary = false });
    }

    [RelayCommand]
    private void StepThreads(object? param)
    {
        if (param != null && int.TryParse(param.ToString(), out int delta))
        {
            ParallelThreads = Math.Clamp(ParallelThreads + delta, 1, 32);
        }
    }

    [RelayCommand]
    private void ProbeUrl()
    {
        ProbeStatus = "â— Probing remote endpoints...";
        IsProbeSuccessful = true;
        ProbeStatus = "â— 200 OK â€¢ HTTP/2 ALPN â€¢ 5.51 GB â€¢ Range Requests Supported";
    }

    [RelayCommand]
    private void PasteClipboard()
    {
        Url = "https://cdimage.debian.org/debian-cd/current/amd64/iso-dvd/debian-12.8.0-amd64-DVD-1.iso";
        FileName = "debian-12.8.0-amd64-DVD-1.iso";
        ProbeUrl();
    }

    [RelayCommand]
    private void StartDownload()
    {
        var model = new DownloadModel
        {
            Title = FileName,
            Url = Url,
            TotalBytes = 5917228800L,
            DownloadedBytes = 0,
            SpeedMbps = 84.6,
            ProgressPercentage = 0,
            Status = DownloadStatus.Active,
            Category = Category,
            ParallelThreads = ParallelThreads,
            ActiveMirrors = MirrorNodes.Count,
            SavePath = SavePath,
            StatusDetail = "16-Way Accelerated â€¢ 3 Mirror Nodes"
        };

        DownloadCreated?.Invoke(model);
        RequestClose?.Invoke();
    }

    [RelayCommand]
    private void Cancel()
    {
        RequestClose?.Invoke();
    }
}
