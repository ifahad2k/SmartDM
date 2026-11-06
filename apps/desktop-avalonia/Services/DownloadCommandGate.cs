using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// Entries live only while commands hold or wait for a lease. Completed history
// must not leave one semaphore per download alive for the engine's lifetime.
internal sealed class DownloadCommandGate
{
    private readonly object _sync = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    private sealed class Entry
    {
        public readonly SemaphoreSlim Semaphore = new(1, 1);
        public int Users;
    }

    public async ValueTask<IDisposable> EnterAsync(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        Entry entry;
        lock (_sync)
        {
            if (!_entries.TryGetValue(id, out entry!))
                _entries.Add(id, entry = new Entry());
            entry.Users++;
        }
        await entry.Semaphore.WaitAsync().ConfigureAwait(false);
        return new Lease(this, id, entry);
    }

    private void Exit(string id, Entry entry)
    {
        entry.Semaphore.Release();
        lock (_sync)
        {
            if (--entry.Users == 0)
            {
                _entries.Remove(id);
                entry.Semaphore.Dispose();
            }
        }
    }

    private sealed class Lease(DownloadCommandGate gate, string id, Entry entry) : IDisposable
    {
        private DownloadCommandGate? _gate = gate;
        public void Dispose() => Interlocked.Exchange(ref _gate, null)?.Exit(id, entry);
    }
}
