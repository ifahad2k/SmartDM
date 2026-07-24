package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.*;

class CrashRecoveryIntegrationTest {

    private static FakeHttpServer server;

    @TempDir
    Path tempDir;

    private HttpClient httpClient;
    private HttpProbeClient probeClient;
    private DownloadEvent.Publisher publisher;

    @BeforeAll
    static void startServer() throws Exception {
        server = new FakeHttpServer();
        server.start();
    }

    @AfterAll
    static void stopServer() {
        server.stop();
    }

    @BeforeEach
    void setUp() {
        httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        probeClient = new HttpProbeClient(httpClient);
        publisher = event -> {};
    }

    static class InMemoryDownloadRepository implements DownloadRepository {
        private final Map<DownloadId, Download> db = new ConcurrentHashMap<>();

        private Download copy(Download source) {
            if (source == null) return null;
            Download copy = new Download(source.id(), source.source(), source.destination());
            copy.updateState(source.state());
            copy.updateProgress(source.downloadedBytes(), source.totalBytes());
            copy.updateIdentity(source.etag(), source.lastModified());
            copy.updateScheduledStartTime(source.scheduledStartTime());
            copy.updateExpectedHash(source.expectedHash());
            copy.updateCategoryId(source.categoryId());
            copy.updateCredential(source.credential());
            List<io.smartdm.domain.DownloadSegment> segments = new ArrayList<>();
            for (io.smartdm.domain.DownloadSegment s : source.segments()) {
                segments.add(new io.smartdm.domain.DownloadSegment(s.index(), s.startOffset(), s.currentOffset(), s.endOffset()));
            }
            copy.updateSegments(segments);
            return copy;
        }

        @Override public void save(Download download) { db.put(download.id(), copy(download)); }
        @Override public Optional<Download> findById(DownloadId id) { return Optional.ofNullable(copy(db.get(id))); }
        @Override public List<Download> findAll() { 
            List<Download> res = new ArrayList<>();
            for (Download d : db.values()) res.add(copy(d));
            return res; 
        }
        @Override public void delete(DownloadId id) { db.remove(id); }
        @Override public List<Download> findScheduledDownloads() { return List.of(); }
        @Override public List<Download> findReadyScheduledDownloads(long currentTimeMs) { return List.of(); }
    }

    @ParameterizedTest
    @EnumSource(RecoveryFaultPoint.class)
    void testCrashRecovery(RecoveryFaultPoint faultPoint) throws Exception {
        InMemoryDownloadRepository repo = new InMemoryDownloadRepository();
        SingleDownloadCoordinator coordinator = new SingleDownloadCoordinator(
                repo, null, probeClient, httpClient, publisher, tempDir.resolve("parts"),
                new io.smartdm.download.engine.bandwidth.TokenBucketRateLimiter(Long.MAX_VALUE, null));

        Path dest = tempDir.resolve("crash_test_" + faultPoint.name() + ".txt");
        Download dl = Download.create(
                SourceUri.of(server.getBaseUrl() + "/normal"),
                Destination.of(dest.toAbsolutePath().toString()));
        repo.save(dl);

        // Inject fault
        coordinator.setFaultInjectionHook(point -> {
            if (point == faultPoint) {
                throw new RuntimeException("Simulated crash at " + point);
            }
        });

        // Run coordinator, expect it to fail (it catches and sets state to FAILED)
        coordinator.execute(dl);

        // State should be FAILED or the process should just stop (coordinator catches it)
        Download failedDl = repo.findById(dl.id()).orElseThrow();
        assertEquals(DownloadState.FAILED, failedDl.state());

        // Now simulate a restart: new coordinator, same repo
        SingleDownloadCoordinator restartedCoordinator = new SingleDownloadCoordinator(
                repo, null, probeClient, httpClient, publisher, tempDir.resolve("parts"),
                new io.smartdm.download.engine.bandwidth.TokenBucketRateLimiter(Long.MAX_VALUE, null));

        // Let's reset the download state to PAUSED or something to simulate user resuming it,
        // or just let it resume if it's already FAILED. Wait, execute() checks if it's COMPLETED or CANCELED.
        // It should run if it's FAILED.
        System.out.println("RESTARTING DL: cur=" + failedDl.segments().get(0).currentOffset() + ", end=" + failedDl.segments().get(0).endOffset()); restartedCoordinator.execute(failedDl); Download after = repo.findById(failedDl.id()).orElseThrow(); System.out.println("AFTER DL: " + after.segments().get(0).currentOffset());

        Download finalDl = repo.findById(dl.id()).orElseThrow();
        assertEquals(DownloadState.COMPLETED, finalDl.state());
        assertTrue(Files.exists(dest));
        assertEquals("Hello World! This is a known length file.", Files.readString(dest));
    }
}
