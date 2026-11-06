using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class Goals34RegressionTests
{
    [Fact]
    public async Task ConfirmedQuarantineDeletion_PreservesUnownedDestination()
    {
        string dir = NewDirectory();
        var model = new DownloadModel { Id = "delete-test-" + Guid.NewGuid(), Status = DownloadStatus.Quarantined,
            SavePath = Path.Combine(dir, "existing.bin"), QuarantinePath = Path.Combine(dir, "blocked.bin") };
        try
        {
            await File.WriteAllTextAsync(model.SavePath, "user file");
            await File.WriteAllTextAsync(model.QuarantinePath, "blocked file");
            await DownloadDestinationService.DeleteConfirmedFileAsync(model);
            Assert.Equal("user file", await File.ReadAllTextAsync(model.SavePath));
            Assert.False(File.Exists(model.QuarantinePath));
        }
        finally { Directory.Delete(dir, true); }
    }
    [Fact]
    public async Task MediaRange_RejectsMissingContentRangeBeforeWriting()
    {
        string file = Path.GetTempFileName();
        try
        {
            await File.WriteAllBytesAsync(file, new byte[100]);
            using var client = new HttpClient(new Handler(_ => new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = new ByteArrayContent(Enumerable.Repeat((byte)99, 100).ToArray()) }));
            var worker = new SegmentWorker(client, "https://fixture.invalid/media", file, 1, 0, 99);
            var queue = new ConcurrentQueue<ChunkRange>(new[] { new ChunkRange(0, 99) });
            await worker.ExecuteChunkQueueAsync(queue, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(4));
            Assert.NotNull(worker.LastError);
            Assert.Equal(new byte[100], await File.ReadAllBytesAsync(file));
        }
        finally { File.Delete(file); }
    }
    [Fact]
    public async Task RefreshAddress_RejectsDifferentAssetAndNonHttp_AndPersistsSameResource()
    {
        var repo = new InMemoryDatabaseRepository();
        var engine = new DownloadEngine(repo, new DirectCleanSafetyScanner());
        var model = new DownloadModel { Url = "https://fixture.invalid/file?token=old", Status = DownloadStatus.Paused, ETag = "old" };
        await Assert.ThrowsAsync<ArgumentException>(() => engine.RefreshDownloadAddressAsync(model, "file:///private"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.RefreshDownloadAddressAsync(model, "https://fixture.invalid/other?token=new"));
        Assert.EndsWith("old", model.Url);
        await engine.RefreshDownloadAddressAsync(model, "https://fixture.invalid/file?token=new");
        Assert.Empty(model.ETag); Assert.EndsWith("new", Assert.Single(await repo.GetAllDownloadsAsync()).Url);
        model.ManifestText = "captured playlist";
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.RefreshDownloadAddressAsync(model, "https://fixture.invalid/file?token=next"));
    }

    [Fact]
    public async Task PausedRename_MovesBackingFileAndKeepsItsBytes()
    {
        string dir = NewDirectory();
        var model = new DownloadModel { Id = "rename-test-" + Guid.NewGuid(), SavePath = Path.Combine(dir, "old.bin"), Status = DownloadStatus.Paused };
        string stage = DownloadEngine.GetDownloadStagingDirectory(model.Id);
        try
        {
            await File.WriteAllTextAsync(Path.Combine(stage, "old.bin"), "partial bytes");
            await new DownloadDestinationService(new InMemoryDatabaseRepository()).MoveAsync(model, dir, "new.bin");
            Assert.Equal("partial bytes", await File.ReadAllTextAsync(Path.Combine(stage, "new.bin")));
            Assert.False(File.Exists(Path.Combine(stage, "old.bin")));
        }
        finally { Directory.Delete(dir, true); Directory.Delete(stage, true); }
    }
    [Fact]
    public void ExpiredMedia_SelectsOnlyTheExactRepresentation()
    {
        var formats = new[] { new MediaFormatDto { FormatId = "137_mp4_140" }, new MediaFormatDto { FormatId = "248_webm_251" } };
        Assert.Same(formats[0], MediaRepresentation.SelectExact(formats, "137_mp4_140"));
        Assert.Null(MediaRepresentation.SelectExact(formats, "1080p"));
        Assert.Null(MediaRepresentation.SelectExact(new[] { formats[0], formats[0] }, "137_mp4_140"));
        Assert.True(MediaRepresentation.IsExpired("https://cdn.invalid/file?expire=100", DateTimeOffset.FromUnixTimeSeconds(200)));
        Assert.False(MediaRepresentation.IsExpired("https://cdn.invalid/file?expire=1000", DateTimeOffset.FromUnixTimeSeconds(200)));
    }

    [Fact]
    public async Task Settings_SaveAtomicallyAndSurviveRestart()
    {
        string dir = NewDirectory();
        try
        {
            var service = new SettingsService(dir);
            var settings = new AppSettingsModel { DefaultDownloadDirectory = dir, MaxParallelSegments = 4, MaxRetries = 0, CloseToTray = false };
            await service.SaveAppSettingsAsync(settings);
            var loaded = await new SettingsService(dir).LoadAppSettingsAsync();
            Assert.Equal(dir, loaded.DefaultDownloadDirectory); Assert.Equal(4, loaded.MaxParallelSegments);
            Assert.Equal(0, loaded.MaxRetries); Assert.False(loaded.CloseToTray);
            Assert.Empty(Directory.GetFiles(dir, "*.tmp"));
            await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => service.SaveAppSettingsAsync(new() { MaxParallelSegments = 0 }));
            Assert.Equal(4, (await new SettingsService(dir).LoadAppSettingsAsync()).MaxParallelSegments);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public async Task RepresentationAndSafetyEvidenceSurviveDatabaseRestart()
    {
        string dir = NewDirectory();
        try
        {
            string path = Path.Combine(dir, "history.db");
            var repository = new SqliteDatabaseRepository(path);
            var model = new DownloadModel { SourcePageUrl = "https://www.youtube.com/watch?v=abcdef12345", FormatId = "137_mp4_140",
                SafetyVerdict = SafetyVerdict.ScannerUnavailable, SafetyDetails = "Not scanned", AvScannerName = "None", QuarantinePath = "blocked-file" };
            await repository.InitializeAsync(); await repository.SaveDownloadAsync(model);
            var loaded = Assert.Single(await new SqliteDatabaseRepository(path).GetAllDownloadsAsync());
            Assert.Equal(model.SourcePageUrl, loaded.SourcePageUrl); Assert.Equal(model.FormatId, loaded.FormatId);
            Assert.Equal(SafetyVerdict.ScannerUnavailable, loaded.SafetyVerdict); Assert.Equal("Not scanned", loaded.SafetyDetails);
            Assert.Equal("blocked-file", loaded.QuarantinePath);
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); Directory.Delete(dir, true); }
    }
    [Theory]
    [InlineData("https://example.invalid/file?v=abcdef12345", false)]
    [InlineData("https://youtube.com.evil.invalid/watch?v=abcdef12345", false)]
    [InlineData("https://notyoutu.be/abcdef12345", false)]
    [InlineData("https://youtube.com/watch?v=short", false)]
    [InlineData("file:///watch?v=abcdef12345", false)]
    [InlineData("https://www.youtube.com/watch?v=abcdef12345", true)]
    [InlineData("https://youtu.be/abcdef12345", true)]
    [InlineData("https://m.youtube.com/shorts/abcdef12345", true)]
    public void YouTubeRouting_RequiresExactHostAndId(string url, bool expected)
        => Assert.Equal(expected, YouTubeMediaResolver.IsYouTubeUrl(url));

    private sealed class Runner(int? code) : IScannerProcessRunner
    {
        public IReadOnlyList<string>? Arguments;
        public Task<int?> RunAsync(string executable, IReadOnlyList<string> arguments, CancellationToken token)
        { Arguments = arguments; token.ThrowIfCancellationRequested(); return Task.FromResult(code); }
    }

    [Theory]
    [InlineData(0, SafetyVerdict.NoThreatsDetected)]
    [InlineData(2, SafetyVerdict.MalwareDetected)]
    [InlineData(7, SafetyVerdict.ScanFailed)]
    [InlineData(null, SafetyVerdict.ScanFailed)]
    public async Task Scanner_ReportsActualExitEvidence(int? code, SafetyVerdict expected)
    {
        string path = Path.GetTempFileName();
        try
        {
            var runner = new Runner(code);
            var scan = await new SafetyScannerService(runner, Path.GetFullPath("scanner.exe"), true).ScanFileAsync(path);
            Assert.Equal(expected, scan.Verdict);
            Assert.Equal(code == 0, scan.IsClean);
            Assert.Contains(path, runner.Arguments!);
            Assert.NotEmpty(scan.Sha256Hash);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task Scanner_MissingFileIsNeverClean()
    {
        var result = await new SafetyScannerService(new Runner(0)).ScanFileAsync(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()));
        Assert.False(result.IsClean); Assert.Equal(SafetyVerdict.ScanFailed, result.Verdict);
    }

    [Fact]
    public async Task Scanner_UnavailableIsNeverClean()
    {
        string path = Path.GetTempFileName();
        try
        {
            var result = await new SafetyScannerService(new ScannerProcessRunner(), Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()), true).ScanFileAsync(path);
            Assert.False(result.IsClean); Assert.NotEqual(SafetyVerdict.NoThreatsDetected, result.Verdict);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task Threat_StaysBlockedAndPreservesExistingDestination()
    {
        string dir = NewDirectory();
        try
        {
            string original = Path.Combine(dir, "existing.bin"), staged = Path.Combine(dir, "staged.bin");
            await File.WriteAllTextAsync(original, "keep"); await File.WriteAllTextAsync(staged, "blocked bytes");
            var repo = new InMemoryDatabaseRepository(); var engine = new DownloadEngine(repo, new DirectCleanSafetyScanner());
            var model = new DownloadModel { SavePath = original };
            Assert.False(await engine.FinalizeDownloadIntegrityAsync(model, new() { HasThreat = true, Verdict = SafetyVerdict.MalwareDetected }, staged));
            Assert.Equal("keep", await File.ReadAllTextAsync(original));
            Assert.Equal("blocked bytes", await File.ReadAllTextAsync(model.QuarantinePath!));
            Assert.True(model.IsQuarantined);
        }
        finally { Directory.Delete(dir, true); }
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => Task.FromResult(response(request));
    }

    [Theory]
    [InlineData(false, false, true)]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    public async Task MediaCheckpoint_RequiresRemoteIdentityAndLocalHash(bool changedETag, bool tampered, bool expected)
    {
        string path = Path.GetTempFileName();
        try
        {
            await File.WriteAllTextAsync(path, "payload");
            await MediaCheckpoint.SaveAsync(path, "selected representation", "\"v1\"", 7, default);
            if (tampered) await File.WriteAllTextAsync(path, "changed");
            using var client = new HttpClient(new Handler(_ =>
            {
                var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[7]) };
                response.Headers.ETag = new EntityTagHeaderValue(changedETag ? "\"v2\"" : "\"v1\""); return response;
            }));
            using var request = new HttpRequestMessage(HttpMethod.Head, "https://fixture.invalid/segment");
            Assert.Equal(expected, await MediaCheckpoint.CanReuseAsync(path, "selected representation", client, request, default));
            using var other = new HttpRequestMessage(HttpMethod.Head, "https://fixture.invalid/segment");
            Assert.False(await MediaCheckpoint.CanReuseAsync(path, "different episode", client, other, default));
        }
        finally { File.Delete(path); File.Delete(path + ".checkpoint"); }
    }

    [Fact]
    public async Task PermanentHlsFailure_StopsWaitingSibling()
    {
        string dir = NewDirectory();
        using var stop = new CancellationTokenSource();
        using var client = new HttpClient(new Handler(_ => new HttpResponseMessage(HttpStatusCode.NotFound)));
        try
        {
            var queue = new ConcurrentQueue<HlsSegmentTask>(new[] { new HlsSegmentTask { Url = "https://fixture.invalid/segment", TargetPath = Path.Combine(dir, "chunk.ts") } });
            var a = new SegmentWorker(client, "https://fixture.invalid/a", Path.Combine(dir, "a"), 1, 0, 0);
            var b = new SegmentWorker(client, "https://fixture.invalid/a", Path.Combine(dir, "b"), 2, 0, 0);
            void Fail(string _) => stop.Cancel();
            await Task.WhenAll(a.ExecuteHlsChunkQueueAsync(queue, () => false, stop.Token, onFatalError: Fail),
                b.ExecuteHlsChunkQueueAsync(queue, () => false, stop.Token, onFatalError: Fail)).WaitAsync(TimeSpan.FromSeconds(4));
            Assert.True(stop.IsCancellationRequested);
            Assert.True(a.LastError != null || b.LastError != null);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public async Task Scheduler_BoundsGlobalAndPerHostAndCancelsWaiters()
    {
        var scheduler = new TransferScheduler(2, 1);
        using var first = await scheduler.EnterAsync("a.invalid", default);
        using var second = await scheduler.EnterAsync("b.invalid", default);
        using var stop = new CancellationTokenSource();
        var same = scheduler.EnterAsync("a.invalid", stop.Token);
        var third = scheduler.EnterAsync("c.invalid", stop.Token);
        Assert.False(same.IsCompleted); Assert.False(third.IsCompleted);
        stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => same);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => third);
        second.Dispose();
        using var replacement = await scheduler.EnterAsync("c.invalid", default);
    }

    [Fact]
    public async Task Move_PreservesCollisionAndPersistsSuccess()
    {
        string dir = NewDirectory();
        try
        {
            string source = Path.Combine(dir, "source.bin"), target = Path.Combine(dir, "target.bin");
            await File.WriteAllTextAsync(source, "source"); await File.WriteAllTextAsync(target, "target");
            var repo = new InMemoryDatabaseRepository();
            var model = new DownloadModel { SavePath = source, Title = "source.bin", Status = DownloadStatus.Completed };
            var service = new DownloadDestinationService(repo);
            await Assert.ThrowsAsync<IOException>(() => service.MoveAsync(model, dir, "target.bin"));
            Assert.Equal(source, model.SavePath); Assert.Equal("target", await File.ReadAllTextAsync(target));
            await Assert.ThrowsAsync<ArgumentException>(() => service.MoveAsync(model, dir, "../outside"));
            await service.MoveAsync(model, dir, "renamed.bin");
            Assert.Equal("source", await File.ReadAllTextAsync(model.SavePath));
            Assert.Equal(model.SavePath, Assert.Single(await repo.GetAllDownloadsAsync()).SavePath);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Theory]
    [InlineData("v9.0.0")]
    [InlineData("sdm2-v2.1")]
    [InlineData("sdm2-v2.1.0-beta")]
    [InlineData("sdm2-v02.1.0")]
    public void Update_RejectsAmbiguousTrackOrVersion(string tag) => Assert.Null(UpdateCheckerService.ParseVersion(tag));

    [Theory]
    [InlineData("sdm2-v2.1.0", "win-x64", false, true)]
    [InlineData("sdm2-v1.9.0", "win-x64", false, false)]
    [InlineData("v9.0.0", "win-x64", false, false)]
    [InlineData("sdm2-v2.1.0", "linux-x64", false, false)]
    [InlineData("sdm2-v2.1.0", "win-x64", true, false)]
    public async Task Update_RequiresNewerTrackArchitectureAndDigest(string tag, string rid, bool missingDigest, bool available)
    {
        var (checker, _) = UpdateFixture(tag, rid, missingDigest, false);
        Assert.Equal(available, (await checker.CheckForUpdatesAsync()).UpdateAvailable);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Update_VerifiesBytesAndNeverExecutes(bool corrupted)
    {
        var (checker, dir) = UpdateFixture("sdm2-v2.1.0", "win-x64", false, corrupted);
        try
        {
            var release = await checker.CheckForUpdatesAsync();
            Assert.True(release.UpdateAvailable);
            if (corrupted) await Assert.ThrowsAsync<InvalidDataException>(() => checker.DownloadAndInstallUpdateAsync(release.DownloadUrl!));
            else Assert.True(File.Exists(await checker.DownloadAndInstallUpdateAsync(release.DownloadUrl!)));
            Assert.Empty(Directory.GetFiles(dir, "*.pending", SearchOption.AllDirectories));
            await Assert.ThrowsAsync<InvalidOperationException>(() => checker.DownloadAndInstallUpdateAsync("https://evil.invalid/payload.exe"));
        }
        finally { Directory.Delete(dir, true); }
    }

    private static (UpdateCheckerService, string) UpdateFixture(string tag, string rid, bool missing, bool corrupt)
    {
        byte[] bytes = Encoding.UTF8.GetBytes("verified archive fixture");
        string version = tag.StartsWith("sdm2-v") ? tag[6..] : "9.0.0";
        string name = $"SmartDM-sdm2-{version}-{rid}.zip";
        string url = $"https://github.com/ifahad2k/SmartDM/releases/download/{tag}/{name}";
        string json = JsonSerializer.Serialize(new[] { new { tag_name = tag, draft = false, prerelease = false, body = "fixture", assets = new[] {
            new { name, browser_download_url = url, size = bytes.Length, digest = missing ? "" : "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)) } } } });
        var client = new HttpClient(new Handler(request => new(HttpStatusCode.OK) { RequestMessage = request,
            Content = request.RequestUri!.Host == "api.github.com" ? new StringContent(json) : new ByteArrayContent(corrupt ? new byte[bytes.Length] : bytes) }));
        string dir = NewDirectory();
        return (new UpdateCheckerService(client, "win-x64", dir), dir);
    }

    private static string NewDirectory() { string dir = Path.Combine(Path.GetTempPath(), "smartdm-goal-test-" + Guid.NewGuid()); Directory.CreateDirectory(dir); return dir; }
}
