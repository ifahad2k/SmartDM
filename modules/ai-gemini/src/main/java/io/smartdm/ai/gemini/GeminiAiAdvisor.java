package io.smartdm.ai.gemini;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.ai.api.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;

/**
 * Implementation adapter for Google Gemini REST API.
 */
public class GeminiAiAdvisor implements OptionalAiAdvisor {

    private final AiProviderConfig config;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public GeminiAiAdvisor(AiProviderConfig config) {
        this(config, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    public GeminiAiAdvisor(AiProviderConfig config, HttpClient httpClient) {
        this.config = config;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public AiCapability capability() {
        if (!config.enabled() || config.apiKey() == null || config.apiKey().isBlank()) {
            return AiCapability.none();
        }
        return AiCapability.all();
    }

    @Override
    public CompletionStage<AiSuggestion> request(AiTask task, ApprovedPayload payload, CancellationToken cancellation) {
        if (!capability().supportsQueryParsing() && !capability().supportsFolderClassification() && !capability().supportsSafetyExplanation()) {
            return CompletableFuture.completedFuture(AiSuggestion.failure("Gemini AI is disabled or API key is missing"));
        }

        if (cancellation != null && cancellation.isCancelled()) {
            return CompletableFuture.completedFuture(AiSuggestion.failure("Task cancelled"));
        }

        return CompletableFuture.supplyAsync(() -> {
            try {
                String model = (config.modelName() == null || config.modelName().isBlank()) ? "gemini-1.5-flash" : config.modelName();
                String endpoint = String.format("%s/v1beta/models/%s:generateContent?key=%s",
                    config.baseUrl(), model, config.apiKey());

                String promptText = buildPromptText(task, payload);

                String jsonRequestBody = objectMapper.writeValueAsString(java.util.Map.of(
                    "contents", List.of(
                        java.util.Map.of("parts", List.of(java.util.Map.of("text", promptText)))
                    )
                ));

                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(jsonRequestBody))
                    .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 429) {
                    return AiSuggestion.failure("Gemini quota exhausted (HTTP 429)—using local result");
                }

                if (response.statusCode() != 200) {
                    return AiSuggestion.failure("Gemini API error (HTTP " + response.statusCode() + ")—using local result");
                }

                return parseGeminiResponse(response.body());

            } catch (Exception ex) {
                // Secret Redaction: Ensure API key is never printed in log/exception message
                String safeMsg = ex.getMessage() != null ? ex.getMessage().replaceAll(config.apiKey(), "[REDACTED]") : "Network exception";
                return AiSuggestion.failure("Gemini request failed: " + safeMsg + "—using local result");
            }
        });
    }

    private String buildPromptText(AiTask task, ApprovedPayload payload) {
        return String.format(
            "Task: %s\nPrompt: %s\nCandidates: %s\nReturn a concise JSON object with fields 'suggestionText' and 'recommendedCategories'.",
            task.displayName(), payload.sanitizedPrompt(), String.join(", ", payload.candidateIds())
        );
    }

    private AiSuggestion parseGeminiResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode candidatesNode = root.path("candidates");
            if (candidatesNode.isArray() && candidatesNode.size() > 0) {
                JsonNode partsNode = candidatesNode.get(0).path("content").path("parts");
                if (partsNode.isArray() && partsNode.size() > 0) {
                    String text = partsNode.get(0).path("text").asText("");
                    List<String> recs = new ArrayList<>();
                    return AiSuggestion.success(text, recs, responseBody);
                }
            }
            return AiSuggestion.failure("Malformed Gemini response JSON");
        } catch (Exception ex) {
            return AiSuggestion.failure("Failed to parse Gemini response");
        }
    }
}
