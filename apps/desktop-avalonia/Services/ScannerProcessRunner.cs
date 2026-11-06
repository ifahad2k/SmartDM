using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public interface IScannerProcessRunner
{
    Task<int?> RunAsync(string executable, IReadOnlyList<string> arguments, CancellationToken token);
}

public sealed class ScannerProcessRunner : IScannerProcessRunner
{
    public async Task<int?> RunAsync(string executable, IReadOnlyList<string> arguments, CancellationToken token)
    {
        if (!Path.IsPathFullyQualified(executable) || !File.Exists(executable)) return null;
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (var value in arguments) start.ArgumentList.Add(value);
        using var process = new Process { StartInfo = start };
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(TimeSpan.FromSeconds(30));
        Task? drains = null;
        try
        {
            process.Start();
            // Drain output with bounded memory; scanner output can include sensitive paths.
            async Task Drain(StreamReader reader)
            {
                var buffer = new char[4096];
                while (await reader.ReadAsync(buffer.AsMemory(), budget.Token) > 0) { }
            }
            drains = Task.WhenAll(Drain(process.StandardOutput), Drain(process.StandardError));
            await process.WaitForExitAsync(budget.Token);
            await drains;
            return process.ExitCode;
        }
        catch (OperationCanceledException)
        {
            try { if (!process.HasExited) process.Kill(true); await process.WaitForExitAsync(); } catch (InvalidOperationException) { }
            if (drains != null) { try { await drains; } catch (OperationCanceledException) { } }
            token.ThrowIfCancellationRequested();
            return null;
        }
        catch (System.ComponentModel.Win32Exception) { return null; }
    }
}
