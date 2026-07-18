package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;

import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;

public class SingleDownloadCoordinator {
    private final DownloadRepository repository;
    private final HttpProbeClient probeClient;
    private final HttpClient httpClient;
    private final DownloadEvent.Publisher eventPublisher;
    private final Path tempDir;

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    private final Map<DownloadId, DownloadSession> activeSessions = new ConcurrentHashMap<>();
    private final Map<DownloadId, Long> lastSaveTimes = new ConcurrentHashMap<>();

    public SingleDownloadCoordinator(
            DownloadRepository repository,
            HttpProbeClient probeClient,
            HttpClient httpClient,
            DownloadEvent.Publisher eventPublisher,
            Path tempDir) {
        this.repository = repository;
        this.probeClient = probeClient;
        this.httpClient = httpClient;
        this.eventPublisher = eventPublisher;
        this.tempDir = tempDir;
    }

    public void execute(Download download) {
        DownloadId id = download.id();
        
        // Remove existing session if finished/dead
        activeSessions.remove(id);
        
        DownloadSession session = new DownloadSession(download);
        activeSessions.put(id, session);
        
        try {
            // ── Phase 1: Probing ───────────────────────────────────────
            download.updateState(DownloadState.PROBING);
            saveDownload(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));

            // Determine ranges / size
            HttpProbeClient.ProbeResult probeResult = probeClient.probeAsync(download.source()).join();
            long totalSize = probeResult.size().value();
            download.updateProgress(download.downloadedBytes(), probeResult.size());
            
            // Check if ranges are supported by probing with range bytes 0-0
            boolean supportsRanges = false;
            if (totalSize > 0) {
                try {
                    HttpRequest rangeCheck = HttpRequest.newBuilder()
                            .uri(download.source().value())
                            .header("User-Agent", USER_AGENT)
                            .header("Range", "bytes=0-0")
                            .GET()
                            .timeout(Duration.ofSeconds(10))
                            .build();
                    HttpResponse<Void> resp = httpClient.send(rangeCheck, HttpResponse.BodyHandlers.discarding());
                    supportsRanges = resp.statusCode() == 206;
                } catch (Exception ignored) {}
            }

            // ── Phase 2: Segment Planning ──────────────────────────────
            List<DownloadSegment> segments = download.segments();
            if (segments.isEmpty()) {
                segments = new ArrayList<>();
                if (supportsRanges && totalSize > 0) {
                    int numSegments = 3;
                    long segmentSize = totalSize / numSegments;
                    for (int i = 0; i < numSegments; i++) {
                        long start = i * segmentSize;
                        long end = (i == numSegments - 1) ? (totalSize - 1) : (start + segmentSize - 1);
                        segments.add(new DownloadSegment(i, start, start, end));
                    }
                } else {
                    // Fall back to a single stream segment
                    segments.add(new DownloadSegment(0, 0, 0, totalSize > 0 ? (totalSize - 1) : Long.MAX_VALUE));
                }
                download.updateSegments(segments);
                saveDownload(download);
            }

            download.updateState(DownloadState.DOWNLOADING);
            saveDownload(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));

            // ── Phase 3: Segment Downloading ───────────────────────────
            Path tempFile = tempDir.resolve(id.value() + ".part");
            if (!Files.exists(tempFile)) {
                Files.createDirectories(tempFile.getParent());
                try (RandomAccessFile raf = new RandomAccessFile(tempFile.toFile(), "rw")) {
                    if (totalSize > 0) {
                        raf.setLength(totalSize);
                    }
                }
            }

            try (FileChannel fileChannel = FileChannel.open(tempFile, 
                    java.nio.file.StandardOpenOption.READ, java.nio.file.StandardOpenOption.WRITE)) {
                
                List<Future<?>> futures = new ArrayList<>();
                List<SegmentWorker> workers = new ArrayList<>();
                
                for (DownloadSegment segment : segments) {
                    // Skip completed segments
                    if (segment.currentOffset() > segment.endOffset()) {
                        continue;
                    }
                    SegmentWorker worker = new SegmentWorker(download, segment, fileChannel, session);
                    workers.add(worker);
                    session.addWorker(worker);
                    
                    // We run workers in the default Java system thread pool or a custom executor
                    futures.add(java.util.concurrent.ForkJoinPool.commonPool().submit(worker));
                }
                
                // Wait for all workers to finish
                for (Future<?> future : futures) {
                    try {
                        future.get();
                    } catch (Exception e) {
                        session.markFailed(e);
                    }
                }

                // Collect worker failures
                for (SegmentWorker worker : workers) {
                    if (worker.failure != null) {
                        session.markFailed(worker.failure);
                    }
                }
            }

            // ── Phase 4: Commit / Finalization ─────────────────────────
            activeSessions.remove(id);

            if (session.isCanceled()) {
                Files.deleteIfExists(tempFile);
                download.updateState(DownloadState.CANCELED);
                saveDownload(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
            } else if (session.isPaused()) {
                download.updateState(DownloadState.PAUSED);
                saveDownload(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
            } else if (session.getFailureReason() != null) {
                System.err.println("Download " + id.value() + " failed: " + session.getFailureReason().getMessage());
                download.updateState(DownloadState.FAILED);
                saveDownload(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
            } else {
                // Check if all segments completed
                boolean allCompleted = true;
                for (DownloadSegment segment : download.segments()) {
                    if (segment.endOffset() != Long.MAX_VALUE) {
                        if (segment.currentOffset() <= segment.endOffset()) {
                            allCompleted = false;
                        }
                    } else {
                        if (!session.isSegmentCompleted(segment.index())) {
                            allCompleted = false;
                        }
                    }
                }

                if (allCompleted) {
                    Path targetParent = download.destination().value().getParent();
                    if (targetParent != null && !Files.exists(targetParent)) {
                        Files.createDirectories(targetParent);
                    }
                    Files.move(tempFile, download.destination().value(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                    download.updateState(DownloadState.COMPLETED);
                    saveDownload(download);
                    eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
                } else {
                    // Paused/Stopped/Canceled boundary check
                    download.updateState(DownloadState.PAUSED);
                    saveDownload(download);
                    eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
                }
            }

        } catch (Exception e) {
            activeSessions.remove(id);
            System.err.println("SingleDownloadCoordinator general failure: " + e.getMessage());
            e.printStackTrace(System.err);
            download.updateState(DownloadState.FAILED);
            saveDownload(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(id, download.state()));
        }
    }

    public void pause(DownloadId id) {
        DownloadSession session = activeSessions.get(id);
        if (session != null) {
            session.pause();
        } else {
            // Force state update if already stopped in memory
            Optional<Download> dOpt = repository.findById(id);
            if (dOpt.isPresent()) {
                Download d = dOpt.get();
                if (d.state() == DownloadState.DOWNLOADING || d.state() == DownloadState.PROBING) {
                    d.updateState(DownloadState.PAUSED);
                    saveDownload(d);
                    eventPublisher.publish(new DownloadEvent.StateChanged(id, d.state()));
                }
            }
        }
    }

    public void cancel(DownloadId id) {
        DownloadSession session = activeSessions.get(id);
        if (session != null) {
            session.cancel();
        } else {
            Optional<Download> dOpt = repository.findById(id);
            if (dOpt.isPresent()) {
                Download d = dOpt.get();
                try {
                    Path tempFile = tempDir.resolve(id.value() + ".part");
                    Files.deleteIfExists(tempFile);
                } catch (Exception ignored) {}
                d.updateState(DownloadState.CANCELED);
                saveDownload(d);
                eventPublisher.publish(new DownloadEvent.StateChanged(id, d.state()));
            }
        }
    }

    private synchronized void saveDownload(Download download) {
        repository.save(download);
    }

    private synchronized void saveDownloadThrottled(Download download) {
        DownloadId id = download.id();
        long now = System.currentTimeMillis();
        Long lastSave = lastSaveTimes.get(id);
        if (lastSave == null || (now - lastSave) > 500) {
            lastSaveTimes.put(id, now);
            repository.save(download);
        }
    }

    private class DownloadSession {
        private final Download download;
        private final List<SegmentWorker> workers = new ArrayList<>();
        private final java.util.Set<Integer> completedSegments = java.util.concurrent.ConcurrentHashMap.newKeySet();
        private volatile boolean paused = false;
        private volatile boolean canceled = false;
        private volatile Throwable failureReason = null;

        public DownloadSession(Download download) {
            this.download = download;
        }

        public void markSegmentCompleted(int index) {
            completedSegments.add(index);
        }

        public boolean isSegmentCompleted(int index) {
            return completedSegments.contains(index);
        }

        public synchronized void addWorker(SegmentWorker worker) {
            this.workers.add(worker);
            if (paused) worker.stop();
            if (canceled) worker.stop();
        }

        public synchronized void pause() {
            this.paused = true;
            for (SegmentWorker worker : workers) {
                worker.stop();
            }
        }

        public synchronized void cancel() {
            this.canceled = true;
            for (SegmentWorker worker : workers) {
                worker.stop();
            }
        }

        public synchronized void markFailed(Throwable t) {
            if (this.failureReason == null) {
                this.failureReason = t;
            }
        }

        public boolean isPaused() { return paused; }
        public boolean isCanceled() { return canceled; }
        public Throwable getFailureReason() { return failureReason; }
    }

    private class SegmentWorker implements Runnable {
        private final Download download;
        private final DownloadSegment segment;
        private final FileChannel fileChannel;
        private final DownloadSession session;
        private volatile boolean stopped = false;
        private volatile Exception failure = null;

        public SegmentWorker(Download download, DownloadSegment segment, FileChannel fileChannel, DownloadSession session) {
            this.download = download;
            this.segment = segment;
            this.fileChannel = fileChannel;
            this.session = session;
        }

        public void stop() {
            this.stopped = true;
        }

        @Override
        public void run() {
            String rangeHeader = "bytes=" + segment.currentOffset() + "-" + (segment.endOffset() == Long.MAX_VALUE ? "" : segment.endOffset());
            try {
                HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                        .uri(download.source().value())
                        .header("User-Agent", USER_AGENT)
                        .timeout(Duration.ofSeconds(15));
                
                // Add range header only if it's not starting from 0 to Long.MAX_VALUE
                if (segment.endOffset() != Long.MAX_VALUE || segment.startOffset() != 0) {
                    reqBuilder.header("Range", rangeHeader);
                }

                HttpRequest request = reqBuilder.GET().build();
                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());

                if (response.statusCode() != 200 && response.statusCode() != 206) {
                    throw new RuntimeException("HTTP GET failed with code " + response.statusCode() + " for range " + rangeHeader);
                }

                try (InputStream is = response.body()) {
                    byte[] buffer = new byte[8192];
                    int read = -1;
                    while (!stopped && (read = is.read(buffer)) != -1) {
                        ByteBuffer byteBuffer = ByteBuffer.wrap(buffer, 0, read);
                        
                        // Concurrent positional write using FileChannel (thread-safe)
                        long writePos = segment.currentOffset();
                        while (byteBuffer.hasRemaining()) {
                            int written = fileChannel.write(byteBuffer, writePos);
                            writePos += written;
                        }
                        
                        segment.updateOffset(segment.currentOffset() + read);
                        
                        // Throttled persistence and progress update
                        saveDownloadThrottled(download);
                        eventPublisher.publish(new DownloadEvent.ProgressUpdated(download.id(), download.downloadedBytes(), download.totalBytes()));
                    }
                    if (read == -1 && !stopped) {
                        session.markSegmentCompleted(segment.index());
                    }
                }
            } catch (Exception e) {
                this.failure = e;
            }
        }
    }
}
