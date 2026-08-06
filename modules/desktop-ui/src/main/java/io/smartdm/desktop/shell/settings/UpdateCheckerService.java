package io.smartdm.desktop.shell.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public class UpdateCheckerService {

    private static final String REPO_API = "https://api.github.com/repos/ifahad2k/SmartDM/releases/latest";
    private static final String REPO_LATEST_HTML = "https://github.com/ifahad2k/SmartDM/releases/latest";
    public static final String CURRENT_VERSION = "v1.0.1";
    
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.ALWAYS)
        .connectTimeout(Duration.ofSeconds(10))
        .build();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record UpdateResult(boolean updateAvailable, String latestVersion, String downloadUrl, String notes, String error) {}

    public static CompletableFuture<UpdateResult> checkForUpdatesAsync() {
        return CompletableFuture.supplyAsync(() -> {
            // Stage 1: Try GitHub API
            try {
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(REPO_API))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .header("Accept", "application/vnd.github+json")
                    .GET()
                    .build();

                HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 200) {
                    JsonNode root = MAPPER.readTree(response.body());
                    String tagName = root.path("tag_name").asText("").trim();
                    String body = root.path("body").asText("");
                    String dlUrl = null;

                    JsonNode assets = root.path("assets");
                    if (assets.isArray()) {
                        for (JsonNode asset : assets) {
                            String name = asset.path("name").asText("");
                            if (name.toLowerCase().endsWith(".exe")) {
                                dlUrl = asset.path("browser_download_url").asText(null);
                                break;
                            }
                        }
                    }
                    if (dlUrl == null && !tagName.isBlank()) {
                        dlUrl = "https://github.com/ifahad2k/SmartDM/releases/download/" + tagName + "/SmartDM-Setup-" + tagName + ".exe";
                    }

                    boolean isNewer = !tagName.isBlank() && !tagName.equalsIgnoreCase(CURRENT_VERSION);
                    return new UpdateResult(isNewer, tagName, dlUrl, body, null);
                }
            } catch (Exception e) {
                System.err.println("GitHub API update check failed, trying HTML redirect fallback: " + e.getMessage());
            }

            // Stage 2: HTML Redirect Fallback (Bypasses API 403 rate limits 100%)
            try {
                HttpRequest htmlReq = HttpRequest.newBuilder()
                    .uri(URI.create(REPO_LATEST_HTML))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .GET()
                    .build();

                HttpResponse<Void> htmlResp = HTTP_CLIENT.send(htmlReq, HttpResponse.BodyHandlers.discarding());
                URI finalUri = htmlResp.uri();
                String uriStr = finalUri.toString();
                
                if (uriStr.contains("/tag/")) {
                    String tag = uriStr.substring(uriStr.lastIndexOf("/tag/") + 5).trim();
                    if (!tag.isBlank()) {
                        String dlUrl = "https://github.com/ifahad2k/SmartDM/releases/download/" + tag + "/SmartDM-Setup-" + tag + ".exe";
                        boolean isNewer = !tag.equalsIgnoreCase(CURRENT_VERSION);
                        return new UpdateResult(isNewer, tag, dlUrl, "Release " + tag + " available on GitHub.", null);
                    }
                }
                return new UpdateResult(false, CURRENT_VERSION, null, null, "No release releases published yet.");
            } catch (Exception ex) {
                return new UpdateResult(false, CURRENT_VERSION, null, null, "Network error checking updates: " + ex.getMessage());
            }
        });
    }

    public static CompletableFuture<Path> downloadAndInstallUpdateAsync(String downloadUrl, Consumer<Double> progressCallback) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                String tempDir = System.getProperty("java.io.tmpdir");
                Path targetPath = Paths.get(tempDir, "SmartDM-Setup-update.exe");
                
                HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(downloadUrl))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    .GET()
                    .build();

                HttpResponse<InputStream> response = HTTP_CLIENT.send(req, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() != 200) {
                    throw new IllegalStateException("HTTP " + response.statusCode() + " downloading update file");
                }

                long totalBytes = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                
                try (InputStream is = response.body();
                     OutputStream os = Files.newOutputStream(targetPath, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                    
                    byte[] buffer = new byte[16384];
                    long downloaded = 0;
                    int r;
                    while ((r = is.read(buffer)) != -1) {
                        os.write(buffer, 0, r);
                        downloaded += r;
                        if (totalBytes > 0 && progressCallback != null) {
                            double prog = (double) downloaded / totalBytes;
                            progressCallback.accept(prog);
                        }
                    }
                }

                if (progressCallback != null) progressCallback.accept(1.0);

                // Launch downloaded setup installer
                ProcessBuilder pb = new ProcessBuilder(targetPath.toAbsolutePath().toString());
                pb.start();

                // Terminate current app cleanly so installer can overwrite files
                javafx.application.Platform.runLater(() -> {
                    javafx.application.Platform.exit();
                    System.exit(0);
                });

                return targetPath;
            } catch (Exception e) {
                throw new RuntimeException("Failed to download update: " + e.getMessage(), e);
            }
        });
    }
}
