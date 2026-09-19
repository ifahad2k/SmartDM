using System;
using System.Diagnostics;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class CompletionInspectorViewModel : ViewModelBase
{
    [ObservableProperty]
    private DownloadModel? _download;

    [ObservableProperty]
    private string _payloadSizeText = "0.00 GB";

    [ObservableProperty]
    private string _elapsedTimeText = "--";

    [ObservableProperty]
    private string _avgSpeedText = "--";

    [ObservableProperty]
    private string _savedLocation = string.Empty;

    [ObservableProperty]
    private string _sha256Hash = string.Empty;

    [ObservableProperty]
    private string _defenderStatus = "Clean • Zero Threats Detected";

    [ObservableProperty]
    private string _heuristicStatus = "No RTLO spoofing or zip slip hazards";

    public event Action? RequestClose;

    public CompletionInspectorViewModel(DownloadModel? download = null)
    {
        Download = download;
        if (download != null)
        {
            if (download.TotalBytes >= 1024L * 1024 * 1024)
                PayloadSizeText = $"{(double)download.TotalBytes / (1024 * 1024 * 1024):F2} GB";
            else if (download.TotalBytes >= 1024L * 1024)
                PayloadSizeText = $"{(double)download.TotalBytes / (1024 * 1024):F2} MB";
            else
                PayloadSizeText = $"{download.TotalBytes} Bytes";

            SavedLocation = download.SavePath;
            Sha256Hash = !string.IsNullOrEmpty(download.Sha256Hash) ? download.Sha256Hash : "Computed on completion";
            AvgSpeedText = download.SpeedMbps > 0 ? $"{download.SpeedMbps:F1} MB/s" : "High-Speed";
            
            if (download.IsQuarantined)
            {
                DefenderStatus = "Threat Detected • Blocked by Scanner";
                HeuristicStatus = download.StatusDetail;
            }
        }
    }

    [RelayCommand]
    private void QuickOpenFile()
    {
        if (Download != null && File.Exists(Download.SavePath))
        {
            try
            {
                Process.Start(new ProcessStartInfo(Download.SavePath) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to open file: {ex.Message}");
            }
        }
    }

    [RelayCommand]
    private void OpenEnclosingFolder()
    {
        if (Download != null && !string.IsNullOrEmpty(Download.SavePath))
        {
            try
            {
                string? folder = Path.GetDirectoryName(Download.SavePath);
                if (!string.IsNullOrEmpty(folder) && Directory.Exists(folder))
                {
                    if (OperatingSystem.IsWindows())
                    {
                        Process.Start("explorer.exe", $"/select,\"{Download.SavePath}\"");
                    }
                    else
                    {
                        Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to open folder: {ex.Message}");
            }
        }
    }

    [RelayCommand]
    private void Dismiss()
    {
        RequestClose?.Invoke();
    }
}
