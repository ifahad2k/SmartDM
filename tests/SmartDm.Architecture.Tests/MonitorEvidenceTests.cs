using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class MonitorEvidenceTests
{
    [Theory]
    [InlineData(DownloadStatus.Active, 8.0)]
    [InlineData(DownloadStatus.Paused, 0.0)]
    [InlineData(DownloadStatus.Failed, 0.0)]
    public void OpeningMonitor_DoesNotFabricateHistoryOrActiveSegments(DownloadStatus status, double speed)
    {
        using var monitor = new TransferMonitorViewModel(new DownloadModel { Status = status, SpeedMbps = speed });
        Assert.False(monitor.ShowDetails);
        Assert.All(monitor.ThreadMetrics, segment => Assert.False(segment.IsActive));
        Assert.Equal(speed > 0 ? new[] { speed } : Array.Empty<double>(), monitor.SparklineHistory);
        monitor.ToggleDetailsCommand.Execute(null);
        monitor.ToggleDetailsCommand.Execute(null);
        Assert.Equal(speed > 0 ? 1 : 0, monitor.SparklineHistory.Count);
    }

    [Fact]
    public void CompactMonitor_PreservesActualSegmentSnapshot()
    {
        using var monitor = new TransferMonitorViewModel(new DownloadModel { ParallelThreads = 1 }, new SnapshotEngine());
        Assert.False(monitor.ShowDetails);
        var segment = Assert.Single(monitor.ThreadMetrics);
        Assert.Equal(50, segment.Progress);
        Assert.True(segment.IsActive);
        Assert.Equal(2.5, segment.SpeedMbps);
    }

    private sealed class SnapshotEngine : IDownloadEngine
    {
        public event Action<DownloadModel>? DownloadProgressChanged { add { } remove { } }
        public event Action<DownloadModel>? DownloadStatusChanged { add { } remove { } }
        public event Action<DownloadModel, SafetyScanResult>? DownloadCompleted { add { } remove { } }
        public IReadOnlyList<SegmentProgress> GetSegments(string id) => new[]
        {
            new SegmentProgress { StartByte = 0, EndByte = 99, DownloadedBytes = 50, SpeedMbps = 2.5, IsActive = true }
        };
        public Task StartDownloadAsync(DownloadModel download) => Task.CompletedTask;
        public Task PauseDownloadAsync(string id) => Task.CompletedTask;
        public Task ResumeDownloadAsync(string id, DownloadModel? download = null) => Task.CompletedTask;
        public Task CancelDownloadAsync(string id) => Task.CompletedTask;
        public void SetSpeedLimitBytesPerSec(long limit) { }
    }
}
