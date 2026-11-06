using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public sealed class TransferScheduler(int maximumDownloads = 4, int maximumPerHost = 2)
{
    private readonly SemaphoreSlim _global = new(maximumDownloads > 0 ? maximumDownloads : throw new ArgumentOutOfRangeException(nameof(maximumDownloads)));
    private readonly object _sync = new();
    private readonly Dictionary<string, Host> _hosts = new(StringComparer.OrdinalIgnoreCase);
    private sealed class Host(int slots) { public readonly SemaphoreSlim Gate = new(slots); public int Users; }

    public async Task<IDisposable> EnterAsync(string host, CancellationToken token)
    {
        Host entry;
        lock (_sync)
        {
            if (!_hosts.TryGetValue(host, out entry!)) _hosts[host] = entry = new Host(maximumPerHost > 0 ? maximumPerHost : throw new ArgumentOutOfRangeException(nameof(maximumPerHost)));
            entry.Users++;
        }
        bool local = false, global = false;
        void Release()
        {
            if (global) _global.Release();
            if (local) entry.Gate.Release();
            lock (_sync) { if (--entry.Users == 0) { _hosts.Remove(host); entry.Gate.Dispose(); } }
        }
        try
        {
            await entry.Gate.WaitAsync(token); local = true;
            await _global.WaitAsync(token); global = true;
            return new Lease(Release);
        }
        catch { Release(); throw; }
    }

    private sealed class Lease(Action release) : IDisposable
    {
        private Action? _release = release;
        public void Dispose() => Interlocked.Exchange(ref _release, null)?.Invoke();
    }
}
