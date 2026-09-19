using System.Collections.Generic;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IDatabaseRepository
{
    Task InitializeAsync();
    Task<List<DownloadModel>> GetAllDownloadsAsync();
    Task SaveDownloadAsync(DownloadModel download);
    Task DeleteDownloadAsync(string id);
    Task UpdateDownloadProgressAsync(string id, long downloadedBytes, double speedMbps, double progress, int etaSeconds);
    Task UpdateDownloadStatusAsync(string id, DownloadStatus status, string statusDetail, string subline);
    Task UpdateChecksumAndSecurityAsync(string id, string sha256, bool isQuarantined, string statusDetail);
}
