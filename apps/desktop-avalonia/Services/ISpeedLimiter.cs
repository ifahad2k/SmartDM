using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public interface ISpeedLimiter
{
    long LimitBytesPerSec { get; }
    void SetLimit(long bytesPerSec);
    ValueTask ThrottleAsync(int bytesRead, CancellationToken cancellationToken = default);
}

public class AggregateSpeedLimiter : ISpeedLimiter
{
    private long _bytesPerSecond;
    private double _availableTokens;
    private long _lastRefillTicks;
    private readonly object _sync = new();

    public long LimitBytesPerSec => Interlocked.Read(ref _bytesPerSecond);

    public AggregateSpeedLimiter(long bytesPerSecond = 0)
    {
        _bytesPerSecond = Math.Max(0, bytesPerSecond);
        _availableTokens = _bytesPerSecond;
        _lastRefillTicks = Stopwatch.GetTimestamp();
    }

    public void SetLimit(long bytesPerSecond)
    {
        lock (_sync)
        {
            bytesPerSecond = Math.Max(0, bytesPerSecond);
            if (_bytesPerSecond == bytesPerSecond) return;
            _bytesPerSecond = bytesPerSecond;
            _availableTokens = bytesPerSecond;
            _lastRefillTicks = Stopwatch.GetTimestamp();
        }
    }

    public async ValueTask ThrottleAsync(int bytesRead, CancellationToken cancellationToken = default)
    {
        long limit = Interlocked.Read(ref _bytesPerSecond);
        if (limit <= 0 || bytesRead <= 0) return;

        double remaining = bytesRead;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            double waitMs = 0;
            lock (_sync)
            {
                if (_bytesPerSecond <= 0) return;
                long now = Stopwatch.GetTimestamp();
                double elapsedSec = (double)(now - _lastRefillTicks) / Stopwatch.Frequency;
                if (elapsedSec > 0)
                {
                    _availableTokens = Math.Min(_bytesPerSecond, _availableTokens + elapsedSec * _bytesPerSecond);
                    _lastRefillTicks = now;
                }

                // A read can exceed the bucket capacity at low limits. Charge it
                // incrementally rather than waiting for an impossible full bucket.
                double consumed = Math.Min(_availableTokens, remaining);
                _availableTokens -= consumed;
                remaining -= consumed;
                if (remaining <= 0) return;

                waitMs = remaining / _bytesPerSecond * 1000.0;
                waitMs = Math.Clamp(waitMs, 5, 250);
            }

            if (waitMs > 0)
            {
                await Task.Delay((int)waitMs, cancellationToken).ConfigureAwait(false);
            }
        }
    }
}
