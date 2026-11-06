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
    private string _defenderStatus = "No scanner result available";

    [ObservableProperty]
    private string _heuristicStatus = "No heuristic result available";

    [ObservableProperty]
    private string _hashVerificationStatus = "No expected SHA-256 supplied";

    [ObservableProperty]
    private bool _showVerificationDetails;

    [ObservableProperty]
    private string _verificationButtonText = "Show verification details";

    public event Action<bool>? RequestToggleVerification;

    [ObservableProperty]
    private bool _hasHashMatchAttempt = false;

    [ObservableProperty]
    private bool _isHashVerified = false;

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
            Sha256Hash = !string.IsNullOrEmpty(download.Sha256Hash) ? download.Sha256Hash : "Not computed";
            AvgSpeedText = download.SpeedMbps > 0 ? $"{download.SpeedMbps:F1} MB/s" : "--";
            
            DefenderStatus = download.SafetyVerdict.ToString();
            HeuristicStatus = download.SafetyDetails;
            if (download.IsQuarantined)
            {
                DefenderStatus = "File quarantined; review safety details";
                HeuristicStatus = download.StatusDetail;
            }

            if (!string.IsNullOrWhiteSpace(download.ExpectedSha256))
            {
                HasHashMatchAttempt = true;
                if (!string.IsNullOrWhiteSpace(download.Sha256Hash) &&
                    Services.DownloadEngine.VerifyHashConstantTime(download.Sha256Hash, download.ExpectedSha256))
                {
                    IsHashVerified = true;
                    HashVerificationStatus = "Match with Expected SHA-256 Verified";
                }
                else
                {
                    IsHashVerified = false;
                    HashVerificationStatus = string.IsNullOrWhiteSpace(download.Sha256Hash)
                        ? "Expected hash could not be verified"
                        : "Expected SHA-256 mismatch";
                }
            }
            else
            {
                HasHashMatchAttempt = false;
                IsHashVerified = false;
                HashVerificationStatus = "No expected SHA-256 supplied";
            }
        }
    }

    [RelayCommand]
    private void ToggleVerification()
    {
        ShowVerificationDetails = !ShowVerificationDetails;
        VerificationButtonText = ShowVerificationDetails ? "Hide verification details" : "Show verification details";
        RequestToggleVerification?.Invoke(ShowVerificationDetails);
    }

    [RelayCommand]
    private void QuickOpenFile()
    {
        if (Download != null && Download.IsCompletedFile && File.Exists(Download.SavePath))
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
