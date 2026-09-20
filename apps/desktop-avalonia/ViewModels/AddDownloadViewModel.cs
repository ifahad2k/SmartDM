using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Net.NetworkInformation;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class AddDownloadViewModel : ViewModelBase
{
    private readonly IHttpProbeService _probeService;
    private readonly IFileCatalogService _catalogService;

    public IFileCatalogService CatalogService => _catalogService;
    public event Action<CatalogMatch, Action>? RequestOpenDuplicateDialog;
    public event Action<string, string, Action<Views.CollisionResolution, string>>? RequestOpenFileCollisionDialog;

    [ObservableProperty]
    private string _url = string.Empty;

    [ObservableProperty]
    private string _fileName = string.Empty;

    [ObservableProperty]
    private string _category = "General";

    [ObservableProperty]
    private string _savePath = string.Empty;

    [ObservableProperty]
    private string _targetDriveDescription = "Target Drive: Calculating...";

    [ObservableProperty]
    private string _availableFreeSpaceFormatted = "Available Free Space: Inspecting...";

    partial void OnSavePathChanged(string value) => UpdateDriveSpace(value);

    [ObservableProperty]
    private int _parallelThreads = 16;

    [ObservableProperty]
    private string _expectedHash = string.Empty;

    [ObservableProperty]
    private string _probeStatus = "• Enter URL and click Probe to analyze endpoint...";

    [ObservableProperty]
    private bool _isProbeSuccessful = false;

    [ObservableProperty]
    private bool _isProbing = false;

    private long _probedTotalBytes = -1;
    private bool _probedAcceptsRanges = true;

    public ObservableCollection<MirrorNode> MirrorNodes { get; } = new();

    public Func<string, string, Task<string?>>? RequestSaveFilePicker { get; set; }
    public event Action<DownloadModel>? DownloadCreated;
    public event Action? RequestClose;

    public AddDownloadViewModel(IHttpProbeService? probeService = null, IFileCatalogService? catalogService = null, string? initialUrl = null, string? initialFileName = null)
    {
        _probeService = probeService ?? new HttpProbeService();
        _catalogService = catalogService ?? new FileCatalogService();

        string downloadsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        SavePath = downloadsDir;
        UpdateDriveSpace(SavePath);

        if (!string.IsNullOrWhiteSpace(initialFileName))
        {
            FileName = initialFileName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(initialUrl))
        {
            Url = initialUrl.Trim();
            _ = ProbeUrlAsync();
        }
    }

    [RelayCommand]
    public async Task BrowseDestinationAsync()
    {
        if (RequestSaveFilePicker != null)
        {
            string defaultDir = !string.IsNullOrWhiteSpace(SavePath)
                ? (Directory.Exists(SavePath) ? SavePath : Path.GetDirectoryName(SavePath) ?? "")
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

            string defaultFileName = !string.IsNullOrWhiteSpace(FileName) ? FileName : "download.bin";

            var selected = await RequestSaveFilePicker.Invoke(defaultDir, defaultFileName);
            if (!string.IsNullOrWhiteSpace(selected))
            {
                SavePath = selected;
                FileName = Path.GetFileName(selected);
                UpdateDriveSpace(selected);
            }
        }
    }

    public void UpdateDriveSpace(string path)
    {
        try
        {
            string checkPath = path;
            if (string.IsNullOrWhiteSpace(checkPath))
            {
                checkPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            }

            string fullPath = Path.GetFullPath(checkPath);
            string? root = Path.GetPathRoot(fullPath);
            if (!string.IsNullOrEmpty(root))
            {
                var drive = new DriveInfo(root);
                if (drive.IsReady)
                {
                    double freeGb = (double)drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);
                    string freeStr = freeGb >= 1000.0
                        ? $"{freeGb / 1024.0:F1} TB"
                        : $"{freeGb:F1} GB";

                    string driveLabel = !string.IsNullOrWhiteSpace(drive.VolumeLabel)
                        ? drive.VolumeLabel
                        : (drive.DriveType == DriveType.Fixed ? "Local Disk" : drive.DriveType.ToString());

                    TargetDriveDescription = $"Target Drive: {drive.Name.TrimEnd('\\')} ({driveLabel}, {drive.DriveFormat})";

                    if (_probedTotalBytes > 0 && drive.AvailableFreeSpace < _probedTotalBytes)
                    {
                        AvailableFreeSpaceFormatted = $"Low Space: {freeStr} free (Needs {((double)_probedTotalBytes / (1024 * 1024 * 1024)):F2} GB)";
                    }
                    else
                    {
                        AvailableFreeSpaceFormatted = $"Available Free Space: {freeStr} (Safe)";
                    }
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Drive check error: {ex.Message}");
        }

        TargetDriveDescription = "Target Drive: Local Storage";
        AvailableFreeSpaceFormatted = "Available Free Space: Ready";
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
    private async Task ProbeUrlAsync()
    {
        if (string.IsNullOrWhiteSpace(Url))
        {
            ProbeStatus = "• Please enter a valid HTTP/HTTPS URL.";
            IsProbeSuccessful = false;
            return;
        }

        IsProbing = true;
        ProbeStatus = "• Probing remote endpoint & calculating chunk matrix...";

        try
        {
            var res = await _probeService.ProbeUrlAsync(Url.Trim());
            IsProbing = false;

            if (res.IsSuccess)
            {
                IsProbeSuccessful = true;
                FileName = res.FileName;
                _probedTotalBytes = res.TotalBytes;
                _probedAcceptsRanges = res.AcceptsRanges;
                Category = res.SuggestedCategory;

                string rangeStr = res.AcceptsRanges ? "Range Requests Supported" : "Single Stream Only";
                ProbeStatus = $"• {res.StatusCode} OK • {res.HttpVersion} • {res.FormattedSize} • {rangeStr} • {res.LatencyMs}ms ping";

                // Mirror nodes
                MirrorNodes.Clear();
                MirrorNodes.Add(new MirrorNode
                {
                    Name = "Primary Node",
                    Url = Url.Trim(),
                    PingMs = (int)Math.Max(1, res.LatencyMs),
                    IsPrimary = true
                });

                if (!string.IsNullOrWhiteSpace(FileName))
                {
                    string defaultDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                    SavePath = Path.Combine(defaultDir, FileName);
                }
            }
            else
            {
                IsProbeSuccessful = false;
                ProbeStatus = $"• Probe Error: {res.ErrorMessage}";
            }
        }
        catch (Exception ex)
        {
            IsProbing = false;
            IsProbeSuccessful = false;
            ProbeStatus = $"• Probe failed: {ex.Message}";
        }
    }

    [RelayCommand]
    private void PasteClipboard()
    {
        // When user clicks paste, trigger probe if text is present
        if (!string.IsNullOrWhiteSpace(Url))
        {
            _ = ProbeUrlAsync();
        }
    }

    [RelayCommand]
    private async Task StartDownloadAsync()
    {
        if (string.IsNullOrWhiteSpace(Url))
        {
            ProbeStatus = "• Cannot start transfer without a download URL.";
            return;
        }

        if (string.IsNullOrWhiteSpace(FileName))
        {
            FileName = "download_" + DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
        }

        string finalSavePath = SavePath;
        if (Directory.Exists(finalSavePath) || finalSavePath.EndsWith("\\") || finalSavePath.EndsWith("/"))
        {
            finalSavePath = Path.Combine(finalSavePath, FileName);
        }

        string icon = Category switch
        {
            "ISO" => "/Assets/Icons/disc-blue.png",
            "ZIP" or "Archives" => "/Assets/Icons/archive-gray.png",
            "Media" => "/Assets/Icons/image-green.png",
            "Software" => "/Assets/Icons/box-blue.png",
            _ => "/Assets/Icons/disc-blue.png"
        };

        string sizeStr = _probedTotalBytes > 0 ? $"{((double)_probedTotalBytes / (1024 * 1024 * 1024)):F2} GB" : "Direct Stream";

        var model = new DownloadModel
        {
            Title = FileName,
            Url = Url.Trim(),
            Domain = Uri.TryCreate(Url.Trim(), UriKind.Absolute, out var u) ? u.Host : "Remote Host",
            TotalBytes = _probedTotalBytes,
            DownloadedBytes = 0,
            SpeedMbps = 0,
            ProgressPercentage = 0,
            Status = DownloadStatus.Queued,
            Category = Category,
            IconSource = icon,
            IconBg = "#EAF2FF",
            ParallelThreads = _probedAcceptsRanges ? ParallelThreads : 1,
            ActiveMirrors = MirrorNodes.Count > 0 ? MirrorNodes.Count : 1,
            SavePath = finalSavePath,
            StatusDetail = _probedAcceptsRanges ? $"{ParallelThreads}-Way Sliced Transfer" : "Single-Stream Sequential",
            Subline = $"{sizeStr} • Waiting in Queue",
            FooterDetail = "Target: " + finalSavePath,
            FooterRight = "Allocated"
        };

        // 1. System-wide Duplicate Detection in Catalog Database
        var duplicate = await _catalogService.FindDuplicateAsync(model.Url, model.Title);
        if (duplicate != null)
        {
            RequestOpenDuplicateDialog?.Invoke(duplicate, () =>
            {
                // User opted to download again -> check target folder collision
                CheckTargetFolderCollision(model);
            });
            return;
        }

        // 2. Check destination folder collision
        CheckTargetFolderCollision(model);
    }

    private void CheckTargetFolderCollision(DownloadModel model)
    {
        string targetPath = model.SavePath;
        if (File.Exists(targetPath))
        {
            string autoNumPath = _catalogService.GenerateUniquePath(targetPath);
            RequestOpenFileCollisionDialog?.Invoke(targetPath, autoNumPath, (resolution, chosenPath) =>
            {
                if (resolution == Views.CollisionResolution.Cancel)
                {
                    return;
                }

                model.SavePath = chosenPath;
                model.Title = Path.GetFileName(chosenPath);
                FinalizeDownload(model);
            });
            return;
        }

        FinalizeDownload(model);
    }

    private void FinalizeDownload(DownloadModel model)
    {
        _ = _catalogService.IndexFileAsync(model.SavePath, model.Url);
        DownloadCreated?.Invoke(model);
        RequestClose?.Invoke();
    }

    [RelayCommand]
    private void Cancel()
    {
        RequestClose?.Invoke();
    }
}
