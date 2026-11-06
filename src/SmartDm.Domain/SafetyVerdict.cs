namespace SmartDm.Domain;

public enum SafetyVerdict
{
    Unscanned,
    ScanFailed,
    NoThreatsDetected,
    Suspicious,
    MalwareDetected
}

public sealed record SafetyEvidence(
    string Source,
    string Code,
    string Description,
    DateTimeOffset ObservedAt);

public sealed record SafetyScanResult(
    SafetyVerdict Verdict,
    string? Sha256,
    IReadOnlyList<SafetyEvidence> Evidence,
    string? ScannerName,
    string? ScannerVersion);
