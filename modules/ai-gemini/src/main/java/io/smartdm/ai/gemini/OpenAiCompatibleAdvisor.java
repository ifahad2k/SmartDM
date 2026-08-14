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
 * Implementation adapter for OpenAI-compatible REST API endpoints
 * (OpenAI, Groq, DeepSeek, or Local Ollama / vLLM).
 */
public class OpenAiCompatibleAdvisor implements OptionalAiAdvisor {

    private final AiProviderConfig config;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public OpenAiCompatibleAdvisor(AiProviderConfig config) {
        this(config, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }

    public OpenAiCompatibleAdvisor(AiProviderConfig config, HttpClient httpClient) {
        this.config = config;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public AiCapability capability() {
        if (!config.enabled()) {
            return AiCapability.none();
        }
        return AiCapability.all();
    }

    @Override
    public CompletionStage<AiSuggestion> request(AiTask task, ApprovedPayload payload, CancellationToken cancellation) {
        if (!capability().supportsQueryParsing() && !capability().supportsFolderClassification() && !capability().supportsSafetyExplanation()) {
            return CompletableFuture.completedFuture(AiSuggestion.failure("Local/OpenAI AI is disabled"));
        }

        if (cancellation != null && cancellation.isCancelled()) {
            return CompletableFuture.completedFuture(AiSuggestion.failure("Task cancelled"));
        }

        return CompletableFuture.supplyAsync(() -> {
            try {
                String baseUrl = config.baseUrl() != null && !config.baseUrl().isBlank() ? config.baseUrl() : "http://localhost:11434/v1";
                if (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);

                String endpoint = baseUrl + "/chat/completions";
                String model = (config.modelName() == null || config.modelName().isBlank()) ? "qwen2.5:3b" : config.modelName();

                String promptText = String.format("Task: %s. Prompt: %s. Candidates: %s",
                    task.displayName(), payload.sanitizedPrompt(), String.join(", ", payload.candidateIds()));

                String jsonBody = objectMapper.writeValueAsString(java.util.Map.of(
                    "model", model,
                    "messages", List.of(
                        java.util.Map.of("role", "system", "content", "You are an AI assistant for SmartDM download manager."),
                        java.util.Map.of("role", "user", "content", promptText)
                    )
                ));

                HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(12))
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody));

                if (config.apiKey() != null && !config.apiKey().isBlank()) {
                    builder.header("Authorization", "Bearer " + config.apiKey());
                }

                HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    return AiSuggestion.failure("Local/OpenAI API error (HTTP " + response.statusCode() + ")—using local result");
                }

                return parseOpenAiResponse(response.body());

            } catch (Exception ex) {
                String rawMsg = ex.getMessage() != null ? ex.getMessage() : "Connection exception";
                String safeMsg = (config.apiKey() != null && !config.apiKey().isBlank())
                    ? rawMsg.replace(config.apiKey(), "[REDACTED]")
                    : rawMsg;
                return AiSuggestion.failure("Local AI request failed: " + safeMsg + "—using local result");
            }
        });
    }

    /**
     * Auto-detects installed models from local Ollama instance (pinging http://localhost:11434/api/tags).
     */
    public static List<String> detectInstalledOllamaModels(String baseOllamaUrl) {
        try {
            String url = (baseOllamaUrl == null || baseOllamaUrl.isBlank()) ? "http://localhost:11434" : baseOllamaUrl;
            if (url.endsWith("/v1")) url = url.substring(0, url.length() - 3);
            if (url.endsWith("/")) url = url.substring(0, url.length() - 1);

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url + "/api/tags"))
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();

            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() == 200) {
                ObjectMapper mapper = new ObjectMapper();
                JsonNode root = mapper.readTree(resp.body());
                JsonNode modelsNode = root.path("models");
                List<String> list = new ArrayList<>();
                if (modelsNode.isArray()) {
                    for (JsonNode m : modelsNode) {
                        String name = m.path("name").asText("");
                        if (!name.isBlank()) list.add(name);
                    }
                }
                return list;
            }
        } catch (Exception ignored) {}
        return List.of();
    }

    private AiSuggestion parseOpenAiResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode choices = root.path("choices");
            if (choices.isArray() && choices.size() > 0) {
                String content = choices.get(0).path("message").path("content").asText("");
                return AiSuggestion.success(content, List.of(), responseBody);
            }
            return AiSuggestion.failure("Malformed OpenAI response JSON");
        } catch (Exception ex) {
            return AiSuggestion.failure("Failed to parse OpenAI response");
        }
    }
}
