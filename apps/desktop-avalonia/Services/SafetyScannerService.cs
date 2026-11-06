using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class SafetyScannerService : ISafetyScanner
{
    public bool CheckRtloExploit(string fileName)
    {
        if (string.IsNullOrEmpty(fileName)) return false;
        // Right-to-Left Override Unicode points
        return fileName.Contains("\u202E") || fileName.Contains("\u202D") || 
               fileName.Contains("\u202B") || fileName.Contains("\u202A");
    }

    public async Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(filePath)) return string.Empty;

        using var sha = SHA256.Create();
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, useAsync: true);
        byte[] hash = await sha.ComputeHashAsync(stream, cancellationToken);
        var sb = new StringBuilder(hash.Length * 2);
        foreach (byte b in hash)
        {
            sb.Append(b.ToString("x2"));
        }
        return sb.ToString();
    }

    private readonly IScannerProcessRunner _runner;
    private readonly string? _scannerPath;
    private readonly bool _defender;

    public SafetyScannerService(IScannerProcessRunner? runner = null, string? scannerPath = null, bool? defender = null)
    {
        _runner = runner ?? new ScannerProcessRunner();
        _defender = defender ?? OperatingSystem.IsWindows();
        _scannerPath = scannerPath ?? (_defender ? FindMpCmdRun() : FindClamAv());
    }

    public async Task<SafetyScanResult> ScanFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        var result = new SafetyScanResult();
        if (!File.Exists(filePath))
        {
            result.Verdict = SafetyVerdict.ScanFailed;
            result.ThreatDetails = "The file is missing; no safety scan was completed.";
            return result;
        }
        result.Sha256Hash = await ComputeSha256Async(filePath, cancellationToken);
        string name = Path.GetFileName(filePath).ToLowerInvariant();
        bool deceptive = (name.EndsWith(".exe") || name.EndsWith(".scr") || name.EndsWith(".bat") || name.EndsWith(".cmd") || name.EndsWith(".vbs")) &&
            (name.Contains(".pdf.") || name.Contains(".doc.") || name.Contains(".docx.") || name.Contains(".jpg.") || name.Contains(".png."));
        if (CheckRtloExploit(name) || deceptive)
        {
            result.Verdict = SafetyVerdict.Suspicious;
            result.HasThreat = result.IsQuarantined = true;
            result.ScannerName = "Local filename checks";
            result.ThreatDetails = "Suspicious filename; this is heuristic evidence, not a malware signature verdict.";
            return result;
        }
        if (_scannerPath == null)
        {
            result.Verdict = SafetyVerdict.ScannerUnavailable;
            result.ThreatDetails = "No supported antivirus scanner was found. SHA-256 is a fingerprint, not a safety verdict.";
            return result;
        }
        result.ScannerName = _defender ? "Windows Defender" : "ClamAV";
        int? code = await _runner.RunAsync(_scannerPath, _defender
            ? new[] { "-Scan", "-ScanType", "3", "-File", filePath, "-DisableRemediation" }
            : new[] { "--no-summary", "--", filePath }, cancellationToken);
        if (code == 0)
        {
            result.Verdict = SafetyVerdict.NoThreatsDetected;
            result.IsClean = true;
            result.ThreatDetails = "The scanner completed and reported no threats.";
        }
        else if (code == (_defender ? 2 : 1))
        {
            result.Verdict = SafetyVerdict.MalwareDetected;
            result.HasThreat = result.IsQuarantined = true;
            result.ThreatDetails = "The antivirus scanner reported a threat.";
        }
        else
        {
            result.Verdict = SafetyVerdict.ScanFailed;
            result.ThreatDetails = "The antivirus scan failed or timed out. No clean verdict is available.";
        }
        return result;
    }

    private static string? FindMpCmdRun()
    {
        // 1. ProgramData Platform update folder
        string platformDir = @"C:\ProgramData\Microsoft\Windows Defender\Platform";
        if (Directory.Exists(platformDir))
        {
            var latest = Directory.GetDirectories(platformDir);
            Array.Sort(latest);
            for (int i = latest.Length - 1; i >= 0; i--)
            {
                string exe = Path.Combine(latest[i], "MpCmdRun.exe");
                if (File.Exists(exe)) return exe;
            }
        }

        // 2. Program Files fallback
        string programFilesExe = @"C:\Program Files\Windows Defender\MpCmdRun.exe";
        if (File.Exists(programFilesExe)) return programFilesExe;

        return null;
    }

    private static string? FindClamAv()
    {
        foreach (string path in new[] { "/usr/bin/clamscan", "/usr/local/bin/clamscan" })
            if (File.Exists(path)) return path;
        return null;
    }
}
