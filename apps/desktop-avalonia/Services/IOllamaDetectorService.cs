using System.Collections.Generic;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IOllamaDetectorService
{
    Task<List<string>> DetectInstalledModelsAsync(string baseUrl = "http://localhost:11434");
}
