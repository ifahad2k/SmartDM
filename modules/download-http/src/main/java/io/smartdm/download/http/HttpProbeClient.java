package io.smartdm.download.http;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.SourceUri;

import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
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
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10))
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .thenApply(response -> {
                    if (response.statusCode() >= 300) {
                        throw new RuntimeException("HEAD status: " + response.statusCode());
                    }
                    long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                    String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                    
                    return new ProbeResult(ByteCount.of(contentLength), mimeType);
                })
                .handle((result, ex) -> {
                    if (ex == null) {
                        return CompletableFuture.completedFuture(result);
                    }
                    // HEAD failed, fall back to GET with Range: bytes=0-0
                    return probeViaGetRange(uri);
                })
                .thenCompose(future -> future);
    }

    private CompletableFuture<ProbeResult> probeViaGetRange(SourceUri uri) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(uri.value())
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .header("Range", "bytes=0-0")
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                .thenApply(response -> {
                    try (InputStream is = response.body()) {
                        // Dummy read to consume a single byte and prevent "resource never referenced" warning
                        int unused = is.read();
                        
                        if (response.statusCode() != 200 && response.statusCode() != 206) {
                            throw new RuntimeException("GET Range failed: " + response.statusCode());
                        }
                        
                        long contentLength = -1;
                        String contentRange = response.headers().firstValue("Content-Range").orElse(null);
                        if (contentRange != null) {
                            int slashIndex = contentRange.lastIndexOf('/');
                            if (slashIndex >= 0) {
                                try {
                                    contentLength = Long.parseLong(contentRange.substring(slashIndex + 1).trim());
                                } catch (NumberFormatException ignored) {}
                            }
                        }
                        
                        if (contentLength == -1) {
                            contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                        }
                        
                        String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                        return new ProbeResult(ByteCount.of(contentLength), mimeType);
                    } catch (Exception e) {
                        throw new RuntimeException("Failed to process GET Range response", e);
                    }
                });
    }
}
