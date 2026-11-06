using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class TransferIntegrityTests
{
    [Fact]
    public async Task DownloadEngine_FfmpegPath_RequiresMatchingChecksum()
    {
        string directory = Path.Combine(Path.GetTempPath(), "smartdm_ffmpeg_pin_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        string executable = Path.Combine(directory, OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg");
        try
        {
            byte[] contents = Encoding.ASCII.GetBytes("installed binary fixture");
            await File.WriteAllBytesAsync(executable, contents);
            string checksum = Convert.ToHexString(SHA256.HashData(contents));
            Assert.Equal(executable, DownloadEngine.ResolveVerifiedFfmpegPath(executable, checksum));
            Assert.Null(DownloadEngine.ResolveVerifiedFfmpegPath(executable, new string('0', 64)));
            Assert.Null(DownloadEngine.ResolveVerifiedFfmpegPath(executable, null));
            await File.WriteAllTextAsync(executable, "modified binary fixture");
            Assert.Null(DownloadEngine.ResolveVerifiedFfmpegPath(executable, checksum));
        }
        finally
        {
            try { Directory.Delete(directory, true); } catch { }
        }
    }

    [Fact]
    public async Task MainViewModel_SavedHttpSpeedLimit_ControlsTransferEngine()
    {
        var settings = new InMemorySettingsService();
        await settings.SaveAppSettingsAsync(new AppSettingsModel
        {
            EnableSpeedLimit = true,
            DefaultSpeedLimitKbps = 250
        });
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
        var viewModel = new MainViewModel(engine: engine, settingsService: settings, isDemoMode: true);

        Assert.Equal(250 * 1024, engine.SpeedLimiter.LimitBytesPerSec);
        Assert.Contains("HTTP Speed Limit", viewModel.ThrottlingStatus);

        await settings.SaveAppSettingsAsync(new AppSettingsModel { EnableSpeedLimit = false });
        viewModel.RefreshEngineMetrics();
        Assert.Equal(0, engine.SpeedLimiter.LimitBytesPerSec);
    }

    [Fact]
    public async Task SegmentWorker_OneByteRange_RequiresPartialContentAndWritesOneByte()
    {
        await using var server = new TestHttpServer(new byte[] { 0x5a });
        string tempFile = Path.Combine(Path.GetTempPath(), "test_one_byte_" + Guid.NewGuid().ToString("N") + ".bin");
        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/one.bin", tempFile, 1, 0, 0);
            await worker.ExecuteAsync(CancellationToken.None);
            Assert.True(worker.Progress.IsCompleted);
            Assert.Equal(1, worker.Progress.DownloadedBytes);
            Assert.Equal(new byte[] { 0x5a }, await File.ReadAllBytesAsync(tempFile));
        }
        finally
        {
            try { File.Delete(tempFile); } catch { }
        }
    }

    [Fact]
    public async Task SegmentWorker_RejectsChangedResourceLength()
    {
        await using var server = new TestHttpServer(new byte[128], ServerFaultMode.ChangedResourceLength);
        string tempFile = Path.Combine(Path.GetTempPath(), "test_changed_length_" + Guid.NewGuid().ToString("N") + ".bin");
        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/file.bin", tempFile, 1, 0, 127,
                expectedTotalBytes: 128);
            await Assert.ThrowsAsync<HttpRequestException>(() => worker.ExecuteAsync(CancellationToken.None));
            Assert.False(worker.Progress.IsCompleted);
            Assert.False(File.Exists(tempFile));
        }
        finally
        {
            try { File.Delete(tempFile); } catch { }
        }
    }

    [Fact]
    public async Task SegmentWorker_StrongETag_SendsIfRangeAndRejectsChangedResource()
    {
        await using var server = new TestHttpServer(new byte[16], ServerFaultMode.Return200OkOnSubrange);
        string tempFile = Path.Combine(Path.GetTempPath(), "test_if_range_" + Guid.NewGuid().ToString("N") + ".bin");
        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/file.bin", tempFile, 1, 0, 15,
                expectedTotalBytes: 16, expectedETag: "\"version-one\"");
            await Assert.ThrowsAsync<HttpRequestException>(() => worker.ExecuteAsync(CancellationToken.None));
            Assert.Equal("\"version-one\"", server.LastIfRange);
            Assert.False(worker.Progress.IsCompleted);
        }
        finally
        {
            try { File.Delete(tempFile); } catch { }
        }
    }

    // =========================================================================
    // C-04: Staging Directory Reconciliation
    // =========================================================================
    [Fact]
    public void CleanupOrphanStagingDirectories_PreservesActiveAndPausedDownloads()
    {
        string activeId = "active_" + Guid.NewGuid().ToString("N");
        string pausedId = "paused_" + Guid.NewGuid().ToString("N");
        string orphanId = "orphan_" + Guid.NewGuid().ToString("N");

        string activeDir = DownloadEngine.GetDownloadStagingDirectory(activeId);
        string pausedDir = DownloadEngine.GetDownloadStagingDirectory(pausedId);
        string orphanDir = DownloadEngine.GetDownloadStagingDirectory(orphanId);

        File.WriteAllText(Path.Combine(activeDir, "chunk_active.bin"), "active data");
        File.WriteAllText(Path.Combine(pausedDir, "chunk_paused.bin"), "paused data");
        File.WriteAllText(Path.Combine(orphanDir, "chunk_orphan.bin"), "orphan data");

        try
        {
            var activeOrResumable = new HashSet<string> { activeId, pausedId };
            // Execute cleanup passing known active/paused IDs
            DownloadEngine.CleanupOrphanStagingDirectories(activeOrResumable);

            // Active and paused directories MUST be preserved
            Assert.True(Directory.Exists(activeDir), "Active staging directory must be preserved across startup/reconciliation.");
            Assert.True(Directory.Exists(pausedDir), "Paused staging directory must be preserved across startup/reconciliation.");
            Assert.True(File.Exists(Path.Combine(activeDir, "chunk_active.bin")));
            Assert.True(File.Exists(Path.Combine(pausedDir, "chunk_paused.bin")));

            // Orphan directory with no active/paused download MUST be purged
            Assert.False(Directory.Exists(orphanDir), "Orphan staging directory without active/paused session must be cleaned up.");
        }
        finally
        {
            try { if (Directory.Exists(activeDir)) Directory.Delete(activeDir, true); } catch { }
            try { if (Directory.Exists(pausedDir)) Directory.Delete(pausedDir, true); } catch { }
            try { if (Directory.Exists(orphanDir)) Directory.Delete(orphanDir, true); } catch { }
        }
    }

    // =========================================================================
    // H-01: Malformed Range Response & Truncation Rejection
    // =========================================================================
    [Fact]
    public async Task SegmentWorker_RejectsMalformedContentRangeBounds()
    {
        byte[] payload = new byte[128];
        for (int i = 0; i < payload.Length; i++) payload[i] = (byte)i;

        // Server configured to return Content-Range: bytes 0-3/128 when 4-7 is requested
        await using var server = new TestHttpServer(payload, ServerFaultMode.MalformedContentRangeBounds);
        string tempFile = Path.Combine(Path.GetTempPath(), "test_range_bounds_" + Guid.NewGuid().ToString("N") + ".bin");

        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/test", tempFile, 1, startByte: 4, endByte: 7);

            // Worker must reject mismatched Content-Range with HttpRequestException
            await Assert.ThrowsAsync<HttpRequestException>(async () =>
            {
                await worker.ExecuteAsync(CancellationToken.None);
            });

            Assert.False(worker.Progress.IsCompleted, "Worker must NOT be marked completed when Content-Range bounds mismatch.");
        }
        finally
        {
            try { if (File.Exists(tempFile)) File.Delete(tempFile); } catch { }
        }
    }

    [Fact]
    public async Task SegmentWorker_Rejects200OkOnSubrangeRequest()
    {
        byte[] payload = new byte[128];
        // Server sends 200 OK full body when a subrange was requested
        await using var server = new TestHttpServer(payload, ServerFaultMode.Return200OkOnSubrange);
        string tempFile = Path.Combine(Path.GetTempPath(), "test_subrange_200_" + Guid.NewGuid().ToString("N") + ".bin");

        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/test", tempFile, 1, startByte: 10, endByte: 20);

            await Assert.ThrowsAsync<HttpRequestException>(async () =>
            {
                await worker.ExecuteAsync(CancellationToken.None);
            });

            Assert.False(worker.Progress.IsCompleted, "Worker must NOT complete when server returns 200 OK for sub-range.");
        }
        finally
        {
            try { if (File.Exists(tempFile)) File.Delete(tempFile); } catch { }
        }
    }

    [Fact]
    public async Task SegmentWorker_RejectsPrematurelyTruncatedStream()
    {
        byte[] payload = new byte[128];
        // Server truncates after 2 bytes
        await using var server = new TestHttpServer(payload, ServerFaultMode.TruncateStreamPrematurely);
        string tempFile = Path.Combine(Path.GetTempPath(), "test_truncated_" + Guid.NewGuid().ToString("N") + ".bin");

        try
        {
            using var http = new HttpClient();
            var worker = new SegmentWorker(http, server.BaseUrl + "/test", tempFile, 1, startByte: 0, endByte: 63);

            // Stream truncation must throw EndOfStreamException or IOException
            await Assert.ThrowsAnyAsync<Exception>(async () =>
            {
                await worker.ExecuteAsync(CancellationToken.None);
            });

            Assert.False(worker.Progress.IsCompleted, "Truncated worker must NOT be marked completed.");
        }
        finally
        {
            try { if (File.Exists(tempFile)) File.Delete(tempFile); } catch { }
        }
    }

    // =========================================================================
    // H-02: Unknown-Length EOF Validation
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_UnknownLengthStream_FailsWhenConnectionAborts()
    {
        byte[] payload = new byte[64];
        // Server sends 4 bytes chunked and abruptly aborts socket
        await using var server = new TestHttpServer(payload, ServerFaultMode.TruncateStreamPrematurely);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_h02_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "unknown_abort.bin");

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, scanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Unknown Length Abort Test",
                Url = server.BaseUrl + "/stream",
                SavePath = savePath,
                TotalBytes = -1, // Unknown length
                ParallelThreads = 1,
                Status = DownloadStatus.Queued
            };

            var tcs = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == download.Id && (dl.Status == DownloadStatus.Failed || dl.Status == DownloadStatus.Completed))
                {
                    tcs.TrySetResult(dl.Status);
                }
            };

            await engine.StartDownloadAsync(download);
            var finalStatus = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Failed, finalStatus);
            Assert.Equal(DownloadStatus.Failed, download.Status);
            Assert.Contains("Failed", download.Subline);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // =========================================================================
    // H-07: Expected SHA-256 Field & Honest Verdicts
    // =========================================================================
    [Theory]
    [InlineData("a1b2c3d4", "A1B2C3D4", true)]
    [InlineData("abcdef123456", "abcdef123456", true)]
    [InlineData("abcdef123456", "abcdef999999", false)]
    [InlineData("abcdef", "abc", false)]
    [InlineData("", "abc", false)]
    public void VerifyHashConstantTime_ValidatesCorrectly(string hashA, string hashB, bool expectedMatch)
    {
        bool result = DownloadEngine.VerifyHashConstantTime(hashA, hashB);
        Assert.Equal(expectedMatch, result);
    }

    [Fact]
    public async Task DownloadEngine_ExpectedSha256_FailsOnMismatchAndPurgesOutput()
    {
        byte[] payload = Encoding.UTF8.GetBytes("Exact Known Data Payload for SHA-256 Verification");
        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_h07_mismatch_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "mismatch_output.bin");

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, scanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Expected Hash Mismatch Test",
                Url = server.BaseUrl + "/file.bin",
                SavePath = savePath,
                TotalBytes = payload.Length,
                ParallelThreads = 2,
                Status = DownloadStatus.Queued,
                ExpectedSha256 = "0000000000000000000000000000000000000000000000000000000000000000" // Deliberate mismatch
            };

            var tcs = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == download.Id && (dl.Status == DownloadStatus.Failed || dl.Status == DownloadStatus.Completed))
                {
                    tcs.TrySetResult(dl.Status);
                }
            };

            await engine.StartDownloadAsync(download);
            var finalStatus = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Failed, finalStatus);
            Assert.Contains("Checksum Mismatch", download.Subline);
            Assert.Contains("Integrity Failure", download.StatusDetail);
            Assert.False(File.Exists(savePath), "Unverified/mismatched output file must NOT be left at final destination.");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    [Fact]
    public async Task DownloadEngine_ExpectedSha256_SucceedsOnMatch()
    {
        byte[] payload = Encoding.UTF8.GetBytes("Exact Known Data Payload for Successful SHA-256 Verification");
        string expectedSha;
        using (var sha = SHA256.Create())
        {
            expectedSha = Convert.ToHexString(sha.ComputeHash(payload)).ToLowerInvariant();
        }

        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_h07_match_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "verified_output.bin");

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, scanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Expected Hash Match Test",
                Url = server.BaseUrl + "/file.bin",
                SavePath = savePath,
                TotalBytes = payload.Length,
                ParallelThreads = 2,
                Status = DownloadStatus.Queued,
                ExpectedSha256 = expectedSha
            };

            var tcs = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == download.Id && (dl.Status == DownloadStatus.Failed || dl.Status == DownloadStatus.Completed))
                {
                    tcs.TrySetResult(dl.Status);
                }
            };

            await engine.StartDownloadAsync(download);
            var finalStatus = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Completed, finalStatus);
            Assert.Contains("Checksum Verified", download.Subline);
            Assert.Contains("Expected SHA-256 matched", download.StatusDetail);
            Assert.True(File.Exists(savePath));
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // =========================================================================
    // H-08: File Catalog Duplicate Detection (Candidate vs Identical)
    // =========================================================================
    [Fact]
    public async Task FileCatalogService_FilenameOnlyMatch_IsCandidateNotIdentical()
    {
        string dbPath = Path.Combine(Path.GetTempPath(), $"catalog_test_{Guid.NewGuid():N}.db");
        string dummyFile = Path.Combine(Path.GetTempPath(), $"existing_file_{Guid.NewGuid():N}.iso");
        File.WriteAllText(dummyFile, "Catalog Test File Content A");

        try
        {
            var catalog = new FileCatalogService(dbPath);
            await catalog.IndexFileAsync(dummyFile, "https://example.com/fileA.iso", "hash_aaaa_1111");

            // Query with same filename but a DIFFERENT expected hash
            var match = await catalog.FindDuplicateAsync(
                url: "https://example.com/different_url.iso",
                fileName: Path.GetFileName(dummyFile),
                expectedSha256: "hash_bbbb_2222");

            Assert.NotNull(match);
            Assert.Contains("Candidate Duplicate", match.MatchReason);
            Assert.DoesNotContain("Identical File", match.MatchReason);

            // Query with same filename and MATCHING expected hash
            var exactMatch = await catalog.FindDuplicateAsync(
                url: "https://example.com/different_url.iso",
                fileName: Path.GetFileName(dummyFile),
                expectedSha256: "hash_aaaa_1111");

            Assert.NotNull(exactMatch);
            Assert.Contains("Identical File", exactMatch.MatchReason);
            Assert.Contains("SHA-256 Verified", exactMatch.MatchReason);
        }
        finally
        {
            try { File.Delete(dbPath); } catch { }
            try { File.Delete(dummyFile); } catch { }
        }
    }

    // =========================================================================
    // H-09: Signed Media CDN URL Collision Prevention
    // =========================================================================
    [Fact]
    public void MainViewModel_FindActiveDownloadByUrl_PreventsCdnVideoplaybackCollisions()
    {
        var mainVm = new MainViewModel(isDemoMode: true);
        string streamUrlA = "https://rr3---sn-4g5edn6s.googlevideo.com/videoplayback?expire=12345&id=videoA_stream";
        string streamUrlB = "https://rr3---sn-4g5edn6s.googlevideo.com/videoplayback?expire=99999&id=videoB_stream";

        var activeDl = new DownloadModel
        {
            Id = Guid.NewGuid().ToString(),
            Title = "Video A",
            Url = streamUrlA,
            SourcePageUrl = "https://www.youtube.com/watch?v=videoA",
            Status = DownloadStatus.Active,
            SavePath = @"C:\Users\test\Downloads\videoA.mp4"
        };
        mainVm.Downloads.Add(activeDl);

        var field = typeof(MainViewModel).GetField("_allMasterDownloads", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        var allList = field?.GetValue(mainVm) as List<DownloadModel>;
        allList?.Insert(0, activeDl);

        // 1. Querying with streamUrlB must NOT match activeDl (different video id!)
        var collisionMatch = mainVm.FindActiveDownloadByUrl(streamUrlB);
        Assert.Null(collisionMatch);

        // 2. Querying with a different expire parameter but SAME id MUST match
        string sameVideoFreshToken = "https://rr3---sn-4g5edn6s.googlevideo.com/videoplayback?expire=55555&id=videoA_stream";
        var sameVideoMatch = mainVm.FindActiveDownloadByUrl(sameVideoFreshToken);
        Assert.NotNull(sameVideoMatch);
        Assert.Equal(activeDl.Id, sameVideoMatch.Id);
    }

    // =========================================================================
    // M-01: Direct URL Filename Inference
    // =========================================================================
    [Fact]
    public async Task HttpProbeService_InfersFilenameFromUrlPathAndMimeType()
    {
        byte[] payload = Encoding.UTF8.GetBytes("%PDF-1.4 Mock PDF Document");
        await using var server = new TestHttpServer(payload);
        server.CustomContentType = "application/pdf";

        var probeService = new HttpProbeService();
        // URL has a path "/reports/quarterly_financials.pdf" with no Content-Disposition header
        var result = await probeService.ProbeUrlAsync($"{server.BaseUrl}/reports/quarterly_financials.pdf");

        Assert.True(result.IsSuccess);
        Assert.Equal("quarterly_financials.pdf", result.FileName);
        Assert.Equal("Documents", result.SuggestedCategory);
        Assert.DoesNotContain(".mp4", result.FileName);
    }

    [Fact]
    public void HttpProbeService_GetExtensionFromMimeType_MapsCorrectly()
    {
        Assert.Equal(".pdf", HttpProbeService.GetExtensionFromMimeType("application/pdf"));
        Assert.Equal(".zip", HttpProbeService.GetExtensionFromMimeType("application/zip"));
        Assert.Equal(".png", HttpProbeService.GetExtensionFromMimeType("image/png"));
        Assert.Equal(".mp3", HttpProbeService.GetExtensionFromMimeType("audio/mpeg"));
        Assert.Equal(".mp4", HttpProbeService.GetExtensionFromMimeType("video/mp4"));
        Assert.Equal(".bin", HttpProbeService.GetExtensionFromMimeType("application/octet-stream"));
    }

    // =========================================================================
    // M-02: Aggregate Speed Limiter Throttling
    // =========================================================================
    [Fact]
    public async Task AggregateSpeedLimiter_ThrottlesBandwidth()
    {
        // Limit to 50 KB/sec
        long limitBytesPerSec = 50 * 1024;
        var limiter = new AggregateSpeedLimiter(limitBytesPerSec);

        // Read 30 KB twice (total 60 KB, exceeding 1-second allocation)
        var sw = Stopwatch.StartNew();
        await limiter.ThrottleAsync(30 * 1024);
        await limiter.ThrottleAsync(30 * 1024);
        sw.Stop();

        // 60 KB at 50 KB/s must take at least 150ms of throttling wait time
        Assert.True(sw.ElapsedMilliseconds >= 120, $"Speed limiter must throttle: took {sw.ElapsedMilliseconds}ms");
    }

    // =========================================================================
    // M-03: Add to Queue Command Binding & Queued State
    // =========================================================================
    [Fact]
    public async Task AddDownloadViewModel_AddToQueueCommand_CreatesQueuedDownloadWithoutStarting()
    {
        var repo = new InMemoryDatabaseRepository();
        DownloadModel? createdDl = null;

        var addVm = new AddDownloadViewModel(
            catalogService: new FileCatalogService(),
            initialUrl: "https://example.com/distribution.iso",
            initialFileName: "distribution.iso");

        addVm.ExpectedHash = "abc123expected";
        addVm.DownloadCreated += dl => createdDl = dl;

        // Execute AddToQueueCommand
        await addVm.AddToQueueCommand.ExecuteAsync(null);

        Assert.NotNull(createdDl);
        Assert.Equal(DownloadStatus.Queued, createdDl.Status);
        Assert.Equal("abc123expected", createdDl.ExpectedSha256);
        Assert.Contains("Queue", createdDl.Subline);
    }

    // =========================================================================
    // H-07: Versioned SQLite Schema Migration for Expected SHA-256
    // =========================================================================
    [Fact]
    public async Task SqliteDatabaseRepository_ExpectedSha256_SurvivesRestartAndMigration()
    {
        string tempDir = Path.Combine(Path.GetTempPath(), "test_db_migration_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string dbPath = Path.Combine(tempDir, "smartdm_test.db");

        try
        {
            string expectedHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
            string downloadId = Guid.NewGuid().ToString("N");

            // Session 1: Create repository, initialize migrations, save download
            {
                var repo1 = new SqliteDatabaseRepository(dbPath);
                await repo1.InitializeAsync();

                var dl = new DownloadModel
                {
                    Id = downloadId,
                    Title = "Migration Persistence Test",
                    Url = "https://example.com/testfile.iso",
                    ExpectedSha256 = expectedHash,
                    TotalBytes = 1048576,
                    Status = DownloadStatus.Queued
                };

                await repo1.SaveDownloadAsync(dl);
            }

            // Session 2: Simulate process termination & restart with a new repository instance pointing to the same SQLite DB
            {
                var repo2 = new SqliteDatabaseRepository(dbPath);
                await repo2.InitializeAsync();

                var allDownloads = await repo2.GetAllDownloadsAsync();
                var loaded = allDownloads.FirstOrDefault(d => d.Id == downloadId);

                Assert.NotNull(loaded);
                Assert.Equal(expectedHash, loaded.ExpectedSha256);
            }
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // =========================================================================
    // H-07 / H-06: Pre-Existing Destination Protection on Mismatch
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_ExpectedSha256_Mismatch_NeverOverwritesOrDeletesPreExistingDestination()
    {
        byte[] payload = Encoding.UTF8.GetBytes("Downloaded Stream Payload That Does Not Match Expected Checksum");
        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_protect_dest_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string destinationFile = Path.Combine(tempDir, "important_user_doc.bin");

        const string originalUserData = "USER ORIGINAL CRITICAL DATA - MUST NOT BE OVERWRITTEN OR DELETED";
        await File.WriteAllTextAsync(destinationFile, originalUserData);

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, scanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Destination Protection Test",
                Url = server.BaseUrl + "/data.bin",
                SavePath = destinationFile,
                TotalBytes = payload.Length,
                ParallelThreads = 2,
                Status = DownloadStatus.Queued,
                ExpectedSha256 = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff" // Deliberate mismatch
            };

            var tcs = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == download.Id && (dl.Status == DownloadStatus.Failed || dl.Status == DownloadStatus.Completed))
                {
                    tcs.TrySetResult(dl.Status);
                }
            };

            await engine.StartDownloadAsync(download);
            var finalStatus = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Failed, finalStatus);
            Assert.Equal(DownloadStatus.Failed, download.Status);
            Assert.Contains("Checksum Mismatch", download.Subline);

            // Crucial verification: The pre-existing file must remain intact with identical original data!
            Assert.True(File.Exists(destinationFile), "Pre-existing user file at SavePath must NOT be deleted on hash mismatch.");
            string actualContent = await File.ReadAllTextAsync(destinationFile);
            Assert.Equal(originalUserData, actualContent);

            // The staged file in .temp must be purged
            string stagingDir = DownloadEngine.GetDownloadStagingDirectory(download.Id);
            string stagedFile = Path.Combine(stagingDir, Path.GetFileName(destinationFile));
            Assert.False(File.Exists(stagedFile), "Unverified staging file must be purged from staging directory.");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // =========================================================================
    // C-04: Durable Segment Journal & Crash/Termination Recovery
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_ForcedTermination_ResumesFromDurableJournalWithoutByteLoss()
    {
        // 120 KB total payload: 3 segments of 40 KB each
        byte[] payload = new byte[120 * 1024];
        for (int i = 0; i < payload.Length; i++) payload[i] = (byte)(i % 251);

        string expectedSha;
        using (var sha = SHA256.Create())
        {
            expectedSha = Convert.ToHexString(sha.ComputeHash(payload)).ToLowerInvariant();
        }

        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_forced_term_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "resumed_output.bin");

        string downloadId = "test_resume_" + Guid.NewGuid().ToString("N");
        string stagingDir = DownloadEngine.GetDownloadStagingDirectory(downloadId);
        Directory.CreateDirectory(stagingDir);
        string stagingFilePath = Path.Combine(stagingDir, Path.GetFileName(savePath));

        try
        {
            // Simulate that Segment 1 (bytes 0 to 39999) was fully downloaded before process was forcibly killed
            long seg1End = 39999;
            await using (var fs = new FileStream(stagingFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite))
            {
                fs.SetLength(payload.Length);
                fs.Seek(0, SeekOrigin.Begin);
                await fs.WriteAsync(payload.AsMemory(0, 40000));
            }

            var priorJournal = new List<SegmentProgress>
            {
                new() { SegmentIndex = 1, StartByte = 0, EndByte = seg1End, DownloadedBytes = 40000, IsCompleted = true },
                new() { SegmentIndex = 2, StartByte = 40000, EndByte = 79999, DownloadedBytes = 0, IsCompleted = false },
                new() { SegmentIndex = 3, StartByte = 80000, EndByte = payload.Length - 1, DownloadedBytes = 0, IsCompleted = false }
            };

            // Write durable journal to disk in staging directory as if written by prior session
            DownloadEngine.SaveSegmentJournal(stagingDir, priorJournal);

            // Verify journal file exists on disk
            string journalPath = DownloadEngine.GetSegmentJournalPath(stagingDir);
            Assert.True(File.Exists(journalPath), "Segment journal must exist on disk.");

            // Launch a fresh DownloadEngine (simulating fresh application launch after forced crash/kill)
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var freshEngine = new DownloadEngine(repo, scanner);

            var download = new DownloadModel
            {
                Id = downloadId,
                Title = "Journaled Crash Resume Test",
                Url = server.BaseUrl + "/file.bin",
                SavePath = savePath,
                TotalBytes = payload.Length,
                ParallelThreads = 3,
                Status = DownloadStatus.Queued,
                ExpectedSha256 = expectedSha
            };

            var tcs = new TaskCompletionSource<DownloadStatus>();
            freshEngine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == download.Id && (dl.Status == DownloadStatus.Failed || dl.Status == DownloadStatus.Completed))
                {
                    tcs.TrySetResult(dl.Status);
                }
            };

            // Resume transfer through DownloadEngine
            await freshEngine.StartDownloadAsync(download);
            var finalStatus = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(6));

            Assert.Equal(DownloadStatus.Completed, finalStatus);
            Assert.True(File.Exists(savePath), "Final assembled file must be created at savePath.");
            Assert.Equal(payload.Length, new FileInfo(savePath).Length);

            byte[] finishedBytes = await File.ReadAllBytesAsync(savePath);
            Assert.Equal(payload, finishedBytes);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
            try { if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true); } catch { }
        }
    }

    // =========================================================================
    // M-02: FFmpeg Speed Limit Policy Labeling
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_FfmpegSpeedLimit_HonestlyLabeled()
    {
        var repo = new InMemoryDatabaseRepository();
        var scanner = new DirectCleanSafetyScanner();
        var engine = new DownloadEngine(repo, scanner);

        // Set speed limit to 200 KB/sec
        engine.SetSpeedLimitBytesPerSec(200 * 1024);

        var download = new DownloadModel
        {
            Id = Guid.NewGuid().ToString(),
            Title = "FFmpeg Speed Limit Labeling Test",
            Url = "https://example.com/manifest.mpd", // Triggers FFmpeg session
            SavePath = Path.Combine(Path.GetTempPath(), "dummy_ffmpeg_stream.mp4"),
            TotalBytes = -1,
            Status = DownloadStatus.Queued
        };

        // Start download (triggers RunFfmpegSessionAsync)
        await engine.StartDownloadAsync(download);

        // Allow runner task to enter RunFfmpegSessionAsync
        await Task.Delay(100);

        // Verify status detail honestly discloses that speed limit applies to segmented transfers
        Assert.Contains("speed limiter applies to segmented", download.StatusDetail, StringComparison.OrdinalIgnoreCase);

        // Cancel the session
        await engine.CancelDownloadAsync(download.Id);
    }

    // =========================================================================
    // Destination Conflict Resolution: Default Never Overwrites, Explicit Actions
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_DestinationConflict_DefaultNeverOverwrites_HonorsExplicitActions()
    {
        byte[] payload = Encoding.UTF8.GetBytes("NEWLY DOWNLOADED REPLACEMENT CONTENT");
        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_dest_conflict_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string destFile = Path.Combine(tempDir, "user_existing_document.txt");

        const string originalUserData = "ORIGINAL CRITICAL USER FILE - DO NOT OVERWRITE BY DEFAULT";

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var scanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, scanner);

            // 1. DEFAULT BEHAVIOR: DefaultNeverOverwrite
            await File.WriteAllTextAsync(destFile, originalUserData);
            var dlDefault = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Default Never Overwrite Test",
                Url = server.BaseUrl + "/test1.txt",
                SavePath = destFile,
                TotalBytes = payload.Length,
                ParallelThreads = 1,
                Status = DownloadStatus.Queued,
                ConflictAction = DestinationConflictAction.DefaultNeverOverwrite
            };

            var tcsDefault = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == dlDefault.Id && (dl.Status == DownloadStatus.Completed || dl.Status == DownloadStatus.Failed))
                    tcsDefault.TrySetResult(dl.Status);
            };

            await engine.StartDownloadAsync(dlDefault);
            await tcsDefault.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Completed, dlDefault.Status);
            // Pre-existing user destination file MUST be untouched!
            Assert.Equal(originalUserData, await File.ReadAllTextAsync(destFile));
            // Downloaded file must have been promoted to a unique generated path
            Assert.NotEqual(destFile, dlDefault.SavePath);
            Assert.True(File.Exists(dlDefault.SavePath), "Unique destination file must exist.");
            Assert.Equal(payload, await File.ReadAllBytesAsync(dlDefault.SavePath));

            // 2. EXPLICIT REPLACE
            await File.WriteAllTextAsync(destFile, originalUserData);
            var dlReplace = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Explicit Replace Test",
                Url = server.BaseUrl + "/test2.txt",
                SavePath = destFile,
                TotalBytes = payload.Length,
                ParallelThreads = 1,
                Status = DownloadStatus.Queued,
                ConflictAction = DestinationConflictAction.Replace
            };

            var tcsReplace = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == dlReplace.Id && (dl.Status == DownloadStatus.Completed || dl.Status == DownloadStatus.Failed))
                    tcsReplace.TrySetResult(dl.Status);
            };

            await engine.StartDownloadAsync(dlReplace);
            await tcsReplace.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Completed, dlReplace.Status);
            Assert.Equal(destFile, dlReplace.SavePath);
            Assert.Equal(payload, await File.ReadAllBytesAsync(destFile));

            // 3. EXPLICIT SKIP
            await File.WriteAllTextAsync(destFile, originalUserData);
            var dlSkip = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Explicit Skip Test",
                Url = server.BaseUrl + "/test3.txt",
                SavePath = destFile,
                TotalBytes = payload.Length,
                ParallelThreads = 1,
                Status = DownloadStatus.Queued,
                ConflictAction = DestinationConflictAction.Skip
            };

            var tcsSkip = new TaskCompletionSource<DownloadStatus>();
            engine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == dlSkip.Id && (dl.Status == DownloadStatus.Completed || dl.Status == DownloadStatus.Failed))
                    tcsSkip.TrySetResult(dl.Status);
            };

            await engine.StartDownloadAsync(dlSkip);
            await tcsSkip.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Equal(DownloadStatus.Completed, dlSkip.Status);
            Assert.Contains("skipped", dlSkip.StatusDetail, StringComparison.OrdinalIgnoreCase);
            // Destination file remains completely unchanged
            Assert.Equal(originalUserData, await File.ReadAllTextAsync(destFile));
            // Staging file was purged
            string stagingFile = Path.Combine(DownloadEngine.GetDownloadStagingDirectory(dlSkip.Id), Path.GetFileName(destFile));
            Assert.False(File.Exists(stagingFile), "Staged file must be purged when skipped.");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // =========================================================================
    // Durable Journal Range Validation: Physical Length, Identity, and Validators
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_JournalValidation_EnforcesPhysicalLength_SourceIdentity_AndValidators()
    {
        string tempDir = Path.Combine(Path.GetTempPath(), "test_journal_val_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        string stagingDir = Path.Combine(tempDir, "staging");
        Directory.CreateDirectory(stagingDir);
        string stagingFile = Path.Combine(stagingDir, "test.bin");

        try
        {
            var segments = new List<SegmentProgress>
            {
                new() { SegmentIndex = 1, StartByte = 0, EndByte = 499, DownloadedBytes = 500, IsCompleted = true },
                new() { SegmentIndex = 2, StartByte = 500, EndByte = 999, DownloadedBytes = 200, IsCompleted = false }
            };

            // 1. Missing staging file on disk -> DownloadedBytes clamped to 0 ("never trust recorded byte counts alone")
            DownloadEngine.SaveSegmentJournal(stagingDir, segments, downloadId: "dl_1", sourceUrl: "https://example.com/file.bin", totalBytes: 1000, etag: "\"etag123\"", lastModified: "Wed, 21 Oct 2026 07:28:00 GMT");
            var loadedNoFile = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://example.com/file.bin", 1000, "\"etag123\"", "Wed, 21 Oct 2026 07:28:00 GMT", stagingFilePath: stagingFile);
            Assert.NotNull(loadedNoFile);
            Assert.All(loadedNoFile, s => Assert.Equal(0, s.DownloadedBytes));

            // 2. A physical staging file cannot prove which ranges were flushed.
            byte[] physicalBytes = new byte[300];
            await File.WriteAllBytesAsync(stagingFile, physicalBytes);

            // The journal claims 500 and 200 bytes, but neither claim is durable proof.
            var loadedClamped = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://example.com/file.bin", 1000, "\"etag123\"", "Wed, 21 Oct 2026 07:28:00 GMT", stagingFilePath: stagingFile);
            Assert.NotNull(loadedClamped);
            Assert.All(loadedClamped, s => { Assert.Equal(0, s.DownloadedBytes); Assert.False(s.IsCompleted); });

            // Preallocation makes the file look complete even when its unwritten ranges are zero-filled.
            await using (var file = new FileStream(stagingFile, FileMode.Open, FileAccess.Write))
            {
                file.SetLength(1000);
            }
            var loadedPreallocated = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://example.com/file.bin", 1000, "\"etag123\"", "Wed, 21 Oct 2026 07:28:00 GMT", stagingFilePath: stagingFile);
            Assert.NotNull(loadedPreallocated);
            Assert.All(loadedPreallocated, s => { Assert.Equal(0, s.DownloadedBytes); Assert.False(s.IsCompleted); });

            // 3. Source Identity Mismatch (wrong URL or download ID) -> REJECT journal (returns null)
            var mismatchId = DownloadEngine.LoadAndValidateJournal(stagingDir, "different_id", "https://example.com/file.bin", 1000, "\"etag123\"", stagingFilePath: stagingFile);
            Assert.Null(mismatchId);

            var mismatchUrl = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://other.com/file.bin", 1000, "\"etag123\"", stagingFilePath: stagingFile);
            Assert.Null(mismatchUrl);

            // 4. HTTP Validators Mismatch (ETag or Last-Modified changed on server) -> REJECT journal (returns null)
            var mismatchEtag = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://example.com/file.bin", 1000, "\"new_etag_changed\"", stagingFilePath: stagingFile);
            Assert.Null(mismatchEtag);

            var mismatchLastMod = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_1", "https://example.com/file.bin", 1000, "\"etag123\"", currentLastModified: "Thu, 22 Oct 2026 08:00:00 GMT", stagingFilePath: stagingFile);
            Assert.Null(mismatchLastMod);

            // 5. Overlapping or disordered segment bounds -> REJECT journal (returns null)
            var corruptSegments = new List<SegmentProgress>
            {
                new() { SegmentIndex = 1, StartByte = 0, EndByte = 500, DownloadedBytes = 100 },
                new() { SegmentIndex = 2, StartByte = 400, EndByte = 999, DownloadedBytes = 100 } // Overlaps with Seg 1!
            };
            DownloadEngine.SaveSegmentJournal(stagingDir, corruptSegments, "dl_corrupt", "https://example.com/file.bin", 1000);
            var loadedCorrupt = DownloadEngine.LoadAndValidateJournal(stagingDir, "dl_corrupt", "https://example.com/file.bin", 1000, stagingFilePath: stagingFile);
            Assert.Null(loadedCorrupt);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    [Fact]
    public async Task DownloadEngine_JournalCheckpoint_ReusesOnlyMatchingCompletedRange()
    {
        string stagingDir = Path.Combine(Path.GetTempPath(), "test_checkpoint_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stagingDir);
        string stagingFile = Path.Combine(stagingDir, "file.bin");
        byte[] bytes = new byte[] { 1, 2, 3, 4, 0, 0, 0, 0 };
        try
        {
            await File.WriteAllBytesAsync(stagingFile, bytes);
            var segments = new List<SegmentProgress>
            {
                new() { SegmentIndex = 1, StartByte = 0, EndByte = 3, DownloadedBytes = 4,
                    IsCompleted = true, CheckpointSha256 = Convert.ToHexString(SHA256.HashData(bytes.AsSpan(0, 4))) },
                new() { SegmentIndex = 2, StartByte = 4, EndByte = 7, DownloadedBytes = 2 }
            };
            DownloadEngine.SaveSegmentJournal(stagingDir, segments, "checkpoint", "https://example.com/file.bin", 8, "\"v1\"");
            var restored = DownloadEngine.LoadAndValidateJournal(stagingDir, "checkpoint", "https://example.com/file.bin", 8,
                currentETag: "\"v1\"", stagingFilePath: stagingFile, allowCompletedReuse: true);
            Assert.NotNull(restored);
            Assert.Equal(4, restored[0].DownloadedBytes);
            Assert.True(restored[0].IsCompleted);
            Assert.Equal(0, restored[1].DownloadedBytes);

            var withoutValidator = DownloadEngine.LoadAndValidateJournal(stagingDir, "checkpoint", "https://example.com/file.bin", 8,
                stagingFilePath: stagingFile, allowCompletedReuse: true);
            Assert.NotNull(withoutValidator);
            Assert.All(withoutValidator, s => Assert.Equal(0, s.DownloadedBytes));

            bytes[0] = 9;
            await File.WriteAllBytesAsync(stagingFile, bytes);
            var tampered = DownloadEngine.LoadAndValidateJournal(stagingDir, "checkpoint", "https://example.com/file.bin", 8,
                currentETag: "\"v1\"", stagingFilePath: stagingFile, allowCompletedReuse: true);
            Assert.NotNull(tampered);
            Assert.All(tampered, s => Assert.Equal(0, s.DownloadedBytes));
        }
        finally
        {
            try { Directory.Delete(stagingDir, true); } catch { }
        }
    }

    [Theory]
    [InlineData("\"v1\"", true)]
    [InlineData("\"v2\"", false)]
    public async Task DownloadEngine_StrongETagCheckpoint_ReusesOnlyMatchingRemoteVersion(string responseETag, bool shouldReuse)
    {
        byte[] payload = new byte[120000];
        for (int i = 0; i < payload.Length; i++) payload[i] = (byte)(i % 251);
        await using var server = new TestHttpServer(payload) { ResponseETag = responseETag };
        string id = "checkpoint_app_" + Guid.NewGuid().ToString("N");
        string stagingDir = DownloadEngine.GetDownloadStagingDirectory(id);
        string outputDir = Path.Combine(Path.GetTempPath(), "test_checkpoint_app_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(outputDir);
        string savePath = Path.Combine(outputDir, "file.bin");
        string stagingFile = Path.Combine(stagingDir, "file.bin");
        try
        {
            byte[] staged = new byte[payload.Length];
            Array.Copy(payload, staged, 60000);
            if (!shouldReuse) staged[0] ^= 0xff; // The old ETag identifies different bytes.
            await File.WriteAllBytesAsync(stagingFile, staged);
            var segments = new List<SegmentProgress>
            {
                new() { SegmentIndex = 1, StartByte = 0, EndByte = 59999, DownloadedBytes = 60000,
                    IsCompleted = true, CheckpointSha256 = Convert.ToHexString(SHA256.HashData(staged.AsSpan(0, 60000))) },
                new() { SegmentIndex = 2, StartByte = 60000, EndByte = 119999 }
            };
            DownloadEngine.SaveSegmentJournal(stagingDir, segments, id, server.BaseUrl + "/file.bin", payload.Length, "\"v1\"");
            var download = new DownloadModel
            {
                Id = id, Url = server.BaseUrl + "/file.bin", SavePath = savePath,
                TotalBytes = payload.Length, ETag = "\"v1\"", ParallelThreads = 2,
                ExpectedSha256 = Convert.ToHexString(SHA256.HashData(payload))
            };
            var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
            var completion = new TaskCompletionSource<DownloadStatus>(TaskCreationOptions.RunContinuationsAsynchronously);
            engine.DownloadStatusChanged += item =>
            {
                if (item.Id == id && item.Status is DownloadStatus.Completed or DownloadStatus.Failed)
                    completion.TrySetResult(item.Status);
            };
            await engine.StartDownloadAsync(download);
            Assert.Equal(DownloadStatus.Completed, await completion.Task.WaitAsync(TimeSpan.FromSeconds(10)));
            Assert.Equal(payload, await File.ReadAllBytesAsync(savePath));
            Assert.Contains(server.RangeRequests, r => r.Start == 0 && r.End == 0); // fresh validator probe
            Assert.Contains(server.RangeRequests, r => r.Start == 60000 && r.End == 119999);
            if (shouldReuse)
                Assert.DoesNotContain(server.RangeRequests, r => r.Start == 0 && r.End == 59999);
            else
                Assert.Contains(server.RangeRequests, r => r.Start == 0 && r.End == 59999);
        }
        finally
        {
            try { Directory.Delete(stagingDir, true); } catch { }
            try { Directory.Delete(outputDir, true); } catch { }
        }
    }

    // =========================================================================
    // Child App Process Termination & Durable Recovery
    // =========================================================================
    [Fact]
    public async Task DownloadEngine_ChildProcessTermination_ResumesFromDatabaseAndJournal()
    {
        // 200 KB payload
        byte[] payload = new byte[200 * 1024];
        for (int i = 0; i < payload.Length; i++) payload[i] = (byte)(i % 241);

        string expectedSha;
        using (var sha = SHA256.Create())
        {
            expectedSha = Convert.ToHexString(sha.ComputeHash(payload)).ToLowerInvariant();
        }

        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "test_child_proc_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        string dbPath = Path.Combine(tempDir, "downloads.db");
        string savePath = Path.Combine(tempDir, "recovered_file.bin");
        string downloadId = "child_kill_" + Guid.NewGuid().ToString("N");

        string dllPath = FindAvaloniaDllPath();
        Assert.True(File.Exists(dllPath), $"SmartDm.Desktop.Avalonia.dll not found at: {dllPath}");

        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        psi.ArgumentList.Add(dllPath);
        psi.Environment["SMARTDM_PROFILE_DIR"] = tempDir;
        psi.ArgumentList.Add("--child-transfer-worker");
        psi.ArgumentList.Add(dbPath);
        psi.ArgumentList.Add(downloadId);
        psi.ArgumentList.Add(server.BaseUrl + "/child_test.bin");
        psi.ArgumentList.Add(savePath);
        psi.ArgumentList.Add(payload.Length.ToString());

        var childProc = new Process { StartInfo = psi };
        var activeSignalTcs = new TaskCompletionSource<bool>();

        childProc.OutputDataReceived += (s, e) =>
        {
            if (e.Data != null && e.Data.Contains("[CHILD_WORKER_ACTIVE]"))
            {
                activeSignalTcs.TrySetResult(true);
            }
        };

        try
        {
            server.ChunkDelayMs = 25; // 25ms per 4KB chunk throttles rate to ~160 KB/s, guaranteeing mid-transfer termination

            childProc.Start();
            childProc.BeginOutputReadLine();
            childProc.BeginErrorReadLine();

            // Wait for child worker process to report active progress
            await activeSignalTcs.Task.WaitAsync(TimeSpan.FromSeconds(15));

            // Allow child process brief time to transfer partial bytes and flush journal to disk
            await Task.Delay(250);

            // Forcibly terminate child process mid-transfer
            childProc.Kill(entireProcessTree: true);
            await childProc.WaitForExitAsync();

            Assert.True(childProc.HasExited, "Child process must be terminated.");

            // Reset server throttling so recovery finishes quickly
            server.ChunkDelayMs = 0;

            // Verify SQLite database was initialized and download record was persisted
            var repo = new SqliteDatabaseRepository(dbPath);
            await repo.InitializeAsync();
            var all = await repo.GetAllDownloadsAsync();
            var persistedDl = all.FirstOrDefault(d => d.Id == downloadId);
            Assert.NotNull(persistedDl);
            Assert.Equal(downloadId, persistedDl.Id);

            // Staging directory and journal must exist from the terminated process
            string stagingDir = DownloadEngine.GetDownloadStagingDirectory(downloadId);
            string journalPath = DownloadEngine.GetSegmentJournalPath(stagingDir);
            Assert.True(File.Exists(journalPath), "Segment journal must exist on disk after child process termination.");

            // Resume the transfer in a new DownloadEngine instance
            var scanner = new DirectCleanSafetyScanner();
            var resumeEngine = new DownloadEngine(repo, scanner);

            persistedDl.ExpectedSha256 = expectedSha;

            var resumeTcs = new TaskCompletionSource<DownloadStatus>();
            resumeEngine.DownloadStatusChanged += dl =>
            {
                if (dl.Id == downloadId && (dl.Status == DownloadStatus.Completed || dl.Status == DownloadStatus.Failed))
                {
                    resumeTcs.TrySetResult(dl.Status);
                }
            };

            await resumeEngine.ResumeDownloadAsync(downloadId, persistedDl);
            var finalStatus = await resumeTcs.Task.WaitAsync(TimeSpan.FromSeconds(15));

            Assert.Equal(DownloadStatus.Completed, finalStatus);
            Assert.True(File.Exists(savePath), "Assembled file must exist at savePath after recovery.");
            Assert.Equal(payload.Length, new FileInfo(savePath).Length);

            byte[] recoveredBytes = await File.ReadAllBytesAsync(savePath);
            Assert.Equal(payload, recoveredBytes);
        }
        finally
        {
            try
            {
                if (!childProc.HasExited)
                {
                    childProc.Kill(true);
                }
                childProc.Dispose();
            }
            catch { }

            try { Directory.Delete(tempDir, true); } catch { }
            try
            {
                string stagingDir = DownloadEngine.GetDownloadStagingDirectory(downloadId);
                if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true);
            }
            catch { }
        }
    }

    private static string FindAvaloniaDllPath()
    {
        string current = AppContext.BaseDirectory;
        string direct = Path.Combine(current, "SmartDm.Desktop.Avalonia.dll");
        if (File.Exists(direct))
        {
            return Path.GetFullPath(direct);
        }

        for (int i = 0; i < 10; i++)
        {
            string candidate = Path.Combine(current, "apps", "desktop-avalonia", "bin", "Debug", "net9.0", "SmartDm.Desktop.Avalonia.dll");
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
            string? parent = Directory.GetParent(current)?.FullName;
            if (parent == null) break;
            current = parent;
        }
        throw new FileNotFoundException("Could not find SmartDm.Desktop.Avalonia.dll relative to test execution directory.");
    }
}
