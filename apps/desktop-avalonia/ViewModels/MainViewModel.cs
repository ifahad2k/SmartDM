using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    private readonly IDownloadEngine _engine;
    private readonly IDatabaseRepository _repository;
    private readonly IHttpProbeService _probeService;
    private readonly ISafetyScanner _safetyScanner;
    private readonly ILocalIpcService _ipcService;
    private readonly ISettingsService _settingsService;
    private readonly IFileCatalogService _catalogService;
    private readonly bool _isDemoMode;

    public int CurrentProcessId => Environment.ProcessId;
    public ISettingsService SettingsService => _settingsService;
    public IFileCatalogService CatalogService => _catalogService;

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private string _totalSpeedFormatted = "0.0 MB/s";

    [ObservableProperty]
    private string _totalEtaFormatted = "--";

    [ObservableProperty]
    private int _activeSocketCount = 0;

    [ObservableProperty]
    private string _peakSpeedFormatted = "0.0 MB/s";

    [ObservableProperty]
    private double _peakSpeedMbps = 0.0;

    [ObservableProperty]
    private string _socketBufferStatus = "Buffer: Idle";

    [ObservableProperty]
    private double _aggregateLoadPercentage = 0.0;

    [ObservableProperty]
    private string _bandwidthCapFormatted = "Unlimited";

    [ObservableProperty]
    private string _bandwidthThrottlerBadge = "Unlimited Pipe";

    [ObservableProperty]
    private string _activeTaskTitle = "Idle";

    [ObservableProperty]
    private string _activeInspectionHash = "No active download";

    [ObservableProperty]
    private string _engineSubline = "Local Loopback | 0 Sockets | ETA --";

    [ObservableProperty]
    private string _upstreamSpeedFormatted = "0.0 KB/s";

    [ObservableProperty]
    private string _throttlingStatus = "Speed Limit: OFF";

    [ObservableProperty]
    private string _storageStatus = "Storage: Calculating...";

    [ObservableProperty]
    private bool _isDarkMode = false;

    [ObservableProperty]
    private string _currentQueueFilter = "All"; // "All", "Active", "Completed", "Scheduled"

    [ObservableProperty]
    private string _currentCategoryFilter = "All";

    [ObservableProperty]
    private string _currentChipFilter = "All";

    [ObservableProperty]
    private bool _hasNoDownloads = false;

    [ObservableProperty]
    private string _emptyStateTitle = "Queue Is Empty";

    [ObservableProperty]
    private string _emptyStateSubtitle = "Paste a direct download URL or drag links into SmartDM to begin.";

    [ObservableProperty]
    private string _emptyStateIcon = "/Assets/Icons/inbox-gray.png";

    [ObservableProperty]
    private Bitmap? _emptyStateIconBitmap;

    // Dynamic queue counts
    [ObservableProperty]
    private int _allCount = 0;

    [ObservableProperty]
    private int _activeCount = 0;

    [ObservableProperty]
    private int _completedCount = 0;

    [ObservableProperty]
    private int _scheduledCount = 0;

    [ObservableProperty]
    private DownloadModel? _selectedDownload;

    [ObservableProperty]
    private bool _isDetailsPaneOpen = false;

    [ObservableProperty]
    private string _clipboardVerificationStatus = string.Empty;

    public bool IsAllQueueSelected => CurrentQueueFilter == "All";
    public bool IsActiveQueueSelected => CurrentQueueFilter == "Active";
    public bool IsCompletedQueueSelected => CurrentQueueFilter == "Completed";
    public bool IsScheduledQueueSelected => CurrentQueueFilter == "Scheduled";

    private readonly List<DownloadModel> _allMasterDownloads = new();

    public ObservableCollection<DownloadModel> Downloads { get; } = new();
    public ObservableCollection<CategoryItem> Categories { get; } = new();
    public ObservableCollection<ThreadMetric> ActiveThreads { get; } = new();
    public ObservableCollection<double> SparklineHistory { get; } = new();

    public event Action? RequestOpenAddDialog;
    public event Action<DownloadModel?>? RequestOpenMonitor;
    public event Action<DownloadModel?>? RequestOpenInspector;
    public event Action<DownloadModel>? RequestOpenMoveRename;
    public event Action<DownloadModel>? RequestOpenRefreshLink;
    public event Action<DownloadModel>? RequestOpenDeleteConfirm;
    public event Action? RequestOpenSettings;
    public event Action<bool>? RequestThemeChange;

    public IDownloadEngine Engine => _engine;
    public IHttpProbeService ProbeService => _probeService;

    public MainViewModel(
        IDownloadEngine? engine = null,
        IDatabaseRepository? repository = null,
        IHttpProbeService? probeService = null,
        ISafetyScanner? safetyScanner = null,
        ILocalIpcService? ipcService = null,
        ISettingsService? settingsService = null,
        IFileCatalogService? catalogService = null,
        bool isDemoMode = false)
    {
        _isDemoMode = isDemoMode;
        _repository = repository ?? new SqliteDatabaseRepository();
        _safetyScanner = safetyScanner ?? new SafetyScannerService();
        _engine = engine ?? new IpcDownloadEngine(_repository, _safetyScanner);
        _probeService = probeService ?? new HttpProbeService();
        _ipcService = ipcService ?? new LocalIpcService();
        _settingsService = settingsService ?? new SettingsService();
        _catalogService = catalogService ?? new FileCatalogService();

        _ = _catalogService.ScanCommonFoldersAsync();

        UpdateStorageStatus();

        for (int i = 0; i < 16; i++)
        {
            ActiveThreads.Add(new ThreadMetric
            {
                ThreadIndex = i + 1,
                SpeedMbps = 0,
                IsActive = false
            });
        }

        for (int i = 0; i < 15; i++)
        {
            SparklineHistory.Add(0);
        }

        if (_isDemoMode)
        {
            InitializeDemoData();
        }
        else
        {
            _ = InitializeProductionAsync();
        }

        InitializeCategories();
        ApplyFilters();
        RefreshEngineMetrics();
    }

    private void UpdateStorageStatus()
    {
        try
        {
            string root = Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)) ?? "C:\\";
            var drive = new DriveInfo(root);
            long freeGb = drive.AvailableFreeSpace / (1024 * 1024 * 1024);
            long totalGb = drive.TotalSize / (1024 * 1024 * 1024);
            double usedPercent = totalGb > 0 ? ((double)(totalGb - freeGb) / totalGb) * 100.0 : 0;
            StorageStatus = $"{drive.Name} Storage: {freeGb} GB free of {totalGb} GB ({usedPercent:F1}% used)";
        }
        catch
        {
            StorageStatus = "Local Storage Pool Available";
        }
    }

    private static Bitmap LoadIcon(string filename)
    {
        var uri = new Uri($"avares://SmartDm.Desktop.Avalonia/Assets/Icons/{filename}");
        return new Bitmap(AssetLoader.Open(uri));
    }

    private void AddCat(string id, string title, string iconName, int count, bool isSelected = false)
    {
        Categories.Add(new CategoryItem
        {
            Id = id,
            Title = title,
            IconSource = $"/Assets/Icons/{iconName}",
            IconBitmap = LoadIcon(iconName),
            Count = count,
            IsSelected = isSelected,
            OnSelectAction = catId => SelectCategory(catId)
        });
    }

    private void InitializeCategories()
    {
        Categories.Clear();
        AddCat("All", "All Categories", "folder-gray.png", _allMasterDownloads.Count(d => !d.IsStorage), true);
        AddCat("Archives", "Archives & Disk Images", "archive-gray.png", _allMasterDownloads.Count(d => d.Category == "ISO" || d.Category == "ZIP"));
        AddCat("Media", "Media & Video Streams", "media-gray.png", _allMasterDownloads.Count(d => d.Category == "PNG" || d.Category == "MP4"));
        AddCat("Audio", "Music & Soundtracks", "pulse-blue.png", 0);
        AddCat("Software", "Software & Installers", "box-blue.png", _allMasterDownloads.Count(d => d.Category == "DMG" || d.Category == "EXE"));
        AddCat("Code", "Packages & Source Repos", "code-gray.png", 0);
        AddCat("Documents", "Documents & E-Books", "file-gray.png", 0);
        AddCat("AI", "AI Weights & Datasets", "matrix-green.png", _allMasterDownloads.Count(d => d.Title.Contains("LLM") || d.Category == "ZIP"));
        AddCat("Torrents", "Torrents & Magnet Links", "link-blue.png", 0);
        AddCat("Quarantine", "Quarantined Threats", "danger-red.png", _allMasterDownloads.Count(d => d.Status == DownloadStatus.Quarantined));
    }

    private async Task InitializeProductionAsync()
    {
        await _repository.InitializeAsync();
        await _settingsService.LoadAppSettingsAsync();

        // 1. Load real downloads from SQLite
        var stored = await _repository.GetAllDownloadsAsync();
        foreach (var dl in stored)
        {
            WireDownloadCallbacks(dl);
            _allMasterDownloads.Add(dl);
        }

        // 2. Wire engine events
        _engine.DownloadProgressChanged += OnEngineProgressChanged;
        _engine.DownloadStatusChanged += OnEngineStatusChanged;
        _engine.DownloadCompleted += OnEngineCompleted;

        // 3. Start local browser IPC daemon
        _ipcService.DownloadRequestedFromBrowser += OnBrowserDownloadRequested;
        await _ipcService.StartAsync();

        Dispatcher.UIThread.Post(() =>
        {
            UpdateCounts();
            ApplyFilters();
            RefreshEngineMetrics();
        });
    }

    private void WireDownloadCallbacks(DownloadModel dl)
    {
        dl.IconBitmap = LoadIcon(Path.GetFileName(dl.IconSource ?? "disc-blue.png"));
        dl.OnOpenMonitor = d => RequestOpenMonitor?.Invoke(d);
        dl.OnOpenInspector = d => RequestOpenInspector?.Invoke(d);
        dl.OnPause = async d => await _engine.PauseDownloadAsync(d.Id);
        dl.OnResume = async d => await _engine.ResumeDownloadAsync(d.Id, d);
        dl.OnCancel = async d => await _engine.CancelDownloadAsync(d.Id);
        dl.OnDelete = d => RequestOpenDeleteConfirm?.Invoke(d);
        dl.OnOpenFile = d => OpenFileNative(d.SavePath);
        dl.OnOpenFolder = d => OpenFolderNative(d.SavePath);
        dl.OnOpenWith = d => OpenWith(d);
        dl.OnMoveRename = d => MoveRename(d);
        dl.OnRedownload = d => Redownload(d);
        dl.OnRefreshUrl = d => RefreshUrl(d);
        dl.OnProperties = d => ShowProperties(d);
        dl.OnSelect = d => SelectDownload(d);
    }

    private void OnBrowserDownloadRequested(BrowserDownloadRequest req)
    {
        Dispatcher.UIThread.Post(async () =>
        {
            var probe = await _probeService.ProbeUrlAsync(req.Url);
            string fileName = req.FileName ?? probe.FileName;
            string saveDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            string savePath = Path.Combine(saveDir, fileName);

            var newDl = new DownloadModel
            {
                Title = fileName,
                Url = req.Url,
                Domain = Uri.TryCreate(req.Url, UriKind.Absolute, out var u) ? u.Host : "Remote Host",
                TotalBytes = probe.TotalBytes,
                DownloadedBytes = 0,
                SpeedMbps = 0,
                ProgressPercentage = 0,
                Status = DownloadStatus.Queued,
                Category = probe.SuggestedCategory,
                SavePath = savePath,
                ParallelThreads = probe.AcceptsRanges ? 16 : 1,
                StatusDetail = "Added via Browser Extension"
            };

            AddNewDownload(newDl);
        });
    }

    public void RefreshEngineMetrics()
    {
        double totalSpeed = _allMasterDownloads.Where(d => d.Status == DownloadStatus.Active).Sum(d => d.SpeedMbps);
        TotalSpeedFormatted = $"{totalSpeed:F1} MB/s";

        if (totalSpeed > PeakSpeedMbps)
        {
            PeakSpeedMbps = totalSpeed;
            PeakSpeedFormatted = $"{PeakSpeedMbps:F1} MB/s";
        }

        AggregateLoadPercentage = Math.Min(100.0, (totalSpeed / 100.0) * 100.0);

        var activeDl = _allMasterDownloads.FirstOrDefault(d => d.Status == DownloadStatus.Active);
        if (activeDl != null)
        {
            var segs = _engine.GetSegments(activeDl.Id);
            ActiveSocketCount = segs.Count > 0 ? segs.Count(s => s.IsActive) : activeDl.ParallelThreads;
            ActiveTaskTitle = activeDl.Title;
            SocketBufferStatus = "Live Buffer: 99.8%";
            TotalEtaFormatted = activeDl.EtaSeconds > 0 ? $"{activeDl.EtaSeconds / 60}m {activeDl.EtaSeconds % 60}s" : "--";
            EngineSubline = $"{activeDl.Domain} | {ActiveSocketCount} Sockets | ETA ~{TotalEtaFormatted}";
            UpstreamSpeedFormatted = "0.8 KB/s";

            for (int i = 0; i < segs.Count && i < ActiveThreads.Count; i++)
            {
                ActiveThreads[i].SpeedMbps = segs[i].SpeedMbps;
                ActiveThreads[i].IsActive = segs[i].IsActive;
            }
        }
        else
        {
            ActiveSocketCount = 0;
            ActiveTaskTitle = "Idle";
            SocketBufferStatus = "Buffer: Idle";
            TotalEtaFormatted = "--";
            EngineSubline = "Local Loopback | 0 Sockets | ETA --";
            UpstreamSpeedFormatted = "0.0 KB/s";
            foreach (var t in ActiveThreads)
            {
                t.SpeedMbps = 0;
                t.IsActive = false;
            }
        }

        var completedDl = _allMasterDownloads.FirstOrDefault(d => d.Status == DownloadStatus.Completed && !string.IsNullOrEmpty(d.Sha256Hash));
        ActiveInspectionHash = completedDl != null && !string.IsNullOrEmpty(completedDl.Sha256Hash)
            ? completedDl.Sha256Hash
            : "No completed payload verified";

        var settings = _settingsService?.CurrentSettings;
        if (settings != null && settings.EnableSpeedLimit)
        {
            BandwidthCapFormatted = $"{settings.DefaultSpeedLimitKbps} KB/s";
            BandwidthThrottlerBadge = $"Cap {settings.DefaultSpeedLimitKbps} KB/s";
            ThrottlingStatus = $"Speed Limit: {settings.DefaultSpeedLimitKbps} KB/s";
        }
        else
        {
            BandwidthCapFormatted = "Unlimited";
            BandwidthThrottlerBadge = "Unlimited Pipe";
            ThrottlingStatus = "Speed Limit: OFF";
        }
    }

    private void OnEngineProgressChanged(DownloadModel updated)
    {
        Dispatcher.UIThread.Post(() =>
        {
            var existing = _allMasterDownloads.FirstOrDefault(d => d.Id == updated.Id);
            if (existing != null && !ReferenceEquals(existing, updated))
            {
                existing.DownloadedBytes = updated.DownloadedBytes;
                existing.TotalBytes = updated.TotalBytes;
                existing.SpeedMbps = updated.SpeedMbps;
                existing.ProgressPercentage = updated.ProgressPercentage;
                existing.EtaSeconds = updated.EtaSeconds;
                existing.Status = updated.Status;
                existing.StatusDetail = updated.StatusDetail;
            }

            RefreshEngineMetrics();

            // Sparkline history update
            double totalSpeed = _allMasterDownloads.Where(d => d.Status == DownloadStatus.Active).Sum(d => d.SpeedMbps);
            SparklineHistory.Add(totalSpeed);
            if (SparklineHistory.Count > 30) SparklineHistory.RemoveAt(0);
        });
    }

    private void OnEngineStatusChanged(DownloadModel dl)
    {
        Dispatcher.UIThread.Post(() =>
        {
            var existing = _allMasterDownloads.FirstOrDefault(d => d.Id == dl.Id);
            if (existing != null && !ReferenceEquals(existing, dl))
            {
                existing.DownloadedBytes = dl.DownloadedBytes;
                existing.TotalBytes = dl.TotalBytes;
                existing.SpeedMbps = dl.SpeedMbps;
                existing.ProgressPercentage = dl.ProgressPercentage;
                existing.EtaSeconds = dl.EtaSeconds;
                existing.Status = dl.Status;
                existing.StatusDetail = dl.StatusDetail;
            }

            UpdateCounts();
            ApplyFilters();
            RefreshEngineMetrics();
        });
    }

    private void OnEngineCompleted(DownloadModel dl, SafetyScanResult scan)
    {
        Dispatcher.UIThread.Post(() =>
        {
            UpdateCounts();
            ApplyFilters();
            RefreshEngineMetrics();
        });
    }

    [RelayCommand]
    public void PromptDeleteDownload(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target != null)
        {
            RequestOpenDeleteConfirm?.Invoke(target);
        }
    }

    public async Task DeleteDownloadAsync(DownloadModel dl, bool deleteFileOnDisk = false)
    {
        try
        {
            if (dl.Status == DownloadStatus.Active || dl.Status == DownloadStatus.Queued)
            {
                await _engine.CancelDownloadAsync(dl.Id);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to cancel engine download: {ex.Message}");
        }

        if (deleteFileOnDisk)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(dl.SavePath) && File.Exists(dl.SavePath))
                {
                    File.Delete(dl.SavePath);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to delete file on disk: {ex.Message}");
            }

            try
            {
                if (!string.IsNullOrWhiteSpace(dl.SavePath))
                {
                    string partFile = dl.SavePath + ".part";
                    if (File.Exists(partFile)) File.Delete(partFile);
                    string tmpFile = dl.SavePath + ".tmp";
                    if (File.Exists(tmpFile)) File.Delete(tmpFile);
                }
            }
            catch { }
        }

        _allMasterDownloads.Remove(dl);
        await _repository.DeleteDownloadAsync(dl.Id);

        if (SelectedDownload == dl)
        {
            CloseDetailsPane();
        }

        UpdateCounts();
        ApplyFilters();
        RefreshEngineMetrics();
    }

    private static void OpenFileNative(string filePath)
    {
        if (File.Exists(filePath))
        {
            try { Process.Start(new ProcessStartInfo(filePath) { UseShellExecute = true }); } catch { }
        }
    }

    private static void OpenFolderNative(string filePath)
    {
        try
        {
            if (File.Exists(filePath) && OperatingSystem.IsWindows())
            {
                Process.Start("explorer.exe", $"/select,\"{filePath}\"");
            }
            else
            {
                string? dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                {
                    Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
                }
            }
        }
        catch { }
    }

    private void InitializeDemoData()
    {
        // Reserved strictly for UI preview & automated snapshots
        _allMasterDownloads.Add(new DownloadModel
        {
            Title = "Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso",
            Url = "https://releases.ubuntu.com/24.04/Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso",
            Domain = "releases.ubuntu.com",
            TotalBytes = 6657199308L,
            DownloadedBytes = 5176162385L,
            ProgressPercentage = 77.9,
            SpeedMbps = 84.6,
            Status = DownloadStatus.Active,
            Category = "ISO",
            SecondaryBadge = "TURBO x16",
            IconSource = "/Assets/Icons/disc-blue.png",
            IconBitmap = LoadIcon("disc-blue.png"),
            IconBg = "#EAF2FF",
            ParallelThreads = 16,
            ActiveMirrors = 3,
            EtaSeconds = 16,
            StatusDetail = "16 Multi-Socket Chunks",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso"),
            FooterDetail = "Pre-allocated memory space • Safe hash pre-match (SHA-256)",
            FooterRight = "Chunk allocation: 16/16 Connected",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/x-iso9660-image",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "Apache/2.4.58 (Ubuntu)",
            ETag = "\"66228ba7-18d223c\"",
            Sha256Hash = "a4358a9e7eb22f46215320579e09d17d5e6de6b92f7c030ef7682f71f654b0e9",
            StartedAt = "Today 10:14 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.iso -> ISO Images)",
            AllocationMethod = "Pre-allocated Sparse (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        _allMasterDownloads.Add(new DownloadModel
        {
            Title = "AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip",
            Url = "https://huggingface.co/models/AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip",
            Domain = "huggingface.co/models",
            TotalBytes = 41768878080L,
            DownloadedBytes = 15245864110L,
            ProgressPercentage = 36.5,
            SpeedMbps = 43.8,
            Status = DownloadStatus.Active,
            Category = "ZIP",
            SecondaryBadge = "32 Chunks",
            IconSource = "/Assets/Icons/box-blue.png",
            IconBitmap = LoadIcon("box-blue.png"),
            IconBg = "#EAF2FF",
            ParallelThreads = 32,
            ActiveMirrors = 2,
            EtaSeconds = 563,
            StatusDetail = "Hetzner Multi-Mirror Cluster",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip"),
            FooterDetail = "Direct Multi-mirror Hetzner cluster (Active peer mesh)",
            FooterRight = "Segment Write Rate: 720 IOPS",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/zip",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "cloudflare-nginx",
            ETag = "\"5f8b2a19-9b98020\"",
            Sha256Hash = "8f4e2c91b53e77862a901f4c2847a9501a4e21bc0879f98231c5908e7df01a2b",
            StartedAt = "Today 09:42 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.zip -> Archives)",
            AllocationMethod = "Sparse Fallocate (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        _allMasterDownloads.Add(new DownloadModel
        {
            Title = "Render_Cinematic_Frame_Pass_8K_Master_001.png",
            Url = "https://cdn.motionstorage.net/assets/Render_Cinematic_Frame_Pass_8K_Master_001.png",
            Domain = "cdn.motionstorage.net",
            TotalBytes = 155609088L,
            DownloadedBytes = 155609088L,
            ProgressPercentage = 100,
            SpeedMbps = 0,
            Status = DownloadStatus.Completed,
            Category = "PNG",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/image-green.png",
            IconBitmap = LoadIcon("image-green.png"),
            IconBg = "#E6FBF2",
            ParallelThreads = 8,
            ActiveMirrors = 1,
            EtaSeconds = 0,
            StatusDetail = "Status: Healthy",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Render_Cinematic_Frame_Pass_8K_Master_001.png"),
            FooterDetail = "Verified clean • Written to local cache",
            FooterRight = "Status: Healthy",
            HttpProtocol = "HTTP/3 QUIC TLS 1.3",
            MimeType = "image/png",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "AmazonS3 / Fastly",
            ETag = "\"90810724-bfbf-4ea9-8d76-574f88e7b931\"",
            Sha256Hash = "3b7194f1c7d23e8095b5c907106e2cf83f8b0561e718b52f440a2f7c0628e932",
            StartedAt = "Today 09:10 PM",
            CompletedAt = "Today 09:12 PM",
            SmartRule = "by extension (*.png -> Media)",
            AllocationMethod = "Standard Buffer Stream",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        _allMasterDownloads.Add(new DownloadModel
        {
            Title = "macOS_Sequoia_15.1_Developer_Restore.dmg",
            Url = "https://swcdn.apple.com/updates/macOS_Sequoia_15.1_Developer_Restore.dmg",
            Domain = "swcdn.apple.com",
            TotalBytes = 15569256448L,
            DownloadedBytes = 8696803328L,
            ProgressPercentage = 55.8,
            SpeedMbps = 0,
            Status = DownloadStatus.Paused,
            Category = "DMG",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/apple-gray.png",
            IconBitmap = LoadIcon("apple-gray.png"),
            IconBg = "#F1F3F6",
            ParallelThreads = 16,
            ActiveMirrors = 1,
            EtaSeconds = 0,
            StatusDetail = "Resumable state valid",
            Subline = "8.10 GB / 14.50 GB (55.8%) • Thread State Suspended (Keep-Alive Header Retained)",
            FooterDetail = "Keep-Alive header retained • Sockets suspended",
            FooterRight = "Resumable state valid",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/x-apple-diskimage",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "Apple-CDN-Edge/v4.2",
            ETag = "\"swcdn-apple-67b12d\"",
            Sha256Hash = "1a8b94f068c07e32489c7d1e39a045ff826b1d490c68270183e390c5f210d7a4",
            StartedAt = "Today 08:30 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.dmg -> Software)",
            AllocationMethod = "Pre-allocated Sparse (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        _allMasterDownloads.Add(new DownloadModel
        {
            Title = "patch_crack_v2024_setup.exe",
            Url = "https://unverified-thirdparty-cdn.ru/files/patch_crack_v2024_setup.exe",
            Domain = "unverified-thirdparty-cdn.ru",
            TotalBytes = 24117248L,
            DownloadedBytes = 24117248L,
            ProgressPercentage = 100,
            SpeedMbps = 0,
            Status = DownloadStatus.Quarantined,
            Category = "EXE",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/danger-red.png",
            IconBitmap = LoadIcon("danger-red.png"),
            IconBg = "#FDE8E8",
            ParallelThreads = 0,
            ActiveMirrors = 0,
            EtaSeconds = 0,
            StatusDetail = "File locked in isolation sandbox",
            Subline = "Blocked by Local Heuristics • RTLO Disguised Extension",
            FooterDetail = "File locked in isolation sandbox",
            FooterRight = "Execution blocked",
            HttpProtocol = "HTTP/1.1 TLS 1.2",
            MimeType = "application/x-msdos-program",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "nginx/1.18.0",
            ETag = "\"malicious-trojan-dropper-v2\"",
            Sha256Hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            StartedAt = "Today 07:15 PM",
            CompletedAt = "Today 07:16 PM",
            SmartRule = "Quarantined by Heuristic Safety Rule",
            AllocationMethod = "Isolated Sandbox Quarantine",
            AvScannerName = "Windows Defender (Threat Quarantined)"
        });

        foreach (var dl in _allMasterDownloads)
        {
            WireDownloadCallbacks(dl);
        }

        UpdateCounts();
    }

    private void UpdateCounts()
    {
        AllCount = _allMasterDownloads.Count(d => !d.IsStorage);
        ActiveCount = _allMasterDownloads.Count(d => d.Status == DownloadStatus.Active && !d.IsStorage);
        CompletedCount = _allMasterDownloads.Count(d => d.Status == DownloadStatus.Completed && !d.IsStorage);
        ScheduledCount = _allMasterDownloads.Count(d => (d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Paused) && !d.IsStorage);
    }

    public void AddNewDownload(DownloadModel newDl)
    {
        WireDownloadCallbacks(newDl);
        _allMasterDownloads.Insert(0, newDl);
        _ = _catalogService.IndexFileAsync(newDl.SavePath, newDl.Url);
        _ = _engine.StartDownloadAsync(newDl);
        UpdateCounts();
        ApplyFilters();
    }

    partial void OnSearchQueryChanged(string value) => ApplyFilters();
    partial void OnCurrentQueueFilterChanged(string value)
    {
        OnPropertyChanged(nameof(IsAllQueueSelected));
        OnPropertyChanged(nameof(IsActiveQueueSelected));
        OnPropertyChanged(nameof(IsCompletedQueueSelected));
        OnPropertyChanged(nameof(IsScheduledQueueSelected));
        ApplyFilters();
    }
    partial void OnCurrentCategoryFilterChanged(string value) => ApplyFilters();
    partial void OnCurrentChipFilterChanged(string value) => ApplyFilters();

    [RelayCommand]
    public void SelectQueueFilter(string filter)
    {
        CurrentQueueFilter = filter;
        CurrentChipFilter = "All";
    }

    [RelayCommand]
    public void SelectCategory(string categoryId)
    {
        CurrentCategoryFilter = categoryId;
        foreach (var c in Categories)
        {
            c.IsSelected = c.Id.Equals(categoryId, StringComparison.OrdinalIgnoreCase);
        }
        ApplyFilters();
    }

    [RelayCommand]
    public void SelectChip(string chip)
    {
        CurrentChipFilter = chip;
    }

    private bool MatchesCategory(DownloadModel d, string cat)
    {
        if (d.IsStorage) return cat == "All";
        return cat switch
        {
            "Archives" => d.Category == "ISO" || d.Category == "ZIP",
            "Media" => d.Category == "PNG" || d.Category == "MP4" || d.Title.EndsWith(".png") || d.Title.EndsWith(".mkv"),
            "Audio" => d.Category == "MP3" || d.Category == "FLAC" || d.Title.EndsWith(".mp3"),
            "Software" => d.Category == "DMG" || d.Category == "EXE" || d.Title.EndsWith(".dmg") || d.Title.EndsWith(".exe"),
            "Code" => d.Category == "GIT" || d.Category == "JAR" || d.Title.EndsWith(".tar.gz"),
            "Documents" => d.Category == "PDF" || d.Category == "DOC",
            "AI" => d.Title.Contains("LLM") || d.Category == "ZIP" || d.Title.EndsWith(".gguf"),
            "Torrents" => d.Category == "TORRENT",
            "Quarantine" => d.Status == DownloadStatus.Quarantined,
            _ => true
        };
    }

    private void ApplyFilters()
    {
        var query = _allMasterDownloads.AsEnumerable();

        if (CurrentQueueFilter == "Active")
        {
            query = query.Where(d => d.Status == DownloadStatus.Active && !d.IsStorage);
        }
        else if (CurrentQueueFilter == "Completed")
        {
            query = query.Where(d => d.Status == DownloadStatus.Completed && !d.IsStorage);
        }
        else if (CurrentQueueFilter == "Scheduled")
        {
            query = query.Where(d => (d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Paused) && !d.IsStorage);
        }

        if (CurrentCategoryFilter != "All")
        {
            query = query.Where(d => MatchesCategory(d, CurrentCategoryFilter));
        }

        if (CurrentChipFilter == "Active")
        {
            query = query.Where(d => d.Status == DownloadStatus.Active && !d.IsStorage);
        }
        else if (CurrentChipFilter == "Completed")
        {
            query = query.Where(d => d.Status == DownloadStatus.Completed && !d.IsStorage);
        }
        else if (CurrentChipFilter == "Video")
        {
            query = query.Where(d => d.Category == "PNG" || d.Category == "MP4");
        }
        else if (CurrentChipFilter == "Archives")
        {
            query = query.Where(d => d.Category == "ISO" || d.Category == "ZIP");
        }
        else if (CurrentChipFilter == "Blocked")
        {
            query = query.Where(d => d.Status == DownloadStatus.Quarantined);
        }

        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            var term = SearchQuery.Trim().ToLowerInvariant();
            query = query.Where(d => d.Title.ToLowerInvariant().Contains(term) || d.Domain.ToLowerInvariant().Contains(term));
        }

        var list = query.ToList();
        Downloads.Clear();
        foreach (var item in list)
        {
            Downloads.Add(item);
        }

        HasNoDownloads = Downloads.Count == 0;
        UpdateEmptyStateText();
    }

    private void UpdateEmptyStateText()
    {
        string iconName = "inbox-gray.png";
        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            EmptyStateTitle = $"No Downloads Matching \"{SearchQuery}\"";
            EmptyStateSubtitle = "Try adjusting your search query or clear the filter to view all items.";
            iconName = "search-gray.png";
        }
        else if (CurrentQueueFilter == "Active")
        {
            EmptyStateTitle = "No Active Transfers";
            EmptyStateSubtitle = "All download queues are currently idle. Click '+ Add URL' to initiate a high-speed transfer.";
            iconName = "transfers-gray.png";
        }
        else if (CurrentQueueFilter == "Completed")
        {
            EmptyStateTitle = "No Completed Downloads";
            EmptyStateSubtitle = "Finished downloads will appear here once all chunks are verified and reconstructed.";
            iconName = "completed-gray.png";
        }
        else if (CurrentQueueFilter == "Scheduled")
        {
            EmptyStateTitle = "No Scheduled Batches";
            EmptyStateSubtitle = "Queue is currently empty. You can set time-based schedules when adding new tasks.";
            iconName = "clock-gray.png";
        }
        else if (CurrentCategoryFilter != "All")
        {
            EmptyStateTitle = $"No {CurrentCategoryFilter} Downloads";
            EmptyStateSubtitle = "No download payloads found matching this category in the current queue.";
            iconName = "folder-gray.png";
        }
        else
        {
            EmptyStateTitle = "Queue Is Empty";
            EmptyStateSubtitle = "Paste a direct download URL or drag links into SmartDM to begin.";
            iconName = "inbox-gray.png";
        }

        EmptyStateIcon = $"/Assets/Icons/{iconName}";
        EmptyStateIconBitmap = LoadIcon(iconName);
    }

    [RelayCommand]
    public void OpenAddDialog() => RequestOpenAddDialog?.Invoke();

    [RelayCommand]
    public void OpenMonitor(DownloadModel? dl) => RequestOpenMonitor?.Invoke(dl);

    [RelayCommand]
    public void OpenInspector(DownloadModel? dl) => RequestOpenInspector?.Invoke(dl);

    [RelayCommand]
    public void OpenSettings() => RequestOpenSettings?.Invoke();

    [RelayCommand]
    public void SelectDownload(DownloadModel? dl)
    {
        if (dl == null)
        {
            foreach (var d in _allMasterDownloads) d.IsSelected = false;
            SelectedDownload = null;
            IsDetailsPaneOpen = false;
            ClipboardVerificationStatus = string.Empty;
            return;
        }

        foreach (var d in _allMasterDownloads)
        {
            d.IsSelected = ReferenceEquals(d, dl) || d.Id == dl.Id;
        }

        SelectedDownload = dl;
        IsDetailsPaneOpen = true;
        ClipboardVerificationStatus = string.Empty;
    }

    [RelayCommand]
    public void CloseDetailsPane()
    {
        IsDetailsPaneOpen = false;
        foreach (var d in _allMasterDownloads) d.IsSelected = false;
        SelectedDownload = null;
        ClipboardVerificationStatus = string.Empty;
    }

    [RelayCommand]
    public void OpenWith(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target != null && !string.IsNullOrEmpty(target.SavePath))
        {
            if (OperatingSystem.IsWindows())
            {
                try
                {
                    Process.Start(new ProcessStartInfo("rundll32.exe", $"shell32.dll,OpenAs_RunDLL \"{target.SavePath}\"") { UseShellExecute = true });
                }
                catch { }
            }
        }
    }

    [RelayCommand]
    public void MoveRename(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target != null)
        {
            RequestOpenMoveRename?.Invoke(target);
        }
    }

    [RelayCommand]
    public void RefreshUrl(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target != null)
        {
            RequestOpenRefreshLink?.Invoke(target);
        }
    }

    [RelayCommand]
    public void Redownload(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target != null)
        {
            target.DownloadedBytes = 0;
            target.ProgressPercentage = 0;
            target.SpeedMbps = 0;
            target.Status = DownloadStatus.Active;
            _ = _engine.StartDownloadAsync(target);
            UpdateCounts();
            ApplyFilters();
            RefreshEngineMetrics();
        }
    }

    [RelayCommand]
    public void ShowProperties(DownloadModel? dl)
    {
        if (dl != null)
        {
            SelectDownload(dl);
        }
    }

    [RelayCommand]
    public async Task VerifyClipboardHashAsync(DownloadModel? dl)
    {
        var target = dl ?? SelectedDownload;
        if (target == null || string.IsNullOrWhiteSpace(target.Sha256Hash))
        {
            ClipboardVerificationStatus = "No SHA-256 hash available to verify.";
            return;
        }

        try
        {
            if (global::Avalonia.Application.Current?.ApplicationLifetime is global::Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop &&
                desktop.MainWindow?.Clipboard != null)
            {
                var clipText = await desktop.MainWindow.Clipboard.GetTextAsync();
                if (string.IsNullOrWhiteSpace(clipText))
                {
                    ClipboardVerificationStatus = "Clipboard is empty.";
                    return;
                }

                clipText = clipText.Trim();
                if (string.Equals(clipText, target.Sha256Hash, StringComparison.OrdinalIgnoreCase))
                {
                    ClipboardVerificationStatus = "✓ Hash Match: Clipboard matches SHA-256!";
                }
                else
                {
                    ClipboardVerificationStatus = "✕ Mismatch: Clipboard hash does not match.";
                }
            }
        }
        catch (Exception ex)
        {
            ClipboardVerificationStatus = $"Verification failed: {ex.Message}";
        }
    }

    [RelayCommand]
    public async Task CopyHashAsync(string? hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return;
        try
        {
            if (global::Avalonia.Application.Current?.ApplicationLifetime is global::Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop &&
                desktop.MainWindow?.Clipboard != null)
            {
                await desktop.MainWindow.Clipboard.SetTextAsync(hash);
                ClipboardVerificationStatus = "✓ SHA-256 copied to clipboard.";
            }
        }
        catch { }
    }

    [RelayCommand]
    public void ToggleTheme()
    {
        IsDarkMode = !IsDarkMode;
        RequestThemeChange?.Invoke(IsDarkMode);
    }
}
