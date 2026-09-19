using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class SafetyScanResult
{
    public bool IsClean { get; set; } = true;
    public string Sha256Hash { get; set; } = string.Empty;
    public string Md5Hash { get; set; } = string.Empty;
    public bool HasThreat { get; set; } = false;
    public string ThreatDetails { get; set; } = string.Empty;
    public string ScannerName { get; set; } = "SmartDM Local Engine";
    public bool IsQuarantined { get; set; } = false;
}

public interface ISafetyScanner
{
    Task<SafetyScanResult> ScanFileAsync(string filePath, CancellationToken cancellationToken = default);
    Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken = default);
    bool CheckRtloExploit(string fileName);
}
