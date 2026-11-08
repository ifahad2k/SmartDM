using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class BatchQueueManagerTests
{
    private sealed class TestDownloadEngine : IDownloadEngine
    {
#pragma warning disable CS0067
        public event Action<DownloadModel>? DownloadProgressChanged;
        public event Action<DownloadModel>? DownloadStatusChanged;
        public event Action<DownloadModel, SafetyScanResult>? DownloadCompleted;
#pragma warning restore CS0067

        public List<string> StartedDownloadIds { get; } = new();
        public List<string> PausedDownloadIds { get; } = new();

        public IReadOnlyList<SegmentProgress> GetSegments(string id) => Array.Empty<SegmentProgress>();

        public Task StartDownloadAsync(DownloadModel download)
        {
            lock (StartedDownloadIds)
            {
                StartedDownloadIds.Add(download.Id);
            }
            return Task.CompletedTask;
        }

        public Task PauseDownloadAsync(string id)
        {
            lock (PausedDownloadIds)
            {
                PausedDownloadIds.Add(id);
            }
            return Task.CompletedTask;
        }

        public Task ResumeDownloadAsync(string id, DownloadModel? download = null) => Task.CompletedTask;
        public Task CancelDownloadAsync(string id) => Task.CompletedTask;
        public void SetSpeedLimitBytesPerSec(long limit) { }

        public void FireCompleted(DownloadModel dl)
        {
            dl.Status = DownloadStatus.Completed;
            DownloadCompleted?.Invoke(dl, new SafetyScanResult { IsClean = true });
        }
    }

    [Fact]
    public async Task EnqueueBatchAsync_With100PlusItems_EnqueuesAllAndRunsAtMost4Concurrently()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(
            engine,
            repo,
            null!,
            masterList,
            dl => { },
            () => { }
        );

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "YouTube Music Top Hits",
            PlaylistTitle = "Top Hits",
            PlaylistId = "PL_TOP_HITS",
            IsAudio = true,
            Referer = "https://music.youtube.com/playlist?list=PL_TOP_HITS"
        };

        const int totalTracks = 110;
        for (int i = 1; i <= totalTracks; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=track_{i}",
                Title = $"Track #{i:D3}",
                FileName = $"Track #{i:D3}.mp3",
                FormatId = "bestaudio/best"
            });
        }

        await queueManager.EnqueueBatchAsync(batchReq);

        // Allow background queue pump to dispatch initial 4
        await Task.Delay(100);

        // 1. Verify all 110 items are enqueued in master list
        Assert.Equal(totalTracks, masterList.Count);

        // 2. Verify queue positions are assigned in order
        var sortedByPos = masterList.OrderBy(d => d.QueuePosition).ToList();
        Assert.Equal(1, sortedByPos.First().QueuePosition);
        Assert.Equal(totalTracks, sortedByPos.Last().QueuePosition);

        // 3. Verify exactly 4 downloads are started concurrently
        int activeCount = masterList.Count(d => d.Status == DownloadStatus.Active);
        Assert.Equal(4, activeCount);
        Assert.Equal(4, engine.StartedDownloadIds.Count);

        // 4. Verify the remaining 106 items remain queued
        int queuedCount = masterList.Count(d => d.Status == DownloadStatus.Queued);
        Assert.Equal(totalTracks - 4, queuedCount);
    }

    [Fact]
    public async Task EngineCompletion_PumpsNextQueuedItem()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(
            engine,
            repo,
            null!,
            masterList,
            dl => { },
            () => { }
        );

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Batch 10",
            IsAudio = true
        };

        for (int i = 1; i <= 10; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=song_{i}",
                Title = $"Song {i}",
                FormatId = "bestaudio/best"
            });
        }

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(100);

        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));

        // Complete the first active download
        var firstActive = masterList.First(d => d.Status == DownloadStatus.Active);
        engine.FireCompleted(firstActive);

        // Allow queue pump to process completion
        await Task.Delay(100);

        // Still exactly 4 active downloads running, plus 1 completed
        Assert.Equal(1, masterList.Count(d => d.Status == DownloadStatus.Completed));
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(5, engine.StartedDownloadIds.Count);
    }

    [Fact]
    public async Task PauseAllAndResumeAll_ControlsQueueExecution()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(
            engine,
            repo,
            null!,
            masterList,
            dl => { },
            () => { }
        );

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Playlist Pause Test",
            IsAudio = true
        };

        for (int i = 1; i <= 8; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=item_{i}",
                Title = $"Item {i}",
                FormatId = "bestaudio/best"
            });
        }

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(100);

        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Queued));

        // 1. Pause All
        await queueManager.PauseAllQueueAsync();
        Assert.Equal(8, masterList.Count(d => d.Status == DownloadStatus.Paused));
        Assert.Equal(4, engine.PausedDownloadIds.Count);

        // 2. Resume All
        await queueManager.ResumeAllQueueAsync();
        await Task.Delay(100);

        // Should have 4 active and 4 queued again
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Queued));
    }

    [Fact]
    public async Task TransferScheduler_DefaultAllows4ConcurrentPerHost()
    {
        var scheduler = new TransferScheduler();
        const string host = "googlevideo.com";

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        // Acquire 4 leases concurrently
        var lease1 = await scheduler.EnterAsync(host, cts.Token);
        var lease2 = await scheduler.EnterAsync(host, cts.Token);
        var lease3 = await scheduler.EnterAsync(host, cts.Token);
        var lease4 = await scheduler.EnterAsync(host, cts.Token);

        Assert.NotNull(lease1);
        Assert.NotNull(lease2);
        Assert.NotNull(lease3);
        Assert.NotNull(lease4);

        // A 5th acquisition must block/timeout
        using var fastCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(80));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await scheduler.EnterAsync(host, fastCts.Token);
        });

        // Releasing 1 lease allows a 5th lease to proceed immediately
        lease1.Dispose();

        using var proceedCts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        var lease5 = await scheduler.EnterAsync(host, proceedCts.Token);
        Assert.NotNull(lease5);

        lease2.Dispose();
        lease3.Dispose();
        lease4.Dispose();
        lease5.Dispose();
    }

    [Fact]
    public async Task SuccessiveBatchEnqueues_MaintainFIFO_MonotonicQueuePositions_AndStrictConcurrency()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(
            engine,
            repo,
            null!,
            masterList,
            dl => { },
            () => { }
        );

        // 1. Enqueue Batch 1 (5 items)
        var batch1 = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Playlist One",
            IsAudio = true
        };
        for (int i = 1; i <= 5; i++)
        {
            batch1.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=p1_song_{i}",
                Title = $"P1 Song {i}"
            });
        }
        await queueManager.EnqueueBatchAsync(batch1);
        await Task.Delay(80);

        Assert.Equal(5, masterList.Count);
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(1, masterList.Count(d => d.Status == DownloadStatus.Queued));

        // 2. Enqueue Batch 2 (5 items)
        var batch2 = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Playlist Two",
            IsAudio = true
        };
        for (int i = 1; i <= 5; i++)
        {
            batch2.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=p2_song_{i}",
                Title = $"P2 Song {i}"
            });
        }
        await queueManager.EnqueueBatchAsync(batch2);
        await Task.Delay(80);

        Assert.Equal(10, masterList.Count);

        // 3. Verify positions are strictly monotonic 1..10 with NO duplicates or interleaving
        var positions = masterList.Select(d => d.QueuePosition).ToList();
        Assert.Equal(Enumerable.Range(1, 10).ToList(), positions);

        // 4. Concurrency still strictly at 4 active
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(6, masterList.Count(d => d.Status == DownloadStatus.Queued));

        // All 4 active items are from Batch 1
        var activeIds = masterList.Where(d => d.Status == DownloadStatus.Active).Select(d => d.Title).ToList();
        for (int i = 1; i <= 4; i++)
        {
            Assert.Contains($"P1 Song {i}", activeIds);
        }

        // 5. Complete an active item: next item pumped must be P1 Song 5 (not Batch 2)
        var firstActive = masterList.First(d => d.Status == DownloadStatus.Active);
        engine.FireCompleted(firstActive);
        await Task.Delay(80);

        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        var p1Song5 = masterList.First(d => d.Title == "P1 Song 5");
        Assert.Equal(DownloadStatus.Active, p1Song5.Status);

        // 6. Complete another active item: now the first item of Batch 2 (P2 Song 1, position 6) starts
        var secondActive = masterList.First(d => d.Status == DownloadStatus.Active && d != p1Song5);
        engine.FireCompleted(secondActive);
        await Task.Delay(80);

        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        var p2Song1 = masterList.First(d => d.Title == "P2 Song 1");
        Assert.Equal(DownloadStatus.Active, p2Song1.Status);
    }

    [Fact]
    public async Task FailedItem_PumpsNextQueuedItem()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(
            engine,
            repo,
            null!,
            masterList,
            dl => { },
            () => { }
        );

        var batch = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Failure Test",
            IsAudio = true
        };
        for (int i = 1; i <= 6; i++)
        {
            batch.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=fail_test_{i}",
                Title = $"Track {i}"
            });
        }
        await queueManager.EnqueueBatchAsync(batch);
        await Task.Delay(80);

        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(2, masterList.Count(d => d.Status == DownloadStatus.Queued));

        // Fail the first active download
        var failing = masterList.First(d => d.Status == DownloadStatus.Active);
        failing.Status = DownloadStatus.Failed;
        failing.StatusDetail = "Simulated Network Failure";
        // Trigger status changed on engine
        queueManager.TriggerQueueProcessing();
        await Task.Delay(80);

        // Concurrency should recover to 4 active, 1 failed, 1 queued
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(1, masterList.Count(d => d.Status == DownloadStatus.Failed));
        Assert.Equal(1, masterList.Count(d => d.Status == DownloadStatus.Queued));
    }

    [Fact]
    public void QueuePresentation_StatusLabel_DisplaysQueuePosition()
    {
        var dl = new DownloadModel
        {
            Status = DownloadStatus.Queued,
            QueuePosition = 7
        };
        Assert.Equal("Queued (#7)", dl.StatusLabel);

        dl.QueuePosition = 0;
        Assert.Equal("Queued", dl.StatusLabel);

        dl.Status = DownloadStatus.Active;
        Assert.Equal("Downloading", dl.StatusLabel);

        dl.Status = DownloadStatus.Paused;
        Assert.Equal("Paused", dl.StatusLabel);
    }

    [Fact]
    public async Task EnqueueBatchAsync_CustomDestinationFolder_RespectsProvidedFolder()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        string customFolder = Path.Combine(Path.GetTempPath(), "SmartDmBatchTests", "CustomMusicFolder");
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Chill Beats",
            DestinationFolder = customFolder,
            IsAudio = true
        };

        for (int i = 1; i <= 5; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=track_{i}",
                Title = $"Track {i}",
                FormatId = "bestaudio/best"
            });
        }

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(50);

        Assert.Equal(5, masterList.Count);
        foreach (var dl in masterList)
        {
            Assert.NotNull(dl.SavePath);
            Assert.StartsWith(customFolder, dl.SavePath, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task EnqueueBatchAsync_DefaultDestinationFolder_UsesDedicatedSubfolder()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Retro Synthwave",
            PlaylistTitle = "Retro Synthwave",
            IsAudio = true
        };

        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=synth1",
            Title = "Neon City",
            FormatId = "bestaudio/best"
        });

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(50);

        Assert.Single(masterList);
        var dl = masterList[0];
        Assert.Contains("Retro Synthwave", dl.SavePath);
    }

    [Fact]
    public async Task ClearQueueAsync_RemovesOnlyQueuedItems()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };

        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Batch 10",
            IsAudio = true
        };

        for (int i = 1; i <= 10; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=track_{i}",
                Title = $"Track {i}"
            });
        }

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(80);

        // 4 active, 6 queued
        Assert.Equal(4, masterList.Count(d => d.Status == DownloadStatus.Active));
        Assert.Equal(6, masterList.Count(d => d.Status == DownloadStatus.Queued));

        await queueManager.ClearQueueAsync();

        // Queued items removed, active items remain running
        Assert.Equal(4, masterList.Count);
        Assert.All(masterList, d => Assert.Equal(DownloadStatus.Active, d.Status));
    }

    [Fact]
    public void BatchDownloadViewModel_InitializesWithDefaults_AndTracksSelection()
    {
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Top Hits 2026",
            PlaylistTitle = "Top Hits 2026",
            IsAudio = true
        };

        for (int i = 1; i <= 5; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=hit_{i}",
                Title = $"Hit Song #{i}"
            });
        }

        var vm = new BatchDownloadViewModel(batchReq);

        Assert.Equal("Top Hits 2026", vm.BatchTitle);
        Assert.Contains("Top Hits 2026", vm.DestinationFolder);
        Assert.True(vm.IsAudio);
        Assert.False(vm.IsVideo);
        Assert.Equal(5, vm.TotalItemCount);
        Assert.Equal(5, vm.SelectedItemCount);
        Assert.True(vm.CanStart);
        Assert.Equal("5 of 5 items selected", vm.SelectionSummary);

        // Deselect all
        vm.DeselectAllCommand.Execute(null);
        Assert.Equal(0, vm.SelectedItemCount);
        Assert.False(vm.CanStart);
        Assert.Equal("0 of 5 items selected", vm.SelectionSummary);

        // Select all
        vm.SelectAllCommand.Execute(null);
        Assert.Equal(5, vm.SelectedItemCount);
        Assert.True(vm.CanStart);

        // Toggle single item
        vm.Items[0].IsSelected = false;
        Assert.Equal(4, vm.SelectedItemCount);
        Assert.Equal("4 of 5 items selected", vm.SelectionSummary);
    }

    [Fact]
    public void BatchDownloadViewModel_FormatToggle_UpdatesExtensionsAndBadges()
    {
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Music Videos",
            IsAudio = true
        };

        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://youtube.com/watch?v=vid1",
            Title = "Video Track 1",
            FileName = "Video Track 1.mp3",
            FormatId = "bestaudio/best"
        });

        var vm = new BatchDownloadViewModel(batchReq);
        Assert.True(vm.IsAudio);
        Assert.Equal("MP3", vm.Items[0].FormatBadge);

        // Toggle to video
        vm.IsVideo = true;
        Assert.False(vm.IsAudio);
        Assert.Equal("MP4", vm.Items[0].FormatBadge);
        Assert.Equal("1080p", vm.Items[0].FormatId);
        Assert.Equal("Video Track 1.mp4", vm.Items[0].FileName);
    }

    [Fact]
    public void BatchDownloadViewModel_ConfirmBatch_FiltersDeselectedTracksAndAppliesFolder()
    {
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Album Collection",
            PlaylistTitle = "Album Collection",
            IsAudio = true
        };

        for (int i = 1; i <= 3; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=track_{i}",
                Title = $"Track #{i}"
            });
        }

        var vm = new BatchDownloadViewModel(batchReq);
        vm.DestinationFolder = @"C:\TestBatchMusic";
        // Uncheck track 2
        vm.Items[1].IsSelected = false;

        BrowserBatchDownloadRequest? confirmedBatch = null;
        bool confirmedPaused = false;
        vm.BatchConfirmed += (req, paused) =>
        {
            confirmedBatch = req;
            confirmedPaused = paused;
        };

        vm.StartBatchDownloadCommand.Execute(null);

        Assert.NotNull(confirmedBatch);
        Assert.False(confirmedPaused);
        Assert.Equal(@"C:\TestBatchMusic", confirmedBatch.DestinationFolder);
        Assert.Equal(2, confirmedBatch.Items.Count);
        Assert.Equal("Track #1", confirmedBatch.Items[0].Title);
        Assert.Equal("Track #3", confirmedBatch.Items[1].Title);
    }

    [Fact]
    public async Task ClearQueueAsync_RemovesWaitingPausedQueueItems()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };
        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Paused Batch Test",
            IsAudio = true
        };

        for (int i = 1; i <= 6; i++)
        {
            batchReq.Items.Add(new BrowserDownloadRequest
            {
                Url = $"https://music.youtube.com/watch?v=item_{i}",
                Title = $"Item {i}"
            });
        }

        // Enqueue with startPaused = true ("Add to Queue (Paused)")
        await queueManager.EnqueueBatchAsync(batchReq, startPaused: true);
        await Task.Delay(50);

        Assert.Equal(6, masterList.Count);
        Assert.All(masterList, d => Assert.Equal(DownloadStatus.Paused, d.Status));

        await queueManager.ClearQueueAsync();

        // All 6 waiting paused items must be cleared
        Assert.Empty(masterList);
    }

    [Fact]
    public async Task EnqueueBatchAsync_InvalidPath_FallsBackToDefaultDownloadsWithoutThrowing()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };
        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Bad Path Batch",
            DestinationFolder = "C:\\Invalid:Folder*Path?<bad>|name",
            IsAudio = true
        };

        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=bad1",
            Title = "Valid Track"
        });

        // Must not throw ArgumentException
        var exception = await Record.ExceptionAsync(async () =>
        {
            await queueManager.EnqueueBatchAsync(batchReq);
            await Task.Delay(50);
        });

        Assert.Null(exception);
        Assert.Single(masterList);
        Assert.False(masterList[0].SavePath.Contains('*'));
        Assert.False(masterList[0].SavePath.Contains('?'));
    }

    [Fact]
    public async Task EnqueueBatchAsync_DuplicateNamesInSameBatch_AssignsUniqueSavePaths()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };
        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Duplicate Names Test",
            IsAudio = true
        };

        // Two items with the exact same title in the same batch
        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=track1",
            Title = "Duplicate Song"
        });
        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=track2",
            Title = "Duplicate Song"
        });

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(50);

        Assert.Equal(2, masterList.Count);
        Assert.NotEqual(masterList[0].SavePath, masterList[1].SavePath);
    }

    [Fact]
    public async Task EnqueueBatchAsync_FormatMismatch_ReplacesExtensionWithoutChaining()
    {
        var engine = new TestDownloadEngine();
        var repo = new InMemoryDatabaseRepository();
        var masterList = new List<DownloadModel>();
        var queueManager = new QueueManager { MaxConcurrentDownloads = 4 };
        queueManager.Initialize(engine, repo, null!, masterList, dl => { }, () => { });

        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Format Mismatch Test",
            IsAudio = false // Video MP4 requested
        };

        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://youtube.com/watch?v=track1",
            Title = "Song Title",
            FileName = "Song Title.mp3" // Has .mp3 from original audio detection
        });

        await queueManager.EnqueueBatchAsync(batchReq);
        await Task.Delay(50);

        Assert.Single(masterList);
        Assert.EndsWith(".mp4", masterList[0].SavePath);
        Assert.DoesNotContain(".mp3.mp4", masterList[0].SavePath);
        Assert.Equal("Song Title", masterList[0].Title);
    }

    [Fact]
    public void BatchDownloadViewModel_EmptyFolder_DisablesStart()
    {
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Validation Test",
            IsAudio = true
        };
        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=v1",
            Title = "Track 1"
        });

        var vm = new BatchDownloadViewModel(batchReq);
        Assert.True(vm.CanStart);

        vm.DestinationFolder = "   ";
        Assert.False(vm.CanStart);

        vm.DestinationFolder = @"C:\ValidFolder";
        Assert.True(vm.CanStart);
    }

    [Fact]
    public void BatchDownloadViewModel_TitleChange_UpdatesDefaultDestinationFolder()
    {
        var batchReq = new BrowserBatchDownloadRequest
        {
            BatchTitle = "Initial Title",
            PlaylistTitle = "Initial Title",
            IsAudio = true
        };
        batchReq.Items.Add(new BrowserDownloadRequest
        {
            Url = "https://music.youtube.com/watch?v=v1",
            Title = "Track 1"
        });

        var vm = new BatchDownloadViewModel(batchReq);
        Assert.Contains("Initial Title", vm.DestinationFolder);

        // Edit title
        vm.BatchTitle = "New Playlist Name";
        Assert.Contains("New Playlist Name", vm.DestinationFolder);
    }
}
