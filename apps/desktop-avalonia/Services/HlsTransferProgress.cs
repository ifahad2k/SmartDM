using System;
using System.Collections.Generic;
using System.Threading;

namespace SmartDm.Desktop.Avalonia.Services;

// Wire traffic includes retries; saved progress includes only verified chunks.
public sealed class HlsTransferProgress
{
    private readonly object _gate = new();
    private readonly HashSet<int> _completed = new();
    private readonly int _totalSegments;
    private long _receivedBytes;
    private long _savedBytes;
    private int _savedSegments;

    public HlsTransferProgress(int totalSegments, int savedSegments = 0, long savedBytes = 0)
    {
        if (totalSegments <= 0 || savedSegments < 0 || savedSegments > totalSegments || savedBytes < 0)
            throw new ArgumentOutOfRangeException(nameof(totalSegments));
        _totalSegments = totalSegments;
        _savedSegments = savedSegments;
        _savedBytes = savedBytes;
    }

    public void RecordReceived(int bytes)
    {
        if (bytes < 0) throw new ArgumentOutOfRangeException(nameof(bytes));
        Interlocked.Add(ref _receivedBytes, bytes);
    }

    public bool RecordSaved(int index, long bytes)
    {
        if (index < 0 || index >= _totalSegments || bytes <= 0) throw new ArgumentOutOfRangeException(nameof(index));
        lock (_gate)
        {
            if (_savedSegments >= _totalSegments || !_completed.Add(index)) return false;
            _savedBytes += bytes;
            _savedSegments++;
            return true;
        }
    }

    public Snapshot Capture()
    {
        lock (_gate)
            return new(_savedBytes, Interlocked.Read(ref _receivedBytes), _savedSegments, _totalSegments);
    }

    public readonly record struct Snapshot(long SavedBytes, long ReceivedBytes, int SavedSegments, int TotalSegments)
    {
        // Chunk count is known. A refining byte-size estimate must not reverse progress.
        public double Percentage => TotalSegments > 0 ? Math.Clamp(100.0 * SavedSegments / TotalSegments, 0, 99) : 0;
    }
}
