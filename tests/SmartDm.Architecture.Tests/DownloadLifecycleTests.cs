using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class DownloadLifecycleTests
{
    [Fact]
    public async Task SimultaneousStarts_ReserveOneOwnerBeforeAsyncSetup()
    {
        using var fixture = new Fixture();
        var repository = new BlockingRepository(item => item.Status == DownloadStatus.Active);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(repository, new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        var complete = Terminal(engine, item.Id);
        var firstStart = engine.StartDownloadAsync(item);
        try
        {
            await repository.Entered.Task.WaitAsync(Deadline);
            var duplicateStarts = Enumerable.Range(0, 24).Select(_ => engine.StartDownloadAsync(item)).Append(firstStart);
            await Task.WhenAll(duplicateStarts).WaitAsync(Deadline);
            Assert.Equal(1, repository.BlockedSaves);
            Assert.Equal(0, fixture.Handler.Requests);
            repository.Release.TrySetResult();
            Assert.Equal(DownloadStatus.Completed, await complete.WaitAsync(Deadline));
            Assert.Equal(1, fixture.Handler.Requests);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally { repository.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task Pause_WaitsForOldReadAndSerializesResumeBeyondFormerTimeout()
    {
        using var fixture = new Fixture(blockFirstRead: true);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        var complete = Terminal(engine, item.Id);
        await engine.StartDownloadAsync(item);
        try
        {
            await fixture.Read.Entered.Task.WaitAsync(Deadline);
            var pause = engine.PauseDownloadAsync(item.Id);
            await fixture.Read.Cancelled.Task.WaitAsync(Deadline);
            var resume = engine.ResumeDownloadAsync(item.Id, item);
            await Task.Delay(950); // deliberately longer than the removed 800 ms timeout
            Assert.False(pause.IsCompleted);
            Assert.False(resume.IsCompleted);
            Assert.Equal(1, fixture.Handler.Requests);
            fixture.Read.Release.TrySetResult();
            await Task.WhenAll(pause, resume).WaitAsync(Deadline);
            Assert.Equal(DownloadStatus.Completed, await complete.WaitAsync(Deadline));
            Assert.Equal(2, fixture.Handler.Requests);
            Assert.Equal(1, fixture.Handler.MaximumOpenStreams);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally { fixture.Read.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task Cancel_DoesNotDeleteStagingUntilOldWriterStops_ThenResumeStartsFresh()
    {
        using var fixture = new Fixture(blockFirstRead: true);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        var complete = Terminal(engine, item.Id);
        await engine.StartDownloadAsync(item);
        try
        {
            await fixture.Read.Entered.Task.WaitAsync(Deadline);
            string staging = DownloadEngine.GetDownloadStagingDirectory(item.Id);
            var cancel = engine.CancelDownloadAsync(item.Id);
            await fixture.Read.Cancelled.Task.WaitAsync(Deadline);
            await Task.Delay(950);
            Assert.False(cancel.IsCompleted);
            Assert.True(File.Exists(Path.Combine(staging, Path.GetFileName(item.SavePath))));
            fixture.Read.Release.TrySetResult();
            await cancel.WaitAsync(Deadline);
            Assert.False(Directory.Exists(staging));
            Assert.Empty(engine.GetSegments(item.Id));
            Assert.Equal(DownloadStatus.Paused, item.Status);
            Assert.Equal("Cancelled", item.StatusDetail);
            Assert.False(complete.IsCompleted);
            await engine.ResumeDownloadAsync(item.Id, item);
            Assert.Equal(DownloadStatus.Completed, await complete.WaitAsync(Deadline));
            Assert.Equal(1, fixture.Handler.MaximumOpenStreams);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally { fixture.Read.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task RepeatedResume_OnOwnedTransferIsIdempotent()
    {
        using var fixture = new Fixture(blockFirstRead: true);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        var complete = Terminal(engine, item.Id);
        await engine.StartDownloadAsync(item);
        try
        {
            await fixture.Read.Entered.Task.WaitAsync(Deadline);
            await Task.WhenAll(Enumerable.Range(0, 24).Select(_ => engine.ResumeDownloadAsync(item.Id, item))).WaitAsync(Deadline);
            Assert.Equal(1, fixture.Handler.Requests);
            Assert.False(fixture.Read.Cancelled.Task.IsCompleted);
            fixture.Read.Release.TrySetResult();
            Assert.Equal(DownloadStatus.Completed, await complete.WaitAsync(Deadline));
        }
        finally { fixture.Read.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task StopDuringScan_WaitsForScanner_AndDoesNotPromoteCancelledOutput()
    {
        using var fixture = new Fixture();
        var scanner = new BlockingScanner();
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), scanner, client);
        var item = fixture.NewDownload();
        item.ConflictAction = DestinationConflictAction.Replace;
        await File.WriteAllTextAsync(item.SavePath, "existing user data");
        int completions = 0;
        engine.DownloadCompleted += (_, _) => Interlocked.Increment(ref completions);
        await engine.StartDownloadAsync(item);
        try
        {
            await scanner.Entered.Task.WaitAsync(Deadline);
            var pause = engine.PauseDownloadAsync(item.Id);
            await scanner.Cancelled.Task.WaitAsync(Deadline);
            await Task.Delay(950);
            Assert.False(pause.IsCompleted);
            Assert.Equal("existing user data", await File.ReadAllTextAsync(item.SavePath));
            scanner.Release.TrySetResult(); // scanner deliberately returns clean despite cancellation
            await pause.WaitAsync(Deadline);
            Assert.Equal(DownloadStatus.Paused, item.Status);
            Assert.Equal(0, completions);
            Assert.Equal("existing user data", await File.ReadAllTextAsync(item.SavePath));

            var completed = Terminal(engine, item.Id);
            await engine.ResumeDownloadAsync(item.Id, item);
            Assert.Equal(DownloadStatus.Completed, await completed.WaitAsync(Deadline));
            Assert.Equal(1, completions);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally { scanner.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task StopAfterCommitStarted_WaitsAndPreservesCompletion(bool cancel)
    {
        using var fixture = new Fixture();
        var repository = new BlockingRepository(item => item.Status == DownloadStatus.Completed);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(repository, new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        await engine.StartDownloadAsync(item);
        try
        {
            await repository.Entered.Task.WaitAsync(Deadline); // promoted, not yet persisted/published
            var stop = cancel ? engine.CancelDownloadAsync(item.Id) : engine.PauseDownloadAsync(item.Id);
            await Task.Delay(100);
            Assert.False(stop.IsCompleted);
            repository.Release.TrySetResult();
            await stop.WaitAsync(Deadline);
            Assert.Equal(DownloadStatus.Completed, item.Status);
            Assert.Equal(DownloadStatus.Completed, Assert.Single(await repository.GetAllDownloadsAsync()).Status);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
            await engine.ResumeDownloadAsync(item.Id, item);
            await engine.StartDownloadAsync(item);
            Assert.Equal(1, fixture.Handler.Requests);
        }
        finally { repository.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task ThreatEvidenceReturnedDuringStop_IsNotDowngradedToPaused()
    {
        using var fixture = new Fixture();
        var scanner = new BlockingScanner(threat: true);
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), scanner, client);
        var item = fixture.NewDownload();
        await engine.StartDownloadAsync(item);
        try
        {
            await scanner.Entered.Task.WaitAsync(Deadline);
            var cancel = engine.CancelDownloadAsync(item.Id);
            await scanner.Cancelled.Task.WaitAsync(Deadline);
            scanner.Release.TrySetResult();
            await cancel.WaitAsync(Deadline);
            Assert.Equal(DownloadStatus.Quarantined, item.Status);
            Assert.False(File.Exists(item.SavePath));
        }
        finally { scanner.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task StopForOneDownload_DoesNotBlockOtherDownloadCommands()
    {
        using var fixture = new Fixture(blockFirstRead: true);
        using var client = new HttpClient(fixture.Handler);
        var repository = new SqliteDatabaseRepository(Path.Combine(fixture.DirectoryPath, "history.db"));
        var engine = new DownloadEngine(repository, new DirectCleanSafetyScanner(), client);
        var first = fixture.NewDownload();
        var second = fixture.NewDownload();
        var secondCompleted = Terminal(engine, second.Id);
        await engine.StartDownloadAsync(first);
        try
        {
            await fixture.Read.Entered.Task.WaitAsync(Deadline);
            var pause = engine.PauseDownloadAsync(first.Id);
            await fixture.Read.Cancelled.Task.WaitAsync(Deadline);
            await engine.StartDownloadAsync(second);
            Assert.Equal(DownloadStatus.Completed, await secondCompleted.WaitAsync(Deadline));
            Assert.False(pause.IsCompleted);
            fixture.Read.Release.TrySetResult();
            await pause.WaitAsync(Deadline);
        }
        finally { fixture.Read.Release.TrySetResult(); await engine.PauseDownloadAsync(first.Id).WaitAsync(Deadline); await engine.PauseDownloadAsync(second.Id).WaitAsync(Deadline); }
    }

    [Fact]
    public async Task Resume_RejectsModelFromAnotherCommandId()
    {
        using var fixture = new Fixture();
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        await Assert.ThrowsAsync<ArgumentException>(() => engine.ResumeDownloadAsync("other-id", fixture.NewDownload()));
        Assert.Equal(0, fixture.Handler.Requests);
    }

    [Fact]
    public async Task RepeatedPauseCancelAndResume_NeverOverlapWritersAcrossSessions()
    {
        using var fixture = new Fixture();
        var controls = Enumerable.Range(0, 8).Select(_ => new ReadControl()).ToArray();
        var handler = new TransferHandler(fixture.Payload, null, request => controls[request - 1]);
        using var client = new HttpClient(handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        var completed = Terminal(engine, item.Id);
        await engine.StartDownloadAsync(item);
        try
        {
            for (int i = 0; i < controls.Length - 1; i++)
            {
                await controls[i].Entered.Task.WaitAsync(Deadline);
                var stop = i % 3 == 0 ? engine.CancelDownloadAsync(item.Id) : engine.PauseDownloadAsync(item.Id);
                var resume = engine.ResumeDownloadAsync(item.Id, item);
                await controls[i].Cancelled.Task.WaitAsync(Deadline);
                controls[i].Release.TrySetResult();
                await Task.WhenAll(stop, resume).WaitAsync(Deadline);
            }
            await controls[^1].Entered.Task.WaitAsync(Deadline);
            controls[^1].Release.TrySetResult();
            Assert.Equal(DownloadStatus.Completed, await completed.WaitAsync(Deadline));
            Assert.Equal(controls.Length, handler.Requests);
            Assert.Equal(1, handler.MaximumOpenStreams);
            Assert.Equal(fixture.Payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally
        {
            foreach (var control in controls) control.Release.TrySetResult();
            await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline);
        }
    }

    [Fact]
    public async Task StopStillJoinsRunner_WhenCancellationCallbackThrows()
    {
        using var fixture = new Fixture(blockFirstRead: true);
        fixture.Read.ThrowOnCancellation = true;
        using var client = new HttpClient(fixture.Handler);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var item = fixture.NewDownload();
        await engine.StartDownloadAsync(item);
        try
        {
            await fixture.Read.Entered.Task.WaitAsync(Deadline);
            var pause = engine.PauseDownloadAsync(item.Id);
            await fixture.Read.Cancelled.Task.WaitAsync(Deadline);
            await Task.Delay(100);
            Assert.False(pause.IsCompleted);
            fixture.Read.Release.TrySetResult();
            await pause.WaitAsync(Deadline);
            Assert.Equal(DownloadStatus.Paused, item.Status);
        }
        finally { fixture.Read.Release.TrySetResult(); await engine.PauseDownloadAsync(item.Id).WaitAsync(Deadline); }
    }

    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(12);
    private static Task<DownloadStatus> Terminal(DownloadEngine engine, string id)
    {
        var result = new TaskCompletionSource<DownloadStatus>(TaskCreationOptions.RunContinuationsAsynchronously);
        void Changed(DownloadModel item)
        {
            if (item.Id != id || item.Status is not (DownloadStatus.Completed or DownloadStatus.Failed or DownloadStatus.Quarantined)) return;
            engine.DownloadStatusChanged -= Changed;
            result.TrySetResult(item.Status);
        }
        engine.DownloadStatusChanged += Changed;
        return result.Task;
    }

    private sealed class Fixture : IDisposable
    {
        public string DirectoryPath { get; } = Path.Combine(Path.GetTempPath(), "smartdm_lifecycle_" + Guid.NewGuid().ToString("N"));
        public byte[] Payload { get; } = Enumerable.Range(0, 4096).Select(i => (byte)(i % 241)).ToArray();
        public ReadControl Read { get; } = new();
        public TransferHandler Handler { get; }
        private readonly List<string> _ids = new();
        public Fixture(bool blockFirstRead = false)
        {
            Directory.CreateDirectory(DirectoryPath);
            Handler = new TransferHandler(Payload, blockFirstRead ? Read : null);
        }
        public DownloadModel NewDownload()
        {
            string id = Guid.NewGuid().ToString("N");
            _ids.Add(id);
            return new DownloadModel { Id = id, Title = "fixture.bin", Url = "https://fixture.invalid/fixture.bin", SavePath = Path.Combine(DirectoryPath, id + ".bin"),
                TotalBytes = Payload.Length, SupportsRanges = false, Status = DownloadStatus.Queued, ExpectedSha256 = Convert.ToHexString(SHA256.HashData(Payload)) };
        }
        public void Dispose()
        {
            Read.Release.TrySetResult();
            foreach (string id in _ids)
            {
                string staging = DownloadEngine.GetDownloadStagingDirectory(id);
                try { Directory.Delete(staging, true); } catch (DirectoryNotFoundException) { }
            }
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            Directory.Delete(DirectoryPath, true);
        }
    }

    private sealed class ReadControl
    {
        public bool ThrowOnCancellation { get; set; }
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Cancelled { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    private sealed class TransferHandler(byte[] payload, ReadControl? control, Func<int, ReadControl?>? selectControl = null) : HttpMessageHandler
    {
        private int _requests, _open, _maximum;
        public int Requests => Volatile.Read(ref _requests);
        public int MaximumOpenStreams => Volatile.Read(ref _maximum);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            int requestNumber = Interlocked.Increment(ref _requests);
            int opened = Interlocked.Increment(ref _open);
            int old;
            do { old = _maximum; if (old >= opened) break; } while (Interlocked.CompareExchange(ref _maximum, opened, old) != old);
            var content = new StreamContent(new ControlledStream(payload, selectControl != null ? selectControl(requestNumber) : requestNumber == 1 ? control : null, () => Interlocked.Decrement(ref _open)));
            content.Headers.ContentLength = payload.Length;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
        }
    }

    private sealed class ControlledStream(byte[] payload, ReadControl? control, Action closed) : MemoryStream(payload, writable: false)
    {
        private int _disposed;
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (control != null)
            {
                using var registration = cancellationToken.Register(() =>
                {
                    control.Cancelled.TrySetResult();
                    if (control.ThrowOnCancellation) throw new InvalidOperationException("Fixture callback failure");
                });
                control.Entered.TrySetResult();
                await control.Release.Task; // simulate a transport slow to honor cancellation
                cancellationToken.ThrowIfCancellationRequested();
            }
            return await base.ReadAsync(buffer, cancellationToken);
        }
        protected override void Dispose(bool disposing)
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0) closed();
            base.Dispose(disposing);
        }
    }

    private sealed class BlockingRepository(Func<DownloadModel, bool> shouldBlock) : InMemoryDatabaseRepository, IDatabaseRepository
    {
        private int _blocked;
        public int BlockedSaves => Volatile.Read(ref _blocked);
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public new async Task SaveDownloadAsync(DownloadModel item)
        {
            if (shouldBlock(item))
            {
                Interlocked.Increment(ref _blocked);
                Entered.TrySetResult();
                await Release.Task;
            }
            await base.SaveDownloadAsync(item);
        }
    }

    private sealed class BlockingScanner(bool threat = false) : ISafetyScanner
    {
        private int _calls;
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Cancelled { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<SafetyScanResult> ScanFileAsync(string path, CancellationToken token = default)
        {
            if (Interlocked.Increment(ref _calls) == 1)
            {
                using var registration = token.Register(() => Cancelled.TrySetResult());
                Entered.TrySetResult();
                await Release.Task;
            }
            var result = await new DirectCleanSafetyScanner().ScanFileAsync(path);
            result.HasThreat = threat;
            result.IsQuarantined = threat;
            result.IsClean = !threat;
            return result;
        }
        public Task<string> ComputeSha256Async(string path, CancellationToken token = default) => new DirectCleanSafetyScanner().ComputeSha256Async(path, token);
        public bool CheckRtloExploit(string name) => false;
    }
}
