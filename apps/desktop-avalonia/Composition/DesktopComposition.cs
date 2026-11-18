using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia;

public static class DesktopComposition
{
    public static MainViewModel CreateMainViewModel(
        IDownloadEngine? engine = null,
        IDatabaseRepository? repository = null,
        IHttpProbeService? probeService = null,
        ISafetyScanner? safetyScanner = null,
        ILocalIpcService? ipcService = null,
        ISettingsService? settingsService = null,
        IFileCatalogService? catalogService = null,
        IQueueManager? queueManager = null,
        bool isDemoMode = false)
    {
        repository ??= new SqliteDatabaseRepository();
        safetyScanner ??= new SafetyScannerService();
        probeService ??= new HttpProbeService();
        return new MainViewModel(
            engine ?? new DownloadEngine(repository, safetyScanner, isPreviewMode: isDemoMode, probeService: probeService), repository,
            probeService, safetyScanner,
            ipcService ?? new LocalIpcService(), settingsService ?? new SettingsService(),
            catalogService ?? new FileCatalogService(), queueManager ?? new QueueManager(), isDemoMode);
    }
}
