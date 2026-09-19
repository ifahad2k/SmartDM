using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class IpcDownloadEngine : IDownloadEngine, IAsyncDisposable
{
    private readonly SmartDmIpcClient _ipcClient;
    private readonly IDownloadEngine _fallbackEngine;
    private readonly IDatabaseRepository _repository;
    private readonly ISafetyScanner _safetyScanner;

    private readonly ConcurrentDictionary<string, DownloadModel> _trackedDownloads = new();
    private readonly ConcurrentDictionary<string, List<SegmentProgress>> _segmentCache = new();

    public event Action<DownloadModel>? DownloadProgressChanged;
    public event Action<DownloadModel>? DownloadStatusChanged;
    public event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;

    public bool IsConnected => _ipcClient.IsConnected;

    public IpcDownloadEngine(
        IDatabaseRepository repository,
        ISafetyScanner safetyScanner,
        SmartDmIpcClient? ipcClient = null,
        IDownloadEngine? fallbackEngine = null)
    {
        _repository = repository;
        _safetyScanner = safetyScanner;
        _ipcClient = ipcClient ?? new SmartDmIpcClient();
        _fallbackEngine = fallbackEngine ?? new DownloadEngine(_repository, _safetyScanner);

        // Forward fallback events when fallback engine is active
        _fallbackEngine.DownloadProgressChanged += dl => DownloadProgressChanged?.Invoke(dl);
        _fallbackEngine.DownloadStatusChanged += dl => DownloadStatusChanged?.Invoke(dl);
        _fallbackEngine.DownloadCompleted += (dl, scan) => DownloadCompleted?.Invoke(dl, scan);

        _ipcClient.MessageReceived += HandleIpcMessage;
        _ipcClient.Connected += () => Debug.WriteLine("[IpcDownloadEngine] Connected to Java 21 Engine Daemon.");
        _ipcClient.Disconnected += () => Debug.WriteLine("[IpcDownloadEngine] Disconnected from Java 21 Engine Daemon.");

        // Attempt initial connection asynchronously
        _ = _ipcClient.ConnectAsync();
    }

    public async Task StartDownloadAsync(DownloadModel download)
    {
        _trackedDownloads[download.Id] = download;

        if (!_ipcClient.IsConnected)
        {
            await _ipcClient.ConnectAsync();
        }

        if (_ipcClient.IsConnected)
        {
            download.Status = DownloadStatus.Active;
            download.StatusDetail = "Downloading via Java 21 Engine (32 Streams)...";
            await _repository.SaveDownloadAsync(download);
            DownloadStatusChanged?.Invoke(download);

            var cmd = new
            {
                command = "START_DOWNLOAD",
                downloadId = download.Id,
                url = download.Url,
                destinationPath = download.SavePath,
                maxConnections = download.ParallelThreads > 0 ? download.ParallelThreads : 32
            };

            bool sent = await _ipcClient.SendAsync(cmd);
            if (!sent)
            {
                await _fallbackEngine.StartDownloadAsync(download);
            }
        }
        else
        {
            await _fallbackEngine.StartDownloadAsync(download);
        }
    }

    public async Task PauseDownloadAsync(string downloadId)
    {
        if (_ipcClient.IsConnected)
        {
            await _ipcClient.SendAsync(new { command = "PAUSE_DOWNLOAD", downloadId });
            if (_trackedDownloads.TryGetValue(downloadId, out var dl))
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Paused by user";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        else
        {
            await _fallbackEngine.PauseDownloadAsync(downloadId);
        }
    }

    public async Task ResumeDownloadAsync(string downloadId, DownloadModel? existingModel = null)
    {
        if (existingModel != null)
        {
            _trackedDownloads[downloadId] = existingModel;
        }

        if (!_ipcClient.IsConnected)
        {
            await _ipcClient.ConnectAsync();
        }

        if (_ipcClient.IsConnected)
        {
            if (_trackedDownloads.TryGetValue(downloadId, out var dl))
            {
                dl.Status = DownloadStatus.Active;
                dl.StatusDetail = "Resuming via Java 21 Engine (Warm Sockets)...";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
            await _ipcClient.SendAsync(new { command = "RESUME_DOWNLOAD", downloadId });
        }
        else
        {
            await _fallbackEngine.ResumeDownloadAsync(downloadId, existingModel);
        }
    }

    public async Task CancelDownloadAsync(string downloadId)
    {
        if (_ipcClient.IsConnected)
        {
            await _ipcClient.SendAsync(new { command = "CANCEL_DOWNLOAD", downloadId });
            if (_trackedDownloads.TryGetValue(downloadId, out var dl))
            {
                dl.Status = DownloadStatus.Paused;
                dl.SpeedMbps = 0;
                dl.StatusDetail = "Cancelled";
                await _repository.SaveDownloadAsync(dl);
                DownloadStatusChanged?.Invoke(dl);
            }
        }
        else
        {
            await _fallbackEngine.CancelDownloadAsync(downloadId);
        }
    }

    public IReadOnlyList<SegmentProgress> GetSegments(string downloadId)
    {
        if (_segmentCache.TryGetValue(downloadId, out var segments) && segments.Count > 0)
        {
            return segments;
        }
        return _fallbackEngine.GetSegments(downloadId);
    }

    public void SetSpeedLimitBytesPerSec(long limitBytesPerSec)
    {
        _fallbackEngine.SetSpeedLimitBytesPerSec(limitBytesPerSec);
        if (_ipcClient.IsConnected)
        {
            _ = _ipcClient.SendAsync(new { command = "SET_RATE_LIMIT", rateLimitBytesPerSec = limitBytesPerSec });
        }
    }

    private void HandleIpcMessage(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (!root.TryGetProperty("event", out var evtProp)) return;
            string? evt = evtProp.GetString();

            if (evt == "DOWNLOAD_PROGRESS")
            {
                if (!root.TryGetProperty("downloadId", out var idProp)) return;
                string? dlId = idProp.GetString();
                if (string.IsNullOrEmpty(dlId)) return;

                if (!_trackedDownloads.TryGetValue(dlId, out var dl)) return;

                if (root.TryGetProperty("downloadedBytes", out var dlBytesProp))
                    dl.DownloadedBytes = dlBytesProp.GetInt64();

                if (root.TryGetProperty("totalBytes", out var totalBytesProp))
                {
                    long tb = totalBytesProp.GetInt64();
                    if (tb > 0) dl.TotalBytes = tb;
                }

                if (root.TryGetProperty("speedBytesPerSec", out var speedProp))
                {
                    double bytesPerSec = speedProp.GetDouble();
                    dl.SpeedMbps = bytesPerSec / (1024.0 * 1024.0);
                }

                if (dl.TotalBytes > 0)
                {
                    dl.ProgressPercentage = Math.Clamp(((double)dl.DownloadedBytes / dl.TotalBytes) * 100.0, 0.0, 100.0);
                    if (dl.SpeedMbps > 0.01)
                    {
                        long remaining = dl.TotalBytes - dl.DownloadedBytes;
                        dl.EtaSeconds = (int)(remaining / (dl.SpeedMbps * 1024 * 1024));
                    }
                }

                // Parse segments
                if (root.TryGetProperty("segments", out var segsProp) && segsProp.ValueKind == JsonValueKind.Array)
                {
                    var segList = new List<SegmentProgress>();
                    foreach (var s in segsProp.EnumerateArray())
                    {
                        var sp = new SegmentProgress
                        {
                            SegmentIndex = s.GetProperty("index").GetInt32(),
                            StartByte = s.GetProperty("startByte").GetInt64(),
                            EndByte = s.GetProperty("endByte").GetInt64(),
                            DownloadedBytes = s.GetProperty("downloadedBytes").GetInt64(),
                            IsActive = s.GetProperty("isActive").GetBoolean(),
                            IsCompleted = s.GetProperty("isCompleted").GetBoolean(),
                            SpeedMbps = s.GetProperty("speedMbps").GetDouble()
                        };
                        segList.Add(sp);
                    }
                    _segmentCache[dlId] = segList;
                }

                DownloadProgressChanged?.Invoke(dl);
            }
            else if (evt == "DOWNLOAD_STATUS")
            {
                if (!root.TryGetProperty("downloadId", out var idProp)) return;
                string? dlId = idProp.GetString();
                if (string.IsNullOrEmpty(dlId)) return;

                if (!_trackedDownloads.TryGetValue(dlId, out var dl)) return;

                string? status = root.TryGetProperty("status", out var stProp) ? stProp.GetString() : null;

                if (status == "COMPLETED")
                {
                    dl.Status = DownloadStatus.Completed;
                    if (dl.TotalBytes > 0) dl.DownloadedBytes = dl.TotalBytes;
                    dl.ProgressPercentage = 100.0;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = "Completed";
                    _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                    DownloadCompleted?.Invoke(dl, new SafetyScanResult { IsClean = true });
                }
                else if (status == "PAUSED")
                {
                    dl.Status = DownloadStatus.Paused;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = "Paused";
                    _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
                else if (status == "CANCELED")
                {
                    dl.Status = DownloadStatus.Paused;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = "Cancelled";
                    _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
                else if (status == "ERROR")
                {
                    dl.Status = DownloadStatus.Paused;
                    dl.SpeedMbps = 0;
                    dl.StatusDetail = root.TryGetProperty("error", out var errProp) ? errProp.GetString() ?? "Error" : "Error";
                    _repository.SaveDownloadAsync(dl);
                    DownloadStatusChanged?.Invoke(dl);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to parse IPC message: {ex.Message}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _ipcClient.DisposeAsync();
    }
}
