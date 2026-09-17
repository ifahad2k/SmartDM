package io.smartdm.download.http;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.AuthCredential;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class HttpProbeClientTest {

    @Test
    @SuppressWarnings("unchecked")
    void testBug38_immediatelyFailsOn404WithoutRetryOrGetRange() {
        HttpClient httpClient = mock(HttpClient.class);
        HttpResponse<Void> headResponse = mock(HttpResponse.class);
        when(headResponse.statusCode()).thenReturn(404);

        when(httpClient.sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(headResponse));

        HttpProbeClient probeClient = new HttpProbeClient(httpClient);
        AuthCredential credential = new AuthCredential("user", "pass", "token", "test_cookie=1");

        CompletableFuture<HttpProbeClient.ProbeResult> future = probeClient.probeAsync(
                SourceUri.of("https://example.com/notfound.zip"),
                credential
        );

        assertThatThrownBy(future::join)
                .hasCauseInstanceOf(RuntimeException.class)
                .hasMessageContaining("404 Not Found");

        // Verify only ONE request was made - no credential retry, no GET Range fallback
        verify(httpClient, times(1)).sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void testBug38_immediatelyFailsOn410WithoutRetryOrGetRange() {
        HttpClient httpClient = mock(HttpClient.class);
        HttpResponse<Void> headResponse = mock(HttpResponse.class);
        when(headResponse.statusCode()).thenReturn(410);

        when(httpClient.sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(headResponse));

        HttpProbeClient probeClient = new HttpProbeClient(httpClient);
        AuthCredential credential = new AuthCredential("user", "pass", "token", "test_cookie=1");

        CompletableFuture<HttpProbeClient.ProbeResult> future = probeClient.probeAsync(
                SourceUri.of("https://example.com/gone.zip"),
                credential
        );

        assertThatThrownBy(future::join)
                .hasCauseInstanceOf(RuntimeException.class)
                .hasMessageContaining("410 Gone");

        // Verify only ONE request was made - no credential retry, no GET Range fallback
        verify(httpClient, times(1)).sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void testBug29_contentRangeWithAsteriskKeepsLengthNegativeOneOn206() {
        HttpClient httpClient = mock(HttpClient.class);

        // HEAD request fails with 405 Method Not Allowed to trigger GET Range fallback
        HttpResponse<Void> headResponse = mock(HttpResponse.class);
        when(headResponse.statusCode()).thenReturn(405);

        // GET Range returns 206 Partial Content with Content-Range: bytes 0-8191/* and Content-Length: 8192
        HttpResponse<InputStream> rangeResponse = mock(HttpResponse.class);
        when(rangeResponse.statusCode()).thenReturn(206);
        when(rangeResponse.body()).thenReturn(new ByteArrayInputStream(new byte[8192]));
        when(rangeResponse.uri()).thenReturn(URI.create("https://example.com/file.bin"));

        HttpHeaders headers = HttpHeaders.of(
                Map.of(
                        "Content-Range", List.of("bytes 0-8191/*"),
                        "Content-Length", List.of("8192"),
                        "Content-Type", List.of("application/octet-stream")
                ),
                (k, v) -> true
        );
        when(rangeResponse.headers()).thenReturn(headers);

        when(httpClient.sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(headResponse))
                .thenReturn(CompletableFuture.completedFuture(rangeResponse));

        HttpProbeClient probeClient = new HttpProbeClient(httpClient);
        HttpProbeClient.ProbeResult result = probeClient.probeAsync(SourceUri.of("https://example.com/file.bin")).join();

        // Must NOT fall back to Content-Length 8192 on 206 Partial Content when total length is *
        assertThat(result.size().value()).isEqualTo(-1L);
        assertThat(result.acceptsRanges()).isTrue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void testBug29_fallsBackToContentLengthOnlyOn200() {
        HttpClient httpClient = mock(HttpClient.class);

        // HEAD request fails with 405 Method Not Allowed to trigger GET Range fallback
        HttpResponse<Void> headResponse = mock(HttpResponse.class);
        when(headResponse.statusCode()).thenReturn(405);

        // Server ignores Range header and returns 200 OK with full file Content-Length
        HttpResponse<InputStream> rangeResponse = mock(HttpResponse.class);
        when(rangeResponse.statusCode()).thenReturn(200);
        when(rangeResponse.body()).thenReturn(new ByteArrayInputStream(new byte[100]));
        when(rangeResponse.uri()).thenReturn(URI.create("https://example.com/file.bin"));

        HttpHeaders headers = HttpHeaders.of(
                Map.of(
                        "Content-Length", List.of("52428800"),
                        "Content-Type", List.of("application/octet-stream")
                ),
                (k, v) -> true
        );
        when(rangeResponse.headers()).thenReturn(headers);

        when(httpClient.sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(headResponse))
                .thenReturn(CompletableFuture.completedFuture(rangeResponse));

        HttpProbeClient probeClient = new HttpProbeClient(httpClient);
        HttpProbeClient.ProbeResult result = probeClient.probeAsync(SourceUri.of("https://example.com/file.bin")).join();

        // Must fall back to Content-Length on 200 OK
        assertThat(result.size().value()).isEqualTo(52428800L);
    }
}
