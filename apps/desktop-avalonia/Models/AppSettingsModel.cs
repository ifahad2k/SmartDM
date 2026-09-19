using System;
using System.IO;
using System.Text.Json.Serialization;

namespace SmartDm.Desktop.Avalonia.Models;

public class AppSettingsModel
{
    [JsonPropertyName("runOnStartup")]
    public bool RunOnStartup { get; set; } = false;

    [JsonPropertyName("closeToTray")]
    public bool CloseToTray { get; set; } = true;

    [JsonPropertyName("autoCheckUpdates")]
    public bool AutoCheckUpdates { get; set; } = true;

    [JsonPropertyName("autoDownloadUpdates")]
    public bool AutoDownloadUpdates { get; set; } = false;

    [JsonPropertyName("firstRunCompleted")]
    public bool FirstRunCompleted { get; set; } = true;

    [JsonPropertyName("reportBugUrl")]
    public string ReportBugUrl { get; set; } = "https://github.com/ifahad2k/SmartDM/issues";

    [JsonPropertyName("maxParallelSegments")]
    public int MaxParallelSegments { get; set; } = 8;

    [JsonPropertyName("enableSpeedLimit")]
    public bool EnableSpeedLimit { get; set; } = false;

    [JsonPropertyName("defaultSpeedLimitKbps")]
    public int DefaultSpeedLimitKbps { get; set; } = 1000;

    [JsonPropertyName("theme")]
    public string Theme { get; set; } = "System Default";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "en";

    [JsonPropertyName("defaultDownloadDirectory")]
    public string DefaultDownloadDirectory { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

    [JsonPropertyName("connectionTimeoutSeconds")]
    public int ConnectionTimeoutSeconds { get; set; } = 15;

    [JsonPropertyName("maxRetries")]
    public int MaxRetries { get; set; } = 3;

    [JsonPropertyName("userAgent")]
    public string UserAgent { get; set; } = "SmartDM/2.0 (Windows NT 10.0; Win64; x64) DesktopEngine";
}
