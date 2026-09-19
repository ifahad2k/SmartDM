using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public class OllamaDetectorService : IOllamaDetectorService
{
    private static readonly HttpClient HttpClientInstance = new()
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public async Task<List<string>> DetectInstalledModelsAsync(string baseUrl = "http://localhost:11434")
    {
        var list = new List<string>();
        try
        {
            string url = baseUrl.TrimEnd('/') + "/api/tags";
            var response = await HttpClientInstance.GetAsync(url);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("models", out var modelsElem) &&
                    modelsElem.ValueKind == JsonValueKind.Array)
                {
                    foreach (var m in modelsElem.EnumerateArray())
                    {
                        if (m.TryGetProperty("name", out var nameElem))
                        {
                            string? name = nameElem.GetString();
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                list.Add(name);
                            }
                        }
                    }
                }
            }
        }
        catch
        {
            // Ollama not running or unreachable
        }

        return list;
    }
}
