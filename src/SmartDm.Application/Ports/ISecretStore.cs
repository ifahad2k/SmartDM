namespace SmartDm.Application.Ports;

public interface ISecretStore
{
    Task<byte[]?> ReadAsync(string name, CancellationToken ct);
    Task WriteAsync(string name, ReadOnlyMemory<byte> secret, CancellationToken ct);
    Task DeleteAsync(string name, CancellationToken ct);
}
