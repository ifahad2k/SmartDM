using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public record CatalogMatch(
    string FileName,
    string FilePath,
    long FileSize,
    string? SourceUrl,
    string MatchReason,
    string DriveLetter,
    bool ExistsOnDisk
);

public interface IFileCatalogService
{
    Task InitializeAsync();
    Task IndexFileAsync(string filePath, string? sourceUrl = null, string? sha256 = null);
    Task<CatalogMatch?> FindDuplicateAsync(string? url, string? fileName);
    string GenerateUniquePath(string targetPath);
    Task ScanCommonFoldersAsync(CancellationToken ct = default);
}
