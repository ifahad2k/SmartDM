using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using SmartDm.Desktop.Avalonia.Views;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class Package2RegressionTests
{
    [Fact]
    public async Task LowLimit_AllowsReadLargerThanBucket_WithoutBypassingRate()
    {
        var limiter = new AggregateSpeedLimiter(1024);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        var timer = Stopwatch.StartNew();
        await limiter.ThrottleAsync(2048, deadline.Token);
        Assert.True(timer.Elapsed >= TimeSpan.FromMilliseconds(850));
    }

    [Fact]
    public async Task Limiter_IsAggregateAcrossConcurrentReaders()
    {
        var limiter = new AggregateSpeedLimiter(4096);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        var timer = Stopwatch.StartNew();
        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => limiter.ThrottleAsync(2048, deadline.Token).AsTask()));
        // Initial one-second burst + one second of refill, shared by all readers.
        Assert.True(timer.Elapsed >= TimeSpan.FromMilliseconds(850));
    }

    [Fact]
    public async Task Limiter_CanCancelOrDisableAnOversizedCharge()
    {
        var limiter = new AggregateSpeedLimiter(1);
        using var cancellation = new CancellationTokenSource();
        var blocked = limiter.ThrottleAsync(131072, cancellation.Token).AsTask();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => blocked);

        blocked = limiter.ThrottleAsync(131072).AsTask();
        limiter.SetLimit(0);
        await blocked.WaitAsync(TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task ReapplyingSameLimit_DoesNotRefillTheBucket()
    {
        var limiter = new AggregateSpeedLimiter(1024);
        await limiter.ThrottleAsync(1024);
        limiter.SetLimit(1024);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        var timer = Stopwatch.StartNew();
        await limiter.ThrottleAsync(1024, deadline.Token);
        Assert.True(timer.Elapsed >= TimeSpan.FromMilliseconds(850));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Probe_PreservesWeakAndStrongValidators(bool weak)
    {
        using var client = new HttpClient(new ResponseHandler(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[17]) };
            response.Headers.ETag = new EntityTagHeaderValue("\"version-1\"", weak);
            response.Content.Headers.LastModified = new DateTimeOffset(2026, 1, 2, 3, 4, 5, TimeSpan.Zero);
            return response;
        }));
        var probe = await new HttpProbeService(client).ProbeUrlAsync("https://fixture.invalid/package.zip");
        Assert.True(probe.IsSuccess);
        Assert.Equal(weak ? "W/\"version-1\"" : "\"version-1\"", probe.ETag);
        Assert.Equal("Fri, 02 Jan 2026 03:04:05 GMT", probe.LastModified);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Probe_VerifiesAdvertisedRanges_AndRejectsMalformed206(bool malformed)
    {
        using var client = new HttpClient(new ResponseHandler(request =>
        {
            var response = new HttpResponseMessage(malformed && request.Method == HttpMethod.Get ? HttpStatusCode.PartialContent : HttpStatusCode.OK)
            { Content = new ByteArrayContent(new byte[20]) };
            response.Headers.AcceptRanges.Add("bytes");
            if (request.Method == HttpMethod.Get)
            {
                Assert.Equal(0, Assert.Single(request.Headers.Range!.Ranges).From);
                Assert.Equal(0, Assert.Single(request.Headers.Range.Ranges).To);
                if (malformed) response.Content.Headers.ContentRange = new ContentRangeHeaderValue(1, 1, 20);
            }
            return response;
        }));
        var result = await new HttpProbeService(client).ProbeUrlAsync("https://fixture.invalid/package.zip");
        Assert.False(result.AcceptsRanges);
        Assert.Equal(!malformed, result.IsSuccess);
        if (!malformed) Assert.Equal(20, result.TotalBytes); // 200 ignored Range; plan a full GET
    }

    [Fact]
    public async Task Engine_LowLimit_CompletesAReadLargerThanBucket_WithCorrectBytes()
    {
        using var directory = new TestDirectory();
        byte[] payload = new byte[131072];
        Random.Shared.NextBytes(payload);
        using var client = new HttpClient(new ResponseHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(payload) }));
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        engine.SetSpeedLimitBytesPerSec(65536);
        var item = new DownloadModel { Url = "https://fixture.invalid/package.zip", SavePath = Path.Combine(directory.Path, "package.zip"), TotalBytes = payload.Length, SupportsRanges = false };
        try
        {
            var timer = Stopwatch.StartNew();
            Assert.Equal(DownloadStatus.Completed, await RunToTerminal(engine, item));
            Assert.True(timer.Elapsed >= TimeSpan.FromMilliseconds(850));
            Assert.Equal(payload, await File.ReadAllBytesAsync(item.SavePath));
        }
        finally { RemoveStaging(item.Id); }
    }

    [Fact]
    public async Task UiProbe_DatabaseRestart_Engine_DownloadsKnownSizeWithoutRanges()
    {
        using var directory = new TestDirectory();
        byte[] payload = Enumerable.Range(0, 70000).Select(i => (byte)(i % 241)).ToArray();
        await using var server = new TestHttpServer(payload, ServerFaultMode.Return200OkOnSubrange) { AdvertiseRanges = false };
        var viewModel = NewViewModel(new HttpProbeService());
        viewModel.Url = server.BaseUrl + "/package.zip";
        await viewModel.ProbeUrlCommand.ExecuteAsync(null);
        Assert.True(viewModel.IsProbeSuccessful);
        viewModel.SavePath = Path.Combine(directory.Path, "package.zip");
        viewModel.ExpectedHash = Convert.ToHexString(SHA256.HashData(payload));
        DownloadModel? created = null;
        viewModel.DownloadCreated += item => created = item;
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.False(created.SupportsRanges);
        Assert.Equal(payload.Length, created.TotalBytes);

        string database = Path.Combine(directory.Path, "history.db");
        await new SqliteDatabaseRepository(database).SaveDownloadAsync(created);
        var restored = Assert.Single(await new SqliteDatabaseRepository(database).GetAllDownloadsAsync());
        Assert.False(restored.SupportsRanges);

        // Previous partial output and a range journal must not be reused for a full GET.
        string staging = DownloadEngine.GetDownloadStagingDirectory(restored.Id);
        Directory.CreateDirectory(staging);
        await File.WriteAllBytesAsync(Path.Combine(staging, "package.zip"), new byte[payload.Length * 2]);
        DownloadEngine.SaveSegmentJournal(staging, new List<SegmentProgress>
        {
            new() { SegmentIndex = 1, StartByte = 0, EndByte = payload.Length - 1, DownloadedBytes = 100 }
        }, restored.Id, restored.Url, payload.Length);
        try
        {
            var engine = new DownloadEngine(new SqliteDatabaseRepository(database), new DirectCleanSafetyScanner());
            Assert.Equal(DownloadStatus.Completed, await RunToTerminal(engine, restored));
            Assert.Empty(server.RangeRequests);
            Assert.Equal(payload, await File.ReadAllBytesAsync(restored.SavePath));
        }
        finally { RemoveStaging(restored.Id); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UiProbe_Restart_OnlyStrongValidatorReusesCompletedCheckpoint(bool weak)
    {
        using var directory = new TestDirectory();
        byte[] payload = Enumerable.Range(0, 120000).Select(i => (byte)(i % 251)).ToArray();
        string etag = weak ? "W/\"v1\"" : "\"v1\"";
        await using var server = new TestHttpServer(payload) { ResponseETag = etag };
        var viewModel = NewViewModel(new HttpProbeService());
        viewModel.Url = server.BaseUrl + "/package.zip";
        await viewModel.ProbeUrlCommand.ExecuteAsync(null);
        Assert.True(viewModel.IsProbeSuccessful);
        viewModel.SavePath = Path.Combine(directory.Path, "package.zip");
        viewModel.ExpectedHash = Convert.ToHexString(SHA256.HashData(payload));
        DownloadModel? created = null;
        viewModel.DownloadCreated += item => created = item;
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.Equal(etag, created.ETag);

        string database = Path.Combine(directory.Path, "history.db");
        await new SqliteDatabaseRepository(database).SaveDownloadAsync(created);
        var restored = Assert.Single(await new SqliteDatabaseRepository(database).GetAllDownloadsAsync());
        Assert.Equal(etag, restored.ETag);
        Assert.True(restored.SupportsRanges);
        string staging = DownloadEngine.GetDownloadStagingDirectory(restored.Id);
        Directory.CreateDirectory(staging);
        await File.WriteAllBytesAsync(Path.Combine(staging, "package.zip"), payload);
        DownloadEngine.SaveSegmentJournal(staging, new List<SegmentProgress>
        {
            new() { SegmentIndex = 1, StartByte = 0, EndByte = 59999, DownloadedBytes = 60000,
                IsCompleted = true, CheckpointSha256 = Convert.ToHexString(SHA256.HashData(payload.AsSpan(0, 60000))) },
            new() { SegmentIndex = 2, StartByte = 60000, EndByte = 119999 }
        }, restored.Id, restored.Url, payload.Length, etag);
        try
        {
            var engine = new DownloadEngine(new SqliteDatabaseRepository(database), new DirectCleanSafetyScanner());
            Assert.Equal(DownloadStatus.Completed, await RunToTerminal(engine, restored));
            Assert.Equal(payload, await File.ReadAllBytesAsync(restored.SavePath));
            if (weak)
                Assert.Contains(server.RangeRequests, range => range.Start == 0 && range.End == 59999);
            else
            {
                Assert.Contains(server.RangeRequests, range => range.Start == 0 && range.End == 0);
                Assert.DoesNotContain(server.RangeRequests, range => range.Start == 0 && range.End == 59999);
            }
        }
        finally { RemoveStaging(restored.Id); }
    }

    [Fact]
    public async Task EditedUrl_DoesNotInheritPriorProbeMetadata()
    {
        using var directory = new TestDirectory();
        var probe = new DelegateProbe(url => Task.FromResult(Probe(url)));
        var viewModel = NewViewModel(probe);
        viewModel.Url = "https://fixture.invalid/first.zip";
        await viewModel.ProbeUrlCommand.ExecuteAsync(null);
        viewModel.Url = "https://fixture.invalid/second.zip";
        viewModel.SavePath = Path.Combine(directory.Path, "second.zip");
        DownloadModel? created = null;
        viewModel.DownloadCreated += item => created = item;
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.Empty(created.ETag);
        Assert.Null(created.LastModified);
        Assert.Null(created.SupportsRanges);
        Assert.True(created.TotalBytes <= 0);
    }

    [Fact]
    public async Task LateProbeResponse_DoesNotReplaceCurrentUrlMetadata()
    {
        using var directory = new TestDirectory();
        var pending = new TaskCompletionSource<ProbeResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var viewModel = NewViewModel(new DelegateProbe(_ => pending.Task));
        viewModel.Url = "https://fixture.invalid/first.zip";
        var probing = viewModel.ProbeUrlCommand.ExecuteAsync(null);
        viewModel.Url = "https://fixture.invalid/second.zip";
        pending.SetResult(Probe("https://fixture.invalid/first.zip"));
        await probing;
        Assert.False(viewModel.IsProbeSuccessful);
        viewModel.SavePath = Path.Combine(directory.Path, "second.zip");
        DownloadModel? created = null;
        viewModel.DownloadCreated += item => created = item;
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.Empty(created.ETag);
        Assert.Null(created.SupportsRanges);
    }

    [Theory]
    [InlineData(CollisionResolution.Overwrite, DestinationConflictAction.Replace)]
    [InlineData(CollisionResolution.AutoNumber, DestinationConflictAction.DefaultNeverOverwrite)]
    [InlineData(CollisionResolution.CustomRename, DestinationConflictAction.DefaultNeverOverwrite)]
    public async Task CollisionChoice_ReachesEngine_OnlyExplicitOverwriteReplaces(CollisionResolution choice, DestinationConflictAction action)
    {
        using var directory = new TestDirectory();
        byte[] payload = new byte[] { 1, 3, 5, 7 };
        await using var server = new TestHttpServer(payload);
        string original = Path.Combine(directory.Path, "original.zip");
        await File.WriteAllTextAsync(original, "keep me");
        var viewModel = NewViewModel(new DelegateProbe(url => Task.FromResult(Probe(url))));
        viewModel.Url = server.BaseUrl + "/package.zip";
        viewModel.SavePath = original;
        DownloadModel? created = null;
        viewModel.DownloadCreated += item => created = item;
        viewModel.RequestOpenFileCollisionDialog += (_, autoNumber, resolve) =>
            resolve(choice, choice == CollisionResolution.Overwrite ? original : choice == CollisionResolution.AutoNumber ? autoNumber : Path.Combine(directory.Path, "custom.zip"));
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.Equal(action, created.ConflictAction);
        try
        {
            var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
            Assert.Equal(DownloadStatus.Completed, await RunToTerminal(engine, created));
            Assert.Equal(payload, await File.ReadAllBytesAsync(created.SavePath));
            if (choice != CollisionResolution.Overwrite) Assert.Equal("keep me", await File.ReadAllTextAsync(original));
        }
        finally { RemoveStaging(created.Id); }
    }

    [Fact]
    public async Task CancelledCollision_DoesNotCreateDownload()
    {
        using var directory = new TestDirectory();
        string original = Path.Combine(directory.Path, "original.zip");
        await File.WriteAllTextAsync(original, "keep me");
        var viewModel = NewViewModel(new DelegateProbe(url => Task.FromResult(Probe(url))));
        viewModel.Url = "https://fixture.invalid/package.zip";
        viewModel.SavePath = original;
        bool created = false;
        viewModel.DownloadCreated += _ => created = true;
        viewModel.RequestOpenFileCollisionDialog += (_, _, resolve) => resolve(CollisionResolution.Cancel, original);
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.False(created);
        Assert.Equal("keep me", await File.ReadAllTextAsync(original));
    }

    [Fact]
    public async Task OverwriteChoice_CannotReplaceAnotherTransfersDestination()
    {
        using var directory = new TestDirectory();
        string original = Path.Combine(directory.Path, "active.zip");
        var viewModel = new AddDownloadViewModel(probeService: new DelegateProbe(url => Task.FromResult(Probe(url))),
            catalogService: new EmptyCatalog(), initialFileName: "package.zip", isPathInUse: path => path == original);
        viewModel.Url = "https://fixture.invalid/package.zip";
        viewModel.SavePath = original;
        bool created = false;
        viewModel.DownloadCreated += _ => created = true;
        viewModel.RequestOpenFileCollisionDialog += (_, _, resolve) => resolve(CollisionResolution.Overwrite, original);
        await viewModel.AddToQueueCommand.ExecuteAsync(null);
        Assert.False(created);
        Assert.Contains("another transfer", viewModel.ProbeStatus);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(9)]
    public async Task SequentialWorker_RejectsLengthMismatch_AndNeverMarksComplete(int actualLength)
    {
        using var directory = new TestDirectory();
        using var client = new HttpClient(new ResponseHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[actualLength])
        }));
        var worker = new SegmentWorker(client, "https://fixture.invalid/package.zip", Path.Combine(directory.Path, "partial.zip"), 1, 0, -1, expectedTotalBytes: 6);
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.ExecuteAsync(CancellationToken.None));
        Assert.False(worker.Progress.IsCompleted);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(9)]
    public async Task SequentialWorker_EnforcesExpectedLength_WhenResponseOmitsContentLength(int actualLength)
    {
        using var directory = new TestDirectory();
        using var client = new HttpClient(new ResponseHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new UnspecifiedLengthContent(new byte[actualLength])
        }));
        var worker = new SegmentWorker(client, "https://fixture.invalid/package.zip", Path.Combine(directory.Path, "partial.zip"), 1, 0, -1, expectedTotalBytes: 6);
        var failure = await Record.ExceptionAsync(() => worker.ExecuteAsync(CancellationToken.None));
        if (actualLength < 6) Assert.IsType<EndOfStreamException>(failure);
        else Assert.IsType<HttpRequestException>(failure);
        Assert.False(worker.Progress.IsCompleted);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Worker_RejectsChangedStrongValidator_BeforeWriting(bool ranged)
    {
        using var directory = new TestDirectory();
        using var client = new HttpClient(new ResponseHandler(_ =>
        {
            var response = new HttpResponseMessage(ranged ? HttpStatusCode.PartialContent : HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[6]) };
            response.Headers.ETag = new EntityTagHeaderValue("\"changed\"");
            if (ranged) response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 5, 6);
            return response;
        }));
        string destination = Path.Combine(directory.Path, "partial.zip");
        var worker = new SegmentWorker(client, "https://fixture.invalid/package.zip", destination, 1, 0, ranged ? 5 : -1, expectedTotalBytes: 6, expectedETag: "\"original\"");
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.ExecuteAsync(CancellationToken.None));
        Assert.False(File.Exists(destination));
        Assert.False(worker.Progress.IsCompleted);
    }

    [Fact]
    public async Task Worker_RejectsUnexpectedContentEncoding()
    {
        using var directory = new TestDirectory();
        using var client = new HttpClient(new ResponseHandler(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[6]) };
            response.Content.Headers.ContentEncoding.Add("gzip");
            return response;
        }));
        string destination = Path.Combine(directory.Path, "partial.zip");
        var worker = new SegmentWorker(client, "https://fixture.invalid/package.zip", destination, 1, 0, -1, expectedTotalBytes: 6);
        await Assert.ThrowsAsync<HttpRequestException>(() => worker.ExecuteAsync(CancellationToken.None));
        Assert.False(File.Exists(destination));
    }

    [Fact]
    public async Task RangeCapabilityMigration_RollsBackOnFailure_AndPreservesHistory()
    {
        using var directory = new TestDirectory();
        string database = Path.Combine(directory.Path, "history.db");
        var item = new DownloadModel { Title = "retained", Url = "https://fixture.invalid/package.zip", ETag = "W/\"v1\"", LastModified = "Fri, 02 Jan 2026 03:04:05 GMT", SupportsRanges = false };
        await new SqliteDatabaseRepository(database).SaveDownloadAsync(item);
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = database }.ToString());
        await connection.OpenAsync();
        using (var rollback = connection.CreateCommand())
        {
            rollback.CommandText = "ALTER TABLE downloads DROP COLUMN supports_ranges; DELETE FROM schema_migrations WHERE version = 4; CREATE TRIGGER fail_v4 BEFORE INSERT ON schema_migrations WHEN NEW.version = 4 BEGIN SELECT RAISE(ABORT, 'migration test failure'); END;";
            await rollback.ExecuteNonQueryAsync();
        }
        await Assert.ThrowsAsync<SqliteException>(() => new SqliteDatabaseRepository(database).InitializeAsync());
        using (var check = connection.CreateCommand())
        {
            check.CommandText = "SELECT COUNT(*) FROM pragma_table_info('downloads') WHERE name = 'supports_ranges';";
            Assert.Equal(0L, (long)(await check.ExecuteScalarAsync())!);
            check.CommandText = "DROP TRIGGER fail_v4;";
            await check.ExecuteNonQueryAsync();
        }
        var repository = new SqliteDatabaseRepository(database);
        var restored = Assert.Single(await repository.GetAllDownloadsAsync());
        Assert.Equal(item.Id, restored.Id);
        Assert.Equal(item.ETag, restored.ETag);
        Assert.Equal(item.LastModified, restored.LastModified);
        Assert.Null(restored.SupportsRanges); // legacy capability is unknown, never invented
        restored.SupportsRanges = false;
        await repository.SaveDownloadAsync(restored);
        Assert.False(Assert.Single(await new SqliteDatabaseRepository(database).GetAllDownloadsAsync()).SupportsRanges);
    }

    private static AddDownloadViewModel NewViewModel(IHttpProbeService probe) => new(probeService: probe, catalogService: new EmptyCatalog(), initialFileName: "package.zip");
    private static ProbeResult Probe(string url) => new() { Url = url, IsSuccess = true, TotalBytes = 100, AcceptsRanges = false, ETag = "\"v1\"", LastModified = "Fri, 02 Jan 2026 03:04:05 GMT", FileName = "package.zip" };

    private static async Task<DownloadStatus> RunToTerminal(DownloadEngine engine, DownloadModel model)
    {
        var done = new TaskCompletionSource<DownloadStatus>(TaskCreationOptions.RunContinuationsAsynchronously);
        void Changed(DownloadModel item)
        {
            if (item.Id == model.Id && item.Status is DownloadStatus.Completed or DownloadStatus.Failed or DownloadStatus.Quarantined)
                done.TrySetResult(item.Status);
        }
        engine.DownloadStatusChanged += Changed;
        try
        {
            await engine.StartDownloadAsync(model);
            var status = await done.Task.WaitAsync(TimeSpan.FromSeconds(10));
            // Terminal notification precedes runner cleanup. Join the owning
            // session before a test deletes its staging directory on Windows.
            await engine.PauseDownloadAsync(model.Id).WaitAsync(TimeSpan.FromSeconds(10));
            return status;
        }
        finally { engine.DownloadStatusChanged -= Changed; }
    }

    private static void RemoveStaging(string id)
    {
        string path = DownloadEngine.GetDownloadStagingDirectory(id);
        // A completed runner normally removes staging itself.
        try { Directory.Delete(path, true); }
        catch (DirectoryNotFoundException) { }
    }

    private sealed class TestDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "smartdm_package2_" + Guid.NewGuid().ToString("N"));
        public TestDirectory() => Directory.CreateDirectory(Path);
        public void Dispose() { SqliteConnection.ClearAllPools(); Directory.Delete(Path, true); }
    }

    private sealed class ResponseHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => Task.FromResult(respond(request));
    }

    private sealed class UnspecifiedLengthContent(byte[] payload) : HttpContent
    {
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => stream.WriteAsync(payload).AsTask();
        protected override Task<Stream> CreateContentReadStreamAsync() => Task.FromResult<Stream>(new MemoryStream(payload, writable: false));
    }

    private sealed class DelegateProbe(Func<string, Task<ProbeResult>> probe) : IHttpProbeService
    {
        public Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken token = default) => probe(url);
        public string SanitizeFileName(string rawFileName) => rawFileName;
        public string DetectCategory(string fileName, string mimeType) => "ZIP";
    }

    private sealed class EmptyCatalog : IFileCatalogService
    {
        public Task InitializeAsync() => Task.CompletedTask;
        public Task IndexFileAsync(string filePath, string? sourceUrl = null, string? sha256 = null) => Task.CompletedTask;
        public Task<CatalogMatch?> FindDuplicateAsync(string? url, string? fileName, string? expectedSha256 = null) => Task.FromResult<CatalogMatch?>(null);
        public string GenerateUniquePath(string targetPath, Func<string, bool>? isPathInUse = null) => System.IO.Path.Combine(System.IO.Path.GetDirectoryName(targetPath)!, "unique.zip");
        public Task ScanCommonFoldersAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}
