package io.smartdm.download.engine;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.http.HttpProbeClient;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;

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
            download.updateState(DownloadState.PROBING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));

            HttpProbeClient.ProbeResult probeResult = probeClient.probeAsync(download.source()).join();
            download.updateProgress(ByteCount.ZERO, probeResult.size());
            download.updateState(DownloadState.DOWNLOADING);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(download.source().value())
                    .GET()
                    .timeout(Duration.ofMinutes(10)) // Some reasonable timeout or no timeout
                    .build();

            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() >= 400) {
                throw new RuntimeException("HTTP GET failed: " + response.statusCode());
            }

            ManagedFileStream mfs = new ManagedFileStream(download.destination(), tempDir);
            try (InputStream is = response.body()) {
                mfs.writeFrom(is, bytesRead -> {
                    download.updateProgress(ByteCount.of(bytesRead), probeResult.size());
                    // we could save/publish less frequently in a real app, but this meets the slice requirement
                    repository.save(download);
                    eventPublisher.publish(new DownloadEvent.ProgressUpdated(download.id(), download.downloadedBytes(), download.totalBytes()));
                });
                mfs.commit();
                
                download.updateState(DownloadState.COMPLETED);
                repository.save(download);
                eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));
            } catch (Exception e) {
                mfs.cleanup();
                throw e;
            }

        } catch (Exception e) {
            download.updateState(DownloadState.FAILED);
            repository.save(download);
            eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), download.state()));
        }
    }
}
