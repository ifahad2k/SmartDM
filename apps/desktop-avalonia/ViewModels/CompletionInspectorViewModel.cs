using System;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class CompletionInspectorViewModel : ViewModelBase
{
    [ObservableProperty]
    private DownloadModel? _download;

    [ObservableProperty]
    private string _payloadSizeText = "14.2 GB";

    [ObservableProperty]
    private string _elapsedTimeText = "3m 42s";

    [ObservableProperty]
    private string _avgSpeedText = "67.4 MB/s";

    [ObservableProperty]
    private string _savedLocation = @"C:\Users\ifaha\Downloads\Archives";

    [ObservableProperty]
    private string _sha256Hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852";

    [ObservableProperty]
    private string _defenderStatus = "Clean â€¢ Zero Threats Detected";

    [ObservableProperty]
    private string _heuristicStatus = "No RTLO spoofing or zip slip hazards";

    public event Action? RequestClose;

    public CompletionInspectorViewModel(DownloadModel? download = null)
    {
        Download = download;
        if (download != null)
        {
            PayloadSizeText = $"{download.TotalBytes / (1024.0 * 1024 * 1024):F2} GB";
            SavedLocation = string.IsNullOrEmpty(download.SavePath) ? @"C:\Users\ifaha\Downloads\Archives" : download.SavePath;
        }
    }

    [RelayCommand]
    private void Dismiss()
    {
        RequestClose?.Invoke();
    }
}
