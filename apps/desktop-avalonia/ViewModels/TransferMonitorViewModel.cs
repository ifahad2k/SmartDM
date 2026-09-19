using System;
using System.Collections.ObjectModel;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class TransferMonitorViewModel : ViewModelBase
{
    [ObservableProperty]
    private DownloadModel? _download;

    [ObservableProperty]
    private double _speedLimit = 120.0;

    [ObservableProperty]
    private string _speedLimitLabel = "Unlimited (Max Pipe)";

    [ObservableProperty]
    private bool _isPaused;

    [ObservableProperty]
    private string _pauseButtonText = "â¸ Pause";

    public ObservableCollection<double> SegmentProgressList { get; } = new();
    public ObservableCollection<ThreadMetric> ThreadMetrics { get; } = new();
    public ObservableCollection<double> SparklineHistory { get; } = new();

    public event Action? RequestClose;
    public event Action<DownloadModel>? RequestCompletionView;

    private readonly DispatcherTimer _timer;
    private readonly Random _random = new();

    public TransferMonitorViewModel(DownloadModel download)
    {
        Download = download;

        for (int i = 0; i < 16; i++)
        {
            SegmentProgressList.Add(Math.Max(50.0, 95.0 - (i * 2.5)));
            ThreadMetrics.Add(new ThreadMetric
            {
                ThreadIndex = i + 1,
                SpeedMbps = 4.5 + (_random.NextDouble() * 2.0),
                IsActive = true
            });
        }

        var initialGraph = new double[] { 45, 52, 60, 58, 64, 72, 80, 75, 88, 92, 84, 98, 102, 94, 84.6 };
        foreach (var val in initialGraph)
        {
            SparklineHistory.Add(val);
        }

        _timer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _timer.Tick += OnTick;
        _timer.Start();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (Download == null || IsPaused) return;

        double baseSpeed = Math.Min(SpeedLimit, 82.0 + (_random.NextDouble() * 5.0));
        Download.SpeedMbps = baseSpeed;
        Download.ProgressPercentage = Math.Min(100.0, Download.ProgressPercentage + 0.15);
        Download.DownloadedBytes = (long)(Download.TotalBytes * (Download.ProgressPercentage / 100.0));

        if (Download.SpeedMbps > 0)
        {
            long remBytes = Download.TotalBytes - Download.DownloadedBytes;
            Download.EtaSeconds = Math.Max(1, (int)(remBytes / (Download.SpeedMbps * 1024 * 1024)));
        }

        SparklineHistory.Add(baseSpeed);
        if (SparklineHistory.Count > 25) SparklineHistory.RemoveAt(0);

        for (int i = 0; i < ThreadMetrics.Count; i++)
        {
            ThreadMetrics[i].SpeedMbps = Math.Max(2.5, Math.Min(8.0, ThreadMetrics[i].SpeedMbps + (_random.NextDouble() * 0.6 - 0.3)));
            SegmentProgressList[i] = Math.Min(100.0, SegmentProgressList[i] + 0.12);
        }
    }

    [RelayCommand]
    private void TogglePause()
    {
        IsPaused = !IsPaused;
        PauseButtonText = IsPaused ? "â–¶ Resume" : "â¸ Pause";

        foreach (var t in ThreadMetrics)
        {
            t.IsActive = !IsPaused;
        }

        if (Download != null)
        {
            Download.Status = IsPaused ? DownloadStatus.Paused : DownloadStatus.Active;
            if (IsPaused) Download.SpeedMbps = 0;
        }
    }

    [RelayCommand]
    private void SimulateFinish()
    {
        _timer.Stop();
        if (Download != null)
        {
            Download.ProgressPercentage = 100.0;
            Download.DownloadedBytes = Download.TotalBytes;
            Download.Status = DownloadStatus.Completed;
            RequestCompletionView?.Invoke(Download);
        }
    }

    [RelayCommand]
    private void Close()
    {
        _timer.Stop();
        RequestClose?.Invoke();
    }
}
