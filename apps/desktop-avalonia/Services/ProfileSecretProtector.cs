using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public interface ISecretProtector
{
    Task<string?> ProtectAsync(string? value, string purpose);
    Task<string?> UnprotectAsync(string? value, string purpose);
}

// Only secret fields are encrypted here; this does not claim SQLCipher history encryption.
public sealed class ProfileSecretProtector : ISecretProtector
{
    public const string Prefix = "sdm-secret-v1:";
    private readonly string _directory;
    private readonly Func<CancellationToken, Task<byte[]>>? _keyProvider;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private byte[]? _key;

    public ProfileSecretProtector(string directory, Func<CancellationToken, Task<byte[]>>? keyProvider = null)
    { _directory = Path.GetFullPath(directory); _keyProvider = keyProvider; }

    public async Task<string?> ProtectAsync(string? value, string purpose)
    {
        if (string.IsNullOrEmpty(value)) return null;
        byte[] plaintext = Encoding.UTF8.GetBytes(value);
        try
        {
            byte[] key = await GetKeyAsync();
            byte[] nonce = RandomNumberGenerator.GetBytes(12), tag = new byte[16], ciphertext = new byte[plaintext.Length];
            using var aes = new AesGcm(key, 16);
            aes.Encrypt(nonce, plaintext, ciphertext, tag, Encoding.UTF8.GetBytes(purpose));
            return Prefix + Convert.ToBase64String(nonce) + ":" + Convert.ToBase64String(tag) + ":" + Convert.ToBase64String(ciphertext);
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }

    public async Task<string?> UnprotectAsync(string? value, string purpose)
    {
        if (string.IsNullOrEmpty(value)) return null;
        byte[]? plaintext = null;
        try
        {
            if (!value.StartsWith(Prefix, StringComparison.Ordinal)) throw new CryptographicException();
            string[] fields = value[Prefix.Length..].Split(':');
            if (fields.Length != 3) throw new CryptographicException();
            byte[] ciphertext = Convert.FromBase64String(fields[2]);
            plaintext = new byte[ciphertext.Length];
            using var aes = new AesGcm(await GetKeyAsync(), 16);
            aes.Decrypt(Convert.FromBase64String(fields[0]), ciphertext, Convert.FromBase64String(fields[1]), plaintext, Encoding.UTF8.GetBytes(purpose));
            return Encoding.UTF8.GetString(plaintext);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException or ArgumentException)
        { throw new CryptographicException("Protected credentials could not be opened for this profile."); }
        finally { if (plaintext != null) CryptographicOperations.ZeroMemory(plaintext); }
    }

    private async Task<byte[]> GetKeyAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_key != null) return _key;
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            if (_keyProvider != null) _key = await _keyProvider(budget.Token);
            else
            {
                string secretDir = Path.Combine(_directory, ".secrets");
                Directory.CreateDirectory(secretDir);
                if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(secretDir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                string lockPath = Path.Combine(secretDir, "key.lock");
                FileStream lease;
                while (true)
                {
                    try { lease = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); break; }
                    catch (IOException) { await Task.Delay(50, budget.Token); }
                }
                using (lease)
                {
                    string marker = Path.Combine(secretDir, "initialized");
                    if (OperatingSystem.IsWindows())
                    {
                        string path = Path.Combine(secretDir, "master.dpapi");
                        if (File.Exists(path)) _key = UnwrapWindows(await File.ReadAllBytesAsync(path, budget.Token));
                        else
                        {
                            if (File.Exists(marker)) throw new CryptographicException("The protected profile key is missing. Restore it before continuing.");
                            byte[] created = RandomNumberGenerator.GetBytes(32);
                            try { PrivateProfileFiles.Write(path, WrapWindows(created)); _key = created; }
                            catch { CryptographicOperations.ZeroMemory(created); throw; }
                        }
                    }
                    else if (OperatingSystem.IsLinux())
                    {
                        string profile = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(_directory)));
                        string existing = await SecretToolAsync(false, profile, null, budget.Token);
                        if (!string.IsNullOrWhiteSpace(existing)) _key = Convert.FromBase64String(existing.Trim());
                        else
                        {
                            if (File.Exists(marker)) throw new CryptographicException("The protected profile key is missing. Restore it before continuing.");
                            byte[] created = RandomNumberGenerator.GetBytes(32);
                            try { await SecretToolAsync(true, profile, Convert.ToBase64String(created), budget.Token); _key = created; }
                            catch { CryptographicOperations.ZeroMemory(created); throw; }
                        }
                    }
                    else throw new PlatformNotSupportedException();
                    PrivateProfileFiles.WriteText(marker, "SmartDM protected profile key v1");
                }
            }
            if (_key.Length != 32) { CryptographicOperations.ZeroMemory(_key); _key = null; throw new CryptographicException("Invalid profile key."); }
            return _key;
        }
        catch (Exception ex) when (ex is not CryptographicException)
        { throw new CryptographicException("Protected storage is unavailable. On Linux unlock Secret Service and install secret-tool. Credentials were not saved as plaintext."); }
        finally { _gate.Release(); }
    }

    private static async Task<string> SecretToolAsync(bool store, string profile, string? secret, CancellationToken token)
    {
        string executable = File.Exists("/usr/bin/secret-tool") ? "/usr/bin/secret-tool" : "/bin/secret-tool";
        if (!File.Exists(executable)) throw new CryptographicException("Linux Secret Service requires secret-tool.");
        var start = new ProcessStartInfo(executable) {UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true};
        start.ArgumentList.Add(store ? "store" : "lookup");
        if (store) start.ArgumentList.Add("--label=SmartDM 2.0 profile encryption key");
        foreach (string value in new[] {"application", "smartdm2", "profile", profile}) start.ArgumentList.Add(value);
        using var process = Process.Start(start) ?? throw new IOException("Cannot open Secret Service.");
        try
        {
            Task<string> output = ProcessOutput.ReadTailAsync(process.StandardOutput, token);
            Task<string> error = ProcessOutput.ReadTailAsync(process.StandardError, token);
            if (store) await process.StandardInput.WriteLineAsync(secret.AsMemory(), token);
            process.StandardInput.Close();
            await process.WaitForExitAsync(token);
            string result = await output; await error;
            if (process.ExitCode != 0 && !(process.ExitCode == 1 && !store && result.Length == 0))
                throw new CryptographicException("Secret Service refused protected storage.");
            return result;
        }
        finally { if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); } }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);

    private static byte[] WrapWindows(byte[] data) => WindowsTransform(data, true);
    private static byte[] UnwrapWindows(byte[] data) => WindowsTransform(data, false);
    private static byte[] WindowsTransform(byte[] data, bool protect)
    {
        var input = new Blob {Length = data.Length, Data = Marshal.AllocHGlobal(data.Length)};
        Blob output = default;
        try
        {
            Marshal.Copy(data, 0, input.Data, data.Length);
            bool ok = protect ? CryptProtectData(ref input, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output) :
                CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new CryptographicException("Windows could not protect this profile key.");
            byte[] result = new byte[output.Length]; Marshal.Copy(output.Data, result, 0, result.Length); return result;
        }
        finally
        {
            for (int i = 0; i < input.Length; i++) Marshal.WriteByte(input.Data, i, 0);
            Marshal.FreeHGlobal(input.Data);
            if (output.Data != IntPtr.Zero) { for (int i = 0; i < output.Length; i++) Marshal.WriteByte(output.Data, i, 0); LocalFree(output.Data); }
        }
    }
}
