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

    public ObservableCollection<MediaFormatItem> AvailableFormats { get; } = new();

    [ObservableProperty]
    private MediaFormatItem? _selectedFormat;

    [ObservableProperty]
    private bool _isMediaFormatSelectorVisible = false;

    [ObservableProperty]
    private string _selectedFormatId = string.Empty;

    partial void OnSelectedFormatChanged(MediaFormatItem? value)
    {
        if (value == null) return;

        SelectedFormatId = value.FormatId;

        // Update file extension if switched between video/audio/image formats
        if (!string.IsNullOrWhiteSpace(FileName))
        {
            string nameWithoutExt = Path.GetFileNameWithoutExtension(FileName);
            string newExt = value.Ext.ToLowerInvariant();
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
        List<MediaFormatDto>? initialFormats = null)
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

        if (initialFormats != null && initialFormats.Count > 0)
        {
            AvailableFormats.Clear();
            foreach (var dto in initialFormats)
            {
                string sizeStr = dto.FileSize > 0 ? MediaFormatItem.FormatBytes(dto.FileSize) : "Direct Stream";
                var item = new MediaFormatItem
                {
                    FormatId = dto.FormatId,
                    Resolution = dto.Resolution,
                    Ext = dto.Ext,
                    FileSize = dto.FileSize,
                    IsAudioOnly = dto.IsAudioOnly,
                    DisplayLabel = dto.Resolution,
                    FormattedSize = sizeStr,
                    DirectUrl = dto.DirectUrl,
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

    public static string? ExtractYouTubeVideoId(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (url.Contains("/watch?v="))
        {
            var parts = url.Split("/watch?v=")[1];
            return parts.Split('&')[0].Split('#')[0];
        }
        if (url.Contains("/shorts/"))
        {
            return url.Split("/shorts/")[1].Split('/')[0].Split('?')[0].Split('#')[0];
        }
        if (url.Contains("youtu.be/"))
        {
            return url.Split("youtu.be/")[1].Split('?')[0].Split('#')[0];
        }
        return null;
    }

    private async Task<bool> TryResolveYouTubeFormatsAsync(string targetUrl)
    {
        string? videoId = ExtractYouTubeVideoId(targetUrl);
        if (string.IsNullOrEmpty(videoId)) return false;

        IsProbing = true;
        ProbeStatus = "• Resolving YouTube streams & formats dynamically...";

        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

            var reqObj = new
            {
                videoId = videoId,
                contentCheckOk = true,
                racyCheckOk = true,
                context = new
                {
                    client = new
                    {
                        clientName = "ANDROID_VR",
                        clientVersion = "1.56.21",
                        androidSdkVersion = 32
                    }
                }
            };

            var jsonContent = new StringContent(JsonSerializer.Serialize(reqObj), Encoding.UTF8, "application/json");
            var res = await client.PostAsync("https://www.youtube.com/youtubei/v1/player", jsonContent);
            if (!res.IsSuccessStatusCode)
            {
                IsProbing = false;
                return false;
            }

            var body = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (!root.TryGetProperty("streamingData", out var streamingData))
            {
                IsProbing = false;
                return false;
            }

            string title = "YouTube Video";
            if (root.TryGetProperty("videoDetails", out var videoDetails) &&
                videoDetails.TryGetProperty("title", out var titleElem))
            {
                title = titleElem.GetString() ?? title;
            }

            string cleanTitle = string.Join("_", title.Split(Path.GetInvalidFileNameChars())).Trim();

            // Find best audio stream
            string? defaultAudioUrl = null;
            long defaultAudioSize = 0;
            if (streamingData.TryGetProperty("adaptiveFormats", out var adaptiveElem))
            {
                foreach (var f in adaptiveElem.EnumerateArray())
                {
                    string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                    if (mime.Contains("audio/"))
                    {
                        string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                        if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                        {
                            long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                            string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                            if (defaultAudioUrl == null || itag == "140")
                            {
                                defaultAudioUrl = streamUrl;
                                defaultAudioSize = clen;
                            }
                        }
                    }
                }
            }

            var formatsList = new List<MediaFormatItem>();

            // Adaptive formats (1080p, 720p, 480p, etc.)
            if (streamingData.TryGetProperty("adaptiveFormats", out adaptiveElem))
            {
                foreach (var f in adaptiveElem.EnumerateArray())
                {
                    string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                    if (mime.Contains("video/"))
                    {
                        string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                        if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                        {
                            string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                            string quality = f.TryGetProperty("qualityLabel", out var ql) ? ql.GetString() ?? "" : "Video";
                            long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                            long totalSize = defaultAudioSize > 0 ? clen + defaultAudioSize : clen;
                            string ext = mime.Contains("webm") ? "webm" : "mp4";

                            formatsList.Add(new MediaFormatItem
                            {
                                FormatId = itag,
                                Resolution = quality,
                                Ext = ext,
                                FileSize = totalSize,
                                IsAudioOnly = false,
                                DisplayLabel = quality,
                                FormattedSize = totalSize > 0 ? MediaFormatItem.FormatBytes(totalSize) : "Direct Stream",
                                DirectUrl = streamUrl,
                                AudioUrl = defaultAudioUrl
                            });
                        }
                    }
                }
            }

            // Combined formats (360p, 720p with audio)
            if (streamingData.TryGetProperty("formats", out var combinedElem))
            {
                foreach (var f in combinedElem.EnumerateArray())
                {
                    string? streamUrl = f.TryGetProperty("url", out var u) ? u.GetString() : null;
                    if (!string.IsNullOrEmpty(streamUrl) && streamUrl.StartsWith("http"))
                    {
                        string itag = f.TryGetProperty("itag", out var it) ? it.ToString() : "";
                        string quality = f.TryGetProperty("qualityLabel", out var ql) ? ql.GetString() ?? "" : "360p";
                        long clen = f.TryGetProperty("contentLength", out var cl) && long.TryParse(cl.GetString(), out var s) ? s : 0;
                        string mime = f.TryGetProperty("mimeType", out var m) ? m.GetString() ?? "" : "";
                        string ext = mime.Contains("webm") ? "webm" : "mp4";

                        formatsList.Add(new MediaFormatItem
                        {
                            FormatId = itag,
                            Resolution = quality + " (Direct)",
                            Ext = ext,
                            FileSize = clen,
                            IsAudioOnly = false,
                            DisplayLabel = quality + " (Direct)",
                            FormattedSize = clen > 0 ? MediaFormatItem.FormatBytes(clen) : "Direct Stream",
                            DirectUrl = streamUrl,
                            AudioUrl = null
                        });
                    }
                }
            }

            if (formatsList.Count == 0)
            {
                IsProbing = false;
                return false;
            }

            // MP3 audio option
            formatsList.Add(new MediaFormatItem
            {
                FormatId = "bestaudio/best",
                Resolution = "Audio (MP3 / High Quality)",
                Ext = "mp3",
                FileSize = defaultAudioSize,
                IsAudioOnly = true,
                DisplayLabel = "Audio (MP3 / High Quality)",
                FormattedSize = defaultAudioSize > 0 ? MediaFormatItem.FormatBytes(defaultAudioSize) : "Direct Audio",
                DirectUrl = defaultAudioUrl,
                AudioUrl = null
            });

            // HD Thumbnail option
            formatsList.Add(new MediaFormatItem
            {
                FormatId = "thumbnail",
                Resolution = "Thumbnail (Cover Image / HD)",
                Ext = "jpg",
                FileSize = 0,
                IsAudioOnly = false,
                DisplayLabel = "Thumbnail (Cover Image / HD)",
                FormattedSize = "HD Image",
                DirectUrl = $"https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg",
                AudioUrl = null
            });

            AvailableFormats.Clear();
            foreach (var item in formatsList)
            {
                AvailableFormats.Add(item);
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

        if (await TryResolveYouTubeFormatsAsync(Url.Trim()))
        {
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

        string targetUrl = (SelectedFormat != null && !string.IsNullOrWhiteSpace(SelectedFormat.DirectUrl))
            ? SelectedFormat.DirectUrl
            : Url.Trim();

        long targetBytes = (SelectedFormat != null && SelectedFormat.FileSize > 0)
            ? SelectedFormat.FileSize
            : _probedTotalBytes;

        string sizeStr = targetBytes > 0 ? $"{((double)targetBytes / (1024 * 1024 * 1024)):F2} GB" : "Direct Stream";

        var model = new DownloadModel
        {
            Title = FileName,
            Url = targetUrl,
            AudioUrl = SelectedFormat?.AudioUrl,
            FormatId = SelectedFormatId,
            Domain = Uri.TryCreate(Url.Trim(), UriKind.Absolute, out var u) ? u.Host : "Remote Host",
            TotalBytes = targetBytes,
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
