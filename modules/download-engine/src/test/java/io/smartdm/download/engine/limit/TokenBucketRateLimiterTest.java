package io.smartdm.download.engine.limit;

import org.junit.jupiter.api.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenBucketRateLimiterTest {
    
    @Test
    void testBasicRateLimiting() throws InterruptedException {
        // 100 bytes per second limit
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(100L, null);
        
        long start = System.nanoTime();
        // Request 100 bytes (should take ~0s)
        limiter.acquire(100);
        long durationMs = (System.nanoTime() - start) / 1_000_000;
        assertTrue(durationMs < 100, "First acquire should be fast");
        
        // Request another 50 bytes (should take ~0.5s)
        limiter.acquire(50);
        long secondDurationMs = (System.nanoTime() - start) / 1_000_000;
        assertTrue(secondDurationMs >= 400 && secondDurationMs <= 800, "Second acquire should take about 500ms");
    }
    
    @Test
    void testHandlingHugeChunks() throws InterruptedException {
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(10L, null);
        
        long start = System.nanoTime();
        // Request 100 bytes, bucket size is 10, limit is 10/s, should take ~10 seconds
        limiter.acquire(30); 
        long durationMs = (System.nanoTime() - start) / 1_000_000;
        assertTrue(durationMs >= 2000, "Huge chunk should be throttled appropriately. Took: " + durationMs);
    }
}
