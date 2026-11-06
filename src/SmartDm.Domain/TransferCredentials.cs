namespace SmartDm.Domain;

/// <summary>
/// Ephemeral credentials supplied strictly to an active transfer.
/// Never serialized, persisted, logged, or exposed to UI bindings.
/// </summary>
public sealed record TransferCredentials(
    string? CookieHeader,
    string? AuthorizationHeader,
    DateTimeOffset ExpiresAt)
{
    public override string ToString() => "[REDACTED_CREDENTIALS]";
}
