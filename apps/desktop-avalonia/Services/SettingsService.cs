using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class SettingsService : ISettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly string _settingsPath;
    private readonly string _aiConfigPath;

    public AppSettingsModel CurrentSettings { get; private set; } = new();
    public AiConfigModel CurrentAiConfig { get; private set; } = new();

    public SettingsService(string? baseDir = null)
    {
        string dir = baseDir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
        Directory.CreateDirectory(dir);
        _settingsPath = Path.Combine(dir, "app_settings.json");
        _aiConfigPath = Path.Combine(dir, "ai_config.json");
    }

    public async Task<AppSettingsModel> LoadAppSettingsAsync()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                string json = await File.ReadAllTextAsync(_settingsPath);
                var settings = JsonSerializer.Deserialize<AppSettingsModel>(json, JsonOptions);
                if (settings != null)
                {
                    CurrentSettings = settings;
                    return settings;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to load app_settings.json: {ex.Message}");
        }

        CurrentSettings = new AppSettingsModel();
        return CurrentSettings;
    }

    public async Task SaveAppSettingsAsync(AppSettingsModel settings)
    {
        CurrentSettings = settings ?? new AppSettingsModel();
        try
        {
            string? dir = Path.GetDirectoryName(_settingsPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            string json = JsonSerializer.Serialize(CurrentSettings, JsonOptions);
            await File.WriteAllTextAsync(_settingsPath, json);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to save app_settings.json: {ex.Message}");
        }
    }

    public async Task<AiConfigModel> LoadAiConfigAsync()
    {
        try
        {
            if (File.Exists(_aiConfigPath))
            {
                string json = await File.ReadAllTextAsync(_aiConfigPath);
                var config = JsonSerializer.Deserialize<AiConfigModel>(json, JsonOptions);
                if (config != null)
                {
                    CurrentAiConfig = config;
                    return config;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to load ai_config.json: {ex.Message}");
        }

        CurrentAiConfig = new AiConfigModel();
        return CurrentAiConfig;
    }

    public async Task SaveAiConfigAsync(AiConfigModel config)
    {
        CurrentAiConfig = config ?? new AiConfigModel();
        try
        {
            string? dir = Path.GetDirectoryName(_aiConfigPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            string json = JsonSerializer.Serialize(CurrentAiConfig, JsonOptions);
            await File.WriteAllTextAsync(_aiConfigPath, json);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to save ai_config.json: {ex.Message}");
        }
    }

    public bool SetStartup(bool enable)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                string appPath = Process.GetCurrentProcess().MainModule?.FileName ?? "";
                if (string.IsNullOrEmpty(appPath)) return false;

                const string regKey = @"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
                const string appName = "SmartDM";

                if (enable)
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "reg",
                        Arguments = $"add \"{regKey}\" /v \"{appName}\" /t REG_SZ /d \"\\\"{appPath}\\\" --autostart\" /f",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    using var p = Process.Start(psi);
                    p?.WaitForExit(3000);
                    return p?.ExitCode == 0;
                }
                else
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "reg",
                        Arguments = $"delete \"{regKey}\" /v \"{appName}\" /f",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    using var p = Process.Start(psi);
                    p?.WaitForExit(3000);
                    return p?.ExitCode == 0;
                }
            }
            else if (OperatingSystem.IsLinux())
            {
                string autostartDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".config", "autostart");
                Directory.CreateDirectory(autostartDir);
                string desktopFile = Path.Combine(autostartDir, "smartdm.desktop");

                if (enable)
                {
                    string appPath = Process.GetCurrentProcess().MainModule?.FileName ?? "smartdm";
                    string content = $"[Desktop Entry]\nType=Application\nName=SmartDM\nExec={appPath} --autostart\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n";
                    File.WriteAllText(desktopFile, content);
                    return true;
                }
                else
                {
                    if (File.Exists(desktopFile)) File.Delete(desktopFile);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"SetStartup error: {ex.Message}");
        }
        return false;
    }

    public async Task PerformUninstallAsync(bool eraseData)
    {
        await Task.Run(() =>
        {
            // 1. Remove autostart entry
            SetStartup(false);

            // 2. Erase AppData if requested
            if (eraseData)
            {
                try
                {
                    string appData = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SmartDM");
                    if (Directory.Exists(appData))
                    {
                        Directory.Delete(appData, recursive: true);
                    }
                }
                catch { }

                try
                {
                    string userHomeDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
                    if (Directory.Exists(userHomeDir))
                    {
                        Directory.Delete(userHomeDir, recursive: true);
                    }
                }
                catch { }
            }
        });
    }
}
