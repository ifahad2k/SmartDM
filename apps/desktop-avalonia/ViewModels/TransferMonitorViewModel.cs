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

public partial class TransferMonitorViewModel : ViewModelBase, IDisposable
{
    private readonly IDownloadEngine? _engine;
    private bool _isDisposed;

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
    private bool _showDetails = false;

    [ObservableProperty]
    private string _detailsButtonText = "Show Details";

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

    public void InitializeDetailsData()
    {
        ThreadMetrics.Clear();
        var existingSegs = !string.IsNullOrEmpty(Download?.Id) ? _engine?.GetSegments(Download.Id) : null;
        int threadCount = Math.Max(1, Download?.ParallelThreads > 0 ? Download.ParallelThreads : 16);
        if (existingSegs != null && existingSegs.Count > 0)
        {
            threadCount = Math.Max(threadCount, existingSegs.Count);
        }

        for (int i = 0; i < threadCount; i++)
        {
            ThreadMetrics.Add(new ThreadMetric
            {
                ThreadIndex = i + 1,
                SpeedMbps = 0,
                IsActive = false,
                Progress = 0
            });
        }

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

        SparklineHistory.Clear();
        if (Download != null && Download.SpeedMbps > 0)
        {
            SparklineHistory.Add(Download.SpeedMbps);
            PeakSpeedMbps = Download.SpeedMbps;
        }
        else
        {
            PeakSpeedMbps = 0.0;
        }
        OnPropertyChanged(nameof(SocketsTelemetryBadge));
        OnPropertyChanged(nameof(SegmentsTitle));
        OnPropertyChanged(nameof(PeakSpeedFormatted));
    }

    [RelayCommand]
    public void ToggleDetails()
    {
        ShowDetails = !ShowDetails;
        DetailsButtonText = ShowDetails ? "Hide Details" : "Show Details";
        RequestToggleDetails?.Invoke(ShowDetails);
    }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PauseButtonIcon))]
    private bool _isPaused;

    [ObservableProperty]
    private string _pauseButtonText = "Pause";

    public string PauseButtonIcon => IsPaused ? "/Assets/Icons/play-gray.png" : "/Assets/Icons/pause-gray.png";

    public string SegmentsBadge => $"{Download?.ParallelThreads ?? 16} SEGMENTS";

    public string ProtocolInfo => Download?.StatusDetail?.Contains("Single", StringComparison.OrdinalIgnoreCase) == true
        ? "Protocol: HTTP/1.1 • Single-Stream Sequential"
        : "Protocol: Not measured";

    public string BufferInfo => "C# download engine";

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

    public string SegmentsTitle => $"{Math.Max(Download?.ParallelThreads ?? 16, ThreadMetrics.Count)} Parallel Stream Segments (Chunk Buffers)";

    public string TransferStatusBadgeText
    {
        get
        {
            if (Download?.Status == DownloadStatus.Failed) return "Transfer Failed";
            if (Download?.Status == DownloadStatus.Completed) return "Transfer Completed";
            if (Download?.Status == DownloadStatus.Paused || IsPaused) return "Transfer Paused";
            if (Download?.SpeedMbps > 0) return "Concurrency Active";
            return "Connecting...";
        }
    }

    public string TransferStatusBadgeColor
    {
        get
        {
            if (Download?.Status == DownloadStatus.Failed) return "#EF4444";
            if (Download?.Status == DownloadStatus.Completed) return "#3B82F6";
            if (Download?.Status == DownloadStatus.Paused || IsPaused) return "#F59E0B";
            if (Download?.SpeedMbps > 0) return "#16A34A";
            return "#94A3B8";
        }
    }

    public string SocketsTelemetryBadge
    {
        get
        {
            if (Download?.Status == DownloadStatus.Failed)
                return "Failed";
            if (Download?.Status == DownloadStatus.Completed)
                return "Completed";
            if (Download?.Status == DownloadStatus.Paused || IsPaused)
                return "Paused";
            if (ThreadMetrics.Count == 0)
            {
                int threads = Download?.ParallelThreads ?? 16;
                return (Download?.Status == DownloadStatus.Active && Download?.SpeedMbps > 0) ? $"{threads} Sockets Active" : "Connecting...";
            }
            int active = ThreadMetrics.Count(t => t.IsActive);
            int done = ThreadMetrics.Count(t => t.IsCompleted);
            int total = ThreadMetrics.Count;
            if (active == 0 && done == 0)
                return "Connecting...";
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

        if (download.Status == DownloadStatus.Paused)
        {
            IsPaused = true;
            PauseButtonText = "Resume";
        }
        else if (download.Status == DownloadStatus.Failed)
        {
            IsPaused = true;
            PauseButtonText = "Retry";
        }

        if (_engine != null)
        {
            _engine.DownloadProgressChanged += OnEngineProgressChanged;
            _engine.DownloadStatusChanged += OnEngineStatusChanged;
            _engine.DownloadCompleted += OnEngineCompleted;
        }

        if (string.IsNullOrWhiteSpace(Download.SavePath))
        {
            Download.SavePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Downloads",
                Download.Title ?? "download.bin");
        }

        // The compact monitor also renders live segment progress.
        InitializeDetailsData();
    }

    private long _lastProgressUiTick = 0;

    private void OnEngineProgressChanged(DownloadModel updated)
    {
        if (Download == null || updated.Id != Download.Id) return;
        if (IsPaused || Download.Status == DownloadStatus.Paused) return;

        long now = Stopwatch.GetTimestamp();
        if (Stopwatch.GetElapsedTime(_lastProgressUiTick, now).TotalMilliseconds < 250)
        {
            return;
        }
        _lastProgressUiTick = now;

        Dispatcher.UIThread.Post(() =>
        {
            if (IsPaused || Download.Status == DownloadStatus.Paused) return;

            if (!ReferenceEquals(Download, updated))
            {
                if (Download.DownloadedBytes != updated.DownloadedBytes) Download.DownloadedBytes = updated.DownloadedBytes;
                if (Download.TotalBytes != updated.TotalBytes) Download.TotalBytes = updated.TotalBytes;
                if (Math.Abs(Download.SpeedMbps - updated.SpeedMbps) > 0.05) Download.SpeedMbps = updated.SpeedMbps;
                if (Math.Abs(Download.ProgressPercentage - updated.ProgressPercentage) >= 0.1) Download.ProgressPercentage = updated.ProgressPercentage;
                if (Download.EtaSeconds != updated.EtaSeconds) Download.EtaSeconds = updated.EtaSeconds;
                if (Download.Status != updated.Status) Download.Status = updated.Status;
                if (Download.StatusDetail != updated.StatusDetail) Download.StatusDetail = updated.StatusDetail;
            }

            if (updated.SpeedMbps > PeakSpeedMbps)
            {
                PeakSpeedMbps = updated.SpeedMbps;
                OnPropertyChanged(nameof(PeakSpeedFormatted));
            }

            if (ShowDetails)
            {
                SparklineHistory.Add(updated.SpeedMbps);
                if (SparklineHistory.Count > 45) SparklineHistory.RemoveAt(0);
            }

            if (_engine != null)
            {
                var segs = _engine.GetSegments(updated.Id);
                while (ThreadMetrics.Count < segs.Count)
                {
                    ThreadMetrics.Add(new ThreadMetric
                    {
                        ThreadIndex = ThreadMetrics.Count + 1,
                        SpeedMbps = 0,
                        IsActive = updated.Status == DownloadStatus.Active,
                        Progress = 0
                    });
                }
                for (int i = 0; i < segs.Count && i < ThreadMetrics.Count; i++)
                {
                    var tm = ThreadMetrics[i];
                    var s = segs[i];
                    if (Math.Abs(tm.SpeedMbps - s.SpeedMbps) > 0.05) tm.SpeedMbps = s.SpeedMbps;
                    if (tm.IsActive != s.IsActive) tm.IsActive = s.IsActive;
                    if (Math.Abs(tm.Progress - s.ProgressPercentage) >= 0.5) tm.Progress = s.ProgressPercentage;
                    if (tm.IsCompleted != s.IsCompleted) tm.IsCompleted = s.IsCompleted;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                OnPropertyChanged(nameof(SegmentsTitle));
            }

            OnPropertyChanged(nameof(TransferStatusBadgeText));
            OnPropertyChanged(nameof(TransferStatusBadgeColor));
        }, DispatcherPriority.Background);
    }

    private void OnEngineStatusChanged(DownloadModel updated)
    {
        if (Download == null || updated.Id != Download.Id) return;

        Dispatcher.UIThread.Post(() =>
        {
            Download.Status = updated.Status;
            Download.StatusDetail = updated.StatusDetail;

            if (updated.Status == DownloadStatus.Paused)
            {
                IsPaused = true;
                PauseButtonText = "Resume";
                Download.SpeedMbps = 0;
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = false;
                    t.SpeedMbps = 0;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                OnPropertyChanged(nameof(PauseButtonIcon));
            }
            else if (updated.Status == DownloadStatus.Failed)
            {
                IsPaused = true;
                PauseButtonText = "Retry";
                Download.SpeedMbps = 0;
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = false;
                    t.SpeedMbps = 0;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                OnPropertyChanged(nameof(PauseButtonIcon));
            }
            else if (updated.Status == DownloadStatus.Active)
            {
                IsPaused = false;
                PauseButtonText = "Pause";
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                OnPropertyChanged(nameof(PauseButtonIcon));
            }

            OnPropertyChanged(nameof(TransferStatusBadgeText));
            OnPropertyChanged(nameof(TransferStatusBadgeColor));
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
        try
        {
            if (Download == null) return;

            if (Download.Status == DownloadStatus.Failed)
            {
                IsPaused = false;
                PauseButtonText = "Pause";
                Download.Status = DownloadStatus.Active;
                Download.StatusDetail = "Retrying download...";
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = true;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                OnPropertyChanged(nameof(PauseButtonIcon));
                if (_engine != null)
                {
                    await Task.Run(async () => await _engine.StartDownloadAsync(Download));
                }
                return;
            }

            IsPaused = !IsPaused;
            PauseButtonText = IsPaused ? "Resume" : "Pause";
            OnPropertyChanged(nameof(PauseButtonIcon));

            if (IsPaused)
            {
                Download.Status = DownloadStatus.Paused;
                Download.SpeedMbps = 0;
                Download.StatusDetail = "Paused by user";
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = false;
                    t.SpeedMbps = 0;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                if (_engine != null)
                {
                    await _engine.PauseDownloadAsync(Download.Id);
                }
            }
            else
            {
                Download.Status = DownloadStatus.Active;
                Download.StatusDetail = "Resuming download...";
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = true;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                if (_engine != null)
                {
                    await _engine.ResumeDownloadAsync(Download.Id, Download);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[TransferMonitor.TogglePauseAsync] Error: {ex.Message}");
        }
    }

    [RelayCommand]
    private async Task StopAsync()
    {
        try
        {
            Dispose();

            if (Download != null)
            {
                Download.Status = DownloadStatus.Paused;
                Download.SpeedMbps = 0;
                Download.StatusDetail = "Stopped by user";
                foreach (var t in ThreadMetrics)
                {
                    t.IsActive = false;
                    t.SpeedMbps = 0;
                }
                OnPropertyChanged(nameof(SocketsTelemetryBadge));
                if (_engine != null)
                {
                    await _engine.CancelDownloadAsync(Download.Id);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[TransferMonitor.StopAsync] Error: {ex.Message}");
        }
        finally
        {
            RequestClose?.Invoke();
        }
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

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;

        if (_engine != null)
        {
            try
            {
                _engine.DownloadProgressChanged -= OnEngineProgressChanged;
                _engine.DownloadStatusChanged -= OnEngineStatusChanged;
                _engine.DownloadCompleted -= OnEngineCompleted;
            }
            catch { }
        }
    }

    [RelayCommand]
    private void Close()
    {
        Dispose();
        RequestClose?.Invoke();
    }
}
