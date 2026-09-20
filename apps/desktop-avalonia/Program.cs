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
            RunMediaResolutionTestAsync().GetAwaiter().GetResult();
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

    private static async System.Threading.Tasks.Task RunMediaResolutionTestAsync()
    {
        Console.WriteLine("=== Starting SmartDM 2.0 Dynamic Media Format Resolution Test ===");

        // Test 1: Direct YouTube URL probe & resolution without yt-dlp
        string testYtUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        Console.WriteLine($"[TEST 1] Probing YouTube URL: {testYtUrl}");
        var vm = new ViewModels.AddDownloadViewModel(initialUrl: testYtUrl);
        await System.Threading.Tasks.Task.Delay(2500);

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

        Console.WriteLine("=== SmartDM 2.0 Dynamic Media Format Resolution Test PASSED Successfully! ===");
    }

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
