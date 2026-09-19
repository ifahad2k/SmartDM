using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class TransferMonitorViewModel : ViewModelBase
{
    private readonly IDownloadEngine? _engine;

    [ObservableProperty]
    private DownloadModel? _download;

    public ObservableCollection<string> LimitModeOptions { get; } = new()
    {
        "Max (Unlimited)",
        "Custom Limit",
        "5 MB/s",
        "10 MB/s",
        "25 MB/s",
        "50 MB/s"
    };

    [ObservableProperty]
    private string _selectedLimitMode = "Max (Unlimited)";

    [ObservableProperty]
    private bool _isCustomLimitEnabled = false;

    [ObservableProperty]
    private double _speedLimit = 120.0;

    [ObservableProperty]
    private string _speedLimitLabel = "Unlimited (Max Pipe)";

    [ObservableProperty]
    private string _speedLimitInput = "25.0";

    [ObservableProperty]
    private bool _showDetails = true;

    [ObservableProperty]
    private string _detailsButtonText = "Hide Details";

    [ObservableProperty]
    private double _peakSpeedMbps = 0.0;

    public string PeakSpeedFormatted => $"{PeakSpeedMbps:F1} MB/s";

    public event Action<bool>? RequestToggleDetails;

    private bool _isUpdatingSpeedLimit = false;

    partial void OnSelectedLimitModeChanged(string value)
    {
        if (value.StartsWith("Max", StringComparison.OrdinalIgnoreCase))
        {
            IsCustomLimitEnabled = false;
            SpeedLimit = 120.0;
            SpeedLimitLabel = "Unlimited (Max Pipe)";
            _engine?.SetSpeedLimitBytesPerSec(0);
        }
        else if (value.StartsWith("Custom", StringComparison.OrdinalIgnoreCase))
        {
            IsCustomLimitEnabled = true;
            if (!double.TryParse(SpeedLimitInput, out double cur) || cur <= 0)
            {
                SpeedLimitInput = "25.0";
                SpeedLimit = 25.0;
            }
            SpeedLimitLabel = $"Throttled: {SpeedLimit:F1} MB/s";
            _engine?.SetSpeedLimitBytesPerSec((long)(SpeedLimit * 1024 * 1024));
        }
        else
        {
            IsCustomLimitEnabled = true;
            string numPart = value.Replace("MB/s", "").Trim();
            if (double.TryParse(numPart, out double presetVal))
            {
                SpeedLimit = presetVal;
                SpeedLimitInput = $"{presetVal:F0}";
                SpeedLimitLabel = $"Throttled: {presetVal:F1} MB/s";
                _engine?.SetSpeedLimitBytesPerSec((long)(presetVal * 1024 * 1024));
            }
        }
    }

    partial void OnSpeedLimitChanged(double value)
    {
        if (_isUpdatingSpeedLimit) return;
        _isUpdatingSpeedLimit = true;

        if (!IsCustomLimitEnabled || value >= 120.0)
        {
            SpeedLimitLabel = "Unlimited (Max Pipe)";
            _engine?.SetSpeedLimitBytesPerSec(0);
        }
        else
        {
            SpeedLimitLabel = $"Throttled: {value:F1} MB/s";
            SpeedLimitInput = $"{value:F1}";
            _engine?.SetSpeedLimitBytesPerSec((long)(value * 1024 * 1024));
        }

        _isUpdatingSpeedLimit = false;
    }

    partial void OnSpeedLimitInputChanged(string value)
    {
        if (_isUpdatingSpeedLimit || !IsCustomLimitEnabled) return;
        _isUpdatingSpeedLimit = true;

        if (double.TryParse(value, out double mbps) && mbps > 0)
        {
            SpeedLimit = Math.Clamp(mbps, 1.0, 100.0);
            SpeedLimitLabel = $"Throttled: {mbps:F1} MB/s";
            _engine?.SetSpeedLimitBytesPerSec((long)(mbps * 1024 * 1024));
        }

        _isUpdatingSpeedLimit = false;
    }

    [RelayCommand]
    public void SetUnlimited()
    {
        SelectedLimitMode = "Max (Unlimited)";
    }

    [RelayCommand]
    public void ToggleDetails()
    {
        ShowDetails = !ShowDetails;
        DetailsButtonText = ShowDetails ? "Hide Details" : "Show Details";
        RequestToggleDetails?.Invoke(ShowDetails);
    }

    [ObservableProperty]
    private bool _isPaused;

    [ObservableProperty]
    private string _pauseButtonText = "Pause";

    public string SegmentsBadge => $"{Download?.ParallelThreads ?? 16} SEGMENTS";

    public string ProtocolInfo => Download?.StatusDetail?.Contains("Single", StringComparison.OrdinalIgnoreCase) == true
        ? "Protocol: HTTP/1.1 • Single-Stream Sequential"
        : "Protocol: HTTP/2 TLS 1.3 • Multi-Socket Slices • ALPN Multiplexed";

    public string BufferInfo => "Direct Async FileChannel • Low-Latency Flush";

    public string FormattedChunkSize
    {
        get
        {
            if (Download == null || Download.TotalBytes <= 0) return "Chunk Size: Dynamic Stream";
            int threads = Math.Max(1, Download.ParallelThreads);
            long chunkBytes = Download.TotalBytes / threads;
            if (chunkBytes >= 1024 * 1024 * 1024)
                return $"Chunk Size: {chunkBytes / (1024.0 * 1024 * 1024):F1} GB each";
            return $"Chunk Size: {chunkBytes / (1024.0 * 1024):F1} MB each";
        }
    }

    public string SegmentsTitle => $"{Download?.ParallelThreads ?? 16} Parallel Stream Segments (Chunk Buffers)";

    public string SocketsTelemetryBadge
    {
        get
        {
            int active = ThreadMetrics.Count(t => t.IsActive);
            int done = ThreadMetrics.Count(t => t.IsCompleted);
            int total = ThreadMetrics.Count;
            if (done > 0)
                return $"{active}/{total} In Flight • {done} Done";
            return $"{active}/{total} Sockets Active";
        }
    }

    public ObservableCollection<ThreadMetric> ThreadMetrics { get; } = new();
    public ObservableCollection<double> SparklineHistory { get; } = new();

    public event Action? RequestClose;
    public event Action<DownloadModel>? RequestCompletionView;

    public TransferMonitorViewModel(DownloadModel download, IDownloadEngine? engine = null)
    {
        Download = download;
        _engine = engine;

        int threadCount = Math.Max(1, download.ParallelThreads > 0 ? download.ParallelThreads : 16);
        for (int i = 0; i < threadCount; i++)
        {
            ThreadMetrics.Add(new ThreadMetric
            {
                ThreadIndex = i + 1,
                SpeedMbps = 0,
                IsActive = download.Status == DownloadStatus.Active,
                Progress = 0
            });
        }

        var existingSegs = _engine?.GetSegments(download.Id);
        if (existingSegs != null && existingSegs.Count > 0)
        {
            for (int i = 0; i < existingSegs.Count && i < ThreadMetrics.Count; i++)
            {
                ThreadMetrics[i].SpeedMbps = existingSegs[i].SpeedMbps;
                ThreadMetrics[i].IsActive = existingSegs[i].IsActive;
                ThreadMetrics[i].Progress = existingSegs[i].ProgressPercentage;
                ThreadMetrics[i].IsCompleted = existingSegs[i].IsCompleted;
            }
        }
        else if (download.ProgressPercentage > 0)
        {
            double totalProgress = Math.Clamp(download.ProgressPercentage, 0.0, 100.0);
            double totalActiveSpeed = download.SpeedMbps > 0 ? download.SpeedMbps : 16.0;
            double completedUnits = (totalProgress / 100.0) * threadCount;
            int fullCompleted = (int)Math.Floor(completedUnits);
            int activeCount = Math.Max(1, threadCount - fullCompleted);
            double perActiveSpeed = Math.Round(totalActiveSpeed / Math.Min(6, activeCount), 1);

            for (int i = 0; i < threadCount; i++)
            {
                if (i < fullCompleted)
                {
                    ThreadMetrics[i].Progress = 100.0;
                    ThreadMetrics[i].IsCompleted = true;
                    ThreadMetrics[i].IsActive = false;
                    ThreadMetrics[i].SpeedMbps = 0.0;
                }
                else if (i == fullCompleted)
                {
                    double remFraction = completedUnits - fullCompleted;
                    double curProg = Math.Round(Math.Clamp(remFraction * 100.0, 10.0, 95.0), 1);
                    ThreadMetrics[i].Progress = curProg;
                    ThreadMetrics[i].IsCompleted = false;
                    ThreadMetrics[i].IsActive = download.Status == DownloadStatus.Active;
                    ThreadMetrics[i].SpeedMbps = perActiveSpeed * 1.2;
                }
                else if (i < fullCompleted + 4 && i < threadCount)
                {
                    double taper = Math.Max(5.0, 60.0 - (i - fullCompleted) * 15.0);
                    ThreadMetrics[i].Progress = taper;
                    ThreadMetrics[i].IsCompleted = false;
                    ThreadMetrics[i].IsActive = download.Status == DownloadStatus.Active;
                    ThreadMetrics[i].SpeedMbps = perActiveSpeed;
                }
                else
                {
                    ThreadMetrics[i].Progress = Math.Max(0.0, 15.0 - (i - fullCompleted) * 4.0);
                    ThreadMetrics[i].IsCompleted = false;
                    ThreadMetrics[i].IsActive = download.Status == DownloadStatus.Active;
                    ThreadMetrics[i].SpeedMbps = Math.Round(perActiveSpeed * 0.5, 1);
                }
            }
        }

        if (_engine != null)
        {
            _engine.DownloadProgressChanged += OnEngineProgressChanged;
            _engine.DownloadCompleted += OnEngineCompleted;
        }

        if (string.IsNullOrWhiteSpace(Download.SavePath))
        {
            Download.SavePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Downloads",
                Download.Title ?? "download.bin");
        }

        if (download.SpeedMbps > 0)
        {
            double s = download.SpeedMbps;
            double[] seedWave = { s * 0.42, s * 0.58, s * 0.52, s * 0.71, s * 0.65, s * 0.82, s * 0.77, s * 0.91, s * 0.86, s * 0.95, s * 0.89, s * 0.98, s * 0.93, s * 1.04, s };
            foreach (var val in seedWave)
            {
                SparklineHistory.Add(Math.Round(val, 1));
            }
            PeakSpeedMbps = SparklineHistory.Max();
        }
        else
        {
            for (int i = 0; i < 15; i++)
            {
                SparklineHistory.Add(0);
            }
            PeakSpeedMbps = 0.0;
        }
        OnPropertyChanged(nameof(PeakSpeedFormatted));
    }

    private void OnEngineProgressChanged(DownloadModel updated)
    {
        if (Download == null || updated.Id != Download.Id) return;

        Dispatcher.UIThread.Post(() =>
        {
            if (!ReferenceEquals(Download, updated))
            {
                Download.DownloadedBytes = updated.DownloadedBytes;
                Download.TotalBytes = updated.TotalBytes;
                Download.SpeedMbps = updated.SpeedMbps;
                Download.ProgressPercentage = updated.ProgressPercentage;
                Download.EtaSeconds = updated.EtaSeconds;
                Download.Status = updated.Status;
                Download.StatusDetail = updated.StatusDetail;
            }

            if (Download.Status == DownloadStatus.Active && IsPaused)
            {
                IsPaused = false;
                PauseButtonText = "Pause";
            }

            if (updated.SpeedMbps > PeakSpeedMbps)
            {
                PeakSpeedMbps = updated.SpeedMbps;
                OnPropertyChanged(nameof(PeakSpeedFormatted));
            }

            SparklineHistory.Add(updated.SpeedMbps);
            if (SparklineHistory.Count > 45) SparklineHistory.RemoveAt(0);

            if (_engine != null)
            {
                var segs = _engine.GetSegments(updated.Id);
                for (int i = 0; i < segs.Count && i < ThreadMetrics.Count; i++)
                {
                    ThreadMetrics[i].SpeedMbps = segs[i].SpeedMbps;
                    ThreadMetrics[i].IsActive = segs[i].IsActive;
                    ThreadMetrics[i].Progress = segs[i].ProgressPercentage;
                    ThreadMetrics[i].IsCompleted = segs[i].IsCompleted;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
            }
        });
    }

    private void OnEngineCompleted(DownloadModel completed, SafetyScanResult scan)
    {
        if (Download != null && completed.Id == Download.Id)
        {
            Dispatcher.UIThread.Post(() =>
            {
                foreach (var t in ThreadMetrics)
                {
                    t.Progress = 100.0;
                    t.SpeedMbps = 0;
                    t.IsActive = false;
                    t.IsCompleted = true;
                }
                RequestCompletionView?.Invoke(completed);
            });
        }
    }

    [RelayCommand]
    private async Task TogglePauseAsync()
    {
        if (Download == null) return;

        IsPaused = !IsPaused;
        PauseButtonText = IsPaused ? "Resume" : "Pause";

        if (IsPaused)
        {
            Download.Status = DownloadStatus.Paused;
            Download.SpeedMbps = 0;
            foreach (var t in ThreadMetrics)
            {
                t.IsActive = false;
                t.SpeedMbps = 0;
            }
            if (_engine != null)
            {
                await _engine.PauseDownloadAsync(Download.Id);
            }
        }
        else
        {
            Download.Status = DownloadStatus.Active;
            foreach (var t in ThreadMetrics)
            {
                t.IsActive = true;
            }
            if (_engine != null)
            {
                await _engine.ResumeDownloadAsync(Download.Id, Download);
            }
        }
    }

    [RelayCommand]
    private void Stop()
    {
        if (Download != null)
        {
            _ = _engine?.CancelDownloadAsync(Download.Id);
        }
        RequestClose?.Invoke();
    }

    [RelayCommand]
    private void OpenFolder()
    {
        string? targetPath = Download?.SavePath;
        if (string.IsNullOrWhiteSpace(targetPath))
        {
            targetPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        }

        try
        {
            if (File.Exists(targetPath) && OperatingSystem.IsWindows())
            {
                Process.Start("explorer.exe", $"/select,\"{targetPath}\"");
            }
            else
            {
                string? dir = Path.GetDirectoryName(targetPath);
                if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir))
                {
                    dir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                }
                Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
            }
        }
        catch { }
    }

    [RelayCommand]
    private void Close()
    {
        if (_engine != null)
        {
            _engine.DownloadProgressChanged -= OnEngineProgressChanged;
            _engine.DownloadCompleted -= OnEngineCompleted;
        }
        RequestClose?.Invoke();
    }
}
