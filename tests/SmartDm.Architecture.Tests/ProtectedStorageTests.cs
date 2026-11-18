using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class ProtectedStorageTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "smartdm-secrets-" + Guid.NewGuid().ToString("N"));
    private readonly byte[] _key = RandomNumberGenerator.GetBytes(32);
    private ProfileSecretProtector Protector() => new(_directory, _ => Task.FromResult(_key));
    public ProtectedStorageTests() => Directory.CreateDirectory(_directory);

    [Fact]
    public async Task CredentialEnvelopeIsAuthenticatedAndPurposeBound()
    {
        var protector = Protector();
        string encrypted = (await protector.ProtectAsync("session=canary-secret", "download:one"))!;
        Assert.DoesNotContain("canary-secret", encrypted);
        Assert.Equal("session=canary-secret", await Protector().UnprotectAsync(encrypted, "download:one"));
        await Assert.ThrowsAsync<CryptographicException>(() => protector.UnprotectAsync(encrypted, "download:two"));
        await Assert.ThrowsAsync<CryptographicException>(() => protector.UnprotectAsync(encrypted[..^2] + "AA", "download:one"));
        await Assert.ThrowsAsync<CryptographicException>(() => protector.UnprotectAsync("plaintext", "download:one"));
    }

    [Fact]
    public async Task SavedCookiesAreCiphertextAndResumeWithTheirOriginalScope()
    {
        string path = Path.Combine(_directory, "history.db");
        var repository = new SqliteDatabaseRepository(path, Protector());
        var download = new DownloadModel {Id="one", Title="Ordinary download", Url="https://cdn.invalid/file", Cookies="session=canary-secret",Status=DownloadStatus.Paused};
        await repository.SaveDownloadAsync(download);
        using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText="SELECT cookies FROM downloads WHERE id='one'";
        string stored = (string)(await command.ExecuteScalarAsync())!;
        Assert.StartsWith(ProfileSecretProtector.Prefix, stored);
        Assert.DoesNotContain("canary-secret", stored);
        var resumed = Assert.Single(await new SqliteDatabaseRepository(path, Protector()).GetAllDownloadsAsync());
        Assert.Equal(download.Cookies, resumed.Cookies);
        Assert.Equal(DownloadStatus.Paused, resumed.Status);
        Assert.DoesNotContain("canary-secret", Encoding.UTF8.GetString(await ReadDatabaseBytesAsync(path)));
    }

    [Fact]
    public async Task LegacyCookieMigrationRollsBackOnKeyFailureAndCanBeRetried()
    {
        string path = Path.Combine(_directory, "legacy.db");
        var repo = new SqliteDatabaseRepository(path, Protector());
        await repo.SaveDownloadAsync(new DownloadModel {Id="one",Title="Legacy",Url="https://cdn.invalid/file"});
        using (var connection = new SqliteConnection("Data Source=" + path))
        {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText="UPDATE downloads SET cookies='legacy-canary'; DELETE FROM schema_migrations WHERE version=9;";
            await command.ExecuteNonQueryAsync();
        }
        var failing = new ProfileSecretProtector(_directory, _ => throw new CryptographicException("Locked store"));
        await Assert.ThrowsAsync<CryptographicException>(() => new SqliteDatabaseRepository(path, failing).InitializeAsync());
        using (var connection = new SqliteConnection("Data Source=" + path))
        {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText="SELECT count(*) FROM schema_migrations WHERE version=9";
            Assert.Equal(0L, await command.ExecuteScalarAsync());
            command.CommandText="SELECT cookies FROM downloads WHERE id='one'";
            Assert.Equal("legacy-canary", await command.ExecuteScalarAsync());
        }
        var restored = Assert.Single(await new SqliteDatabaseRepository(path, Protector()).GetAllDownloadsAsync());
        Assert.Equal("legacy-canary", restored.Cookies);
        Assert.DoesNotContain("legacy-canary", Encoding.UTF8.GetString(await ReadDatabaseBytesAsync(path)));
    }

    [Fact]
    public async Task ApiKeyMigrationPreservesBlankSaveAndAllowsExplicitRemoval()
    {
        string path = Path.Combine(_directory, "ai_config.json");
        await File.WriteAllTextAsync(path, "{\"apiKey\":\"api-canary\",\"enabled\":false}");
        var settings = new SettingsService(_directory, Protector());
        Assert.True((await settings.LoadAiConfigAsync()).HasApiKey);
        Assert.DoesNotContain("api-canary", await File.ReadAllTextAsync(path));
        await settings.SaveAiConfigAsync(new AiConfigModel(), "");
        Assert.Equal("api-canary", await Protector().UnprotectAsync(settings.CurrentAiConfig.ProtectedApiKey, "ai-api-key"));
        await settings.SaveAiConfigAsync(new AiConfigModel(), clearApiKey:true);
        Assert.False((await new SettingsService(_directory, Protector()).LoadAiConfigAsync()).HasApiKey);
    }

    [Fact]
    public async Task WindowsProfileKeySurvivesAProtectorRestartWithoutPlaintextKeyFile()
    {
        if (!OperatingSystem.IsWindows()) return;
        string value = (await new ProfileSecretProtector(_directory).ProtectAsync("os-canary", "test"))!;
        Assert.Equal("os-canary", await new ProfileSecretProtector(_directory).UnprotectAsync(value,"test"));
        Assert.DoesNotContain("os-canary", Encoding.UTF8.GetString(await File.ReadAllBytesAsync(Path.Combine(_directory,".secrets","master.dpapi"))));
    }

    private static async Task<byte[]> ReadDatabaseBytesAsync(string path)
    {
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var buffer = new MemoryStream(); await file.CopyToAsync(buffer); return buffer.ToArray();
    }

    public void Dispose() { SqliteConnection.ClearAllPools(); Directory.Delete(_directory,true); }
}
