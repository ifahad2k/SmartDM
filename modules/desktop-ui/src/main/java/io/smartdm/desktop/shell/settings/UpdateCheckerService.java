package io.smartdm.desktop.shell.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public class UpdateCheckerService {

    private static final String REPO_API = "https://api.github.com/repos/ifahad2k/SmartDM/releases/latest";
    private static final String CURRENT_VERSION = "v1.0.1";
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record UpdateResult(boolean updateAvailable, String latestVersion, String downloadUrl, String notes, String error) {}

    public static CompletableFuture<UpdateResult> checkForUpdatesAsync() {
        return CompletableFuture.supplyAsync(() -> {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(REPO_API))
                    .header("User-Agent", "SmartDM-DesktopApp")
                    .header("Accept", "application/vnd.github+json")
                    .GET()
                    .build();

                HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 200) {
                    JsonNode root = MAPPER.readTree(response.body());
                    String tagName = root.path("tag_name").asText("");
                    String htmlUrl = root.path("html_url").asText("");
                    String body = root.path("body").asText("");

                    boolean isNewer = !tagName.isBlank() && !tagName.equalsIgnoreCase(CURRENT_VERSION);
                    return new UpdateResult(isNewer, tagName, htmlUrl, body, null);
                } else if (response.statusCode() == 404) {
                    return new UpdateResult(false, CURRENT_VERSION, null, null, "No releases found on GitHub repository yet.");
                } else {
                    return new UpdateResult(false, CURRENT_VERSION, null, null, "HTTP " + response.statusCode());
                }
            } catch (Exception e) {
                return new UpdateResult(false, CURRENT_VERSION, null, null, "Network error: " + e.getMessage());
            }
        });
    }
}
