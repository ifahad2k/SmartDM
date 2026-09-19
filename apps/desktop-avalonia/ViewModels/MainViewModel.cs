using System;
using System.Collections.ObjectModel;
using System.Linq;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private string _totalSpeedFormatted = "84.6 MB/s";

    [ObservableProperty]
    private string _totalEtaFormatted = "14s";

    [ObservableProperty]
    private int _activeSocketCount = 16;

    [ObservableProperty]
    private string _storageStatus = "Fast NVMe SSD: 1.2 TB free of 2.0 TB (39.4%)";

    [ObservableProperty]
    private bool _isDarkMode = false;

    public ObservableCollection<DownloadModel> Downloads { get; } = new();
    public ObservableCollection<ThreadMetric> ActiveThreads { get; } = new();
    public ObservableCollection<double> SparklineHistory { get; } = new();

    public event Action? RequestOpenAddDialog;
    public event Action<DownloadModel>? RequestOpenMonitor;
    public event Action<DownloadModel>? RequestOpenInspector;
    public event Action<bool>? RequestThemeChange;

    private readonly DispatcherTimer _simulationTimer;
    private readonly Random _random = new();

    public MainViewModel()
    {
        InitializeSampleData();

        _simulationTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _simulationTimer.Tick += OnSimulationTick;
        _simulationTimer.Start();
    }

    private void InitializeSampleData()
    {
        Downloads.Add(new DownloadModel
        {
            Title = "Ubuntu-24.04.1-desktop-amd64.iso",
            Url = "https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso",
            TotalBytes = 5917228800L,
            DownloadedBytes = 4597686784L,
            ProgressPercentage = 77.7,
            SpeedMbps = 84.6,
            Status = DownloadStatus.Active,
            Category = "Disc Images",
            ParallelThreads = 16,
            ActiveMirrors = 3,
            EtaSeconds = 14,
            StatusDetail = "16-Way Accelerated â€¢ 3 Mirror Nodes"
        });

        Downloads.Add(new DownloadModel
        {
            Title = "debian-12.8.0-amd64-DVD-1.iso",
            Url = "https://cdimage.debian.org/debian-cd/current/amd64/iso-dvd/debian-12.8.0-amd64-DVD-1.iso",
            TotalBytes = 3984588800L,
            DownloadedBytes = 1235232528L,
            ProgressPercentage = 31.0,
            SpeedMbps = 32.4,
            Status = DownloadStatus.Active,
            Category = "Disc Images",
            ParallelThreads = 8,
            ActiveMirrors = 1,
            EtaSeconds = 80,
            StatusDetail = "Primary Mirror: debian.org CDN"
        });

        Downloads.Add(new DownloadModel
        {
            Title = "Cyberpunk_2077_Update_v2.1.zip",
            Url = "https://fastcdn.gamepatch.org/cyberpunk/patch21.zip",
            TotalBytes = 15247133696L,
            DownloadedBytes = 15247133696L,
            ProgressPercentage = 100.0,
            SpeedMbps = 0,
            Status = DownloadStatus.Completed,
            Category = "Archives",
            ParallelThreads = 16,
            ActiveMirrors = 2,
            EtaSeconds = 0,
            StatusDetail = "100% Verified SHA-256 â€¢ Clean Sandbox Check"
        });

        Downloads.Add(new DownloadModel
        {
            Title = "macOS_Sequoia_15.1_Developer_Restore.dmg",
            Url = "https://updates.developer.apple.com/restore/macOS15.dmg",
            TotalBytes = 15569256448L,
            DownloadedBytes = 8697368576L,
            ProgressPercentage = 55.8,
            SpeedMbps = 0,
            Status = DownloadStatus.Paused,
            Category = "Disc Images",
            ParallelThreads = 16,
            ActiveMirrors = 1,
            EtaSeconds = 0,
            StatusDetail = "Paused by User â€¢ Keep-Alive Retained"
        });

        Downloads.Add(new DownloadModel
        {
            Title = "patch_crack_v2024_setup.exe",
            Url = "https://shadyfiles.biz/patch_crack.exe",
            TotalBytes = 15728640L,
            DownloadedBytes = 15728640L,
            ProgressPercentage = 100.0,
            SpeedMbps = 0,
            Status = DownloadStatus.Quarantined,
            Category = "Software",
            ParallelThreads = 1,
            ActiveMirrors = 0,
            EtaSeconds = 0,
            StatusDetail = "Blocked by Local Heuristics â€¢ RTLO Spoofing"
        });

        for (int i = 0; i < 16; i++)
        {
            ActiveThreads.Add(new ThreadMetric
            {
                ThreadIndex = i + 1,
                SpeedMbps = 4.8 + (_random.NextDouble() * 1.6),
                IsActive = true
            });
        }

        var initData = new double[] { 45, 52, 60, 58, 64, 72, 80, 75, 88, 92, 84, 98, 102, 94, 84.6 };
        foreach (var p in initData)
        {
            SparklineHistory.Add(p);
        }
    }

    private void OnSimulationTick(object? sender, EventArgs e)
    {
        var primaryItem = Downloads.FirstOrDefault(d => d.Status == DownloadStatus.Active);
        if (primaryItem != null)
        {
            double newSpeed = 82.0 + (_random.NextDouble() * 5.0);
            primaryItem.SpeedMbps = newSpeed;
            primaryItem.ProgressPercentage = Math.Min(99.9, primaryItem.ProgressPercentage + 0.12);
            primaryItem.DownloadedBytes = (long)(primaryItem.TotalBytes * (primaryItem.ProgressPercentage / 100.0));

            TotalSpeedFormatted = $"{newSpeed:F1} MB/s";
            SparklineHistory.Add(newSpeed);
            if (SparklineHistory.Count > 25) SparklineHistory.RemoveAt(0);
        }

        for (int i = 0; i < ActiveThreads.Count; i++)
        {
            ActiveThreads[i].SpeedMbps = Math.Max(2.5, Math.Min(7.5, ActiveThreads[i].SpeedMbps + (_random.NextDouble() * 0.4 - 0.2)));
        }
    }

    [RelayCommand]
    private void OpenAddDialog()
    {
        RequestOpenAddDialog?.Invoke();
    }

    [RelayCommand]
    private void OpenMonitor(DownloadModel? item)
    {
        var target = item ?? Downloads.FirstOrDefault(d => d.Status == DownloadStatus.Active);
        if (target != null)
        {
            RequestOpenMonitor?.Invoke(target);
        }
    }

    [RelayCommand]
    private void OpenInspector(DownloadModel? item)
    {
        var target = item ?? Downloads.FirstOrDefault(d => d.Status == DownloadStatus.Completed);
        if (target != null)
        {
            RequestOpenInspector?.Invoke(target);
        }
    }

    [RelayCommand]
    private void ToggleTheme()
    {
        IsDarkMode = !IsDarkMode;
        RequestThemeChange?.Invoke(IsDarkMode);
    }
}
