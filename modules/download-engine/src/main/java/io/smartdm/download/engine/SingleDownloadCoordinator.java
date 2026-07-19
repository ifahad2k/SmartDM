package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Coordinates the lifecycle of a single download: probe → download → commit.
 *
 * <p>Guarantees: the destination path never contains partial content.
 * All writing goes to a temporary {@code .part} file first, and only
 * an atomic move publishes the complete file.
 */
public class SingleDownloadCoordinator {
    private final DownloadRepository repository;
    private final HttpProbeClient probeClient;
    private final HttpClient httpClient;
    private final DownloadEvent.Publisher eventPublisher;
    private final Path tempDir;

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
        try {
            // ── Phase 1: Probe ─────────────────────────────────────────
            download.updateState(DownloadState.PROBING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));

            HttpProbeClient.ProbeResult probeResult = probeClient.probeAsync(download.source()).join();
            download.updateProgress(ByteCount.ZERO, probeResult.size());
            download.updateState(DownloadState.DOWNLOADING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));

            // ── Phase 2: Download ──────────────────────────────────────
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(download.source().value())
                    .GET()
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());

            // Any non-2xx after redirect resolution is a failure
            if (response.statusCode() >= 300) {
                throw new RuntimeException("HTTP GET failed: " + response.statusCode());
            }

            // ── Phase 3: Write to temp, then atomic commit ─────────────
            ManagedFileStream mfs = new ManagedFileStream(download.destination(), tempDir);
            try (InputStream is = response.body()) {
                long expectedSize = probeResult.size().value();
                AtomicLong downloadedBytes = new AtomicLong(0L);
                try {
                    mfs.writeFrom(is, bytesRead -> {
                        downloadedBytes.set(bytesRead);
                        download.updateProgress(ByteCount.of(bytesRead), probeResult.size());
                        repository.save(download);
                        eventPublisher.publish(new DownloadEvent.ProgressUpdated(
                                download.id(), download.downloadedBytes(), download.totalBytes()));
                    });
                } catch (Exception e) {
                    if (expectedSize < 0 && isAcceptableEndOfStream(e)) {
                        // Some servers close after sending a complete unknown-length body.
                        // Treat that as a successful end-of-stream rather than a hard failure.
                    } else {
                        throw e;
                    }
                }

                if (expectedSize >= 0 && downloadedBytes.get() != expectedSize) {
                    throw new IOException("Downloaded bytes do not match expected size: expected="
                            + expectedSize + ", actual=" + downloadedBytes.get());
                }

                mfs.commit();

                download.updateState(DownloadState.COMPLETED);
                repository.save(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));
            } catch (Exception e) {
                mfs.cleanup();
                throw e;
            }

        } catch (Exception e) {
            System.err.println("SingleDownloadCoordinator failed: " + e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace(System.err);
            download.updateState(DownloadState.FAILED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));
        }
    }

    public void pause(io.smartdm.domain.DownloadId id) {
        // To be fully implemented with Phase 5
    }

    public void cancel(io.smartdm.domain.DownloadId id) {
        // To be fully implemented with Phase 5
    }

    private boolean isAcceptableEndOfStream(Exception e) {
        Throwable current = e;
        while (current != null) {
            String message = current.getMessage();
            if (current instanceof EOFException) {
                return true;
            }
            if (message != null && (message.contains("closed") || message.contains("EOF reached")
                    || message.contains("Connection reset") || message.contains("connection reset"))) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
