using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace SmartDm.Desktop.Avalonia.Services;

public static class DownloadStaging
{
    public static string RootPath
    {
        get
        {
            string? configured = Environment.GetEnvironmentVariable("SMARTDM_STAGING_DIR");
            if (!string.IsNullOrWhiteSpace(configured))
            {
                if (!Path.IsPathFullyQualified(configured)) throw new InvalidOperationException("The staging root must be absolute.");
                return Path.GetFullPath(configured);
            }
            return Path.Combine(AppProfile.DirectoryPath, "staging");
        }
    }

    public static string GetDownloadStagingDirectory(string downloadId) =>
        ResolveDirectory(downloadId, RootPath, LegacyRoots());

    public static string ResolveDirectory(string downloadId, string root, IEnumerable<string> legacyRoots)
    {
        if (string.IsNullOrWhiteSpace(downloadId)) throw new ArgumentException("A download ID is required.", nameof(downloadId));
        string target = Path.Combine(Path.GetFullPath(root), "dl_" + MediaCheckpoint.Fingerprint(downloadId));
        if (HasData(target)) return target;
        // Resume existing legacy partials in place; never copy many GB across drives at startup.
        foreach (string legacyRoot in legacyRoots)
            foreach (string name in DirectoryNames(downloadId))
            {
                string legacy = Path.Combine(Path.GetFullPath(legacyRoot), name);
                if (HasData(legacy)) return legacy;
            }
        Directory.CreateDirectory(target);
        return target;
    }

    private static bool HasData(string directory)
    {
        try
        {
            return (File.GetAttributes(directory) & FileAttributes.ReparsePoint) == 0 &&
                Directory.EnumerateFileSystemEntries(directory).Any();
        }
        catch (FileNotFoundException) { return false; }
        catch (DirectoryNotFoundException) { return false; }
    }

    private static IEnumerable<string> DirectoryNames(string id)
    {
        yield return "dl_" + MediaCheckpoint.Fingerprint(id);
        yield return "dl_" + string.Join("_", id.Replace(".", "_").Split(Path.GetInvalidFileNameChars()));
    }

    private static IEnumerable<string> LegacyRoots()
    {
        // Isolated test/diagnostic profiles must never inspect or clean the real profile's staging.
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTDM_STAGING_DIR")) ||
            !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTDM_PROFILE_DIR"))) yield break;
        yield return Path.Combine(AppContext.BaseDirectory, ".temp");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SmartDM", ".temp");
        var framework = new DirectoryInfo(AppContext.BaseDirectory);
        var configuration = framework.Parent;
        if (configuration?.Parent?.Name == "bin" && configuration.Name is "Debug" or "Release")
            yield return Path.Combine(configuration.Parent.FullName, configuration.Name == "Debug" ? "Release" : "Debug", framework.Name, ".temp");
    }

    public static void CleanupStagingDirectory(string stagingDir)
    {
        try
        {
            if (Directory.Exists(stagingDir))
            {
                Directory.Delete(stagingDir, recursive: true);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to clean staging directory '{stagingDir}': {ex.Message}");
        }
    }

    public static void CleanupOrphanStagingDirectories(IEnumerable<string>? activeOrResumableIds = null, TimeSpan? retentionCutoff = null, IEnumerable<string>? liveSessionIds = null)
    {
        var safeSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (activeOrResumableIds != null)
        {
            foreach (var id in activeOrResumableIds)
            {
                if (!string.IsNullOrWhiteSpace(id))
                {
                    safeSet.Add("dl_" + string.Join("_", id.Replace(".", "_").Split(Path.GetInvalidFileNameChars())));
                    safeSet.Add("dl_" + MediaCheckpoint.Fingerprint(id));
                }
            }
        }

        foreach (string id in liveSessionIds ?? Enumerable.Empty<string>())
        {
            safeSet.Add("dl_" + string.Join("_", id.Replace(".", "_").Split(Path.GetInvalidFileNameChars())));
            safeSet.Add("dl_" + MediaCheckpoint.Fingerprint(id));
        }

        DateTime cutoffTime = retentionCutoff.HasValue
            ? DateTime.UtcNow - retentionCutoff.Value
            : DateTime.MinValue;

        void CleanTempRoot(string tempRoot)
        {
            try
            {
                if (!Directory.Exists(tempRoot)) return;
                foreach (var dir in Directory.GetDirectories(tempRoot))
                {
                    try
                    {
                        if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) continue;
                        string dirName = Path.GetFileName(dir);
                        if (!dirName.StartsWith("dl_", StringComparison.Ordinal)) continue;
                        if (safeSet.Contains(dirName))
                        {
                            continue;
                        }

                        if (retentionCutoff.HasValue)
                        {
                            var di = new DirectoryInfo(dir);
                            if (di.LastWriteTimeUtc > cutoffTime)
                            {
                                continue;
                            }
                        }

                        Directory.Delete(dir, recursive: true);
                    }
                    catch { }
                }
            }
            catch { }
        }

        CleanTempRoot(RootPath);
        foreach (string root in LegacyRoots().Distinct(StringComparer.OrdinalIgnoreCase)) CleanTempRoot(root);
    }

}
