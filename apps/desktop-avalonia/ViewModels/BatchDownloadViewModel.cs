using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class BatchItemViewModel : ObservableObject
{
    private bool _isSelected = true;
    public bool IsSelected
    {
        get => _isSelected;
        set
        {
            if (SetProperty(ref _isSelected, value))
            {
                SelectionChanged?.Invoke();
            }
        }
    }

    public Action? SelectionChanged { get; set; }

    public int Index { get; set; }
    public string FormattedIndex => $"#{Index:D2}";
    public string Title { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public string? FormatId { get; set; }
    public string? Referer { get; set; }
    public string? PageUrl { get; set; }
    public string? Cookies { get; set; }
    public string? UserAgent { get; set; }

    private string _formatBadge = "MP3";
    public string FormatBadge
    {
        get => _formatBadge;
        set => SetProperty(ref _formatBadge, value);
    }
}

public partial class BatchDownloadViewModel : ViewModelBase
{
    private readonly BrowserBatchDownloadRequest _batchRequest;
    private readonly AppSettingsModel? _settings;

    private readonly string _baseDir;
    private bool _isCustomDestinationFolder = false;
    private bool _isUpdatingDerivedFolder = false;
    private bool _isBulkUpdating = false;

    [ObservableProperty]
    private string _batchTitle = string.Empty;

    [ObservableProperty]
    private string _destinationFolder = string.Empty;

    [ObservableProperty]
    private string _targetDriveDescription = "Target Drive: Local Disk";

    [ObservableProperty]
    private string _availableFreeSpaceFormatted = "Available Free Space: Ready";

    [ObservableProperty]
    private bool _isAudio = true;

    public bool IsVideo
    {
        get => !IsAudio;
        set => IsAudio = !value;
    }

    [ObservableProperty]
    private int _totalItemCount;

    [ObservableProperty]
    private int _selectedItemCount;

    [ObservableProperty]
    private string _selectionSummary = string.Empty;

    [ObservableProperty]
    private bool _canStart = true;

    public ObservableCollection<BatchItemViewModel> Items { get; } = new();

    public Func<string, Task<string?>>? RequestFolderPicker { get; set; }
    public event Action<BrowserBatchDownloadRequest, bool>? BatchConfirmed;
    public event Action? RequestClose;

    public BatchDownloadViewModel(
        BrowserBatchDownloadRequest batchRequest,
        AppSettingsModel? settings = null)
    {
        _batchRequest = batchRequest ?? throw new ArgumentNullException(nameof(batchRequest));
        _settings = settings;

        _batchTitle = !string.IsNullOrWhiteSpace(batchRequest.PlaylistTitle)
            ? batchRequest.PlaylistTitle
            : (!string.IsNullOrWhiteSpace(batchRequest.BatchTitle) ? batchRequest.BatchTitle : "Batch Download");

        _isAudio = batchRequest.IsAudio;

        _baseDir = !string.IsNullOrWhiteSpace(_settings?.DefaultDownloadDirectory) && Directory.Exists(_settings.DefaultDownloadDirectory)
            ? _settings.DefaultDownloadDirectory
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

        if (!string.IsNullOrWhiteSpace(batchRequest.DestinationFolder))
        {
            _destinationFolder = batchRequest.DestinationFolder;
            _isCustomDestinationFolder = true;
        }
        else
        {
            string folderSafeName = QueueManager.SanitizeFolderName(_batchTitle);
            if (string.IsNullOrWhiteSpace(folderSafeName))
            {
                folderSafeName = "Batch Download";
            }
            _destinationFolder = Path.Combine(_baseDir, folderSafeName);
            _isCustomDestinationFolder = false;
        }

        string badge = _isAudio ? "MP3" : "MP4";

        if (batchRequest.Items != null)
        {
            int idx = 1;
            foreach (var item in batchRequest.Items)
            {
                if (string.IsNullOrWhiteSpace(item.Url)) continue;
                string title = !string.IsNullOrWhiteSpace(item.Title)
                    ? item.Title.Trim()
                    : $"Item {idx}";

                var itemVm = new BatchItemViewModel
                {
                    Index = idx++,
                    Title = title,
                    Url = item.Url.Trim(),
                    FileName = item.FileName,
                    FormatId = item.FormatId,
                    FormatBadge = badge,
                    Referer = item.Referer ?? batchRequest.Referer,
                    PageUrl = item.PageUrl ?? batchRequest.PageUrl,
                    Cookies = item.Cookies ?? batchRequest.Cookies,
                    UserAgent = item.UserAgent ?? batchRequest.UserAgent
                };
                itemVm.SelectionChanged = OnItemSelectionChanged;
                Items.Add(itemVm);
            }
        }

        UpdateSelectionMetrics();
        UpdateDriveSpace(_destinationFolder);
    }

    private void OnItemSelectionChanged()
    {
        if (!_isBulkUpdating)
        {
            UpdateSelectionMetrics();
        }
    }

    private void UpdateSelectionMetrics()
    {
        TotalItemCount = Items.Count;
        SelectedItemCount = Items.Count(i => i.IsSelected);
        SelectionSummary = $"{SelectedItemCount} of {TotalItemCount} items selected";
        CanStart = SelectedItemCount > 0 && !string.IsNullOrWhiteSpace(DestinationFolder);
    }

    partial void OnBatchTitleChanged(string value)
    {
        if (!_isCustomDestinationFolder)
        {
            string folderSafeName = QueueManager.SanitizeFolderName(value);
            if (string.IsNullOrWhiteSpace(folderSafeName))
            {
                folderSafeName = "Batch Download";
            }
            _isUpdatingDerivedFolder = true;
            try
            {
                DestinationFolder = Path.Combine(_baseDir, folderSafeName);
            }
            finally
            {
                _isUpdatingDerivedFolder = false;
            }
        }
    }

    partial void OnIsAudioChanged(bool value)
    {
        OnPropertyChanged(nameof(IsVideo));
        string badge = value ? "MP3" : "MP4";
        string newExt = value ? ".mp3" : ".mp4";
        string newFormat = value ? "bestaudio/best" : "1080p";

        foreach (var item in Items)
        {
            item.FormatBadge = badge;
            item.FormatId = newFormat;
            if (!string.IsNullOrWhiteSpace(item.FileName))
            {
                item.FileName = Path.ChangeExtension(item.FileName, newExt);
            }
            else if (!string.IsNullOrWhiteSpace(item.Title))
            {
                item.FileName = $"{item.Title}{newExt}";
            }
        }
    }

    partial void OnDestinationFolderChanged(string value)
    {
        if (!_isUpdatingDerivedFolder)
        {
            _isCustomDestinationFolder = true;
        }
        UpdateDriveSpace(value);
        UpdateSelectionMetrics();
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
                    AvailableFreeSpaceFormatted = $"Available Free Space: {freeStr} (Ready)";
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Drive check error: {ex.Message}");
        }

        TargetDriveDescription = "Target Drive: Local Storage";
        AvailableFreeSpaceFormatted = "Available Free Space: Ready";
    }

    [RelayCommand]
    public void SelectAll()
    {
        _isBulkUpdating = true;
        try
        {
            foreach (var item in Items)
            {
                item.IsSelected = true;
            }
        }
        finally
        {
            _isBulkUpdating = false;
        }
        UpdateSelectionMetrics();
    }

    [RelayCommand]
    public void DeselectAll()
    {
        _isBulkUpdating = true;
        try
        {
            foreach (var item in Items)
            {
                item.IsSelected = false;
            }
        }
        finally
        {
            _isBulkUpdating = false;
        }
        UpdateSelectionMetrics();
    }

    [RelayCommand]
    public async Task BrowseDestinationAsync()
    {
        if (RequestFolderPicker != null)
        {
            var picked = await RequestFolderPicker.Invoke(DestinationFolder);
            if (!string.IsNullOrWhiteSpace(picked))
            {
                _isCustomDestinationFolder = true;
                DestinationFolder = picked;
                UpdateDriveSpace(picked);
            }
        }
    }

    [RelayCommand]
    public void StartBatchDownload()
    {
        ConfirmBatch(startPaused: false);
    }

    [RelayCommand]
    public void AddToQueue()
    {
        ConfirmBatch(startPaused: true);
    }

    private void ConfirmBatch(bool startPaused)
    {
        var selected = Items.Where(i => i.IsSelected).ToList();
        if (selected.Count == 0)
        {
            return;
        }

        string ext = IsAudio ? ".mp3" : ".mp4";

        _batchRequest.BatchTitle = string.IsNullOrWhiteSpace(BatchTitle) ? "Batch Download" : BatchTitle.Trim();
        _batchRequest.PlaylistTitle = _batchRequest.BatchTitle;
        _batchRequest.DestinationFolder = string.IsNullOrWhiteSpace(DestinationFolder) ? null : DestinationFolder.Trim();
        _batchRequest.IsAudio = IsAudio;
        _batchRequest.Items = selected.Select(i => new BrowserDownloadRequest
        {
            Url = i.Url,
            Title = i.Title,
            FileName = !string.IsNullOrWhiteSpace(i.FileName) ? i.FileName : $"{i.Title}{ext}",
            FormatId = IsAudio ? "bestaudio/best" : (i.FormatId ?? "1080p"),
            Referer = i.Referer,
            PageUrl = i.PageUrl,
            Cookies = i.Cookies,
            UserAgent = i.UserAgent
        }).ToList();

        BatchConfirmed?.Invoke(_batchRequest, startPaused);
        RequestClose?.Invoke();
    }

    [RelayCommand]
    public void Cancel()
    {
        RequestClose?.Invoke();
    }
}
