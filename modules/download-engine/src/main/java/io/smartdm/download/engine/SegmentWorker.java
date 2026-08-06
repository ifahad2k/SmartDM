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
    private final DownloadSegment segment;
    private final SegmentedFileChannel channel;
    private final io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter;
    private final ProgressCallback progressCallback;
    private final String etag;
    private final String lastModified;
    private volatile boolean paused = false;

    public interface ProgressCallback {
        void onProgress(DownloadSegment segment, long bytesRead);
    }

    public SegmentWorker(HttpClient httpClient, HttpRequest baseRequest, DownloadSegment segment, SegmentedFileChannel channel, io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter, ProgressCallback progressCallback, String etag, String lastModified) {
        this.httpClient = httpClient;
        this.baseRequest = baseRequest;
        this.segment = segment;
        this.channel = channel;
        this.rateLimiter = rateLimiter;
        this.progressCallback = progressCallback;
        this.etag = etag;
        this.lastModified = lastModified;
    }

    @Override
    public Void call() throws Exception {
        int maxRetries = 8;
        int attempt = 0;
        Exception lastException = null;

        while (attempt < maxRetries && !Thread.currentThread().isInterrupted() && !paused) {
            if (segment.currentOffset() > segment.endOffset() && segment.endOffset() >= 0) {
                return null; // Already finished
            }

            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder(baseRequest.uri());
                
                baseRequest.headers().map().forEach((k, v) -> {
                    for (String val : v) {
                        builder.header(k, val);
                    }
                });

                boolean isRangeRequest = false;
                if (segment.endOffset() >= 0) {
                    builder.header("Range", "bytes=" + segment.currentOffset() + "-" + segment.endOffset());
                    isRangeRequest = true;
                } else if (segment.startOffset() > 0 || segment.currentOffset() > 0) {
                    builder.header("Range", "bytes=" + segment.currentOffset() + "-");
                    isRangeRequest = true;
                }

                builder.timeout(Duration.ofSeconds(30));
                HttpRequest request = builder.GET().build();

                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                
                if (response.statusCode() == 416) {
                    // Range Not Satisfiable - offset reached segment boundary
                    return null;
                }

                if (response.statusCode() >= 300) {
                    throw new RuntimeException("HTTP GET failed with status: " + response.statusCode());
                }

                if (isRangeRequest && response.statusCode() != 206) {
                    if (response.statusCode() == 200) {
                        if (segment.startOffset() > 0 || segment.currentOffset() > 0) {
                            if (segment.currentOffset() > 0) {
                                segment.updateOffset(0);
                                channel.truncate(0);
                            }
                        }
                    } else {
                        throw new RuntimeException("HTTP GET failed with status: " + response.statusCode());
                    }
                }

                long bytesRemaining = segment.endOffset() >= 0 ? (segment.endOffset() - segment.currentOffset() + 1) : Long.MAX_VALUE;

                try (InputStream is = response.body()) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while (!Thread.currentThread().isInterrupted() && !paused && bytesRemaining > 0) {
                        int toRead = (int) Math.min(buffer.length, bytesRemaining);
                        read = is.read(buffer, 0, toRead);
                        if (read == -1) break;

                        if (rateLimiter != null) {
                            rateLimiter.acquire(read);
                        }
                        channel.writeAt(segment.currentOffset(), buffer, read);
                        segment.updateOffset(segment.currentOffset() + read);
                        bytesRemaining -= read;
                        if (progressCallback != null) {
                            progressCallback.onProgress(segment, read);
                        }
                    }
                }

                if (segment.endOffset() < 0 || segment.currentOffset() > segment.endOffset()) {
                    return null; // Completed segment successfully
                }

                if (Thread.currentThread().isInterrupted() || paused) {
                    return null;
                }

            } catch (Exception e) {
                lastException = e;
                attempt++;
                if (Thread.currentThread().isInterrupted() || paused) {
                    return null;
                }
                if (attempt < maxRetries) {
                    try {
                        Thread.sleep(1000L * attempt); // Exponential backoff (1s, 2s, 3s...)
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return null;
                    }
                }
            }
        }

        if (lastException != null && !paused && !Thread.currentThread().isInterrupted()) {
            throw lastException;
        }

        return null;
    }

    public void pause() {
        this.paused = true;
    }
}
