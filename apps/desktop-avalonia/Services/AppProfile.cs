using System;
using System.IO;

namespace SmartDm.Desktop.Avalonia.Services;

public static class AppProfile
{
    public static string DirectoryPath
    {
        get
        {
            string? configured = Environment.GetEnvironmentVariable("SMARTDM_PROFILE_DIR");
            if (!string.IsNullOrEmpty(configured))
            {
                if (!Path.IsPathFullyQualified(configured)) throw new InvalidOperationException("The profile directory must be absolute.");
                return Path.GetFullPath(configured);
            }
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
        }
    }

    public static void IsolateDiagnostics()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SMARTDM_PROFILE_DIR"))) return;
        string root = Path.Combine(Path.GetTempPath(), "SmartDM-diagnostics", Guid.NewGuid().ToString("N"));
        Environment.SetEnvironmentVariable("SMARTDM_PROFILE_DIR", root);
        Environment.SetEnvironmentVariable("SMARTDM_STAGING_DIR", Path.Combine(root, "staging"));
    }
}
