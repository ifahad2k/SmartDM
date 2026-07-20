package io.smartdm.download.engine.limit;

import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class TokenBucketRateLimiter {
    
    private volatile Long bytesPerSecondLimit;
    private double tokens;
    private long lastRefillTimestamp;
    private final TokenBucketRateLimiter parent; // For hierarchical limiting
    
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition tokensAvailable = lock.newCondition();
    
    public TokenBucketRateLimiter(Long bytesPerSecondLimit, TokenBucketRateLimiter parent) {
        if (bytesPerSecondLimit != null && bytesPerSecondLimit <= 0) {
            throw new IllegalArgumentException("Limit must be positive");
        }
        this.bytesPerSecondLimit = bytesPerSecondLimit;
        this.parent = parent;
        this.tokens = bytesPerSecondLimit != null ? bytesPerSecondLimit : 0;
        this.lastRefillTimestamp = System.nanoTime();
    }
    
    public void setLimit(Long newLimitBytesPerSecond) {
        if (newLimitBytesPerSecond != null && newLimitBytesPerSecond <= 0) {
            throw new IllegalArgumentException("Limit must be positive");
        }
        lock.lock();
        try {
            this.bytesPerSecondLimit = newLimitBytesPerSecond;
            if (newLimitBytesPerSecond != null && tokens > newLimitBytesPerSecond) {
                tokens = newLimitBytesPerSecond;
            }
            tokensAvailable.signalAll();
        } finally {
            lock.unlock();
        }
    }
    
    public void acquire(long permits) throws InterruptedException {
        if (parent != null) {
            parent.acquire(permits);
        }
        
        while (permits > 0) {
            if (bytesPerSecondLimit == null) {
                return;
            }
            
            lock.lockInterruptibly();
            try {
                while (true) {
                    Long limit = bytesPerSecondLimit;
                    if (limit == null) {
                        break;
                    }
                    
                    long chunk = Math.min(permits, limit);
                    
                    refill(limit);
                    
                    if (tokens >= chunk) {
                        tokens -= chunk;
                        permits -= chunk;
                        break;
                    }
                    
                    // Not enough tokens, calculate wait time
                    double missing = chunk - tokens;
                    long waitNanos = (long) ((missing / limit) * 1_000_000_000L);
                    if (waitNanos > 0) {
                        tokensAvailable.awaitNanos(waitNanos);
                    } else {
                        // In case of precision loss, wait a tiny bit to avoid spinning
                        tokensAvailable.awaitNanos(1000);
                    }
                }
            } finally {
                lock.unlock();
            }
        }
    }
    
    private void refill(long limit) {
        long now = System.nanoTime();
        long elapsedNanos = now - lastRefillTimestamp;
        lastRefillTimestamp = now;
        
        double elapsedSeconds = elapsedNanos / 1_000_000_000.0;
        tokens += limit * elapsedSeconds;
        if (tokens > limit) {
            tokens = limit;
        }
    }
}
