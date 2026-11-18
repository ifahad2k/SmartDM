using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
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
    private readonly IQueueManager _queueManager;
    private readonly bool _isDemoMode;

    public int CurrentProcessId => Environment.ProcessId;
    public ISettingsService SettingsService => _settingsService;
    public IFileCatalogService CatalogService => _catalogService;
    public IQueueManager QueueManager => _queueManager;

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
    private string _throttlingStatus = "HTTP Speed Limit: OFF";

    private long _lastAppliedSavedSpeedLimit = long.MinValue;

    [ObservableProperty]
    private string _storageStatus = "Storage: Calculating...";

    [ObservableProperty]
    private bool _isDarkMode = false;

    [ObservableProperty]
    private bool _showAdvancedLayout;

    public string LayoutButtonText => ShowAdvancedLayout ? "Simple view" : "Advanced view";
    public string QueueHeading => CurrentQueueFilter switch
    {
        "Active" => "Active Downloads",
        "Completed" => "Completed",
        "Queue" or "Scheduled" => "Download Queue",
        _ => "All downloads"
    };

    public string QueueSubline => CurrentQueueFilter switch
    {
        "Active" => $"{ActiveCount} active transfer{(ActiveCount == 1 ? "" : "s")}",
        "Completed" => $"{CompletedCount} completed file{(CompletedCount == 1 ? "" : "s")}",
        "Queue" or "Scheduled" => $"{ActiveCount} downloading (max 4 concurrent) • {QueuedCount} waiting in queue",
        _ => $"{AllCount} total download{(AllCount == 1 ? "" : "s")}"
    };

    partial void OnShowAdvancedLayoutChanged(bool value) => OnPropertyChanged(nameof(LayoutButtonText));

    [RelayCommand]
    private void ToggleAdvancedLayout() => ShowAdvancedLayout = !ShowAdvancedLayout;

    [ObservableProperty]
    private string _currentQueueFilter = "All"; // "All", "Active", "Completed", "Queue", "Scheduled"

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
    private int _queuedCount = 0;

    [ObservableProperty]
    private int _queueCount = 0;

    [ObservableProperty]
    private DownloadModel? _selectedDownload;

    [ObservableProperty]
    private bool _isDetailsPaneOpen = false;

    [ObservableProperty]
    private string _clipboardVerificationStatus = string.Empty;

    public bool IsAllQueueSelected => CurrentQueueFilter == "All";
    public bool IsActiveQueueSelected => CurrentQueueFilter == "Active";
    public bool IsCompletedQueueSelected => CurrentQueueFilter == "Completed";
    public bool IsQueueSelected => CurrentQueueFilter is "Queue" or "Scheduled";
    public bool IsScheduledQueueSelected => CurrentQueueFilter is "Queue" or "Scheduled";

    private readonly List<DownloadModel> _allMasterDownloads = new();

    public ObservableCollection<DownloadModel> Downloads { get; } = new();
    public ObservableCollection<CategoryItem> Categories { get; } = new();
    public ObservableCollection<ThreadMetric> ActiveThreads { get; } = new();
    public ObservableCollection<double> SparklineHistory { get; } = new();

    public event Action<string?, string?, string?, List<MediaFormatDto>?, string?, string?, string?, string?, string?, string?, string?>? RequestOpenAddDialog;
    public event Action<BrowserBatchDownloadRequest>? RequestOpenBatchDialog;
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
        IDownloadEngine engine,
        IDatabaseRepository repository,
        IHttpProbeService probeService,
        ISafetyScanner safetyScanner,
        ILocalIpcService ipcService,
        ISettingsService settingsService,
        IFileCatalogService catalogService,
        IQueueManager queueManager,
        bool isDemoMode = false)
    {
        _isDemoMode = isDemoMode;
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _safetyScanner = safetyScanner ?? throw new ArgumentNullException(nameof(safetyScanner));
        _engine = engine ?? throw new ArgumentNullException(nameof(engine));
        _probeService = probeService ?? throw new ArgumentNullException(nameof(probeService));
        _ipcService = ipcService ?? throw new ArgumentNullException(nameof(ipcService));
        _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));
        _catalogService = catalogService ?? throw new ArgumentNullException(nameof(catalogService));
        _queueManager = queueManager ?? throw new ArgumentNullException(nameof(queueManager));

        // Only explicitly indexed downloads enter the catalog.

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

    private static Bitmap? LoadIcon(string filename)
    {
        try
        {
            var uri = new Uri($"avares://SmartDm.Desktop.Avalonia/Assets/Icons/{filename}");
            return new Bitmap(AssetLoader.Open(uri));
        }
        catch
        {
            return null;
        }
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
        AddCat("Archives", "Archives & Disk Images", "archive-gray.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Archives")));
        AddCat("Media", "Media & Video Streams", "media-gray.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Media")));
        AddCat("Audio", "Music & Soundtracks", "pulse-blue.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Audio")));
        AddCat("Software", "Software & Installers", "box-blue.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Software")));
        AddCat("Code", "Packages & Source Repos", "code-gray.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Code")));
        AddCat("Documents", "Documents & E-Books", "file-gray.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Documents")));
        AddCat("AI", "AI Weights & Datasets", "matrix-green.png", _allMasterDownloads.Count(d => MatchesCategory(d, "AI")));
        AddCat("Torrents", "Torrents & Magnet Links", "link-blue.png", _allMasterDownloads.Count(d => MatchesCategory(d, "Torrents")));
        AddCat("Quarantine", "Quarantined Threats", "danger-red.png", _allMasterDownloads.Count(d => d.Status == DownloadStatus.Quarantined));
    }

    private async Task InitializeProductionAsync()
    {
        try
        {
            App.LogStartup("InitializeProductionAsync ENTER");
            await _repository.InitializeAsync();
            App.LogStartup("_repository.InitializeAsync DONE");
            await _settingsService.LoadAppSettingsAsync();
            App.LogStartup("_settingsService.LoadAppSettingsAsync DONE");

            // 1. Load real downloads from SQLite
            var stored = await _repository.GetAllDownloadsAsync();
            App.LogStartup($"Loaded {stored.Count} downloads from SQLite");
            foreach (var dl in stored)
            {
                WireDownloadCallbacks(dl);
                _allMasterDownloads.Add(dl);
            }

            // Reconcile staging directories: preserve valid partials for active/resumable downloads
            var activeOrResumableIds = stored
                .Where(d => d.Status != DownloadStatus.Completed && !PreviewTransfers.IsPreview(d))
                .Select(d => d.Id)
                .ToHashSet();
            DownloadEngine.CleanupOrphanStagingDirectories(activeOrResumableIds, TimeSpan.FromHours(24));

            // 2. Wire engine events
            _engine.DownloadProgressChanged += OnEngineProgressChanged;
            _engine.DownloadStatusChanged += OnEngineStatusChanged;
            _engine.DownloadCompleted += OnEngineCompleted;

            // 3. Initialize QueueManager
            _queueManager.Initialize(
                _engine,
                _repository,
                _catalogService,
                _allMasterDownloads,
                WireDownloadCallbacks,
                () => Dispatcher.UIThread.Post(() =>
                {
                    UpdateCounts();
                    ApplyFilters();
                    RefreshEngineMetrics();
                }));

            // 4. Start local browser IPC daemon
            _ipcService.DownloadRequestedFromBrowser += OnBrowserDownloadRequested;
            _ipcService.BatchDownloadRequestedFromBrowser += OnBrowserBatchDownloadRequested;
            _ipcService.WindowRestoreRequested += OnWindowRestoreRequested;
            App.LogStartup("Starting _ipcService...");
            await _ipcService.StartAsync();
            App.LogStartup("_ipcService.StartAsync DONE");

            // 5. Trigger Queue Processing for any pending queued items
            _queueManager.TriggerQueueProcessing();

            Dispatcher.UIThread.Post(() =>
            {
                UpdateCounts();
                ApplyFilters();
                RefreshEngineMetrics();
                App.LogStartup("Dispatcher.UIThread initial update DONE");
            });
            App.LogStartup("InitializeProductionAsync EXIT");
        }
        catch (Exception ex)
        {
            App.LogStartup($"FATAL EXCEPTION in InitializeProductionAsync: {ex}");
        }
    }

    private void WireDownloadCallbacks(DownloadModel dl)
    {
        dl.IconBitmap = LoadIcon(Path.GetFileName(dl.IconSource ?? "disc-blue.png"));
        dl.OnOpenMonitor = d => RequestOpenMonitor?.Invoke(d);
        dl.OnOpenInspector = d => RequestOpenInspector?.Invoke(d);
        if (_isDemoMode || PreviewTransfers.IsPreview(dl))
        {
            dl.IsPreview = true;
            dl.OnPause = dl.OnResume = dl.OnCancel = d => d.StatusDetail = PreviewTransfers.DisabledMessage;
            dl.OnDelete = d => RequestOpenDeleteConfirm?.Invoke(d);
            dl.OnProperties = d => ShowProperties(d);
            dl.OnSelect = d => SelectDownload(d);
            return;
        }
        dl.OnPause = async d =>
        {
            try
            {
                bool wasActive = d.Status == DownloadStatus.Active;
                d.Status = DownloadStatus.Paused;
                d.SpeedMbps = 0;
                d.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(d);
                RefreshEngineMetrics();
                UpdateCounts();
                ApplyFilters();
                if (wasActive)
                {
                    await _engine.PauseDownloadAsync(d.Id);
                }
                _queueManager.TriggerQueueProcessing();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[MainViewModel.OnPause] Error: {ex.Message}");
            }
        };
        dl.OnResume = async d =>
        {
            try
            {
                if (d.QueuePosition <= 0)
                {
                    lock (_allMasterDownloads)
                    {
                        int maxPos = _allMasterDownloads.Where(x => x.QueuePosition > 0).Select(x => x.QueuePosition).DefaultIfEmpty(0).Max();
                        d.QueuePosition = maxPos + 1;
                    }
                }
                d.Status = DownloadStatus.Queued;
                d.StatusDetail = "Queued • Waiting for transfer slot";
                d.Subline = "Waiting in Queue";
                await _repository.SaveDownloadAsync(d);
                RefreshEngineMetrics();
                UpdateCounts();
                ApplyFilters();
                _queueManager.TriggerQueueProcessing();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[MainViewModel.OnResume] Error: {ex.Message}");
            }
        };
        dl.OnCancel = async d =>
        {
            try
            {
                bool wasActive = d.Status == DownloadStatus.Active;
                d.Status = DownloadStatus.Paused;
                d.SpeedMbps = 0;
                d.StatusDetail = "Cancelled";
                await _repository.SaveDownloadAsync(d);
                RefreshEngineMetrics();
                UpdateCounts();
                ApplyFilters();
                if (wasActive)
                {
                    await _engine.CancelDownloadAsync(d.Id);
                }
                _queueManager.TriggerQueueProcessing();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[MainViewModel.OnCancel] Error: {ex.Message}");
            }
        };
        dl.OnDelete = d => RequestOpenDeleteConfirm?.Invoke(d);
        dl.OnOpenFile = d => { if (d.IsCompletedFile) OpenFileNative(d.SavePath); };
        dl.OnOpenFolder = d => OpenFolderNative(d.SavePath);
        dl.OnOpenWith = d => OpenWith(d);
        dl.OnMoveRename = d => MoveRename(d);
        dl.OnRedownload = d => Redownload(d);
        dl.OnRefreshUrl = d => RefreshUrl(d);
        dl.OnProperties = d => ShowProperties(d);
        dl.OnSelect = d => SelectDownload(d);
    }

    private readonly ConcurrentDictionary<string, DateTime> _recentBrowserRequests = new();
    private readonly List<BrowserDownloadRequest> _incomingRequestBuffer = new();
    private readonly object _bufferLock = new();
    private CancellationTokenSource? _bufferCts;

    private void OnBrowserDownloadRequested(BrowserDownloadRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.Url))
        {
            var now = DateTime.UtcNow;
            if (_recentBrowserRequests.TryGetValue(req.Url, out var lastTime) && (now - lastTime).TotalMilliseconds < 250)
            {
                // Suppress rapid hardware double-click bounce only (< 250ms)
                return;
            }
            _recentBrowserRequests[req.Url] = now;
        }

        lock (_bufferLock)
        {
            _incomingRequestBuffer.Add(req);
            _bufferCts?.Cancel();
            _bufferCts = new CancellationTokenSource();
            var token = _bufferCts.Token;

            _ = Task.Delay(350, token).ContinueWith(t =>
            {
                if (t.IsCanceled) return;

                List<BrowserDownloadRequest> batchToProcess;
                lock (_bufferLock)
                {
                    batchToProcess = new List<BrowserDownloadRequest>(_incomingRequestBuffer);
                    _incomingRequestBuffer.Clear();
                }

                if (batchToProcess.Count == 1)
                {
                    var single = batchToProcess[0];
                    Dispatcher.UIThread.Post(() =>
                    {
                        RequestOpenAddDialog?.Invoke(single.Url, single.FileName, single.FormatId, single.Formats, single.Title, single.Referer, single.UserAgent, single.Cookies, single.VideoUrl, single.AudioUrl, single.Mime);
                    });
                }
                else if (batchToProcess.Count > 1)
                {
                    var batchReq = new BrowserBatchDownloadRequest
                    {
                        BatchTitle = batchToProcess[0].Title ?? "Batch Download",
                        Referer = batchToProcess[0].Referer,
                        PageUrl = batchToProcess[0].PageUrl,
                        Cookies = batchToProcess[0].Cookies,
                        UserAgent = batchToProcess[0].UserAgent,
                        IsAudio = batchToProcess.All(b => b.FormatId != null && b.FormatId.Contains("audio", StringComparison.OrdinalIgnoreCase)),
                        Items = batchToProcess
                    };

                    Dispatcher.UIThread.Post(async () =>
                    {
                        App.RestoreCurrentMainWindow();
                        if (RequestOpenBatchDialog != null)
                        {
                            RequestOpenBatchDialog.Invoke(batchReq);
                        }
                        else
                        {
                            CurrentQueueFilter = "Queue";
                            await _queueManager.EnqueueBatchAsync(batchReq);
                        }
                    });
                }
            }, TaskScheduler.Default);
        }
    }

    private void OnBrowserBatchDownloadRequested(BrowserBatchDownloadRequest batch)
    {
        Dispatcher.UIThread.Post(async () =>
        {
            App.RestoreCurrentMainWindow();
            if (RequestOpenBatchDialog != null)
            {
                RequestOpenBatchDialog.Invoke(batch);
            }
            else
            {
                CurrentQueueFilter = "Queue";
                await _queueManager.EnqueueBatchAsync(batch);
            }
        });
    }

    private void OnWindowRestoreRequested()
    {
        Dispatcher.UIThread.Post(() =>
        {
            App.RestoreCurrentMainWindow();
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
            ActiveSocketCount = Math.Max(1, activeDl.ParallelThreads);
            ActiveTaskTitle = activeDl.Title ?? "Downloading...";
            SocketBufferStatus = "Direct Async FileChannel (32 Buffers Active)";
            TotalEtaFormatted = activeDl.FormattedEta;
            EngineSubline = $"Active | {ActiveSocketCount} Streams | Speed {activeDl.FormattedSpeed}";
            UpstreamSpeedFormatted = "Not measured";

            var segs = _engine.GetSegments(activeDl.Id);
            while (ActiveThreads.Count < segs.Count)
            {
                ActiveThreads.Add(new ThreadMetric
                {
                    ThreadIndex = ActiveThreads.Count + 1,
                    SpeedMbps = 0,
                    IsActive = true
                });
            }
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
        long savedLimit = settings is { EnableSpeedLimit: true, DefaultSpeedLimitKbps: > 0 }
            ? (long)settings.DefaultSpeedLimitKbps * 1024
            : 0;
        if (savedLimit != _lastAppliedSavedSpeedLimit)
        {
            _engine.SetSpeedLimitBytesPerSec(savedLimit);
            _lastAppliedSavedSpeedLimit = savedLimit;
        }
        if (settings != null && settings.EnableSpeedLimit)
        {
            BandwidthCapFormatted = $"{settings.DefaultSpeedLimitKbps} KB/s";
            BandwidthThrottlerBadge = $"Cap {settings.DefaultSpeedLimitKbps} KB/s";
            ThrottlingStatus = $"HTTP Speed Limit: {settings.DefaultSpeedLimitKbps} KB/s";
        }
        else
        {
            BandwidthCapFormatted = "Unlimited";
            BandwidthThrottlerBadge = "Unlimited Pipe";
            ThrottlingStatus = "HTTP Speed Limit: OFF";
        }
    }

    private long _lastMainProgressUiTick = 0;

    private void OnEngineProgressChanged(DownloadModel updated)
    {
        long now = Stopwatch.GetTimestamp();
        if (Stopwatch.GetElapsedTime(_lastMainProgressUiTick, now).TotalMilliseconds < 250)
        {
            return;
        }
        _lastMainProgressUiTick = now;

        Dispatcher.UIThread.Post(() =>
        {
            var existing = _allMasterDownloads.FirstOrDefault(d => d.Id == updated.Id);
            if (existing == null) return;
            if (existing.Status == DownloadStatus.Paused || updated.Status == DownloadStatus.Paused) return;

            if (!ReferenceEquals(existing, updated))
            {
                if (existing.DownloadedBytes != updated.DownloadedBytes) existing.DownloadedBytes = updated.DownloadedBytes;
                if (existing.TotalBytes != updated.TotalBytes) existing.TotalBytes = updated.TotalBytes;
                if (Math.Abs(existing.SpeedMbps - updated.SpeedMbps) > 0.05) existing.SpeedMbps = updated.SpeedMbps;
                if (Math.Abs(existing.ProgressPercentage - updated.ProgressPercentage) >= 0.1) existing.ProgressPercentage = updated.ProgressPercentage;
                if (existing.EtaSeconds != updated.EtaSeconds) existing.EtaSeconds = updated.EtaSeconds;
                if (existing.Status != updated.Status) existing.Status = updated.Status;
                if (existing.StatusDetail != updated.StatusDetail) existing.StatusDetail = updated.StatusDetail;
            }

            RefreshEngineMetrics();

            // Sparkline history update
            double totalSpeed = _allMasterDownloads.Where(d => d.Status == DownloadStatus.Active).Sum(d => d.SpeedMbps);
            SparklineHistory.Add(totalSpeed);
            if (SparklineHistory.Count > 30) SparklineHistory.RemoveAt(0);
        }, DispatcherPriority.Background);
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
        }, DispatcherPriority.Background);
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
        bool preview = _isDemoMode || PreviewTransfers.IsPreview(dl);
        try
        {
            if (!preview && (dl.Status == DownloadStatus.Active || dl.Status == DownloadStatus.Queued))
            {
                await _engine.CancelDownloadAsync(dl.Id);
            }
        }
        catch (Exception)
        {
            Debug.WriteLine("Could not stop transfer; deletion was not performed.");
            return;
        }

        if (deleteFileOnDisk && !preview)
            await DownloadDestinationService.DeleteConfirmedFileAsync(dl);

        _allMasterDownloads.Remove(dl);
        if (!_isDemoMode) await _repository.DeleteDownloadAsync(dl.Id);

        if (SelectedDownload == dl)
        {
            CloseDetailsPane();
        }

        UpdateCounts();
        ApplyFilters();
        RefreshEngineMetrics();
        if (!preview) _queueManager.TriggerQueueProcessing();
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
            if (OperatingSystem.IsWindows())
            {
                if (File.Exists(filePath))
                {
                    Process.Start("explorer.exe", $"/select,\"{filePath}\"");
                }
                else if (Directory.Exists(filePath))
                {
                    Process.Start(new ProcessStartInfo(filePath) { UseShellExecute = true });
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
            else if (OperatingSystem.IsMacOS())
            {
                if (File.Exists(filePath))
                {
                    Process.Start("open", $"-R \"{filePath}\"");
                }
                else if (Directory.Exists(filePath))
                {
                    Process.Start("open", $"\"{filePath}\"");
                }
                else
                {
                    string? dir = Path.GetDirectoryName(filePath);
                    if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                    {
                        Process.Start("open", $"\"{dir}\"");
                    }
                }
            }
            else
            {
                string target = Directory.Exists(filePath) ? filePath : (Path.GetDirectoryName(filePath) ?? filePath);
                if (Directory.Exists(target))
                {
                    Process.Start("xdg-open", $"\"{target}\"");
                }
            }
        }
        catch { }
    }

    private void InitializeDemoData()
    {
        _allMasterDownloads.AddRange(DesignData.DemoDownloads.Create(LoadIcon));
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
        ScheduledCount = _allMasterDownloads.Count(d => (d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Paused || d.Status == DownloadStatus.Failed) && !d.IsStorage);
        QueuedCount = _allMasterDownloads.Count(d => d.Status == DownloadStatus.Queued && !d.IsStorage);
        QueueCount = _allMasterDownloads.Count(d => (d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Active) && !d.IsStorage);

        foreach (var c in Categories)
        {
            c.Count = c.Id switch
            {
                "All" => AllCount,
                "Quarantine" => _allMasterDownloads.Count(d => d.Status == DownloadStatus.Quarantined),
                _ => _allMasterDownloads.Count(d => MatchesCategory(d, c.Id))
            };
        }
    }

    public DownloadModel? FindActiveDownloadByUrl(string? url)
    {
        lock (_allMasterDownloads) return DownloadLookup.FindActiveByUrl(_allMasterDownloads, url);
    }

    public bool IsPathInUse(string? path)
    {
        lock (_allMasterDownloads) return DownloadLookup.IsPathInUse(_allMasterDownloads, path);
    }

    public void AddNewDownload(DownloadModel newDl)
    {

        // Smart guard: If the path is actively in use by another running/queued download, auto-number it
        if (IsPathInUse(newDl.SavePath))
        {
            bool activeTransferUsingPath = false;
            lock (_allMasterDownloads)
            {
                activeTransferUsingPath = _allMasterDownloads.Any(d =>
                    (d.Status == DownloadStatus.Active || d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Paused) &&
                    !string.IsNullOrWhiteSpace(d.SavePath) &&
                    string.Equals(Path.GetFullPath(d.SavePath), Path.GetFullPath(newDl.SavePath), StringComparison.OrdinalIgnoreCase));
            }

            if (activeTransferUsingPath)
            {
                newDl.SavePath = _catalogService.GenerateUniquePath(newDl.SavePath, IsPathInUse);
                newDl.Title = Path.GetFileName(newDl.SavePath);
                newDl.FooterDetail = "Target: " + newDl.SavePath;
            }
        }

        if (_isDemoMode || PreviewTransfers.IsPreview(newDl))
        {
            newDl.IsPreview = true;
            newDl.StatusDetail = PreviewTransfers.DisabledMessage;
            WireDownloadCallbacks(newDl);
            _allMasterDownloads.Insert(0, newDl);
            UpdateCounts();
            ApplyFilters();
            return;
        }

        WireDownloadCallbacks(newDl);
        _allMasterDownloads.Insert(0, newDl);
        _ = _catalogService.IndexFileAsync(newDl.SavePath, newDl.Url);

        if (newDl.Status != DownloadStatus.Queued)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await _engine.StartDownloadAsync(newDl);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AddNewDownload] StartDownloadAsync error: {ex.Message}");
                }
            });
        }
        else
        {
            _ = _repository.SaveDownloadAsync(newDl);
            _queueManager.TriggerQueueProcessing();
        }

        UpdateCounts();
        ApplyFilters();
    }

    partial void OnSearchQueryChanged(string value) => ApplyFilters();
    partial void OnCurrentQueueFilterChanged(string value)
    {
        OnPropertyChanged(nameof(QueueHeading));
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
        string category = d.Category?.Trim() ?? string.Empty;
        string ext = Path.GetExtension(d.SavePath ?? d.Title ?? string.Empty).ToLowerInvariant();

        return cat switch
        {
            "Archives" => category.Equals("Archives", StringComparison.OrdinalIgnoreCase) ||
                          category.Equals("ISO", StringComparison.OrdinalIgnoreCase) ||
                          category.Equals("ZIP", StringComparison.OrdinalIgnoreCase) ||
                          ext is ".zip" or ".rar" or ".7z" or ".tar" or ".gz" or ".tgz" or ".bz2" or ".tbz2" or ".xz" or ".txz" or ".zst" or ".iso" or ".img" or ".vmdk" or ".qcow2" or ".cab",

            "Media" => category.Equals("Media", StringComparison.OrdinalIgnoreCase) ||
                       category.Equals("MP4", StringComparison.OrdinalIgnoreCase) ||
                       category.Equals("PNG", StringComparison.OrdinalIgnoreCase) ||
                       ext is ".mp4" or ".mkv" or ".webm" or ".avi" or ".mov" or ".wmv" or ".flv" or ".ts" or ".m4v" or ".3gp" or
                              ".png" or ".jpg" or ".jpeg" or ".webp" or ".gif" or ".svg" or ".ico" or ".bmp" or ".avif" or ".tiff",

            "Audio" => category.Equals("Audio", StringComparison.OrdinalIgnoreCase) ||
                       category.Equals("MP3", StringComparison.OrdinalIgnoreCase) ||
                       category.Equals("FLAC", StringComparison.OrdinalIgnoreCase) ||
                       ext is ".mp3" or ".flac" or ".wav" or ".aac" or ".ogg" or ".opus" or ".m4a" or ".wma",

            "Software" => category.Equals("Software", StringComparison.OrdinalIgnoreCase) ||
                          category.Equals("EXE", StringComparison.OrdinalIgnoreCase) ||
                          category.Equals("DMG", StringComparison.OrdinalIgnoreCase) ||
                          ext is ".exe" or ".msi" or ".apk" or ".dmg" or ".pkg" or ".deb" or ".rpm" or ".appx" or ".msix" or ".appimage",

            "Code" => category.Equals("Code", StringComparison.OrdinalIgnoreCase) ||
                      category.Equals("GIT", StringComparison.OrdinalIgnoreCase) ||
                      category.Equals("JAR", StringComparison.OrdinalIgnoreCase) ||
                      ext is ".whl" or ".jar" or ".gem" or ".patch" or ".json" or ".xml" or ".html" or ".css" or ".js" or ".py" or ".sh" or ".yaml" or ".yml" or ".sql" or ".wasm",

            "Documents" => category.Equals("Documents", StringComparison.OrdinalIgnoreCase) ||
                           category.Equals("PDF", StringComparison.OrdinalIgnoreCase) ||
                           category.Equals("DOC", StringComparison.OrdinalIgnoreCase) ||
                           ext is ".pdf" or ".doc" or ".docx" or ".xlsx" or ".xls" or ".pptx" or ".ppt" or ".txt" or ".csv" or ".tsv" or ".rtf" or ".epub" or ".mobi" or ".odt" or ".ods" or ".odp",

            "AI" => category.Equals("AI", StringComparison.OrdinalIgnoreCase) ||
                    ext is ".gguf" or ".safetensors" or ".onnx" or ".pt" or ".pth" ||
                    (d.Title != null && d.Title.Contains("LLM", StringComparison.OrdinalIgnoreCase)),

            "Torrents" => category.Equals("Torrents", StringComparison.OrdinalIgnoreCase) ||
                          category.Equals("TORRENT", StringComparison.OrdinalIgnoreCase) ||
                          ext is ".torrent",

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
        else if (CurrentQueueFilter is "Queue" or "Scheduled")
        {
            query = query.Where(d => (d.Status == DownloadStatus.Active || d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Paused) && !d.IsStorage);
        }

        if (CurrentCategoryFilter != "All")
        {
            query = query.Where(d => MatchesCategory(d, CurrentCategoryFilter));
        }

        if (CurrentChipFilter == "Active")
        {
            query = query.Where(d => d.Status == DownloadStatus.Active && !d.IsStorage);
        }
        else if (CurrentChipFilter == "Queue")
        {
            query = query.Where(d => (d.Status == DownloadStatus.Active || d.Status == DownloadStatus.Queued) && !d.IsStorage);
        }
        else if (CurrentChipFilter == "Completed")
        {
            query = query.Where(d => d.Status == DownloadStatus.Completed && !d.IsStorage);
        }
        else if (CurrentChipFilter == "Video")
        {
            query = query.Where(d => MatchesCategory(d, "Media"));
        }
        else if (CurrentChipFilter == "Archives")
        {
            query = query.Where(d => MatchesCategory(d, "Archives"));
        }
        else if (CurrentChipFilter == "Blocked")
        {
            query = query.Where(d => d.Status == DownloadStatus.Quarantined);
        }

        if (CurrentQueueFilter is "Queue" or "Scheduled" || CurrentChipFilter == "Queue")
        {
            query = query.OrderBy(d => d.Status switch
            {
                DownloadStatus.Active => 0,
                DownloadStatus.Queued => 1,
                _ => 2
            }).ThenBy(d => d.QueuePosition > 0 ? d.QueuePosition : int.MaxValue);
        }

        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            var term = SearchQuery.Trim().ToLowerInvariant();
            query = query.Where(d => d.Title.ToLowerInvariant().Contains(term) || d.Domain.ToLowerInvariant().Contains(term));
        }

        var list = query.ToList();
        // In-place collection synchronization to eliminate UI thread card rebuilds
        for (int i = Downloads.Count - 1; i >= 0; i--)
        {
            if (!list.Contains(Downloads[i]))
            {
                Downloads.RemoveAt(i);
            }
        }
        for (int i = 0; i < list.Count; i++)
        {
            var item = list[i];
            if (i >= Downloads.Count)
            {
                Downloads.Add(item);
            }
            else if (!ReferenceEquals(Downloads[i], item))
            {
                int existingIdx = Downloads.IndexOf(item);
                if (existingIdx >= 0)
                {
                    Downloads.Move(existingIdx, i);
                }
                else
                {
                    Downloads.Insert(i, item);
                }
            }
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
        else if (CurrentQueueFilter is "Queue" or "Scheduled")
        {
            EmptyStateTitle = "Download Queue Is Empty";
            EmptyStateSubtitle = "Queued downloads and playlist tracks will appear here.";
            iconName = "inbox-gray.png";
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
    public void OpenAddDialog(string? initialUrl = null) => RequestOpenAddDialog?.Invoke(initialUrl, null, null, null, null, null, null, null, null, null, null);

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

    public Task<string> MoveDownloadAsync(DownloadModel model, string directory, string name) => _engine.MoveDownloadAsync(model, directory, name);

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
            _ = Task.Run(async () =>
            {
                try { await _engine.StartDownloadAsync(target); }
                catch (Exception ex) { Debug.WriteLine($"[Redownload] StartDownloadAsync error: {ex.Message}"); }
            });
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

    [RelayCommand]
    public async Task PauseAllAsync()
    {
        await _queueManager.PauseAllQueueAsync();
        UpdateCounts();
        ApplyFilters();
        RefreshEngineMetrics();
    }

    [RelayCommand]
    public async Task ResumeAllAsync()
    {
        await _queueManager.ResumeAllQueueAsync();
        UpdateCounts();
        ApplyFilters();
        RefreshEngineMetrics();
    }

    public IRelayCommand PauseQueueCommand => PauseAllCommand;
    public IRelayCommand ResumeQueueCommand => ResumeAllCommand;

    [RelayCommand]
    public async Task ClearQueueAsync()
    {
        await _queueManager.ClearQueueAsync();
        UpdateCounts();
        ApplyFilters();
        RefreshEngineMetrics();
    }

    [RelayCommand]
    public void OpenQueueFolder()
    {
        if (SelectedDownload != null && !string.IsNullOrWhiteSpace(SelectedDownload.SavePath))
        {
            OpenFolderNative(SelectedDownload.SavePath);
            return;
        }

        DownloadModel? representative;
        lock (_allMasterDownloads)
        {
            representative = _allMasterDownloads.FirstOrDefault(d =>
                (d.Status == DownloadStatus.Queued || d.Status == DownloadStatus.Active || d.Status == DownloadStatus.Completed) &&
                !string.IsNullOrWhiteSpace(d.SavePath));
        }

        if (representative != null && !string.IsNullOrWhiteSpace(representative.SavePath))
        {
            string? dir = Path.GetDirectoryName(representative.SavePath);
            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
            {
                OpenFolderNative(dir);
                return;
            }
        }

        string defaultDownloads = !string.IsNullOrWhiteSpace(_settingsService?.CurrentSettings?.DefaultDownloadDirectory) &&
                                  Directory.Exists(_settingsService.CurrentSettings.DefaultDownloadDirectory)
            ? _settingsService.CurrentSettings.DefaultDownloadDirectory
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

        OpenFolderNative(defaultDownloads);
    }

    [RelayCommand]
    public async Task OpenBatchGrabberAsync()
    {
        var batch = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Batch Download",
            IsAudio = false
        };

        if (global::Avalonia.Application.Current?.ApplicationLifetime is global::Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop &&
            desktop.MainWindow?.Clipboard != null)
        {
            try
            {
                string? text = await desktop.MainWindow.Clipboard.GetTextAsync();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    var lines = text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    int idx = 1;
                    foreach (var line in lines)
                    {
                        if (Uri.TryCreate(line, UriKind.Absolute, out _))
                        {
                            batch.Items.Add(new BrowserDownloadRequest
                            {
                                Url = line,
                                Title = $"Item {idx++}"
                            });
                        }
                    }
                }
            }
            catch { }
        }

        if (batch.Items.Count == 0)
        {
            batch.Items.Add(new BrowserDownloadRequest
            {
                Url = "https://",
                Title = "Batch Task 1"
            });
        }

        if (RequestOpenBatchDialog != null)
        {
            RequestOpenBatchDialog.Invoke(batch);
        }
        else
        {
            CurrentQueueFilter = "Queue";
            await _queueManager.EnqueueBatchAsync(batch);
        }
    }
}
