using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public interface ISettingsService
{
    AppSettingsModel CurrentSettings { get; }
    AiConfigModel CurrentAiConfig { get; }

    Task<AppSettingsModel> LoadAppSettingsAsync();
    Task SaveAppSettingsAsync(AppSettingsModel settings);

    Task<AiConfigModel> LoadAiConfigAsync();
    Task SaveAiConfigAsync(AiConfigModel config);

    bool SetStartup(bool enable);
    Task PerformUninstallAsync(bool eraseData);
}
