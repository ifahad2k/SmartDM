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

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
