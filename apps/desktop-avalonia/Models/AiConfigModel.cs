using System.Text.Json.Serialization;

namespace SmartDm.Desktop.Avalonia.Models;

public class AiConfigModel
{
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = false;

    [JsonPropertyName("providerType")]
    public string ProviderType { get; set; } = "DISABLED"; // "DISABLED", "GEMINI", "OPENAI_COMPATIBLE"

    [JsonPropertyName("protectedApiKey")]
    public string? ProtectedApiKey { get; set; }

    [JsonIgnore]
    public bool HasApiKey => !string.IsNullOrEmpty(ProtectedApiKey);

    [JsonPropertyName("baseUrl")]
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com";

    [JsonPropertyName("modelName")]
    public string ModelName { get; set; } = "qwen2.5:3b";

    [JsonPropertyName("dailyRequestLimit")]
    public int DailyRequestLimit { get; set; } = 50;
}
