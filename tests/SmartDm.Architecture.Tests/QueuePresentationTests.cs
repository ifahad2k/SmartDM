using System.Collections.Generic;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class QueuePresentationTests
{
    [Fact]
    public void CompactQueueFields_FollowLiveDownloadState()
    {
        var download = new DownloadModel
        {
            Status = DownloadStatus.Active,
            SpeedMbps = 3.8,
            EtaSeconds = 120,
            TotalBytes = 512 * 1024 * 1024
        };
        var changes = new List<string>();
        download.PropertyChanged += (_, args) => changes.Add(args.PropertyName ?? string.Empty);

        download.SpeedMbps = 4.2;
        download.EtaSeconds = 90;
        Assert.Equal("4.2 MB/s", download.QueueSpeedText);
        Assert.Equal("90s", download.QueueEtaText);
        Assert.Contains(nameof(download.QueueSpeedText), changes);
        Assert.Contains(nameof(download.QueueEtaText), changes);

        changes.Clear();
        download.Status = DownloadStatus.Paused;
        Assert.Equal("Paused", download.StatusLabel);
        Assert.Equal("—", download.QueueSpeedText);
        Assert.Equal("—", download.QueueEtaText);
        Assert.Contains(nameof(download.StatusLabel), changes);
        Assert.Contains(nameof(download.QueueSpeedText), changes);
    }

    [Fact]
    public void SimpleQueue_IsDefault_AndAdvancedViewCanBeRestored()
    {
        var viewModel = new MainViewModel(isDemoMode: true);
        Assert.False(viewModel.ShowAdvancedLayout);
        Assert.Equal("Advanced view", viewModel.LayoutButtonText);

        viewModel.ToggleAdvancedLayoutCommand.Execute(null);
        Assert.True(viewModel.ShowAdvancedLayout);
        Assert.Equal("Simple view", viewModel.LayoutButtonText);

        viewModel.ToggleAdvancedLayoutCommand.Execute(null);
        Assert.False(viewModel.ShowAdvancedLayout);
    }
}
