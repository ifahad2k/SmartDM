package io.smartdm.download.http;

import io.smartdm.domain.AuthCredential;
import io.smartdm.domain.ByteCount;
import io.smartdm.domain.SourceUri;

import java.util.Base64;
import java.nio.charset.StandardCharsets;

import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public class HttpProbeClient {
    public static String parseNetscapeCookies(String netscapeCookies) {
        if (netscapeCookies == null || netscapeCookies.trim().isEmpty()) return "";
        
        // Handle case where extension sent literal '\n' and '\t' instead of actual newlines and tabs
        if (netscapeCookies.contains("\\n")) {
            netscapeCookies = netscapeCookies.replace("\\n", "\n").replace("\\t", "\t");
        }
        
        StringBuilder sb = new StringBuilder();
        String[] lines = netscapeCookies.split("\\r?\\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#HttpOnly_")) {
                line = line.substring("#HttpOnly_".length()).trim();
            } else if (line.startsWith("#")) {
                continue;
            }
            
            String[] parts = line.split("\\t", -1);
            if (parts.length >= 7) {
                String name = parts[5];
                String value = parts[6];
                if (name != null && !name.isBlank()) {
                    if (sb.length() > 0) sb.append("; ");
                    sb.append(name).append("=").append(value);
                }
            } else if (line.contains("=") && !line.contains("\t")) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(line);
            }
        }
        return sb.toString();
    }

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

    public record ProbeResult(ByteCount size, String mimeType, String etag, String lastModified, boolean acceptsRanges, String contentDispositionFilename) {
        public ProbeResult(ByteCount size, String mimeType, String etag, String lastModified, boolean acceptsRanges) {
            this(size, mimeType, etag, lastModified, acceptsRanges, null);
        }
    }

    public static String parseContentDispositionFilename(String header) {
        if (header == null || header.isBlank()) return null;
        try {
            String lower = header.toLowerCase();
            if (lower.contains("filename*=utf-8''")) {
                String sub = header.substring(lower.indexOf("filename*=utf-8''") + 17);
                int semi = sub.indexOf(';');
                if (semi > 0) sub = sub.substring(0, semi);
                sub = sub.trim();
                try { return java.net.URLDecoder.decode(sub, java.nio.charset.StandardCharsets.UTF_8); } catch (Exception ignored) {}
            }
            if (lower.contains("filename=")) {
                String sub = header.substring(lower.indexOf("filename=") + 9);
                int semi = sub.indexOf(';');
                if (semi > 0) sub = sub.substring(0, semi);
                sub = sub.replace("\"", "").trim();
                if (!sub.isEmpty()) {
                    try { sub = java.net.URLDecoder.decode(sub, java.nio.charset.StandardCharsets.UTF_8); } catch (Exception ignored) {}
                    return sub;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    public CompletableFuture<ProbeResult> probeAsync(SourceUri uri) {
        return probeAsync(uri, null);
    }

    public CompletableFuture<ProbeResult> probeAsync(SourceUri uri, AuthCredential credential) {
        String scheme = uri.value().getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            return CompletableFuture.failedFuture(
                new IllegalArgumentException("Only HTTP/HTTPS URLs are supported, got: " + scheme));
        }

        HttpRequest request = HttpRequestFactory.createBuilder(uri, credential)
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10))
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .thenApply(response -> {
                    if (response.statusCode() == 404) {
                        throw new RuntimeException("HTTP 404 Not Found: The file or release asset does not exist on the server.");
                    }
                    if (response.statusCode() == 401) {
                        String wwwAuth = response.headers().firstValue("WWW-Authenticate").orElse("Secure Area");
                        throw new UnauthorizedException(wwwAuth);
                    }
                    if (response.statusCode() >= 300) {
                        throw new RuntimeException("HTTP Error " + response.statusCode() + ": Failed to probe URL");
                    }
                    long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                    String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                    String etag = response.headers().firstValue("ETag").orElse(null);
                    String lastMod = response.headers().firstValue("Last-Modified").orElse(null);
                    boolean acceptsRanges = response.headers().firstValue("Accept-Ranges").map(val -> val.contains("bytes")).orElse(false);
                    String cdHeader = response.headers().firstValue("Content-Disposition").orElse(null);
                    String dispositionFilename = parseContentDispositionFilename(cdHeader);
                    if (dispositionFilename == null || dispositionFilename.isBlank()) {
                        try {
                            String finalPath = response.uri().getPath();
                            if (finalPath != null && finalPath.contains("/")) {
                                String seg = finalPath.substring(finalPath.lastIndexOf('/') + 1);
                                if (seg.contains(".") && !seg.endsWith(".php") && !seg.endsWith(".asp") && !seg.endsWith(".aspx") && !seg.endsWith(".bin")) {
                                    dispositionFilename = java.net.URLDecoder.decode(seg, java.nio.charset.StandardCharsets.UTF_8);
                                }
                            }
                        } catch (Exception ignored) {}
                    }
                    
                    return new ProbeResult(ByteCount.of(contentLength), mimeType, etag, lastMod, acceptsRanges, dispositionFilename);
                })
                .handle((result, ex) -> {
                    if (ex == null) {
                        return CompletableFuture.completedFuture(result);
                    }
                    // If probing with cookies/credentials failed (e.g. 401/403/405), retry WITHOUT credentials first!
                    // Fixes GitHub Releases, S3 presigned URLs, and CDN links that reject browser cookies.
                    if (credential != null && (credential.cookies() != null || credential.username() != null)) {
                        return probeAsync(uri, null);
                    }
                    if (ex.getCause() instanceof UnauthorizedException) {
                        return CompletableFuture.<ProbeResult>failedFuture(ex.getCause());
                    }
                    return probeViaGetRange(uri, credential);
                })
                .thenCompose(future -> future);
    }

    private CompletableFuture<ProbeResult> probeViaGetRange(SourceUri uri, AuthCredential credential) {
        HttpRequest request = HttpRequestFactory.createBuilder(uri, credential)
                .header("Range", "bytes=0-8191")
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                .thenApply(response -> {
                    try (InputStream is = response.body()) {
                        // Dummy read to consume a single byte and prevent "resource never referenced" warning
                        int unused = is.read();
                        
                        if (response.statusCode() == 404) {
                            throw new RuntimeException("HTTP 404 Not Found: The file or release asset does not exist on the server.");
                        }

                        if (response.statusCode() == 401) {
                            String wwwAuth = response.headers().firstValue("WWW-Authenticate").orElse("Secure Area");
                            throw new UnauthorizedException(wwwAuth);
                        }
                        
                        if (response.statusCode() != 200 && response.statusCode() != 206) {
                            StringBuilder headersDump = new StringBuilder();
                            response.headers().map().forEach((k, v) -> headersDump.append(k).append(": ").append(v).append("\n"));
                            throw new RuntimeException("GET Range failed: " + response.statusCode() + "\nHeaders:\n" + headersDump.toString());
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
                        
                        String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                        String etag = response.headers().firstValue("ETag").orElse(null);
                        String lastMod = response.headers().firstValue("Last-Modified").orElse(null);
                        boolean acceptsRanges = response.statusCode() == 206 || contentRange != null;
                        String cdHeader = response.headers().firstValue("Content-Disposition").orElse(null);
                        String dispositionFilename = parseContentDispositionFilename(cdHeader);
                        if (dispositionFilename == null || dispositionFilename.isBlank()) {
                            try {
                                String finalPath = response.uri().getPath();
                                if (finalPath != null && finalPath.contains("/")) {
                                    String seg = finalPath.substring(finalPath.lastIndexOf('/') + 1);
                                    if (seg.contains(".") && !seg.endsWith(".php") && !seg.endsWith(".asp") && !seg.endsWith(".aspx") && !seg.endsWith(".bin")) {
                                        dispositionFilename = java.net.URLDecoder.decode(seg, java.nio.charset.StandardCharsets.UTF_8);
                                    }
                                }
                            } catch (Exception ignored) {}
                        }
                        
                        return new ProbeResult(ByteCount.of(contentLength), mimeType, etag, lastMod, acceptsRanges, dispositionFilename);
                    } catch (UnauthorizedException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new RuntimeException("Failed to process GET Range response", e);
                    }
                })
                .handle((result, ex) -> {
                    if (ex == null) {
                        return CompletableFuture.completedFuture(result);
                    }
                    if (ex.getCause() instanceof UnauthorizedException) {
                        return CompletableFuture.<ProbeResult>failedFuture(ex.getCause());
                    }
                    if (credential != null && credential.cookies() != null && !credential.cookies().isEmpty()) {
                        return probeViaGetRange(uri, null);
                    }
                    return CompletableFuture.<ProbeResult>failedFuture(ex);
                })
                .thenCompose(future -> future);
    }
}
