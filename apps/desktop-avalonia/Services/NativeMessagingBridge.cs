using System;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public sealed class NativeMessagingBridge : IAsyncDisposable
{
    private readonly string _name, _token;
    private readonly Func<string, CancellationToken, Task<byte[]>> _dispatch;
    private readonly CancellationTokenSource _stop = new();
    private readonly ConcurrentDictionary<int, Task> _requests = new();
    private readonly SemaphoreSlim _slots = new(8, 8);
    private readonly Task _runner;
    private int _nextId;

    public NativeMessagingBridge(string name, string token, Func<string, CancellationToken, Task<byte[]>> dispatch)
    {
        _name = name; _token = token; _dispatch = dispatch;
        _runner = RunAsync();
    }

    public static bool TokenMatches(string? supplied, string expected)
    {
        if (supplied == null || supplied.Length != expected.Length) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(expected));
    }

    private async Task RunAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested)
            {
                var pipe = new NamedPipeServerStream(_name, PipeDirection.InOut, 16, PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                try { await pipe.WaitForConnectionAsync(_stop.Token); }
                catch { await pipe.DisposeAsync(); throw; }
                if (!_slots.Wait(0)) { await pipe.DisposeAsync(); continue; }
                int id = Interlocked.Increment(ref _nextId);
                Task request = ServeAsync(pipe);
                _requests[id] = request;
                _ = request.ContinueWith(_ => _requests.TryRemove(id, out var ignored), TaskScheduler.Default);
            }
        }
        catch (OperationCanceledException) when (_stop.IsCancellationRequested) { }
    }

    private async Task ServeAsync(NamedPipeServerStream pipe)
    {
        await using (pipe)
        using (var budget = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token))
        {
            budget.CancelAfter(TimeSpan.FromSeconds(25));
            try
            {
                byte[] message = await BrowserProtocol.ReadFrameAsync(pipe, BrowserProtocol.MaximumRequestBytes + 4096, budget.Token);
                using var envelope = JsonDocument.Parse(message, new JsonDocumentOptions {MaxDepth = 32});
                var root = envelope.RootElement;
                if (!BrowserProtocol.IsAllowedOrigin(root.GetProperty("origin").GetString()) ||
                    !TokenMatches(root.GetProperty("token").GetString(), _token))
                    throw new InvalidDataException("Browser integration is not authenticated.");
                var payload = root.GetProperty("payload");
                BrowserProtocol.Validate(payload);
                byte[] response = await _dispatch(payload.GetRawText(), budget.Token);
                await BrowserProtocol.WriteFrameAsync(pipe, response, BrowserProtocol.MaximumResponseBytes, budget.Token);
            }
            catch (Exception) when (!budget.IsCancellationRequested)
            {
                try { await BrowserProtocol.WriteFrameAsync(pipe, Encoding.UTF8.GetBytes("{\"status\":\"error\",\"success\":false,\"message\":\"Browser handoff failed securely. Check integration setup.\"}"), BrowserProtocol.MaximumResponseBytes, budget.Token); }
                catch (Exception ex) when (ex is IOException or OperationCanceledException) { }
            }
            catch (Exception) when (budget.IsCancellationRequested) { }
            finally { _slots.Release(); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        await _runner;
        await Task.WhenAll(_requests.Values);
        _slots.Dispose(); _stop.Dispose();
    }

    public static async Task RunHostAsync(string[] args)
    {
        using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(28));
        Stream output = Console.OpenStandardOutput();
        try
        {
            string? origin = args.FirstOrDefault(BrowserProtocol.IsAllowedOrigin);
            if (origin == null) throw new InvalidDataException("Untrusted native host caller.");
            byte[] message = await BrowserProtocol.ReadFrameAsync(Console.OpenStandardInput(), BrowserProtocol.MaximumRequestBytes, budget.Token);
            using var payload = JsonDocument.Parse(message, new JsonDocumentOptions {MaxDepth = 32});
            BrowserProtocol.Validate(payload.RootElement);
            string[] descriptor = await File.ReadAllLinesAsync(Path.Combine(AppProfile.DirectoryPath, "ipc.info"), budget.Token);
            if (descriptor.Length < 3 || !descriptor[2].StartsWith("smartdm-", StringComparison.Ordinal)) throw new InvalidDataException("Start the current SmartDM app first.");
            using var pipe = new NamedPipeClientStream(".", descriptor[2], PipeDirection.InOut,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await pipe.ConnectAsync(1500, budget.Token);
            byte[] envelope = JsonSerializer.SerializeToUtf8Bytes(new {origin, token = descriptor[1], payload = payload.RootElement});
            await BrowserProtocol.WriteFrameAsync(pipe, envelope, BrowserProtocol.MaximumRequestBytes + 4096, budget.Token);
            byte[] reply = await BrowserProtocol.ReadFrameAsync(pipe, BrowserProtocol.MaximumResponseBytes, budget.Token);
            await BrowserProtocol.WriteFrameAsync(output, reply, BrowserProtocol.MaximumResponseBytes, budget.Token);
        }
        catch (Exception)
        {
            using var errorBudget = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            await BrowserProtocol.WriteFrameAsync(output, Encoding.UTF8.GetBytes("{\"status\":\"error\",\"success\":false,\"message\":\"Start SmartDM and register its C# native host. Reload the extension after updating.\"}"), BrowserProtocol.MaximumResponseBytes, errorBudget.Token);
        }
    }
}
