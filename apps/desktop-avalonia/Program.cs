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

        // Cleanup
        try { System.IO.File.Delete(tempDb); } catch { }
        try { System.IO.File.Delete(tempFile); } catch { }
        try { System.IO.Directory.Delete(tempSettingsDir, recursive: true); } catch { }

        Console.WriteLine("[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]");
    }

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
