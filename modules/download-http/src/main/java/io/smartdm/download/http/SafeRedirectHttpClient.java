package io.smartdm.download.http;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

public class SafeRedirectHttpClient {
    private final HttpClient delegate;
    private static final int MAX_REDIRECTS = 5;

    public SafeRedirectHttpClient(HttpClient delegate) {
        this.delegate = delegate;
    }

    public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler) throws java.io.IOException, InterruptedException {
        try {
            return sendWithRedirects(request, responseBodyHandler, 0).join();
        } catch (java.util.concurrent.CompletionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof java.io.IOException) throw (java.io.IOException) cause;
            if (cause instanceof InterruptedException) throw (InterruptedException) cause;
            if (cause instanceof RuntimeException) throw (RuntimeException) cause;
            throw new RuntimeException(cause);
        }
    }

    public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler) {
        return sendWithRedirects(request, responseBodyHandler, 0);
    }

    private <T> CompletableFuture<HttpResponse<T>> sendWithRedirects(HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler, int redirectCount) {
        if (redirectCount > MAX_REDIRECTS) {
            return CompletableFuture.failedFuture(new RuntimeException("Too many redirects"));
        }
        return delegate.sendAsync(request, responseBodyHandler).thenCompose(response -> {
            int statusCode = response.statusCode();
            if (statusCode >= 300 && statusCode <= 399) {
                String location = response.headers().firstValue("Location").orElse(null);
                if (location != null) {
                    URI newUri = request.uri().resolve(location);
                    HttpRequest.Builder newBuilder = HttpRequest.newBuilder(newUri)
                        .method(request.method(), request.bodyPublisher().orElse(HttpRequest.BodyPublishers.noBody()))
                        .timeout(request.timeout().orElse(java.time.Duration.ofSeconds(10)));
                    
                    boolean isCrossOrigin = !request.uri().getHost().equalsIgnoreCase(newUri.getHost()) || request.uri().getPort() != newUri.getPort() || !request.uri().getScheme().equalsIgnoreCase(newUri.getScheme());
                    
                    for (Map.Entry<String, List<String>> entry : request.headers().map().entrySet()) {
                        String headerName = entry.getKey();
                        if (isCrossOrigin && !HttpHeadersPolicy.ALLOWED_USER_HEADERS.contains(headerName)) {
                            continue;
                        }
                        for (String val : entry.getValue()) {
                            newBuilder.header(headerName, val);
                        }
                    }
                    return sendWithRedirects(newBuilder.build(), responseBodyHandler, redirectCount + 1);
                }
            }
            return CompletableFuture.completedFuture(response);
        });
    }
}
