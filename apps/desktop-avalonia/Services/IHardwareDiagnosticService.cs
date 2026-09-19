namespace SmartDm.Desktop.Avalonia.Services;

public enum HardwareSuitabilityLevel
{
    Excellent,
    Moderate,
    Low
}

public record HardwareDiagnosticResult(
    double TotalRamGb,
    int CpuCores,
    HardwareSuitabilityLevel Suitability,
    string SummaryMessage,
    string RecommendedModel);

public interface IHardwareDiagnosticService
{
    HardwareDiagnosticResult CheckHardware();
}
