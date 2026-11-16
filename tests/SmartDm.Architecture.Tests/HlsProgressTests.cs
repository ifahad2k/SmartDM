using System.Net;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HlsProgressTests
{
    [Fact]
    public void RetransmissionsAreTraffic_NotSavedProgress()
    {
        var progress = new HlsTransferProgress(3);
        progress.RecordReceived(700);
        var failedAttempt = progress.Capture();
        Assert.Equal(700, failedAttempt.ReceivedBytes);
        Assert.Equal(0, failedAttempt.SavedBytes);
        Assert.Equal(0, failedAttempt.Percentage);
        progress.RecordReceived(900);
        Assert.True(progress.RecordSaved(0, 892)); // Wrapper bytes are not saved media.
        var firstSaved = progress.Capture();
        Assert.Equal(1600, firstSaved.ReceivedBytes);
        Assert.Equal(892, firstSaved.SavedBytes);
        Assert.Equal(100.0 / 3, firstSaved.Percentage, 6);
        Assert.False(progress.RecordSaved(0, 892));
        Assert.Equal(firstSaved, progress.Capture());
    }

    [Fact]
    public async Task ConcurrentWorkers_KeepWireAndCommittedTotalsWithoutDoubleCounting()
    {
        var progress = new HlsTransferProgress(100, 10, 1000);
        await Task.WhenAll(Enumerable.Range(10, 90).Select(index => Task.Run(() =>
        {
            progress.RecordReceived(101);
            Assert.True(progress.RecordSaved(index, 100));
            Assert.False(progress.RecordSaved(index, 100));
        })));
        var snapshot = progress.Capture();
        Assert.Equal(10000, snapshot.SavedBytes);
        Assert.Equal(9090, snapshot.ReceivedBytes);
        Assert.Equal(100, snapshot.SavedSegments);
        Assert.Equal(99, snapshot.Percentage); // Only finalization may finish the transfer.
    }

    [Fact]
    public async Task RefererRecovery_DisposesRejectedResponse_AndPreservesTheSegment()
    {
        var rejectedContent = new TrackedContent(new byte[] {1});
        byte[] media = Enumerable.Repeat((byte)0x47, 4096).ToArray();
        int requests = 0;
        using var client = new HttpClient(new Handler(_ => Interlocked.Increment(ref requests) == 1
            ? new(HttpStatusCode.Forbidden) {Content = rejectedContent}
            : new(HttpStatusCode.OK) {Content = new ByteArrayContent(media)}));
        string path = Path.GetTempFileName();
        var task = new HlsSegmentTask {Url = "https://cdn.invalid/segment", TargetPath = path};
        var worker = new SegmentWorker(client, task.Url, path, 1, 0, 0, referer: "https://page.invalid/watch");
        bool saved = false;
        try
        {
            await worker.ExecuteHlsChunkQueueAsync(new(new[] {task}), () => saved, default, (_, _) => saved = true)
                .WaitAsync(TimeSpan.FromSeconds(4));
            Assert.True(saved, worker.LastError);
            Assert.True(rejectedContent.WasDisposed);
            Assert.Equal(media, await File.ReadAllBytesAsync(path));
            Assert.False(worker.Progress.IsActive);
            Assert.Equal(0, worker.Progress.DownloadedBytes);
            Assert.Equal(media.Length - 1, worker.Progress.EndByte);
        }
        finally {foreach (var suffix in new[] {"", ".tmp", ".checkpoint"}) File.Delete(path + suffix);}
    }

    [Fact]
    public async Task TerminalWorkerError_DoesNotExposeTheSignedSourceInItsMessage()
    {
        using var client = new HttpClient(new Handler(_ => throw new HttpRequestException("https://cdn.invalid/segment?token=DO_NOT_LOG")));
        string path = Path.GetTempFileName();
        var task = new HlsSegmentTask {Url = "https://cdn.invalid/segment", TargetPath = path, Retries = 4};
        var worker = new SegmentWorker(client, task.Url, path, 1, 0, 0);
        try
        {
            await worker.ExecuteHlsChunkQueueAsync(new(new[] {task}), () => false, default).WaitAsync(TimeSpan.FromSeconds(2));
            Assert.NotNull(worker.LastError);
            Assert.DoesNotContain("DO_NOT_LOG", worker.LastError);
            Assert.DoesNotContain("https://", worker.LastError);
        }
        finally {File.Delete(path);}
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public void Monitor_RetryStateIsVisibleEvenWhenNetworkStillHasThroughput(double speed)
    {
        using var monitor = new TransferMonitorViewModel(new DownloadModel
        {
            Status = DownloadStatus.Active, SpeedMbps = speed,
            StatusDetail = "Retrying stream segments (1 workers • 0/355 chunks saved)..."
        });
        Assert.Equal("Retrying stream...", monitor.TransferStatusBadgeText);
        Assert.Equal("#F59E0B", monitor.TransferStatusBadgeColor);
    }

    [Fact]
    public async Task RealEngine_DoesNotCreditFailedChunkBytes_AndCountsOnlyVerifiedChunks()
    {
        var releaseFailure = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var blockSecond = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstTraffic = new TaskCompletionSource<(long Bytes, double Percent)>(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstSaved = new TaskCompletionSource<(long Bytes, double Percent)>(TaskCreationOptions.RunContinuationsAsynchronously);
        byte[] media = Enumerable.Repeat((byte)0x47, 4096).ToArray();
        int firstRequests = 0, reads = 0;
        using var client = new HttpClient(new Handler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("first.ts"))
            {
                if (Interlocked.Increment(ref firstRequests) == 2) // First GET is the engine's access probe.
                    return new(HttpStatusCode.OK) {Content = new StreamContent(new ReadStream(async (buffer, token) =>
                    {
                        if (Interlocked.Increment(ref reads) == 1) {media.AsMemory(0, 512).CopyTo(buffer); return 512;}
                        await releaseFailure.Task.WaitAsync(token);
                        throw new IOException("Simulated interrupted segment body");
                    }))};
                return new(HttpStatusCode.OK) {Content = new ByteArrayContent(media)};
            }
            if (request.RequestUri.AbsolutePath.EndsWith("second.ts"))
                return new(HttpStatusCode.OK) {Content = new ByteArrayContent(media)};
            return new(HttpStatusCode.OK) {Content = new StreamContent(new ReadStream(async (_, token) =>
            {
                await blockSecond.Task.WaitAsync(token);
                return 0;
            }))};
        }));
        string directory = Path.Combine(Path.GetTempPath(), "smartdm-hls-progress-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var download = new DownloadModel
        {
            Url = "https://cdn.invalid/list.m3u8", MediaKind = "hls", ParallelThreads = 1,
            SavePath = Path.Combine(directory, "result.mp4"),
            ManifestText = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nfirst.ts\n#EXTINF:6,\nsecond.ts\n#EXTINF:6,\nthird.ts\n#EXT-X-ENDLIST\n"
        };
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        engine.DownloadProgressChanged += model =>
        {
            if ((model.SpeedMbps > 0 && model.DownloadedBytes == 0) || model.DownloadedBytes == 512)
                firstTraffic.TrySetResult((model.DownloadedBytes, model.ProgressPercentage));
            if (model.DownloadedBytes >= media.Length)
                firstSaved.TrySetResult((model.DownloadedBytes, model.ProgressPercentage));
        };
        try
        {
            await engine.StartDownloadAsync(download);
            var pending = await firstTraffic.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal(0, pending.Bytes); // The old engine reports these unverified 512 bytes as progress.
            Assert.Equal(0, pending.Percent);
            Assert.Equal(-1, Assert.Single(engine.GetSegments(download.Id)).EndByte); // No invented 4.5 MB chunk size.
            releaseFailure.TrySetResult();
            var saved = await firstSaved.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal(media.Length, saved.Bytes);
            Assert.Equal(100.0 / 3, saved.Percent, 6);
            Assert.False(File.Exists(download.SavePath));
        }
        finally
        {
            await engine.PauseDownloadAsync(download.Id);
            releaseFailure.TrySetResult();
            blockSecond.TrySetResult();
            DownloadEngine.CleanupStagingDirectory(DownloadEngine.GetDownloadStagingDirectory(download.Id));
            Directory.Delete(directory, true);
        }
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(send(request));
    }

    private sealed class TrackedContent(byte[] bytes) : ByteArrayContent(bytes)
    {
        public bool WasDisposed { get; private set; }
        protected override void Dispose(bool disposing) {WasDisposed = true; base.Dispose(disposing);}
    }

    private sealed class ReadStream(Func<Memory<byte>, CancellationToken, ValueTask<int>> read) : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => read(buffer, cancellationToken);
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
