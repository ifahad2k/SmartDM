package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;

import java.io.EOFException;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Coordinates the lifecycle of a download: probe → plan segments → download → verify → commit.
 */
public class SingleDownloadCoordinator {
    private static final Logger log = LoggerFactory.getLogger(SingleDownloadCoordinator.class);
    
    private final DownloadRepository repository;
    private final HttpProbeClient probeClient;
    private final HttpClient httpClient;
    private final DownloadEvent.Publisher eventPublisher;
    private final Path tempDir;
    private final ExecutorService segmentExecutor;

    private final ConcurrentHashMap<DownloadId, DownloadSession> sessions = new ConcurrentHashMap<>();

    private static class DownloadSession {
        final Download download;
        volatile SegmentedFileChannel channel;
        final List<SegmentWorker> workers = new ArrayList<>();
        final List<Future<Void>> futures = new ArrayList<>();
        volatile boolean cancelled = false;
        volatile boolean paused = false;

        DownloadSession(Download download, SegmentedFileChannel channel) {
            this.download = download;
            this.channel = channel;
        }
    }

    private final io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter;

    public SingleDownloadCoordinator(
            DownloadRepository repository,
            HttpProbeClient probeClient,
            HttpClient httpClient,
            DownloadEvent.Publisher eventPublisher,
            Path tempDir,
            io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter) {
        this.repository = repository;
        this.probeClient = probeClient;
        this.httpClient = httpClient;
        this.eventPublisher = eventPublisher;
        this.tempDir = tempDir;
        this.rateLimiter = rateLimiter;
        this.segmentExecutor = Executors.newCachedThreadPool();
    }

    public void execute(Download download) {
        if (download.state() == DownloadState.COMPLETED || download.state() == DownloadState.CANCELED) {
            return;
        }

        if (download.state() == DownloadState.VERIFYING) {
            try {
                long expectedSize = download.totalBytes().value();
                if (expectedSize > 0 && java.nio.file.Files.exists(download.destination().value()) &&
                    java.nio.file.Files.size(download.destination().value()) == expectedSize) {
                    
                    Path partFile = tempDir.resolve(download.id().value() + ".part");
                    if (!java.nio.file.Files.exists(partFile)) {
                        log.info("Recovered from crash after commit for download {}. Marking as COMPLETED.", download.id().value());
                        download.updateState(DownloadState.COMPLETED);
                        repository.save(download);
                        eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
                        return;
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to check file size during recovery for download {}", download.id().value(), e);
            }
        }

        DownloadSession newSession = new DownloadSession(download, null);
        if (sessions.putIfAbsent(download.id(), newSession) != null) {
            log.warn("Download {} is already executing. Ignoring duplicate start request.", download.id().value());
            return;
        }

        SegmentedFileChannel channel = null;
        DownloadSession session = newSession;
        try {
            // ── Phase 1: Probe ─────────────────────────────────────────
            download.updateState(DownloadState.PROBING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));

            HttpProbeClient.ProbeResult probeResult = probeClient.probeAsync(download.source()).join();

            // Re-check database state in case the user paused/cancelled during the blocking probe
            Download latest = repository.findById(download.id()).orElse(download);
            if (latest.state() == DownloadState.PAUSED || latest.state() == DownloadState.CANCELED) {
                return; // Abort execution silently; pause/cancel already handled the DB and Events
            }

            // Check identity for resume
            if (download.etag() != null || download.lastModified() != null) {
                boolean etagChanged = download.etag() != null && !download.etag().equals(probeResult.etag());
                boolean lmChanged = download.lastModified() != null && !download.lastModified().equals(probeResult.lastModified());
                if (etagChanged || lmChanged) {
                    download.updateSegments(Collections.emptyList());
                    download.updateProgress(ByteCount.ZERO, ByteCount.UNKNOWN);
                    try {
                        java.nio.file.Files.deleteIfExists(tempDir.resolve(download.id().value() + ".part"));
                    } catch(Exception e) {
                        log.warn("Failed to delete stale part file on identity change", e);
                    }
                }
            }

            download.updateIdentity(probeResult.etag(), probeResult.lastModified());
            download.updateProgress(download.downloadedBytes(), probeResult.size());

            // Generate segments if empty
            if (download.segments().isEmpty()) {
                List<DownloadSegment> segments = new ArrayList<>();
                long totalSize = probeResult.size().value();
                if (totalSize > 0 && probeResult.acceptsRanges()) {
                    int numSegments = calculateDynamicSegments(totalSize);
                    long segmentSize = totalSize / numSegments;
                    for (int i = 0; i < numSegments; i++) {
                        long start = i * segmentSize;
                        long end = (i == numSegments - 1) ? totalSize - 1 : start + segmentSize - 1;
                        segments.add(new DownloadSegment(i, start, start, end));
                    }
                } else {
                    segments.add(new DownloadSegment(0, 0, 0, totalSize - 1));
                }
                download.updateSegments(segments);
                repository.save(download);
            }

            download.updateState(DownloadState.DOWNLOADING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));

            // ── Phase 2: Execute Workers ──────────────────────────────────────
            channel = new SegmentedFileChannel(download.destination(), tempDir, download.id().value() + ".part");
            session.channel = channel;

            HttpRequest baseRequest = HttpRequest.newBuilder()
                    .uri(download.source().value())
                    .GET()
                    .build();

            long[] lastSaveTime = {System.currentTimeMillis()};
            SegmentWorker.ProgressCallback callback = (segment, read) -> {
                eventPublisher.publish(new DownloadEvent.ProgressUpdated(
                        download.id(), download.downloadedBytes(), download.totalBytes(), download));
                long now = System.currentTimeMillis();
                if (now - lastSaveTime[0] > 5000) {
                    synchronized (lastSaveTime) {
                        if (now - lastSaveTime[0] > 5000) {
                            try { session.channel.force(true); } catch(Exception ignored){}
                            repository.save(download);
                            lastSaveTime[0] = now;
                        }
                    }
                }
            };

            for (DownloadSegment segment : download.segments()) {
                if (segment.currentOffset() > segment.endOffset() && segment.endOffset() >= 0) continue;
                SegmentWorker worker = new SegmentWorker(httpClient, baseRequest, segment, channel, rateLimiter, callback, download.etag(), download.lastModified());
                session.workers.add(worker);
                session.futures.add(segmentExecutor.submit(worker));
            }

            // Wait for all to finish
            boolean workerFailed = false;
            for (Future<Void> future : session.futures) {
                try {
                    future.get();
                } catch (Exception e) {
                    if (!isAcceptableEndOfStream(e)) {
                        workerFailed = true;
                    }
                }
            }

            if (session.cancelled) {
                channel.cleanup();
                return;
            }

            if (session.paused) {
                download.updateState(DownloadState.PAUSED);
                repository.save(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
                return;
            }

            if (workerFailed) {
                throw new RuntimeException("One or more segment workers failed.");
            }

            // Verify size
            long expectedSize = probeResult.size().value();
            long actualSize = download.downloadedBytes().value();
            if (expectedSize >= 0 && actualSize != expectedSize) {
                throw new IOException("Downloaded bytes do not match expected size: expected="
                        + expectedSize + ", actual=" + actualSize);
            }

            // ── Phase 3: Verify ──────────────────────────────────────
            download.updateState(DownloadState.VERIFYING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
            
            // Hashing logic can be added here if needed

            // ── Phase 4: Commit ──────────────────────────────────────
            channel.commit();

            download.updateState(DownloadState.COMPLETED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));

        } catch (Exception e) {
            log.error("SingleDownloadCoordinator failed: {}", e.getMessage(), e);
            download.updateState(DownloadState.FAILED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
        } finally {
            if (session != null) {
                sessions.remove(download.id());
                if (download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED) {
                    session.channel.cleanup();
                } else if (download.state() == DownloadState.PAUSED) {
                    try { if (session.channel != null) session.channel.close(); } catch(Exception ignored){}
                }
            } else if (channel != null) {
                if (download.state() == DownloadState.FAILED) channel.cleanup();
            }
        }
    }

    private int calculateDynamicSegments(long totalSize) {
        if (totalSize < 5 * 1024 * 1024) return 1;
        if (totalSize < 50 * 1024 * 1024) return 4;
        return 8;
    }

    public void pause(DownloadId id) {
        DownloadSession session = sessions.get(id);
        if (session != null) {
            session.paused = true;
            for (SegmentWorker worker : session.workers) {
                worker.pause();
            }
            for (Future<Void> future : session.futures) {
                future.cancel(true);
            }
            session.download.updateState(DownloadState.PAUSING);
            eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.PAUSING, session.download));
        } else {
            repository.findById(id).ifPresent(d -> {
                d.updateState(DownloadState.PAUSED);
                repository.save(d);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.PAUSED, d));
            });
        }
    }

    public CompletableFuture<Void> cancel(DownloadId id) {
        DownloadSession session = sessions.get(id);
        if (session != null) {
            session.cancelled = true;
            for (SegmentWorker worker : session.workers) {
                worker.pause();
            }
            for (Future<Void> future : session.futures) {
                future.cancel(true);
            }
            return CompletableFuture.runAsync(() -> {
                for (Future<Void> future : session.futures) {
                    try { future.get(); } catch (Exception ignored) {}
                }
                session.download.updateState(DownloadState.CANCELED);
                repository.save(session.download);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.CANCELED, session.download));
            });
        } else {
            return CompletableFuture.runAsync(() -> {
                repository.findById(id).ifPresent(d -> {
                    d.updateState(DownloadState.CANCELED);
                    repository.save(d);
                    eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.CANCELED, d));
                });
            });
        }
    }

    public void shutdown() {
        segmentExecutor.shutdownNow();
        try {
            segmentExecutor.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private boolean isAcceptableEndOfStream(Exception e) {
        return false;
    }
}
