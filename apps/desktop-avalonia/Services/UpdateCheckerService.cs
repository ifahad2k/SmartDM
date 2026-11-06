using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Threading;

namespace SmartDm.Desktop.Avalonia.Services;

public class UpdateCheckerService : IUpdateCheckerService
{
    private readonly HttpClient _client;
    private readonly string _rid;
    private readonly string _directory;
    private readonly ConcurrentDictionary<string, (string Hash, long Size)> _approved = new();
    public string CurrentVersion => "2.0.0";
    private const string Releases = "https://api.github.com/repos/ifahad2k/SmartDM/releases?per_page=30";

    public UpdateCheckerService(HttpClient? client = null, string? rid = null, string? directory = null)
    {
        _client = client ?? new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        _rid = rid ?? ((OperatingSystem.IsWindows() ? "win-" : "linux-") + RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant());
        _directory = directory ?? Path.Combine(Path.GetTempPath(), "SmartDM-updates");
    }

    public async Task<UpdateCheckResult> CheckForUpdatesAsync()
    {
        _approved.Clear();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Releases);
            request.Headers.UserAgent.ParseAdd("SmartDM/2.0");
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > 2_000_000) throw new InvalidDataException();
            await using var source = await response.Content.ReadAsStreamAsync(budget.Token);
            using var metadata = new MemoryStream();
            var buffer = new byte[8192]; int read;
            while ((read = await source.ReadAsync(buffer, budget.Token)) > 0)
            {
                if (metadata.Length + read > 2_000_000) throw new InvalidDataException("Release metadata too large.");
                metadata.Write(buffer, 0, read);
            }
            using var data = JsonDocument.Parse(metadata.ToArray());
            var releases = data.RootElement.EnumerateArray().Where(r => !r.GetProperty("draft").GetBoolean() && !r.GetProperty("prerelease").GetBoolean())
                .Select(r => (Release: r, Version: ParseVersion(r.GetProperty("tag_name").GetString())))
                .Where(r => r.Version != null && r.Version > Version.Parse(CurrentVersion)).OrderByDescending(r => r.Version);
            foreach (var candidate in releases)
            {
                string version = candidate.Version!.ToString();
                string name = $"SmartDM-sdm2-{version}-{_rid}" + (_rid.StartsWith("win-") ? ".zip" : ".tar.gz");
                foreach (var asset in candidate.Release.GetProperty("assets").EnumerateArray())
                {
                    if (asset.GetProperty("name").GetString() != name) continue;
                    string url = asset.GetProperty("browser_download_url").GetString() ?? "";
                    string digest = asset.TryGetProperty("digest", out var d) ? d.GetString() ?? "" : "";
                    long size = asset.GetProperty("size").GetInt64();
                    string tag = candidate.Release.GetProperty("tag_name").GetString()!;
                    string expectedUrl = $"https://github.com/ifahad2k/SmartDM/releases/download/{tag}/{name}";
                    if (url != expectedUrl || !Regex.IsMatch(digest, "^sha256:[0-9a-fA-F]{64}$") || size is <= 0 or > 2_000_000_000) continue;
                    _approved[url] = (digest[7..], size);
                    return new(true, version, url, candidate.Release.GetProperty("body").GetString(), null);
                }
            }
            return new(false, CurrentVersion, null, null, null);
        }
        catch (Exception) { return new(false, CurrentVersion, null, null, "Could not verify C# release metadata. No update will be installed."); }
    }

    public static Version? ParseVersion(string? tag)
    {
        if (tag == null || !Regex.IsMatch(tag, @"^sdm2-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")) return null;
        return Version.TryParse(tag[6..], out var value) ? value : null;
    }

    public async Task<string> DownloadAndInstallUpdateAsync(string downloadUrl, IProgress<double>? progress = null)
    {
        if (!_approved.TryGetValue(downloadUrl, out var asset)) throw new InvalidOperationException("Check for a compatible verified C# release first.");
        string folder = Path.Combine(_directory, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        string pending = Path.Combine(folder, "download.pending");
        try
        {
            using var budget = new CancellationTokenSource(TimeSpan.FromMinutes(10));
            using var response = await _client.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            response.EnsureSuccessStatusCode();
            if (response.RequestMessage?.RequestUri is { } final && (final.Scheme != "https" ||
                final.Host is not ("github.com" or "release-assets.githubusercontent.com" or "objects.githubusercontent.com")))
                throw new InvalidDataException("Unexpected update destination.");
            if (response.Content.Headers.ContentLength is long length && length != asset.Size) throw new InvalidDataException("Update length mismatch.");
            await using (var output = new FileStream(pending, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
            await using (var input = await response.Content.ReadAsStreamAsync())
            {
                byte[] buffer = new byte[65536]; long total = 0; int read;
                while ((read = await input.ReadAsync(buffer, budget.Token)) > 0)
                {
                    total += read;
                    if (total > asset.Size) throw new InvalidDataException("Update exceeds its verified size.");
                    await output.WriteAsync(buffer.AsMemory(0, read), budget.Token);
                    progress?.Report((double)total / asset.Size);
                }
                if (total != asset.Size) throw new InvalidDataException("Incomplete update.");
                await output.FlushAsync(); output.Flush(true);
            }
            await using var file = File.OpenRead(pending);
            string hash = Convert.ToHexString(await SHA256.HashDataAsync(file));
            if (!string.Equals(hash, asset.Hash, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Update checksum mismatch.");
            file.Close();
            string target = Path.Combine(folder, Path.GetFileName(new Uri(downloadUrl).AbsolutePath));
            File.Move(pending, target);
            return target;
        }
        finally { if (File.Exists(pending)) File.Delete(pending); }
    }
}
