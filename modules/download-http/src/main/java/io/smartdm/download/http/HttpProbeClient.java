package io.smartdm.download.http;

import io.smartdm.domain.AuthCredential;
import io.smartdm.domain.ByteCount;
import io.smartdm.domain.SourceUri;

import java.util.Base64;

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
        String userAgent = (credential != null && credential.userAgent() != null && !credential.userAgent().isEmpty()) 
                           ? credential.userAgent() 
                           : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(uri.value())
                .header("User-Agent", userAgent)
                .header("Accept", "*/*")
                .header("Accept-Language", "en-US,en;q=0.9")
                .header("Sec-Fetch-Dest", "video")
                .header("Sec-Fetch-Mode", "no-cors")
                .header("Sec-Fetch-Site", "cross-site")
                .header("Accept-Encoding", "identity")
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10));

        String urlStr = uri.value().toString().toLowerCase();
        if (urlStr.contains("tiktok.com") || urlStr.contains("tiktokcdn.com")) {
            builder.header("Referer", "https://www.tiktok.com/");
        } else if (urlStr.contains("facebook.com") || urlStr.contains("fbcdn.net")) {
            builder.header("Referer", "https://www.facebook.com/");
        } else if (urlStr.contains("instagram.com") || urlStr.contains("cdninstagram.com")) {
            builder.header("Referer", "https://www.instagram.com/");
        }
                
        if (credential != null) {
            if (credential.username() != null && !credential.username().isEmpty()) {
                String basicAuth = Base64.getEncoder().encodeToString((credential.username() + ":" + credential.password()).getBytes());
                builder.header("Authorization", "Basic " + basicAuth);
            }
            if (credential.cookies() != null && !credential.cookies().isEmpty()) {
                String cookieHeader = parseNetscapeCookies(credential.cookies());
                if (!cookieHeader.isEmpty()) {
                    builder.header("Cookie", cookieHeader);
                }
            }
        }

        HttpRequest request = builder.build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .thenApply(response -> {
                    if (response.statusCode() == 401) {
                        String wwwAuth = response.headers().firstValue("WWW-Authenticate").orElse("Secure Area");
                        throw new UnauthorizedException(wwwAuth);
                    }
                    if (response.statusCode() >= 300) {
                        throw new RuntimeException("HEAD status: " + response.statusCode());
                    }
                    long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                    String mimeType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
                    String etag = response.headers().firstValue("ETag").orElse(null);
                    String lastMod = response.headers().firstValue("Last-Modified").orElse(null);
                    boolean acceptsRanges = response.headers().firstValue("Accept-Ranges").map(val -> val.contains("bytes")).orElse(false);
                    String cdHeader = response.headers().firstValue("Content-Disposition").orElse(null);
                    String dispositionFilename = parseContentDispositionFilename(cdHeader);
                    
                    return new ProbeResult(ByteCount.of(contentLength), mimeType, etag, lastMod, acceptsRanges, dispositionFilename);
                })
                .handle((result, ex) -> {
                    if (ex == null) {
                        return CompletableFuture.completedFuture(result);
                    }
                    // HEAD failed (possibly 405 Method Not Allowed or 401/403 from CDN)
                    if (ex.getCause() instanceof UnauthorizedException) {
                        return CompletableFuture.<ProbeResult>failedFuture(ex.getCause());
                    }
                    // If probing with cookies failed, retry WITHOUT cookies (fixes GitHub releases & S3/Azure presigned URLs)
                    if (credential != null && credential.cookies() != null && !credential.cookies().isEmpty()) {
                        return probeAsync(uri, null);
                    }
                    return probeViaGetRange(uri, credential);
                })
                .thenCompose(future -> future);
    }

    private CompletableFuture<ProbeResult> probeViaGetRange(SourceUri uri, AuthCredential credential) {
        String userAgent = (credential != null && credential.userAgent() != null && !credential.userAgent().isEmpty()) 
                           ? credential.userAgent() 
                           : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(uri.value())
                .header("User-Agent", userAgent)
                .header("Accept", "*/*")
                .header("Accept-Language", "en-US,en;q=0.9")
                .header("Sec-Fetch-Dest", "video")
                .header("Sec-Fetch-Mode", "no-cors")
                .header("Sec-Fetch-Site", "cross-site")
                .header("Accept-Encoding", "identity")
                .header("Range", "bytes=0-8191")
                .GET()
                .timeout(Duration.ofSeconds(10));

        String urlStr = uri.value().toString().toLowerCase();
        if (urlStr.contains("tiktok.com") || urlStr.contains("tiktokcdn.com")) {
            builder.header("Referer", "https://www.tiktok.com/");
        } else if (urlStr.contains("facebook.com") || urlStr.contains("fbcdn.net")) {
            builder.header("Referer", "https://www.facebook.com/");
        } else if (urlStr.contains("instagram.com") || urlStr.contains("cdninstagram.com")) {
            builder.header("Referer", "https://www.instagram.com/");
        }
                
        if (credential != null) {
            if (credential.username() != null && !credential.username().isEmpty()) {
                String basicAuth = Base64.getEncoder().encodeToString((credential.username() + ":" + credential.password()).getBytes());
                builder.header("Authorization", "Basic " + basicAuth);
            }
            if (credential.cookies() != null && !credential.cookies().isEmpty()) {
                String cookieHeader = parseNetscapeCookies(credential.cookies());
                if (!cookieHeader.isEmpty()) {
                    builder.header("Cookie", cookieHeader);
                }
            }
        }

        HttpRequest request = builder.build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                .thenApply(response -> {
                    try (InputStream is = response.body()) {
                        // Dummy read to consume a single byte and prevent "resource never referenced" warning
                        int unused = is.read();
                        
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
