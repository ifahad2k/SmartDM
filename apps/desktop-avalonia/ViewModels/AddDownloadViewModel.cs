using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Threading;
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
    private readonly Func<string, DownloadModel?>? _findActiveDownloadByUrl;
    private readonly Func<string, bool>? _isPathInUse;

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
    private ProbeResult? _lastProbe;
    private int _probeGeneration;

    partial void OnUrlChanged(string value)
    {
        _probeGeneration++;
        _lastProbe = null;
        _probedTotalBytes = -1;
        _probedAcceptsRanges = true;
        IsProbeSuccessful = false;
        IsProbing = false;
    }

    public ObservableCollection<MediaFormatItem> AvailableFormats { get; } = new();

    [ObservableProperty]
    private MediaFormatItem? _selectedFormat;

    [ObservableProperty]
    private bool _isMediaFormatSelectorVisible = false;

    [ObservableProperty]
    private string _selectedFormatId = string.Empty;

    private string? _authoritativeTitle;
    private string? _initialReferer;
    private string? _initialUserAgent;
    private string? _initialCookies;
    private string? _initialVideoUrl;
    private string? _initialAudioUrl;

    public static bool IsGenericOrInvalidFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string clean = name.Trim();
        string lower = Path.GetFileNameWithoutExtension(clean).ToLowerInvariant();

        // Strip notification badge e.g. "(311) " or "(1) "
        lower = System.Text.RegularExpressions.Regex.Replace(lower, @"^\(\d+\)\s*", "").Trim();

        // Strip duplicate counter suffix e.g. " (1)", " (2)", " (5)"
        lower = System.Text.RegularExpressions.Regex.Replace(lower, @"\s*\(\d+\)$", "").Trim();

        if (lower == "youtube" ||
            lower == "youtube music" ||
            lower == "watch" ||
            lower == "videoplayback" ||
            lower == "video" ||
            lower == "media stream" ||
            lower == "download" ||
            lower == "downloads" ||
            lower == "notifications" ||
            lower == "notification" ||
            lower == "facebook" ||
            lower == "pornhub" ||
            lower == "bin" ||
            lower == "player" ||
            lower == "embed" ||
            lower == "video stream" ||
            lower == "stream" ||
            lower == "kwik" ||
            lower == "megaplay" ||
            lower.Length < 2)
        {
            return true;
        }

        // Detect embed player host tokens or generic files like "file 179829 - megaplay" or "file 12345"
        if (System.Text.RegularExpressions.Regex.IsMatch(lower, @"^file[\s_-]*\d+"))
        {
            return true;
        }

        if (lower.Contains("megaplay") || lower.Contains("kwik") || lower.Contains("streamwish") ||
            lower.Contains("vidcloud") || lower.Contains("upcloud") || lower.Contains("filemoon") ||
            lower.Contains("doodstream") || lower.Contains("streamtape") || lower.Contains("mp4upload"))
        {
            if (lower.StartsWith("file") || lower.StartsWith("player") || lower.StartsWith("embed") || lower.StartsWith("video") || lower.Contains("server") || lower == "megaplay" || lower == "kwik")
            {
                return true;
            }
        }

        // Detect Facebook CDN tokens (e.g. AQPEv8rliM4qIQGkbci...)
        if (lower.StartsWith("aq") && lower.Length >= 12 && !lower.Contains(' '))
        {
            return true;
        }

        // Detect opaque random hashes or segment tokens (> 25 chars without spaces)
        if (lower.Length >= 25 && !lower.Contains(' ') && System.Text.RegularExpressions.Regex.IsMatch(lower, @"^[a-z0-9_\-\+\/\=]+$"))
        {
            return true;
        }

        return false;
    }

    partial void OnSelectedFormatChanged(MediaFormatItem? value)
    {
        if (value == null) return;

        SelectedFormatId = value.FormatId;

        if (!string.IsNullOrWhiteSpace(value.DirectUrl))
        {
            Url = value.DirectUrl;
        }

        // Update file extension if switched between video/audio/image formats
        if (!string.IsNullOrWhiteSpace(FileName))
        {
            string nameWithoutExt = Path.GetFileNameWithoutExtension(FileName);
            if (IsGenericOrInvalidFileName(nameWithoutExt))
            {
                string fallback = !IsGenericOrInvalidFileName(_authoritativeTitle) ? _authoritativeTitle! : "video";
                nameWithoutExt = string.Join("_", fallback.Split(Path.GetInvalidFileNameChars())).Trim();
            }
            string newExt = value.Ext.ToLowerInvariant();
            if (newExt == "m3u8") newExt = "mp4";
            FileName = $"{nameWithoutExt}.{newExt}";
            
            if (!string.IsNullOrWhiteSpace(SavePath))
            {
                string dir = Directory.Exists(SavePath) ? SavePath : (Path.GetDirectoryName(SavePath) ?? SavePath);
                SavePath = Path.Combine(dir, FileName);
            }
        }


        if (value.FileSize > 0)
        {
            _probedTotalBytes = value.FileSize;
            UpdateDriveSpace(SavePath);
        }

        if (value.IsAudioOnly)
        {
            Category = "Audio";
        }
        else if (value.Ext.Equals("jpg", StringComparison.OrdinalIgnoreCase) || value.Ext.Equals("png", StringComparison.OrdinalIgnoreCase) || value.Ext.Equals("webp", StringComparison.OrdinalIgnoreCase))
        {
            Category = "Images";
        }
        else
        {
            Category = "Media";
        }

        ProbeStatus = $"• Selected: {value.DisplayLabel} • {value.FormattedSize}";
    }

    public ObservableCollection<MirrorNode> MirrorNodes { get; } = new();

    public Func<string, string, Task<string?>>? RequestSaveFilePicker { get; set; }
    public event Action<DownloadModel>? DownloadCreated;
    public event Action? RequestClose;

    public AddDownloadViewModel(
        IHttpProbeService? probeService = null,
        IFileCatalogService? catalogService = null,
        string? initialUrl = null,
        string? initialFileName = null,
        string? initialFormatId = null,
        List<MediaFormatDto>? initialFormats = null,
        string? initialTitle = null,
        string? initialReferer = null,
        string? initialUserAgent = null,
        string? initialCookies = null,
        Func<string, DownloadModel?>? findActiveDownloadByUrl = null,
        Func<string, bool>? isPathInUse = null,
        string? initialVideoUrl = null,
        string? initialAudioUrl = null,
        AppSettingsModel? settings = null)
    {
        settings ??= new AppSettingsModel();
        ParallelThreads = Math.Clamp(settings.MaxParallelSegments, 1, 32);
        _probeService = probeService ?? new HttpProbeService(settings: settings);
        _catalogService = catalogService ?? new FileCatalogService();
        _findActiveDownloadByUrl = findActiveDownloadByUrl;
        _isPathInUse = isPathInUse;
        _initialReferer = initialReferer;
        _initialUserAgent = initialUserAgent ?? settings.UserAgent;
        _initialCookies = initialCookies;
        _initialVideoUrl = initialVideoUrl;
        _initialAudioUrl = initialAudioUrl;

        string downloadsDir = settings.DefaultDownloadDirectory;
        SavePath = downloadsDir;
        UpdateDriveSpace(SavePath);

        if (!IsGenericOrInvalidFileName(initialTitle))
        {
            _authoritativeTitle = initialTitle!.Trim();
        }
        else if (initialFormats != null)
        {
            var firstWithTitle = initialFormats.FirstOrDefault(f => !IsGenericOrInvalidFileName(f.Title));
            if (firstWithTitle != null)
            {
                _authoritativeTitle = firstWithTitle.Title!.Trim();
            }
        }

        if (!IsGenericOrInvalidFileName(initialFileName))
        {
            FileName = _probeService.SanitizeFileName(initialFileName!.Trim());
        }
        else if (!string.IsNullOrWhiteSpace(_authoritativeTitle) && !IsGenericOrInvalidFileName(_authoritativeTitle))
        {
            string safeTitle = string.Join("_", _authoritativeTitle.Split(Path.GetInvalidFileNameChars())).Trim();
            string ext = (!string.IsNullOrWhiteSpace(initialFormatId) && initialFormatId.Contains("bestaudio")) ? "mp3" : "mp4";
            FileName = $"{safeTitle}.{ext}";
        }
        else
        {
            string ext = (!string.IsNullOrWhiteSpace(initialFormatId) && initialFormatId.Contains("bestaudio")) ? "mp3" : "mp4";
            FileName = $"video.{ext}";
        }

        if (!string.IsNullOrWhiteSpace(FileName))
        {
            SavePath = Path.Combine(downloadsDir, FileName);
            UpdateDriveSpace(SavePath);
        }

        bool hasRealFormats = initialFormats != null && initialFormats.Count > 0 &&
            initialFormats.Any(f => Uri.TryCreate(f.DirectUrl, UriKind.Absolute, out var address) && address.Scheme is "http" or "https");

        if (hasRealFormats && initialFormats != null)
        {
            AvailableFormats.Clear();
            foreach (var dto in initialFormats)
            {
                if (!Uri.TryCreate(dto.DirectUrl, UriKind.Absolute, out var address) || address.Scheme is not ("http" or "https")) continue;
                string sizeStr = dto.FileSize > 0 ? MediaFormatItem.FormatBytes(dto.FileSize) : "Direct Stream";
                var item = new MediaFormatItem
                {
                    FormatId = dto.FormatId,
                    Resolution = dto.Resolution,
                    Ext = dto.Ext.Equals("m3u8", StringComparison.OrdinalIgnoreCase) ? "mp4" : dto.Ext,
                    FileSize = dto.FileSize,
                    IsAudioOnly = dto.IsAudioOnly,
                    DisplayLabel = dto.Resolution,
                    FormattedSize = sizeStr,
                    DirectUrl = dto.DirectUrl,
                    MediaKind = dto.MediaKind,
                    ManifestText = dto.ManifestText,
                    AudioManifestText = dto.AudioManifestText,
                    AudioUrl = dto.AudioUrl
                };
                AvailableFormats.Add(item);
            }

            IsMediaFormatSelectorVisible = true;

            MediaFormatItem? match = null;
            if (!string.IsNullOrWhiteSpace(initialFormatId))
            {
                match = AvailableFormats.FirstOrDefault(f => f.FormatId.Equals(initialFormatId, StringComparison.OrdinalIgnoreCase));
            }

            SelectedFormat = match ?? AvailableFormats.FirstOrDefault();
            if (SelectedFormat != null && SelectedFormat.FileSize > 0)
            {
                _probedTotalBytes = SelectedFormat.FileSize;
            }

            if (string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(initialUrl))
            {
                Url = initialUrl.Trim();
            }

            // If we have a YouTube URL and direct streams are not resolved yet, resolve streams dynamically
            bool isYt = !string.IsNullOrWhiteSpace(initialUrl) && YouTubeMediaResolver.IsYouTubeUrl(initialUrl);
            if (isYt && (SelectedFormat == null || string.IsNullOrWhiteSpace(SelectedFormat.DirectUrl) || SelectedFormat.DirectUrl.Contains("youtube.com") || SelectedFormat.DirectUrl.Contains("youtu.be") || IsGenericOrInvalidFileName(FileName)))
            {
                _ = TryResolveYouTubeFormatsAsync(initialUrl!.Trim());
            }
        }
        else if (!string.IsNullOrWhiteSpace(initialUrl))
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

    public static string? ExtractYouTubeVideoId(string url) => YouTubeMediaResolver.ExtractYouTubeVideoId(url);

    private async Task<bool> TryResolveYouTubeFormatsAsync(string targetUrl)
    {
        string? videoId = ExtractYouTubeVideoId(targetUrl);
        if (string.IsNullOrEmpty(videoId)) return false;

        IsProbing = true;
        ProbeStatus = "• Resolving YouTube streams & formats dynamically...";

        try
        {
            var res = await YouTubeMediaResolver.ResolveYouTubeFormatsAsync(targetUrl);
            if (!res.Success || res.Formats.Count == 0)
            {
                IsProbing = false;
                return false;
            }

            _authoritativeTitle = res.Title;
            string cleanTitle = string.Join("_", res.Title.Split(Path.GetInvalidFileNameChars())).Trim();

            AvailableFormats.Clear();
            foreach (var dto in res.Formats)
            {
                string sizeStr = dto.FileSize > 0 ? MediaFormatItem.FormatBytes(dto.FileSize) : "Direct Stream";
                AvailableFormats.Add(new MediaFormatItem
                {
                    FormatId = dto.FormatId,
                    Resolution = dto.Resolution,
                    Ext = dto.Ext,
                    FileSize = dto.FileSize,
                    IsAudioOnly = dto.IsAudioOnly,
                    DisplayLabel = dto.Resolution,
                    FormattedSize = sizeStr,
                    DirectUrl = dto.DirectUrl,
                    MediaKind = dto.MediaKind,
                    ManifestText = dto.ManifestText,
                    AudioManifestText = dto.AudioManifestText,
                    AudioUrl = dto.AudioUrl
                });
            }

            IsMediaFormatSelectorVisible = true;
            IsProbeSuccessful = true;
            IsProbing = false;

            var preferred = AvailableFormats.FirstOrDefault(f => f.Resolution.StartsWith("1080p") && !f.IsAudioOnly)
                         ?? AvailableFormats.FirstOrDefault(f => f.Resolution.StartsWith("720p") && !f.IsAudioOnly)
                         ?? AvailableFormats.FirstOrDefault();

            SelectedFormat = preferred;
            FileName = $"{cleanTitle}.{SelectedFormat?.Ext ?? "mp4"}";

            if (SelectedFormat != null && SelectedFormat.FileSize > 0)
            {
                _probedTotalBytes = SelectedFormat.FileSize;
                UpdateDriveSpace(SavePath);
            }

            ProbeStatus = $"• Found {AvailableFormats.Count} formats • Selected: {SelectedFormat?.DisplayLabel} • {SelectedFormat?.FormattedSize}";
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"YouTube format resolution error: {ex.Message}");
            IsProbing = false;
            return false;
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

        string requestedUrl = Url.Trim();
        int generation = ++_probeGeneration;
        _lastProbe = null;
        _probedTotalBytes = -1;
        _probedAcceptsRanges = true;
        IsProbeSuccessful = false;
        if (await TryResolveYouTubeFormatsAsync(requestedUrl))
        {
            return;
        }
        if (generation != _probeGeneration) return;

        IsProbing = true;
        ProbeStatus = "• Probing remote endpoint & calculating chunk matrix...";

        try
        {
            var res = await _probeService.ProbeUrlAsync(requestedUrl);
            if (generation != _probeGeneration) return;
            IsProbing = false;

            if (res.IsSuccess)
            {
                IsProbeSuccessful = true;
                if (string.IsNullOrWhiteSpace(FileName) ||
                    FileName.Equals("watch", StringComparison.OrdinalIgnoreCase) ||
                    FileName.Equals("download", StringComparison.OrdinalIgnoreCase) ||
                    !FileName.Contains("."))
                {
                    if (!string.IsNullOrWhiteSpace(res.FileName))
                    {
                        FileName = res.FileName;
                    }
                }
                _probedTotalBytes = res.TotalBytes;
                _probedAcceptsRanges = res.AcceptsRanges;
                _lastProbe = res;
                Category = !string.IsNullOrWhiteSpace(FileName) ? _probeService.DetectCategory(FileName, res.MimeType) : res.SuggestedCategory;

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
            if (generation != _probeGeneration) return;
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
        await ProcessDownloadSubmissionAsync(asQueued: false);
    }

    [RelayCommand]
    private async Task AddToQueueAsync()
    {
        await ProcessDownloadSubmissionAsync(asQueued: true);
    }

    private async Task ProcessDownloadSubmissionAsync(bool asQueued)
    {
        if (string.IsNullOrWhiteSpace(Url))
        {
            ProbeStatus = "• Cannot start transfer without a download URL.";
            return;
        }

        if (string.IsNullOrWhiteSpace(FileName))
        {
            string inferredExt = ".bin";
            if (Uri.TryCreate(Url.Trim(), UriKind.Absolute, out var parsedUri))
            {
                string pathOnly = parsedUri.AbsolutePath;
                string ext = Path.GetExtension(pathOnly);
                if (!string.IsNullOrEmpty(ext) && ext.Length <= 5)
                {
                    inferredExt = ext;
                }
            }
            FileName = "download_" + DateTime.UtcNow.ToString("yyyyMMdd_HHmmss") + inferredExt;
        }
        else if (FileName.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            FileName = Path.ChangeExtension(FileName, ".mp4");
        }

        string finalSavePath = SavePath;
        if (Directory.Exists(finalSavePath) || finalSavePath.EndsWith("\\") || finalSavePath.EndsWith("/"))
        {
            finalSavePath = Path.Combine(finalSavePath, FileName);
        }
        else if (finalSavePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
        {
            finalSavePath = Path.ChangeExtension(finalSavePath, ".mp4");
        }


        string icon = Category switch
        {
            "ISO" => "/Assets/Icons/disc-blue.png",
            "ZIP" or "Archives" => "/Assets/Icons/archive-gray.png",
            "Media" => "/Assets/Icons/image-green.png",
            "Software" => "/Assets/Icons/box-blue.png",
            _ => "/Assets/Icons/disc-blue.png"
        };

        string targetUrl = (SelectedFormat != null && !string.IsNullOrWhiteSpace(SelectedFormat.DirectUrl))
            ? SelectedFormat.DirectUrl
            : Url.Trim();

        if (YouTubeMediaResolver.IsYouTubeUrl(targetUrl) || (SelectedFormat != null && !string.IsNullOrWhiteSpace(SelectedFormat.DirectUrl) && YouTubeMediaResolver.IsYouTubeUrl(SelectedFormat.DirectUrl)))
        {
            string ytUrl = !string.IsNullOrWhiteSpace(Url) ? Url.Trim() : targetUrl;
            if (YouTubeMediaResolver.IsYouTubeUrl(ytUrl))
            {
                IsProbing = true;
                ProbeStatus = "• Resolving YouTube streams & deciphering signatures...";
                var res = await YouTubeMediaResolver.ResolveYouTubeFormatsAsync(ytUrl);
                if (!res.Success || res.Formats.Count == 0)
                {
                    IsProbing = false;
                    ProbeStatus = "Media discovery failed. Retry from the original video page.";
                    return;
                }
                if (res.Success && res.Formats.Count > 0)
                {
                    var match = res.Formats.FirstOrDefault(f => f.FormatId.Equals(SelectedFormatId, StringComparison.Ordinal));
                    if (match == null)
                    {
                        IsProbing = false;
                        ProbeStatus = "The selected format is unavailable. Refresh the format list and select again.";
                        return;
                    }
                    if (match != null)
                    {
                        targetUrl = match.DirectUrl ?? targetUrl;
                        if (SelectedFormat != null)
                        {
                            SelectedFormat.DirectUrl = match.DirectUrl;
                            SelectedFormat.AudioUrl = match.AudioUrl;
                            if (match.FileSize > 0) SelectedFormat.FileSize = match.FileSize;
                        }
                    }
                }
                IsProbing = false;
            }
        }

        long targetBytes = (SelectedFormat != null && SelectedFormat.FileSize > 0)
            ? SelectedFormat.FileSize
            : _probedTotalBytes;

        string sizeStr = targetBytes > 0 ? $"{((double)targetBytes / (1024 * 1024 * 1024)):F2} GB" : "Direct Stream";

        string? effectiveAudioUrl = (SelectedFormat != null && SelectedFormat.IsAudioOnly) ? null : (SelectedFormat?.AudioUrl ?? _initialAudioUrl);
        string? effectiveVideoUrl = SelectedFormat?.DirectUrl ?? _initialVideoUrl ?? Url.Trim();

        // Validators/capabilities describe the probed resource only, never a
        // different selected representation or a URL edited during the probe.
        var probe = _lastProbe != null && string.Equals(_lastProbe.Url, targetUrl, StringComparison.Ordinal)
            ? _lastProbe : null;

        var model = new DownloadModel
        {
            Title = FileName,
            Url = targetUrl,
            SourcePageUrl = _initialReferer ?? Url.Trim(),
            AudioUrl = effectiveAudioUrl,
            FormatId = SelectedFormatId,
            MediaKind = SelectedFormat?.MediaKind,
            ManifestText = SelectedFormat?.ManifestText,
            AudioManifestText = SelectedFormat?.AudioManifestText,
            Domain = Uri.TryCreate(Url.Trim(), UriKind.Absolute, out var u) ? u.Host : "Remote Host",
            TotalBytes = targetBytes,
            DownloadedBytes = 0,
            SpeedMbps = 0,
            ProgressPercentage = 0,
            Status = asQueued ? DownloadStatus.Queued : DownloadStatus.Active,
            Category = Category,
            IconSource = icon,
            IconBg = "#EAF2FF",
            ParallelThreads = _probedAcceptsRanges ? ParallelThreads : 1,
            ActiveMirrors = MirrorNodes.Count > 0 ? MirrorNodes.Count : 1,
            SavePath = finalSavePath,
            Referer = _initialReferer,
            UserAgent = _initialUserAgent,
            Cookies = _initialCookies,
            ETag = probe?.ETag ?? string.Empty,
            LastModified = probe?.LastModified,
            SupportsRanges = probe?.AcceptsRanges,
            PageUrl = _initialReferer,
            VideoUrl = effectiveVideoUrl,
            ExpectedSha256 = ExpectedHash?.Trim() ?? string.Empty,
            StatusDetail = _probedAcceptsRanges ? $"{ParallelThreads}-Way Sliced Transfer" : "Single-Stream Sequential",
            Subline = asQueued ? $"{sizeStr} • Waiting in Queue" : $"{sizeStr} • Starting transfer...",
            FooterDetail = "Target: " + finalSavePath,
            FooterRight = "Allocated"
        };

        // 1. Check for Active / Queued / Paused Transfers
        if (_findActiveDownloadByUrl != null)
        {
            var activeDl = _findActiveDownloadByUrl(model.Url) ?? _findActiveDownloadByUrl(Url.Trim());
            if (activeDl != null)
            {
                string progressInfo = activeDl.ProgressPercentage > 0
                    ? $"Currently {activeDl.Status} ({activeDl.ProgressPercentage:F1}% Complete - {activeDl.FormattedDownloaded} of {activeDl.FormattedTotalBytes})"
                    : $"Currently {activeDl.Status} (Transfer in progress)";

                string driveLetter = !string.IsNullOrEmpty(activeDl.SavePath) && activeDl.SavePath.Length >= 2 && activeDl.SavePath[1] == ':'
                    ? activeDl.SavePath.Substring(0, 2)
                    : "C:";

                var activeMatch = new CatalogMatch(
                    FileName: activeDl.Title ?? Path.GetFileName(activeDl.SavePath),
                    FilePath: activeDl.SavePath,
                    FileSize: activeDl.TotalBytes > 0 ? activeDl.TotalBytes : activeDl.DownloadedBytes,
                    SourceUrl: activeDl.Url,
                    MatchReason: progressInfo,
                    DriveLetter: driveLetter,
                    ExistsOnDisk: File.Exists(activeDl.SavePath)
                );

                RequestOpenDuplicateDialog?.Invoke(activeMatch, () =>
                {
                    // User opted to download again -> check target folder collision
                    CheckTargetFolderCollision(model);
                });
                return;
            }
        }

        // 2. System-wide Duplicate Detection in Catalog Database (for completed files on disk)
        var duplicate = await _catalogService.FindDuplicateAsync(model.Url, model.Title, string.IsNullOrWhiteSpace(model.ExpectedSha256) ? null : model.ExpectedSha256);
        if (duplicate != null)
        {
            RequestOpenDuplicateDialog?.Invoke(duplicate, () =>
            {
                // User opted to download again -> check target folder collision
                CheckTargetFolderCollision(model);
            });
            return;
        }

        // 3. Check destination folder collision
        CheckTargetFolderCollision(model);
    }

    private void CheckTargetFolderCollision(DownloadModel model)
    {
        string targetPath = model.SavePath;
        bool isColliding = File.Exists(targetPath) || (_isPathInUse?.Invoke(targetPath) == true);
        if (isColliding)
        {
            string autoNumPath = _catalogService.GenerateUniquePath(targetPath, _isPathInUse);
            RequestOpenFileCollisionDialog?.Invoke(targetPath, autoNumPath, (resolution, chosenPath) =>
            {
                if (resolution == Views.CollisionResolution.Cancel)
                {
                    return;
                }

                if (resolution == Views.CollisionResolution.Overwrite &&
                    (_isPathInUse?.Invoke(chosenPath) == true))
                {
                    ProbeStatus = "• Cannot replace a file used by another transfer. Choose a different filename.";
                    return;
                }

                model.SavePath = chosenPath;
                model.Title = Path.GetFileName(chosenPath);
                model.ConflictAction = resolution == Views.CollisionResolution.Overwrite
                    ? DestinationConflictAction.Replace
                    : DestinationConflictAction.DefaultNeverOverwrite;
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
