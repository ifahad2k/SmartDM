package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.domain.repository.CategoryRepository;
import io.smartdm.domain.Category;
import io.smartdm.domain.CategoryRule;
import io.smartdm.download.http.HttpProbeClient;
import io.smartdm.download.http.HttpRequestFactory;
import io.smartdm.download.http.UnauthorizedException;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

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
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Coordinates the lifecycle of a download: probe → plan segments → download → verify → commit.
 */
public class SingleDownloadCoordinator {
    private static final Logger log = LoggerFactory.getLogger(SingleDownloadCoordinator.class);

    static {
        try {
            if (System.getProperty("jdk.httpclient.receiveBufferSize") == null) {
                System.setProperty("jdk.httpclient.receiveBufferSize", "1048576"); // 1 MB TCP window scale
            }
            if (System.getProperty("jdk.httpclient.connectionPoolSize") == null) {
                System.setProperty("jdk.httpclient.connectionPoolSize", "64");
            }
        } catch (Throwable ignored) {}
    }
    
    private final DownloadRepository repository;
    private final CategoryRepository categoryRepository;
    private final HttpProbeClient probeClient;
    private final HttpClient httpClient;
    private final DownloadEvent.Publisher eventPublisher;
    private final Path tempDir;
    private final ExecutorService segmentExecutor;

    private final ConcurrentHashMap<DownloadId, DownloadSession> sessions = new ConcurrentHashMap<>();

    private static class DownloadSession {
        final Download download;
        volatile SegmentedFileChannel channel;
        final List<SegmentWorker> workers = new CopyOnWriteArrayList<>();
        final List<Future<Void>> futures = new CopyOnWriteArrayList<>();
        volatile boolean cancelled = false;
        volatile boolean paused = false;
        volatile boolean queued = false;

        DownloadSession(Download download, SegmentedFileChannel channel) {
            this.download = download;
            this.channel = channel;
        }
    }

    private final io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter;

    public SingleDownloadCoordinator(
            DownloadRepository repository,
            CategoryRepository categoryRepository,
            HttpProbeClient probeClient,
            HttpClient httpClient,
            DownloadEvent.Publisher eventPublisher,
            Path tempDir,
            io.smartdm.download.engine.limit.TokenBucketRateLimiter rateLimiter) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
        this.probeClient = probeClient;
        this.httpClient = httpClient;
        this.eventPublisher = eventPublisher;
        this.tempDir = tempDir;
        this.rateLimiter = rateLimiter;
        this.segmentExecutor = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "segment-worker");
            t.setDaemon(true);
            return t;
        });
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

            HttpProbeClient.ProbeResult probeResult;
            try {
                probeResult = probeClient.probeAsync(download.source(), download.credential()).join();
            } catch (java.util.concurrent.CompletionException ce) {
                if (ce.getCause() instanceof UnauthorizedException) {
                    download.updateState(DownloadState.REQUIRES_AUTH);
                    repository.save(download);
                    eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
                    return;
                }
                throw ce;
            }

            // Re-check database state in case the user paused/cancelled during the blocking probe
            Download latest = repository.findById(download.id()).orElse(download);
            if (session.paused || session.queued || session.cancelled ||
                latest.state() == DownloadState.PAUSED || latest.state() == DownloadState.QUEUED || latest.state() == DownloadState.CANCELED) {
                return; // Abort execution silently; pause/cancel already handled the DB and Events
            }

            // Check identity for resume
            if (download.etag() != null || download.lastModified() != null) {
                boolean etagChanged = download.etag() != null && probeResult.etag() != null && !download.etag().equals(probeResult.etag());
                boolean lmChanged = download.lastModified() != null && probeResult.lastModified() != null && !download.lastModified().equals(probeResult.lastModified());
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
            
            if (download.categoryId() == null && categoryRepository != null) {
                // Auto-assign category
                String mimeType = probeResult.mimeType();
                String ext = download.destination().value().getFileName().toString();
                int lastDot = ext.lastIndexOf('.');
                String extension = (lastDot != -1) ? ext.substring(lastDot + 1).toLowerCase() : "";
                
                Category matchedCategory = null;
                outer: for (Category cat : categoryRepository.findAll()) {
                    for (CategoryRule rule : cat.rules()) {
                        if (rule.type() == CategoryRule.RuleType.EXTENSION && extension.equalsIgnoreCase(rule.value())) {
                            matchedCategory = cat;
                            break outer;
                        }
                        if (rule.type() == CategoryRule.RuleType.MIME_TYPE && mimeType != null && mimeType.contains(rule.value())) {
                            matchedCategory = cat;
                            break outer;
                        }
                    }
                }
                
                if (matchedCategory != null) {
                    download.updateCategoryId(matchedCategory.id());
                }
            }

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
            long totalExpectedSize = probeResult.size().value();
            if (totalExpectedSize > 0) {
                channel.preallocate(totalExpectedSize);
            }

            HttpRequest baseRequest = HttpRequestFactory.createBuilder(download.source(), download.credential())
                    .GET()
                    .build();

            AtomicLong lastSaveTime = new AtomicLong(System.currentTimeMillis());
            AtomicLong lastProgressPublishTime = new AtomicLong(0);
            SegmentWorker.ProgressCallback callback = (segment, read) -> {
                long now = System.currentTimeMillis();
                long prevPub = lastProgressPublishTime.get();
                if (now - prevPub >= 100) {
                    if (lastProgressPublishTime.compareAndSet(prevPub, now)) {
                        eventPublisher.publish(new DownloadEvent.ProgressUpdated(
                                download.id(), download.downloadedBytes(), download.totalBytes(), download));
                    }
                }
                long prevSave = lastSaveTime.get();
                if (now - prevSave > 5000) {
                    if (lastSaveTime.compareAndSet(prevSave, now)) {
                        try { session.channel.force(false); } catch(Exception ignored){}
                        repository.save(download);
                    }
                }
            };

            for (DownloadSegment segment : download.segments()) {
                if (segment.currentOffset() > segment.endOffset() && segment.endOffset() >= 0) continue;
                boolean acceptsRanges = download.segments().size() > 1 || (download.totalBytes() != null && download.totalBytes().value() > 0);
                SegmentWorker worker = new SegmentWorker(httpClient, baseRequest, segment, channel, rateLimiter, callback, download.etag(), download.lastModified(), acceptsRanges);
                session.workers.add(worker);
                session.futures.add(segmentExecutor.submit(worker));
            }

            // Dynamic Work-Stealing Supervisor Loop
            boolean canWorkSteal = probeResult.acceptsRanges() && totalExpectedSize > 0;
            int maxConcurrency = Math.min(32, Math.max(8, download.segments().size() * 2));
            long minStealSize = Math.min(4 * 1024 * 1024L, Math.max(512 * 1024L, totalExpectedSize / 32));

            boolean workerFailed = false;
            while (!session.cancelled && !session.paused && !session.queued) {
                boolean allFinished = true;
                int activeCount = 0;

                for (Future<Void> future : session.futures) {
                    if (future.isDone()) {
                        try {
                            future.get();
                        } catch (Exception e) {
                            if (!isAcceptableEndOfStream(e)) {
                                workerFailed = true;
                                break;
                            }
                        }
                    } else {
                        allFinished = false;
                        activeCount++;
                    }
                }

                if (workerFailed || allFinished) {
                    break;
                }

                if (canWorkSteal && activeCount < maxConcurrency) {
                    stealWorkIfPossible(session, download, channel, baseRequest, callback, minStealSize);
                }

                try {
                    Thread.sleep(50);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

            if (session.cancelled) {
                channel.cleanup();
                return;
            }

            if (session.queued) {
                download.updateState(DownloadState.QUEUED);
                repository.save(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
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
            if (expectedSize > 0 && actualSize != expectedSize) {
                throw new IOException("Downloaded bytes do not match expected size: expected="
                        + expectedSize + ", actual=" + actualSize);
            }

            // If size was unknown or 0 during probe, update totalBytes to actualSize
            if (expectedSize <= 0 && actualSize > 0) {
                download.updateProgress(download.downloadedBytes(), io.smartdm.domain.ByteCount.of(actualSize));
            }

            // ── Phase 3: Verify ──────────────────────────────────────
            download.updateState(DownloadState.VERIFYING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
            
            // Hashing logic
            if (download.expectedHash() != null && !download.expectedHash().isBlank()) {
                String cleanHash = download.expectedHash().trim();
                String algorithm;
                if (cleanHash.length() == 32) {
                    algorithm = "MD5";
                } else if (cleanHash.length() == 40) {
                    algorithm = "SHA-1";
                } else if (cleanHash.length() == 64) {
                    algorithm = "SHA-256";
                } else {
                    algorithm = "SHA-256";
                }
                try {
                    java.security.MessageDigest digest = java.security.MessageDigest.getInstance(algorithm);
                    try (java.io.InputStream is = java.nio.file.Files.newInputStream(channel.getTempFile())) {
                        byte[] buffer = new byte[1048576]; // 1 MB high-speed hash verification buffer
                        int read;
                        while ((read = is.read(buffer)) != -1) {
                            digest.update(buffer, 0, read);
                        }
                    }
                    byte[] hashBytes = digest.digest();
                    String actualHash = java.util.HexFormat.of().formatHex(hashBytes);
                    if (!actualHash.equalsIgnoreCase(cleanHash)) {
                        throw new RuntimeException("Hash verification failed. Expected: " + download.expectedHash() + ", Actual: " + actualHash);
                    }
                } catch (java.security.NoSuchAlgorithmException e) {
                    throw new RuntimeException(algorithm + " algorithm not available for hash verification", e);
                }
            }

            // ── Phase 4: Commit ──────────────────────────────────────
            channel.commit();

            download.updateState(DownloadState.COMPLETED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));

        } catch (Exception e) {
            log.error("Execution failed for download {}", download.id().value(), e);
            download.updateState(DownloadState.FAILED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
        } finally {
            if (session != null) {
                sessions.remove(download.id());
                if (download.state() == DownloadState.CANCELED) {
                    if (session.channel != null) {
                        session.channel.cleanup();
                    }
                } else {
                    try {
                        if (session.channel != null) {
                            session.channel.close();
                        }
                    } catch (Exception ignored) {}
                }
            } else if (channel != null) {
                if (download.state() == DownloadState.CANCELED) {
                    channel.cleanup();
                } else {
                    try {
                        channel.close();
                    } catch (Exception ignored) {}
                }
            }
        }
    }

    private int calculateDynamicSegments(long totalSize) {
        if (totalSize < 2 * 1024 * 1024) return 1;
        if (totalSize < 20 * 1024 * 1024) return 4;
        if (totalSize < 100 * 1024 * 1024) return 8;
        return 16;
    }

    private void stealWorkIfPossible(
            DownloadSession session,
            Download download,
            SegmentedFileChannel channel,
            HttpRequest baseRequest,
            SegmentWorker.ProgressCallback callback,
            long minStealSize) {

        DownloadSegment candidate = null;
        long maxRemaining = minStealSize - 1;

        for (DownloadSegment seg : download.segments()) {
            long rem = seg.remainingBytes();
            if (rem > maxRemaining) {
                maxRemaining = rem;
                candidate = seg;
            }
        }

        if (candidate != null) {
            int newIndex = download.segments().size();
            DownloadSegment stolen = candidate.split(newIndex, minStealSize);
            if (stolen != null) {
                download.segments().add(stolen);
                SegmentWorker newWorker = new SegmentWorker(
                        httpClient, baseRequest, stolen, channel, rateLimiter,
                        callback, download.etag(), download.lastModified(), true
                );
                session.workers.add(newWorker);
                session.futures.add(segmentExecutor.submit(newWorker));
                log.debug("Work stolen: bisected segment {} at {}, spawned segment {} [{} - {}]",
                        candidate.index(), candidate.endOffset(), stolen.index(), stolen.startOffset(), stolen.endOffset());
            }
        }
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

    public void queue(DownloadId id) {
        DownloadSession session = sessions.get(id);
        if (session != null) {
            session.queued = true;
            for (SegmentWorker worker : session.workers) {
                worker.pause(); // Stop worker loops like pause
            }
            for (Future<Void> future : session.futures) {
                future.cancel(true);
            }
            session.download.updateState(DownloadState.QUEUED);
            eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.QUEUED, session.download));
        } else {
            repository.findById(id).ifPresent(d -> {
                d.updateState(DownloadState.QUEUED);
                repository.save(d);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.QUEUED, d));
            });
        }
    }

    public CompletableFuture<Void> cancel(DownloadId id) {
        return cancel(id, true);
    }

    public CompletableFuture<Void> cancel(DownloadId id, boolean saveToRepository) {
        DownloadSession session = sessions.get(id);
        if (session != null) {
            session.cancelled = true;
            session.download.updateState(DownloadState.CANCELED);
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
                if (saveToRepository) {
                    repository.save(session.download);
                }
                eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.CANCELED, session.download));
            });
        } else {
            return CompletableFuture.runAsync(() -> {
                if (saveToRepository) {
                    repository.findById(id).ifPresent(d -> {
                        d.updateState(DownloadState.CANCELED);
                        repository.save(d);
                        eventPublisher.publish(new DownloadEvent.StateChanged(id, DownloadState.CANCELED, d));
                    });
                }
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
        Throwable cause = e.getCause() != null ? e.getCause() : e;
        if (cause instanceof EOFException) return true;
        if (cause instanceof java.net.SocketException) {
            String msg = cause.getMessage();
            return msg != null && (msg.contains("Connection reset") || msg.contains("Broken pipe"));
        }
        return false;
    }
}
