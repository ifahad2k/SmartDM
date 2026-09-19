using System;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public record UpdateCheckResult(
    bool UpdateAvailable,
    string LatestVersion,
    string? DownloadUrl,
    string? Notes,
    string? Error);

public interface IUpdateCheckerService
{
    string CurrentVersion { get; }
    Task<UpdateCheckResult> CheckForUpdatesAsync();
    Task<string> DownloadAndInstallUpdateAsync(string downloadUrl, IProgress<double>? progress = null);
}
