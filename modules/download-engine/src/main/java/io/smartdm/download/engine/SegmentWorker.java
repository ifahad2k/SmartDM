package io.smartdm.download.engine;

import io.smartdm.domain.DownloadSegment;

import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.Callable;

public class SegmentWorker implements Callable<Void> {
    private final HttpClient httpClient;
    private final HttpRequest baseRequest;
    private volatile DownloadSegment segment;
    private final SegmentedFileChannel channel;
    private final io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter;
    private final ProgressCallback progressCallback;
    private final String etag;
    private final String lastModified;
    private volatile boolean paused = false;
    private final boolean acceptsRanges;
    private final WorkStealingProvider workStealingProvider;

    private volatile double currentSpeedMBps = 1.0;
    private long windowStartTime = System.currentTimeMillis();
    private long windowBytesRead = 0;

    public interface ProgressCallback {
        void onProgress(DownloadSegment segment, long bytesRead);
    }

    public interface WorkStealingProvider {
        DownloadSegment stealWork(SegmentWorker idleWorker, long minStealBytes);
    }

    public SegmentWorker(HttpClient httpClient, HttpRequest baseRequest, DownloadSegment segment, SegmentedFileChannel channel, io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter, ProgressCallback progressCallback, String etag, String lastModified, boolean acceptsRanges, WorkStealingProvider workStealingProvider) {
        this.httpClient = httpClient;
        this.baseRequest = baseRequest;
        this.segment = segment;
        this.channel = channel;
        this.rateLimiter = rateLimiter;
        this.progressCallback = progressCallback;
        this.etag = etag;
        this.lastModified = lastModified;
        this.acceptsRanges = acceptsRanges;
        this.workStealingProvider = workStealingProvider;
    }

    public SegmentWorker(HttpClient httpClient, HttpRequest baseRequest, DownloadSegment segment, SegmentedFileChannel channel, io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter, ProgressCallback progressCallback, String etag, String lastModified, boolean acceptsRanges) {
        this(httpClient, baseRequest, segment, channel, rateLimiter, progressCallback, etag, lastModified, acceptsRanges, null);
    }

    public SegmentWorker(HttpClient httpClient, HttpRequest baseRequest, DownloadSegment segment, SegmentedFileChannel channel, io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter, ProgressCallback progressCallback, String etag, String lastModified) {
        this(httpClient, baseRequest, segment, channel, rateLimiter, progressCallback, etag, lastModified, true, null);
    }

    @Override
    public Void call() throws Exception {
        while (!Thread.currentThread().isInterrupted() && !paused) {
            downloadCurrentSegment();

            if (paused || Thread.currentThread().isInterrupted()) {
                return null;
            }

            // Warm-Socket Persistent Connection Re-use:
            // Query the coordinator for an unfinished slice and immediately download it on this warm worker pipeline!
            if (workStealingProvider != null && acceptsRanges) {
                DownloadSegment next = workStealingProvider.stealWork(this, 1024 * 1024L);
                if (next != null) {
                    this.segment = next;
                    continue; // Download the stolen slice immediately on warm socket!
                }
            }

            break;
        }
        return null;
    }

    private void downloadCurrentSegment() throws Exception {
        int maxRetries = 8;
        int attempt = 0;
        Exception lastException = null;

        while (attempt < maxRetries && !Thread.currentThread().isInterrupted() && !paused) {
            DownloadSegment currentSeg = this.segment;
            if (currentSeg.currentOffset() > currentSeg.endOffset() && currentSeg.endOffset() >= 0) {
                return; // Already finished
            }

            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder(baseRequest.uri());
                
                baseRequest.headers().map().forEach((k, v) -> {
                    for (String val : v) {
                        builder.header(k, val);
                    }
                });

                boolean isRangeRequest = false;
                if (acceptsRanges) {
                    if (currentSeg.endOffset() >= 0) {
                        builder.header("Range", "bytes=" + currentSeg.currentOffset() + "-" + currentSeg.endOffset());
                        isRangeRequest = true;
                    } else if (currentSeg.startOffset() > 0 || currentSeg.currentOffset() > 0) {
                        builder.header("Range", "bytes=" + currentSeg.currentOffset() + "-");
                        isRangeRequest = true;
                    }
                }

                if (isRangeRequest) {
                    if (etag != null && !etag.isBlank()) {
                        builder.header("If-Range", etag);
                    } else if (lastModified != null && !lastModified.isBlank()) {
                        builder.header("If-Range", lastModified);
                    }
                }

                builder.timeout(Duration.ofSeconds(30));
                HttpRequest request = builder.GET().build();

                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                
                try (InputStream is = response.body()) {
                    if (response.statusCode() == 416) {
                        // Range Not Satisfiable - offset reached segment boundary
                        return;
                    }

                    if (response.statusCode() >= 300) {
                        throw new RuntimeException("HTTP GET failed with status: " + response.statusCode());
                    }

                    if (isRangeRequest && response.statusCode() != 206) {
                        if (response.statusCode() == 200) {
                            if (currentSeg.index() > 0) {
                                return;
                            }
                            if (currentSeg.currentOffset() > 0) {
                                currentSeg.updateOffset(0);
                                channel.truncate(0);
                            }
                        } else {
                            throw new RuntimeException("HTTP GET failed with status: " + response.statusCode());
                        }
                    }

                    byte[] buffer = new byte[262144]; // 256 KB high-speed direct buffer
                    int read;
                    while (!Thread.currentThread().isInterrupted() && !paused) {
                        long cur = currentSeg.currentOffset();
                        long end = currentSeg.endOffset();
                        if (end >= 0 && cur > end) {
                            break; // Reached end of current slice (including dynamically contracted splits)
                        }
                        long remaining = end >= 0 ? (end - cur + 1) : Long.MAX_VALUE;
                        if (remaining <= 0) {
                            break;
                        }

                        int toRead = (int) Math.min(buffer.length, remaining);
                        read = is.read(buffer, 0, toRead);
                        if (read == -1) {
                            if (!paused && !Thread.currentThread().isInterrupted() && currentSeg.endOffset() >= 0 && currentSeg.currentOffset() <= currentSeg.endOffset()) {
                                throw new java.io.EOFException("Premature end of stream for segment " + currentSeg.index() + ": expected " + (currentSeg.endOffset() + 1) + " bytes, got " + currentSeg.currentOffset());
                            }
                            break;
                        }

                        if (rateLimiter != null) {
                            rateLimiter.acquire(read);
                        }
                        channel.writeAt(currentSeg.currentOffset(), buffer, read);
                        currentSeg.updateOffset(currentSeg.currentOffset() + read);

                        // Real-time speed telemetry
                        windowBytesRead += read;
                        long now = System.currentTimeMillis();
                        if (now - windowStartTime >= 500) {
                            double elapsedSec = Math.max(0.1, (now - windowStartTime) / 1000.0);
                            double instSpeed = (windowBytesRead / (1024.0 * 1024.0)) / elapsedSec;
                            currentSpeedMBps = 0.3 * instSpeed + 0.7 * currentSpeedMBps;
                            windowBytesRead = 0;
                            windowStartTime = now;
                        }

                        if (progressCallback != null) {
                            progressCallback.onProgress(currentSeg, read);
                        }
                    }
                }

                if (currentSeg.endOffset() < 0 || currentSeg.currentOffset() > currentSeg.endOffset()) {
                    return; // Completed segment successfully
                }

                if (Thread.currentThread().isInterrupted() || paused) {
                    return;
                }

            } catch (Exception e) {
                lastException = e;
                attempt++;
                if (Thread.currentThread().isInterrupted() || paused) {
                    return;
                }
                if (attempt < maxRetries) {
                    try {
                        long baseDelay = 1000L * (1L << Math.min(attempt, 5));
                        long jitter = (long)(Math.random() * baseDelay * 0.3);
                        Thread.sleep(baseDelay + jitter);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }

        if (lastException != null && !paused && !Thread.currentThread().isInterrupted()) {
            throw lastException;
        }
    }

    public void pause() {
        this.paused = true;
    }

    public boolean isPaused() {
        return paused;
    }

    public DownloadSegment getSegment() {
        return segment;
    }

    public double getCurrentSpeedMBps() {
        return currentSpeedMBps;
    }
}
