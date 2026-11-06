package io.smartdm.download.engine;

import io.smartdm.domain.*;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

public class BenchmarkRunnerTest {

    @Test
    void runBenchmarkDownload(@TempDir Path tempDir) throws Exception {
        int testSizeBytes = 8 * 1024 * 1024; // 8 MB bounded synthetic payload
        try (LocalTestHttpServer server = LocalTestHttpServer.createSynthetic(testSizeBytes, "/benchmark-test.bin")) {
            String testUrl = server.getUrl();
            Path destFile = tempDir.resolve("benchmark-test.bin");
            Path partsDir = tempDir.resolve("parts");
            Files.createDirectories(partsDir);

            HttpClient httpClient = HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_2)
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .connectTimeout(Duration.ofSeconds(15))
                    .build();

            HttpProbeClient probeClient = new HttpProbeClient(httpClient);

            DownloadRepository repo = new DownloadRepository() {
                @Override public void save(Download download) {}
                @Override public Optional<Download> findById(DownloadId id) { return Optional.empty(); }
                @Override public List<Download> findAll() { return Collections.emptyList(); }
                @Override public void delete(DownloadId id) {}
                @Override public List<Download> findScheduledDownloads() { return Collections.emptyList(); }
                @Override public List<Download> findReadyScheduledDownloads(long currentTimeMs) { return Collections.emptyList(); }
            };

            SingleDownloadCoordinator coordinator = new SingleDownloadCoordinator(
                    repo, null, probeClient, httpClient,
                    event -> {},
                    partsDir,
                    new io.smartdm.download.engine.limit.TokenBucketRateLimiter(null, null)
            );

            Download download = Download.create(SourceUri.of(testUrl), Destination.of(destFile));

            List<SpeedSample> samples = new CopyOnWriteArrayList<>();
            AtomicBoolean running = new AtomicBoolean(true);

            ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor();
            long startTime = System.currentTimeMillis();
            long[] lastBytes = {0};
            long[] lastTick = {startTime};
            int[] secondCounter = {0};

            ticker.scheduleAtFixedRate(() -> {
                if (!running.get()) return;
                long now = System.currentTimeMillis();
                long totalBytesDownloaded = download.downloadedBytes().value();
                long totalExpected = download.totalBytes() != null && download.totalBytes().value() > 0 ? download.totalBytes().value() : testSizeBytes;
                long delta = totalBytesDownloaded - lastBytes[0];
                double elapsedSec = Math.max(0.1, (now - lastTick[0]) / 1000.0);
                double speedMBps = (delta / (1024.0 * 1024.0)) / elapsedSec;
                lastBytes[0] = totalBytesDownloaded;
                lastTick[0] = now;
                secondCounter[0]++;

                int sec = secondCounter[0];
                double progressPercent = totalExpected > 0 ? (totalBytesDownloaded * 100.0 / totalExpected) : 0;
                int activeSegments = (int) download.segments().stream().filter(s -> s.remainingBytes() > 0).count();
                int totalSegments = download.segments().size();

                SpeedSample sample = new SpeedSample(sec, totalBytesDownloaded, delta, speedMBps, progressPercent, activeSegments, totalSegments);
                samples.add(sample);
            }, 100, 100, TimeUnit.MILLISECONDS);

            System.out.println("=== Starting SmartDM Bounded Local Benchmark ===");
            long execStart = System.currentTimeMillis();
            try {
                coordinator.execute(download);
            } finally {
                running.set(false);
                ticker.shutdownNow();
            }

            long execEnd = System.currentTimeMillis();
            double totalDurationSec = Math.max(0.001, (execEnd - execStart) / 1000.0);
            long totalDownloaded = download.downloadedBytes().value();
            double avgSpeedMBps = (totalDownloaded / (1024.0 * 1024.0)) / totalDurationSec;

            System.out.printf("%n=== Download Finished! ===%n");
            System.out.printf("State: %s%n", download.state());
            System.out.printf("Total Bytes: %d bytes (%.2f MB)%n", totalDownloaded, totalDownloaded / (1024.0 * 1024.0));
            System.out.printf("Total Duration: %.2f seconds%n", totalDurationSec);
            System.out.printf("Average Speed: %.2f MB/s (%.2f Mbps)%n", avgSpeedMBps, avgSpeedMBps * 8);
            System.out.printf("Final Segments Count: %d%n", download.segments().size());

            // Write output CSV and JSON to tempDir instead of personal hardcoded path
            Path csvFile = tempDir.resolve("speed_benchmark.csv");
            Path jsonFile = tempDir.resolve("speed_benchmark.json");

            StringBuilder csv = new StringBuilder("second,bytes_downloaded,speed_mbps,progress_percent,active_segments,total_segments\n");
            for (SpeedSample s : samples) {
                csv.append(String.format(Locale.US, "%d,%d,%.2f,%.2f,%d,%d\n",
                        s.second, s.downloadedBytes, s.speedMBps, s.progressPercent, s.activeSegments, s.totalSegments));
            }
            Files.writeString(csvFile, csv.toString());

            StringBuilder json = new StringBuilder("{\n");
            json.append(String.format(Locale.US, "  \"totalBytes\": %d,\n", totalDownloaded));
            json.append(String.format(Locale.US, "  \"durationSeconds\": %.2f,\n", totalDurationSec));
            json.append(String.format(Locale.US, "  \"avgSpeedMBps\": %.2f,\n", avgSpeedMBps));
            json.append(String.format(Locale.US, "  \"finalSegments\": %d,\n", download.segments().size()));
            json.append("  \"samples\": [\n");
            for (int i = 0; i < samples.size(); i++) {
                SpeedSample s = samples.get(i);
                json.append(String.format(Locale.US, "    {\"second\": %d, \"downloadedBytes\": %d, \"speedMBps\": %.2f, \"progressPercent\": %.2f, \"activeSegments\": %d, \"totalSegments\": %d}%s\n",
                        s.second, s.downloadedBytes, s.speedMBps, s.progressPercent, s.activeSegments, s.totalSegments, (i == samples.size() - 1 ? "" : ",")));
            }
            json.append("  ]\n}");
            Files.writeString(jsonFile, json.toString());

            assertThat(download.state()).isEqualTo(DownloadState.COMPLETED);
            assertThat(Files.exists(destFile)).isTrue();
            assertThat(Files.size(destFile)).isEqualTo(testSizeBytes);
            assertThat(Files.exists(csvFile)).isTrue();
            assertThat(Files.exists(jsonFile)).isTrue();

            coordinator.shutdown();
        }
    }

    record SpeedSample(int second, long downloadedBytes, long deltaBytes, double speedMBps, double progressPercent, int activeSegments, int totalSegments) {}
}
