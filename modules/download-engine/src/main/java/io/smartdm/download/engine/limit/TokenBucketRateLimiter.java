package io.smartdm.download.engine.limit;

import java.util.concurrent.atomic.AtomicLong;

public class TokenBucketRateLimiter {
    
    private volatile Long bytesPerSecondLimit;
    private final AtomicLong tokens;
    private final AtomicLong lastRefillTimestamp;
    private final TokenBucketRateLimiter parent; // For hierarchical limiting (e.g. global -> queue -> download)
    
    public TokenBucketRateLimiter(Long bytesPerSecondLimit, TokenBucketRateLimiter parent) {
        this.bytesPerSecondLimit = bytesPerSecondLimit;
        this.parent = parent;
        this.tokens = new AtomicLong(bytesPerSecondLimit != null ? bytesPerSecondLimit : Long.MAX_VALUE);
        this.lastRefillTimestamp = new AtomicLong(System.nanoTime());
    }
    
    public void setLimit(Long newLimitBytesPerSecond) {
        this.bytesPerSecondLimit = newLimitBytesPerSecond;
        if (newLimitBytesPerSecond == null) {
            tokens.set(Long.MAX_VALUE);
        } else {
            // Cap existing tokens to new limit
            tokens.updateAndGet(current -> Math.min(current, newLimitBytesPerSecond));
        }
    }
    
    public void acquire(long permits) throws InterruptedException {
        if (parent != null) {
            parent.acquire(permits);
        }
        
        while (true) {
            Long limit = bytesPerSecondLimit;
            if (limit == null) {
                return; // Unlimited
            }
            
            refill(limit);
            
            long currentTokens = tokens.get();
            if (currentTokens >= permits) {
                if (tokens.compareAndSet(currentTokens, currentTokens - permits)) {
                    return;
                }
            } else {
                // Not enough tokens, wait a bit
                Thread.sleep(10);
            }
        }
    }
    
    private void refill(long limit) {
        long now = System.nanoTime();
        long last = lastRefillTimestamp.get();
        long elapsedNanos = now - last;
        
        // Refill 10 times a second max to avoid tiny increments
        if (elapsedNanos > 100_000_000) { 
            if (lastRefillTimestamp.compareAndSet(last, now)) {
                double elapsedSeconds = elapsedNanos / 1_000_000_000.0;
                long tokensToAdd = (long) (limit * elapsedSeconds);
                tokens.updateAndGet(current -> Math.min(limit, current + tokensToAdd));
            }
        }
    }
}
