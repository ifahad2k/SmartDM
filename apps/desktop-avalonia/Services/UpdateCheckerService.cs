using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class UpdateCheckerService : IUpdateCheckerService
{
    private const string RepoApi = "https://api.github.com/repos/ifahad2k/SmartDM/releases/latest";
    private const string RepoLatestHtml = "https://github.com/ifahad2k/SmartDM/releases/latest";
    public string CurrentVersion => "2.0-STABLE";

    private static readonly HttpClient HttpClientInstance = new(new HttpClientHandler
    {
        AllowAutoRedirect = true
    })
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    static UpdateCheckerService()
    {
        HttpClientInstance.DefaultRequestHeaders.Add("User-Agent", "SmartDM/2.0 (Windows NT 10.0; Win64; x64) DesktopClient");
    }

    public async Task<UpdateCheckResult> CheckForUpdatesAsync()
    {
        // 1. Try GitHub API
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, RepoApi);
            request.Headers.Add("Accept", "application/vnd.github+json");

            var response = await HttpClientInstance.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                string tagName = root.TryGetProperty("tag_name", out var tagElem) ? tagElem.GetString() ?? "" : "";
                string notes = root.TryGetProperty("body", out var bodyElem) ? bodyElem.GetString() ?? "" : "";
                string? dlUrl = null;

                if (root.TryGetProperty("assets", out var assetsElem) && assetsElem.ValueKind == JsonValueKind.Array)
                {
                    foreach (var asset in assetsElem.EnumerateArray())
                    {
                        if (asset.TryGetProperty("name", out var nElem) &&
                            asset.TryGetProperty("browser_download_url", out var uElem))
                        {
                            string name = nElem.GetString() ?? "";
                            if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ||
                                name.EndsWith(".AppImage", StringComparison.OrdinalIgnoreCase) ||
                                name.EndsWith(".deb", StringComparison.OrdinalIgnoreCase))
                            {
                                dlUrl = uElem.GetString();
                                break;
                            }
                        }
                    }
                }

                if (string.IsNullOrEmpty(dlUrl) && !string.IsNullOrEmpty(tagName))
                {
                    dlUrl = $"https://github.com/ifahad2k/SmartDM/releases/download/{tagName}/SmartDM-Setup-{tagName}.exe";
                }

                bool isNewer = !string.IsNullOrEmpty(tagName) &&
                               !tagName.Equals(CurrentVersion, StringComparison.OrdinalIgnoreCase) &&
                               !tagName.Equals($"v{CurrentVersion}", StringComparison.OrdinalIgnoreCase);

                return new UpdateCheckResult(isNewer, tagName, dlUrl, notes, null);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"GitHub API check failed: {ex.Message}");
        }

        // 2. HTML redirect fallback
        try
        {
            using var headReq = new HttpRequestMessage(HttpMethod.Get, RepoLatestHtml);
            var headResp = await HttpClientInstance.SendAsync(headReq, HttpCompletionOption.ResponseHeadersRead);
            string? finalUrl = headResp.RequestMessage?.RequestUri?.ToString();

            if (!string.IsNullOrEmpty(finalUrl) && finalUrl.Contains("/tag/"))
            {
                string tag = finalUrl.Substring(finalUrl.LastIndexOf("/tag/", StringComparison.Ordinal) + 5).Trim();
                if (!string.IsNullOrEmpty(tag))
                {
                    string dlUrl = $"https://github.com/ifahad2k/SmartDM/releases/download/{tag}/SmartDM-Setup-{tag}.exe";
                    bool isNewer = !tag.Equals(CurrentVersion, StringComparison.OrdinalIgnoreCase) &&
                                   !tag.Equals($"v{CurrentVersion}", StringComparison.OrdinalIgnoreCase);
                    return new UpdateCheckResult(isNewer, tag, dlUrl, $"Release {tag} is available on GitHub.", null);
                }
            }

            return new UpdateCheckResult(false, CurrentVersion, null, null, "No releases published yet.");
        }
        catch (Exception ex)
        {
            return new UpdateCheckResult(false, CurrentVersion, null, null, $"Network check failed: {ex.Message}");
        }
    }

    public async Task<string> DownloadAndInstallUpdateAsync(string downloadUrl, IProgress<double>? progress = null)
    {
        string tempDir = Path.GetTempPath();
        string ext = OperatingSystem.IsWindows() ? ".exe" : ".AppImage";
        string targetFile = Path.Combine(tempDir, $"SmartDM-Update{ext}");

        using (var response = await HttpClientInstance.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead))
        {
            response.EnsureSuccessStatusCode();
            long total = response.Content.Headers.ContentLength ?? -1L;

            await using var contentStream = await response.Content.ReadAsStreamAsync();
            await using var fileStream = new FileStream(targetFile, FileMode.Create, FileAccess.Write, FileShare.None);

            byte[] buffer = new byte[65536];
            long downloaded = 0;
            int read;

            while ((read = await contentStream.ReadAsync(buffer)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, read));
                downloaded += read;

                if (total > 0 && progress != null)
                {
                    progress.Report((double)downloaded / total);
                }
            }
        }

        progress?.Report(1.0);

        if (OperatingSystem.IsWindows())
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = targetFile,
                UseShellExecute = true
            });
        }
        else if (OperatingSystem.IsLinux())
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "chmod",
                Arguments = $"+x \"{targetFile}\"",
                UseShellExecute = false
            })?.WaitForExit();

            Process.Start(new ProcessStartInfo
            {
                FileName = targetFile,
                UseShellExecute = true
            });
        }

        return targetFile;
    }
}
