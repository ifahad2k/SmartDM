using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IHttpProbeService
{
    Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken cancellationToken = default);
    Task<ProbeResult> ProbeUrlAsync(string url, string? referer, string? userAgent, string? cookies, CancellationToken cancellationToken = default)
        => ProbeUrlAsync(url, cancellationToken);
    string SanitizeFileName(string rawFileName);
    string DetectCategory(string fileName, string mimeType);
    string? InferFileNameFromUrl(string url) => null;
    string? InferFileNameFromUrl(string url, string? referer) => InferFileNameFromUrl(url);
}
