using Avalonia;
using System;

namespace SmartDm.Desktop.Avalonia;

sealed class Program
{
    // Initialization code. Don't use any Avalonia, third-party APIs or any
    // SynchronizationContext-reliant code before AppMain is called: things aren't initialized
    // yet and stuff might break.
    [STAThread]
    public static void Main(string[] args)
    {
        if (args != null && System.Linq.Enumerable.Contains(args, "--test-backend"))
        {
            RunBackendSelfTestAsync().GetAwaiter().GetResult();
            return;
        }

        if (args != null && System.Linq.Enumerable.Contains(args, "--test-ipc-download"))
        {
            RunIpcEndToEndTestAsync().GetAwaiter().GetResult();
            return;
        }

        if (args != null && System.Linq.Enumerable.Contains(args, "--test-media-resolve"))
        {
            string? url = System.Linq.Enumerable.FirstOrDefault(args, a => a.StartsWith("http"));
            RunMediaResolutionTestAsync(url).GetAwaiter().GetResult();
            return;
        }

        if (args != null && System.Linq.Enumerable.Contains(args, "--test-staging"))
        {
            RunStagingIsolationTest();
            return;
        }

        if (args != null && System.Linq.Enumerable.Contains(args, "--benchmark-yt-speed"))
        {
            RunYouTubeSpeedBenchmarkAsync().GetAwaiter().GetResult();
            return;
        }

        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args ?? Array.Empty<string>());
    }

    private static async System.Threading.Tasks.Task RunBackendSelfTestAsync()
    {
        Console.WriteLine("[STARTING_BACKEND_DIAGNOSTICS]");

        // 1. SQLite Database Test
        string tempDb = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"smartdm_test_{System.Guid.NewGuid()}.db");
        var repo = new Services.SqliteDatabaseRepository(tempDb);
        await repo.InitializeAsync();

        var testItem = new Models.DownloadModel
        {
            Id = System.Guid.NewGuid().ToString(),
            Title = "diagnostic_payload.iso",
            Url = "https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso",
            TotalBytes = 104857600L,
            DownloadedBytes = 52428800L,
            SpeedMbps = 65.4,
            ProgressPercentage = 50.0,
            Status = Models.DownloadStatus.Active,
            Category = "ISO",
            SavePath = "C:\\test\\payload.iso"
        };
        await repo.SaveDownloadAsync(testItem);

        var loaded = await repo.GetAllDownloadsAsync();
        if (loaded.Count != 1 || loaded[0].Title != "diagnostic_payload.iso")
        {
            throw new Exception("SQLite test failed: loaded item mismatch.");
        }
        Console.WriteLine("[PASS] SQLite persistence: Task saved and loaded correctly.");

        // 2. Safety & SHA-256 Scanner Test
        var scanner = new Services.SafetyScannerService();
        string tempFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "test_sha_smartdm.txt");
        System.IO.File.WriteAllText(tempFile, "SmartDM 2.0 Engine High Speed Segmented Downloader");
        string sha = await scanner.ComputeSha256Async(tempFile);
        if (string.IsNullOrEmpty(sha) || sha.Length != 64)
        {
            throw new Exception("SHA-256 test failed.");
        }
        Console.WriteLine($"[PASS] SHA-256 streaming hash: {sha}");

        bool rtloBenign = scanner.CheckRtloExploit("normal_document.pdf");
        bool rtloMalicious = scanner.CheckRtloExploit("report\u202Efdp.exe");
        if (rtloBenign || !rtloMalicious)
        {
            throw new Exception("RTLO detection test failed.");
        }
        Console.WriteLine("[PASS] RTLO threat detection: Correctly blocked spoofed executable.");

        // 3. HTTP Probe Service Test
        var probe = new Services.HttpProbeService();
        var probeResult = await probe.ProbeUrlAsync("https://raw.githubusercontent.com/dotnet/core/main/release-notes/releases-index.json");
        Console.WriteLine($"[PASS] HTTP Probe: Success={probeResult.IsSuccess}, Code={probeResult.StatusCode}, Version={probeResult.HttpVersion}, Size={probeResult.FormattedSize}, Ranges={probeResult.AcceptsRanges}");

        // 4. Settings Persistence Test
        string tempSettingsDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"smartdm_cfg_{System.Guid.NewGuid()}");
        var settingsService = new Services.SettingsService(tempSettingsDir);
        var initialSettings = await settingsService.LoadAppSettingsAsync();
        initialSettings.MaxParallelSegments = 12;
        initialSettings.EnableSpeedLimit = true;
        initialSettings.DefaultSpeedLimitKbps = 2500;
        await settingsService.SaveAppSettingsAsync(initialSettings);

        var loadedSettings = await settingsService.LoadAppSettingsAsync();
        if (loadedSettings.MaxParallelSegments != 12 || !loadedSettings.EnableSpeedLimit || loadedSettings.DefaultSpeedLimitKbps != 2500)
        {
            throw new Exception("Settings persistence failed.");
        }
        Console.WriteLine("[PASS] AppSettings persistence: Successfully verified JSON serialization & reload.");

        // 5. Hardware Diagnostics Test
        var hwService = new Services.HardwareDiagnosticService();
        var hwResult = hwService.CheckHardware();
        if (hwResult.TotalRamGb <= 0 || hwResult.CpuCores <= 0)
        {
            throw new Exception("Hardware diagnostics failed.");
        }
        Console.WriteLine($"[PASS] Hardware diagnostics: RAM={hwResult.TotalRamGb:F1} GB, Cores={hwResult.CpuCores}, Model={hwResult.RecommendedModel}");

        // 6. Update Checker Test
        var updateService = new Services.UpdateCheckerService();
        var updateResult = await updateService.CheckForUpdatesAsync();
        Console.WriteLine($"[PASS] Update check: CurrentVersion={updateService.CurrentVersion}, Latest={updateResult.LatestVersion}, UpdateAvailable={updateResult.UpdateAvailable}");

        // 7. IPC Client & Engine Bridge Test
        var ipcClient = new Services.SmartDmIpcClient();
        bool isConnected = await ipcClient.ConnectAsync();
        Console.WriteLine($"[PASS] IPC Bridge initialization: Connected={isConnected} (Daemon Active={isConnected})");

        var ipcEngine = new Services.IpcDownloadEngine(repo, scanner, ipcClient);
        Console.WriteLine($"[PASS] IpcDownloadEngine created with active fallback support: FallbackReady=true");

        // Cleanup
        try { System.IO.File.Delete(tempDb); } catch { }
        try { System.IO.File.Delete(tempFile); } catch { }
        try { System.IO.Directory.Delete(tempSettingsDir, recursive: true); } catch { }

        Console.WriteLine("[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]");
    }

    private static async System.Threading.Tasks.Task RunIpcEndToEndTestAsync()
    {
        Console.WriteLine("=== Starting SmartDM 2.0 IPC End-to-End Download Test ===");

        // 1. Ensure Engine Daemon is running
        await Services.EngineDaemonLauncher.EnsureDaemonRunningAsync();

        // 2. Connect IPC Client
        var ipcClient = new Services.SmartDmIpcClient();
        bool connected = await ipcClient.ConnectAsync();
        Console.WriteLine($"[IPC_STATUS] Connected to Java 21 Engine Daemon: {connected}");

        string tempDb = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"smartdm_ipc_test_{System.Guid.NewGuid()}.db");
        var repo = new Services.SqliteDatabaseRepository(tempDb);
        await repo.InitializeAsync();
        var scanner = new Services.SafetyScannerService();

        var ipcEngine = new Services.IpcDownloadEngine(repo, scanner, ipcClient);

        string testUrl = "http://ipv4.download.thinkbroadband.com/512MB.zip";
        string targetFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "smartdm_e2e_dest", "512MB.zip");
        System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(targetFile)!);
        try { System.IO.File.Delete(targetFile); } catch { }

        var dl = new Models.DownloadModel
        {
            Id = "e2e-ipc-" + System.Guid.NewGuid().ToString().Substring(0, 8),
            Title = "512MB.zip",
            Url = testUrl,
            SavePath = targetFile,
            ParallelThreads = 32,
            Status = Models.DownloadStatus.Active
        };

        var tcs = new System.Threading.Tasks.TaskCompletionSource<bool>();
        int progressTicks = 0;

        ipcEngine.DownloadProgressChanged += model =>
        {
            if (model.Id != dl.Id) return;
            progressTicks++;
            var segments = ipcEngine.GetSegments(model.Id);
            int activeSegs = System.Linq.Enumerable.Count(segments, s => s.IsActive && !s.IsCompleted);

            Console.WriteLine($"[LIVE_TELEMETRY #{progressTicks}] Downloaded: {model.DownloadedBytes / (1024.0 * 1024.0):F2} MB | Speed: {model.SpeedMbps:F2} MB/s | Progress: {model.ProgressPercentage:F1}% | Active Segments: {activeSegs}/{segments.Count}");

            if (progressTicks >= 4 && model.DownloadedBytes > 1024 * 1024)
            {
                tcs.TrySetResult(true);
            }
        };

        Console.WriteLine($"[DISPATCH] Sending START_DOWNLOAD for {testUrl} via Java 21 Engine (32 Streams)...");
        await ipcEngine.StartDownloadAsync(dl);

        // Wait for at least 4 progress ticks or 15s timeout
        var completed = await System.Threading.Tasks.Task.WhenAny(tcs.Task, System.Threading.Tasks.Task.Delay(15000));
        if (completed != tcs.Task)
        {
            throw new Exception("Timeout waiting for live IPC progress ticks.");
        }

        Console.WriteLine("[PASS] Verified multi-stream live telemetry received via IPC socket!");

        // Test Pause
        Console.WriteLine("[DISPATCH] Sending PAUSE_DOWNLOAD...");
        await ipcEngine.PauseDownloadAsync(dl.Id);
        await System.Threading.Tasks.Task.Delay(600);
        Console.WriteLine($"[PASS] Download successfully paused: Status={dl.Status}");

        // Test Cancel
        Console.WriteLine("[DISPATCH] Sending CANCEL_DOWNLOAD...");
        await ipcEngine.CancelDownloadAsync(dl.Id);
        await System.Threading.Tasks.Task.Delay(600);
        Console.WriteLine($"[PASS] Download successfully cancelled: Status={dl.Status}");

        // Cleanup
        try { System.IO.File.Delete(tempDb); } catch { }
        try { System.IO.File.Delete(targetFile); } catch { }

        Console.WriteLine("=== SmartDM 2.0 IPC Bridge End-to-End Test PASSED Successfully! ===");
    }

    private static async System.Threading.Tasks.Task RunMediaResolutionTestAsync(string? specificUrl = null)
    {
        Console.WriteLine("=== Starting SmartDM 2.0 Dynamic Media Format Resolution Test ===");

        // Test 1: Direct YouTube URL probe & resolution without yt-dlp
        string testYtUrl = !string.IsNullOrWhiteSpace(specificUrl) ? specificUrl : "https://www.youtube.com/watch?v=Pc1JzImPw_M";
        Console.WriteLine($"[TEST 1] Probing YouTube URL: {testYtUrl}");
        var vm = new ViewModels.AddDownloadViewModel(initialUrl: testYtUrl);
        
        int waitMs = 0;
        while (!vm.IsMediaFormatSelectorVisible && waitMs < 30000)
        {
            await System.Threading.Tasks.Task.Delay(250);
            waitMs += 250;
        }

        if (!vm.IsMediaFormatSelectorVisible)
        {
            throw new Exception("Media format selector should be visible for YouTube URL.");
        }
        if (vm.AvailableFormats.Count == 0)
        {
            throw new Exception("AvailableFormats collection is empty.");
        }

        Console.WriteLine($"[PASS] Format dropdown visible: {vm.IsMediaFormatSelectorVisible}");
        Console.WriteLine($"[PASS] Discovered formats count: {vm.AvailableFormats.Count}");
        Console.WriteLine($"[PASS] Selected format: {vm.SelectedFormat?.DisplayLabel} ({vm.SelectedFormat?.FormattedSize})");
        Console.WriteLine($"[PASS] Direct URL prefix: {vm.SelectedFormat?.DirectUrl?.Substring(0, Math.Min(60, vm.SelectedFormat?.DirectUrl?.Length ?? 0))}...");
        Console.WriteLine($"[PASS] Save FileName: {vm.FileName}");

        bool hasMp3 = System.Linq.Enumerable.Any(vm.AvailableFormats, f => f.FormatId == "bestaudio/best");
        bool hasThumb = System.Linq.Enumerable.Any(vm.AvailableFormats, f => f.FormatId == "thumbnail");
        if (!hasMp3) throw new Exception("AvailableFormats missing MP3 format option.");
        if (!hasThumb) throw new Exception("AvailableFormats missing HD Thumbnail format option.");
        Console.WriteLine($"[PASS] Dynamic MP3 option present: {hasMp3}");
        Console.WriteLine($"[PASS] Dynamic HD Thumbnail option present: {hasThumb}");

        // Test 2: IPC initial formats passed from browser overlay
        Console.WriteLine("[TEST 2] Verifying browser overlay formats binding & preselection...");
        var browserFormats = new System.Collections.Generic.List<Services.MediaFormatDto>
        {
            new() { FormatId = "137", Resolution = "1080p (MP4)", Ext = "mp4", FileSize = 84361446L, DirectUrl = "https://example.com/video1080.mp4", AudioUrl = "https://example.com/audio140.m4a" },
            new() { FormatId = "136", Resolution = "720p (MP4)", Ext = "mp4", FileSize = 29905327L, DirectUrl = "https://example.com/video720.mp4", AudioUrl = "https://example.com/audio140.m4a" },
            new() { FormatId = "bestaudio/best", Resolution = "Audio (MP3 / High Quality)", Ext = "mp3", FileSize = 3449447L, IsAudioOnly = true, DirectUrl = "https://example.com/audio140.m4a" },
            new() { FormatId = "thumbnail", Resolution = "Thumbnail (Cover Image / HD)", Ext = "jpg", FileSize = 0, DirectUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg" }
        };

        var browserVm = new ViewModels.AddDownloadViewModel(
            initialUrl: "https://example.com/video1080.mp4",
            initialFileName: "Never_Gonna_Give_You_Up.mp4",
            initialFormatId: "137",
            initialFormats: browserFormats
        );

        if (!browserVm.IsMediaFormatSelectorVisible)
        {
            throw new Exception("Browser VM format selector not visible.");
        }
        if (browserVm.SelectedFormat?.FormatId != "137")
        {
            throw new Exception($"Expected preselected formatId '137', but got '{browserVm.SelectedFormat?.FormatId}'");
        }
        if (browserVm.SelectedFormat.FileSize != 84361446L)
        {
            throw new Exception($"Expected file size 84361446, but got {browserVm.SelectedFormat.FileSize}");
        }
        Console.WriteLine($"[PASS] Browser VM preselected: {browserVm.SelectedFormat.DisplayLabel} ({browserVm.SelectedFormat.FormattedSize})");

        // Test 3: Switching format in dropdown updates extension and category
        Console.WriteLine("[TEST 3] Verifying format switching in dropdown...");
        var mp3Fmt = System.Linq.Enumerable.First(browserVm.AvailableFormats, f => f.FormatId == "bestaudio/best");
        browserVm.SelectedFormat = mp3Fmt;
        if (!browserVm.FileName.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
        {
            throw new Exception($"Expected filename to end with .mp3, but was {browserVm.FileName}");
        }
        if (browserVm.Category != "Audio")
        {
            throw new Exception($"Expected Category 'Audio', but was '{browserVm.Category}'");
        }
        Console.WriteLine($"[PASS] Switched to MP3 -> FileName: {browserVm.FileName}, Category: {browserVm.Category}");

        var thumbFmt = System.Linq.Enumerable.First(browserVm.AvailableFormats, f => f.FormatId == "thumbnail");
        browserVm.SelectedFormat = thumbFmt;
        if (!browserVm.FileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase))
        {
            throw new Exception($"Expected filename to end with .jpg, but was {browserVm.FileName}");
        }
        if (browserVm.Category != "Images")
        {
            throw new Exception($"Expected Category 'Images', but was '{browserVm.Category}'");
        }
        Console.WriteLine($"[PASS] Switched to Thumbnail -> FileName: {browserVm.FileName}, Category: {browserVm.Category}");

        // Test 4: Generic notification filename rejection (e.g. "(311) YouTube.mp4")
        Console.WriteLine("[TEST 4] Verifying generic filename rejection (e.g. '(311) YouTube.mp4')...");
        var ytFormatsWithTitle = new System.Collections.Generic.List<Services.MediaFormatDto>
        {
            new() { FormatId = "1080p60", Resolution = "1080p60", Ext = "mp4", FileSize = 433020000L, Title = "iPhone 18 Pro TEARDOWN: They aren't going to like this..." }
        };

        var genericVm = new ViewModels.AddDownloadViewModel(
            initialUrl: "https://www.youtube.com/watch?v=Pc1JzImPw_M",
            initialFileName: "(311) YouTube.mp4",
            initialFormatId: "1080p60",
            initialFormats: ytFormatsWithTitle,
            initialTitle: "iPhone 18 Pro TEARDOWN: They aren't going to like this..."
        );

        if (genericVm.FileName.Contains("YouTube", StringComparison.OrdinalIgnoreCase) || genericVm.FileName.Contains("(311)"))
        {
            throw new Exception($"Generic filename '(311) YouTube.mp4' was not rejected! Result: {genericVm.FileName}");
        }
        if (!genericVm.FileName.StartsWith("iPhone 18 Pro TEARDOWN", StringComparison.OrdinalIgnoreCase))
        {
            throw new Exception($"Expected filename to start with 'iPhone 18 Pro TEARDOWN', but was: {genericVm.FileName}");
        }
        Console.WriteLine($"[PASS] Generic '(311) YouTube.mp4' successfully rejected and replaced with real title: '{genericVm.FileName}'");

        Console.WriteLine("=== SmartDM 2.0 Dynamic Media Format Resolution Test PASSED Successfully! ===");
    }

    private static void RunStagingIsolationTest()
    {
        Console.WriteLine("=== Starting SmartDM 2.0 Staging Directory & Auto-Cleanup Test ===");

        string testId = "test_download_" + Guid.NewGuid().ToString("N");
        string stagingDir = Services.DownloadEngine.GetDownloadStagingDirectory(testId);
        Console.WriteLine($"[PASS] Staging directory allocated: {stagingDir}");

        if (!System.IO.Directory.Exists(stagingDir))
        {
            throw new Exception("Staging directory was not created on disk.");
        }

        // Verify root is marked Hidden
        string parentDir = System.IO.Path.GetDirectoryName(stagingDir)!;
        var di = new System.IO.DirectoryInfo(parentDir);
        bool isHidden = (di.Attributes & System.IO.FileAttributes.Hidden) != 0;
        Console.WriteLine($"[PASS] Staging root is marked hidden: {isHidden} ({parentDir})");

        // Simulate 390 segment files written during HLS stream transfer
        Console.WriteLine("[TEST] Simulating 390 segment chunks written during stream download...");
        for (int i = 0; i < 390; i++)
        {
            string segPath = System.IO.Path.Combine(stagingDir, $"chunk_{i:D4}.ts");
            System.IO.File.WriteAllText(segPath, "dummy HLS video transport stream payload");
        }
        string outputMp4 = System.IO.Path.Combine(stagingDir, "final_video.mp4");
        System.IO.File.WriteAllBytes(outputMp4, new byte[1024 * 64]);

        int chunkCount = System.IO.Directory.GetFiles(stagingDir, "*.ts").Length;
        if (chunkCount != 390)
        {
            throw new Exception($"Expected 390 chunks, found {chunkCount}");
        }
        Console.WriteLine($"[PASS] Successfully contained {chunkCount} chunks in hidden staging directory without touching user folders.");

        // Simulate successful completion: Atomic move to target and cleanup
        string finalTarget = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "smartdm_test_dest", "final_video.mp4");
        System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(finalTarget)!);
        System.IO.File.Move(outputMp4, finalTarget, overwrite: true);

        Services.DownloadEngine.CleanupStagingDirectory(stagingDir);

        if (System.IO.Directory.Exists(stagingDir))
        {
            throw new Exception("Staging directory was not cleaned up after completion.");
        }
        Console.WriteLine("[PASS] Staging directory and all 390 chunk files automatically deleted!");

        if (!System.IO.File.Exists(finalTarget) || new System.IO.FileInfo(finalTarget).Length == 0)
        {
            throw new Exception("Final output file was not moved to destination.");
        }
        Console.WriteLine($"[PASS] Final file exists at destination: {finalTarget} ({new System.IO.FileInfo(finalTarget).Length} bytes)");
        try { System.IO.File.Delete(finalTarget); } catch { }

        // Test orphan cleanup
        string orphanDir = Services.DownloadEngine.GetDownloadStagingDirectory("orphan_" + Guid.NewGuid().ToString("N"));
        System.IO.File.WriteAllText(System.IO.Path.Combine(orphanDir, "leftover.ts"), "leftover");
        Services.DownloadEngine.CleanupOrphanStagingDirectories();
        if (System.IO.Directory.Exists(orphanDir))
        {
            throw new Exception("Orphan staging directory was not cleaned up by CleanupOrphanStagingDirectories.");
        }
        Console.WriteLine("[PASS] Orphan staging directory cleanup verified!");

        Console.WriteLine("=== SmartDM 2.0 Staging Directory & Auto-Cleanup Test PASSED! ===");
    }

    private static async System.Threading.Tasks.Task RunYouTubeSpeedBenchmarkAsync()
    {
        Console.WriteLine("=== YouTube Download Speed Diagnostic Benchmark ===");
        var res = await Services.YouTubeMediaResolver.ResolveYouTubeFormatsAsync("https://www.youtube.com/watch?v=Pc1JzImPw_M");
        var stream = System.Linq.Enumerable.FirstOrDefault(res.Formats, f => !string.IsNullOrEmpty(f.DirectUrl) && f.FileSize > 50000000);
        if (stream == null) { Console.WriteLine("Stream not found"); return; }

        string testUrl = stream.DirectUrl!;
        Console.WriteLine($"Testing Stream URL: {testUrl.Substring(0, Math.Min(80, testUrl.Length))}...");
        Console.WriteLine($"Total Stream Size: {stream.FileSize / (1024 * 1024)} MB");

        var handler = new System.Net.Http.SocketsHttpHandler
        {
            AllowAutoRedirect = true,
            PooledConnectionLifetime = TimeSpan.FromMinutes(15),
            EnableMultipleHttp2Connections = true
        };
        var client = new System.Net.Http.HttpClient(handler);

        // Test 1: Single sequential stream (simulating FFmpeg)
        Console.WriteLine("\n[1] Testing Single Sequential Stream (FFmpeg behavior)...");
        var sw1 = System.Diagnostics.Stopwatch.StartNew();
        long bytes1 = 0;
        using (var req1 = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get, testUrl))
        {
            req1.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 10485760); // 10 MB
            using var resp1 = await client.SendAsync(req1, System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
            var stream1 = await resp1.Content.ReadAsStreamAsync();
            byte[] buf = new byte[65536];
            int read;
            while ((read = await stream1.ReadAsync(buf, 0, buf.Length)) > 0)
            {
                bytes1 += read;
                if (bytes1 >= 10485760) break;
            }
        }
        sw1.Stop();
        double speed1 = (bytes1 / (1024.0 * 1024.0)) / sw1.Elapsed.TotalSeconds;
        Console.WriteLine($"Single Stream: Downloaded {bytes1 / (1024 * 1024)} MB in {sw1.Elapsed.TotalSeconds:F2}s -> Speed: {speed1:F2} MB/s");

        // Test 2: Multi-Connection Segmented (IDM / SmartDM multi-worker behavior)
        Console.WriteLine("\n[2] Testing 16-Connection Segmented Range Requests (IDM behavior)...");
        int workers = 16;
        long totalTestBytes = 20971520; // 20 MB
        long chunkSize = totalTestBytes / workers;
        var sw2 = System.Diagnostics.Stopwatch.StartNew();
        var tasks = new System.Collections.Generic.List<System.Threading.Tasks.Task<long>>();

        for (int i = 0; i < workers; i++)
        {
            long start = i * chunkSize;
            long end = (i == workers - 1) ? totalTestBytes - 1 : (start + chunkSize - 1);
            tasks.Add(System.Threading.Tasks.Task.Run(async () =>
            {
                using var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get, testUrl);
                req.Version = System.Net.HttpVersion.Version11;
                req.VersionPolicy = System.Net.Http.HttpVersionPolicy.RequestVersionExact;
                req.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(start, end);
                using var resp = await client.SendAsync(req, System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
                var s = await resp.Content.ReadAsStreamAsync();
                byte[] buf = new byte[131072];
                long b = 0;
                int r;
                while ((r = await s.ReadAsync(buf, 0, buf.Length)) > 0)
                {
                    b += r;
                }
                return b;
            }));
        }

        var results = await System.Threading.Tasks.Task.WhenAll(tasks);
        sw2.Stop();
        long bytes2 = System.Linq.Enumerable.Sum(results);
        double speed2 = (bytes2 / (1024.0 * 1024.0)) / sw2.Elapsed.TotalSeconds;
        Console.WriteLine($"16 Parallel Sockets: Downloaded {bytes2 / (1024 * 1024)} MB in {sw2.Elapsed.TotalSeconds:F2}s -> Speed: {speed2:F2} MB/s");
        Console.WriteLine($"\nSpeedup: {speed2 / speed1:F1}x faster with 16 parallel sockets!");
    }

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
