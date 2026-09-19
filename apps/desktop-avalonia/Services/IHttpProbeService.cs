using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IHttpProbeService
{
    Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken cancellationToken = default);
    string SanitizeFileName(string rawFileName);
    string DetectCategory(string fileName, string mimeType);
}
