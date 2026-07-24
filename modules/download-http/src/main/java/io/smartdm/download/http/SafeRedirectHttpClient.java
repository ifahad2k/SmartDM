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
            return sendWithRedirects(request, responseBodyHandler, 0, new java.util.HashSet<>()).join();
        } catch (java.util.concurrent.CompletionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof java.io.IOException) throw (java.io.IOException) cause;
            if (cause instanceof InterruptedException) throw (InterruptedException) cause;
            if (cause instanceof RuntimeException) throw (RuntimeException) cause;
            throw new RuntimeException(cause);
        }
    }



    private <T> CompletableFuture<HttpResponse<T>> sendWithRedirects(HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler, int redirectCount, Set<URI> visitedUris) {
        if (redirectCount >= MAX_REDIRECTS) {
            return CompletableFuture.failedFuture(new RuntimeException("Too many redirects"));
        }
        
        String scheme = request.uri().getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            return CompletableFuture.failedFuture(new IllegalArgumentException("Unsupported redirect scheme: " + scheme));
        }

        if (visitedUris.contains(request.uri())) {
            return CompletableFuture.failedFuture(new RuntimeException("Redirect loop detected for URI: " + request.uri()));
        }
        visitedUris.add(request.uri());

        return delegate.sendAsync(request, responseBodyHandler).thenCompose(response -> {
            int statusCode = response.statusCode();
            if (statusCode >= 300 && statusCode <= 399) {
                String location = response.headers().firstValue("Location").orElse(null);
                if (location != null) {
                    URI newUri = request.uri().resolve(location);
                    String newScheme = newUri.getScheme();
                    if (newScheme == null || (!newScheme.equalsIgnoreCase("http") && !newScheme.equalsIgnoreCase("https"))) {
                        return CompletableFuture.failedFuture(new IllegalArgumentException("Invalid redirect target scheme: " + newScheme));
                    }

                    String method = request.method();
                    HttpRequest.BodyPublisher body = request.bodyPublisher().orElse(HttpRequest.BodyPublishers.noBody());
                    if (statusCode == 303 || ((statusCode == 301 || statusCode == 302) && "POST".equalsIgnoreCase(method))) {
                        method = "GET";
                        body = HttpRequest.BodyPublishers.noBody();
                    }

                    HttpRequest.Builder newBuilder = HttpRequest.newBuilder(newUri)
                        .method(method, body)
                        .timeout(request.timeout().orElse(java.time.Duration.ofSeconds(10)));
                    
                    int origPort = request.uri().getPort() != -1 ? request.uri().getPort() : ("https".equalsIgnoreCase(request.uri().getScheme()) ? 443 : 80);
                    int newPort = newUri.getPort() != -1 ? newUri.getPort() : ("https".equalsIgnoreCase(newUri.getScheme()) ? 443 : 80);
                    String origHost = request.uri().getHost();
                    String newHost = newUri.getHost();
                    boolean isCrossOrigin = origHost == null || newHost == null || !origHost.equalsIgnoreCase(newHost) || origPort != newPort || !request.uri().getScheme().equalsIgnoreCase(newUri.getScheme());
                    
                    for (Map.Entry<String, List<String>> entry : request.headers().map().entrySet()) {
                        String headerName = entry.getKey();
                        if (isCrossOrigin) {
                            boolean allowed = false;
                            for (String allowedHeader : HttpHeadersPolicy.ALLOWED_USER_HEADERS) {
                                if (allowedHeader.equalsIgnoreCase(headerName)) {
                                    allowed = true;
                                    break;
                                }
                            }
                            if (!allowed) continue;
                        }
                        for (String val : entry.getValue()) {
                            newBuilder.header(headerName, val);
                        }
                    }
                    return sendWithRedirects(newBuilder.build(), responseBodyHandler, redirectCount + 1, visitedUris);
                }
            }
            return CompletableFuture.completedFuture(response);
        });
    }

    public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler) {
        return sendWithRedirects(request, responseBodyHandler, 0, new java.util.HashSet<>());
    }
}
