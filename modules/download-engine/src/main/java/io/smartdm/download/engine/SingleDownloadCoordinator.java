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
import io.smartdm.download.http.UnauthorizedException;
import java.util.Base64;

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
        final List<SegmentWorker> workers = new ArrayList<>();
        final List<Future<Void>> futures = new ArrayList<>();
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
        this.segmentExecutor = Executors.newCachedThreadPool();
    }

    public void execute(Download download) {
        if (download.state() == DownloadState.COMPLETED || download.state() == DownloadState.CANCELED) {
            return;
        }

        if (download.state() == DownloadState.VERIFYING) {
            try {
                long expectedSize = download.totalBytes().value();
                if (expectedSize > 0 && java.nio.file.Files.exists(Path.of(download.destination().value())) &&
                    java.nio.file.Files.size(Path.of(download.destination().value())) == expectedSize) {
                    
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
            
            if (download.categoryId() == null && categoryRepository != null) {
                // Auto-assign category
                String mimeType = probeResult.mimeType();
                Path destPath = Path.of(download.destination().value());
                String ext = destPath.getFileName().toString();
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

            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(download.source().value())
                    .GET();
            
            if (download.credential() != null) {
                String basicAuth = Base64.getEncoder().encodeToString((download.credential().username() + ":" + download.credential().password()).getBytes());
                reqBuilder.header("Authorization", "Basic " + basicAuth);
            }
            HttpRequest baseRequest = reqBuilder.build();

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
            if (expectedSize >= 0 && actualSize != expectedSize) {
                throw new IOException("Downloaded bytes do not match expected size: expected="
                        + expectedSize + ", actual=" + actualSize);
            }

            // ── Phase 3: Verify ──────────────────────────────────────
            download.updateState(DownloadState.VERIFYING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state(), download));
            
            // Hashing logic
            if (download.expectedHash() != null && !download.expectedHash().isBlank()) {
                try {
                    java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
                    try (java.io.InputStream is = java.nio.file.Files.newInputStream(channel.getTempFile())) {
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = is.read(buffer)) != -1) {
                            digest.update(buffer, 0, read);
                        }
                    }
                    byte[] hashBytes = digest.digest();
                    StringBuilder sb = new StringBuilder();
                    for (byte b : hashBytes) {
                        sb.append(String.format("%02x", b));
                    }
                    String actualHash = sb.toString();
                    if (!actualHash.equalsIgnoreCase(download.expectedHash().trim())) {
                        throw new RuntimeException("Hash verification failed. Expected: " + download.expectedHash() + ", Actual: " + actualHash);
                    }
                } catch (java.security.NoSuchAlgorithmException e) {
                    throw new RuntimeException("SHA-256 algorithm not available for hash verification", e);
                }
            }

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
                    if (session.channel != null) {
                        session.channel.cleanup();
                    }
                } else if (download.state() == DownloadState.PAUSED || download.state() == DownloadState.QUEUED) {
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
        return false;
    }
}
