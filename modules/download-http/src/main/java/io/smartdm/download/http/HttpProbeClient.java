package io.smartdm.download.http;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.SourceUri;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

public class HttpProbeClient {
    private final HttpClient httpClient;

    public HttpProbeClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public HttpProbeClient() {
        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build());
    }

    public record ProbeResult(ByteCount size, String mimeType) {}

    public CompletableFuture<ProbeResult> probeAsync(SourceUri uri) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(uri.value())
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10))
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .thenApply(response -> {
                    if (response.statusCode() >= 400) {
                        throw new RuntimeException("HTTP error during probe: " + response.statusCode());
                    }
                    long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                    String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                    
                    return new ProbeResult(ByteCount.of(contentLength), mimeType);
                });
    }
}
