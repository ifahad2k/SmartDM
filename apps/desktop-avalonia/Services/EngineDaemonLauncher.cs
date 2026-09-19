using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public static class EngineDaemonLauncher
{
    private static Process? _daemonProcess;

    public static async Task EnsureDaemonRunningAsync(CancellationToken ct = default)
    {
        string portFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm", "engine.port");

        // If port file exists, test if it responds
        if (File.Exists(portFile))
        {
            var testClient = new SmartDmIpcClient();
            if (await testClient.ConnectAsync(ct))
            {
                await testClient.DisposeAsync();
                return; // Already running and healthy!
            }
            try { File.Delete(portFile); } catch { }
        }

        // Search for repo root to find gradlew
        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        DirectoryInfo? dir = new DirectoryInfo(currentDir);
        string? repoRoot = null;

        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "settings.gradle.kts")))
            {
                repoRoot = dir.FullName;
                break;
            }
            dir = dir.Parent;
        }

        if (repoRoot == null) return;

        string gradlew = OperatingSystem.IsWindows()
            ? Path.Combine(repoRoot, "gradlew.bat")
            : Path.Combine(repoRoot, "gradlew");

        if (!File.Exists(gradlew)) return;

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = gradlew,
                Arguments = ":modules:download-engine:runEngineDaemon",
                WorkingDirectory = repoRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            _daemonProcess = Process.Start(psi);
            if (_daemonProcess != null)
            {
                AppDomain.CurrentDomain.ProcessExit += (_, _) =>
                {
                    try
                    {
                        if (!_daemonProcess.HasExited)
                        {
                            _daemonProcess.Kill(entireProcessTree: true);
                        }
                    }
                    catch { }
                };

                // Wait up to 5 seconds for engine.port to be created
                for (int i = 0; i < 25; i++)
                {
                    if (File.Exists(portFile)) break;
                    await Task.Delay(200, ct);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to auto-launch Engine Daemon: {ex.Message}");
        }
    }
}
