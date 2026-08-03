package io.smartdm.ai.gemini;

import io.smartdm.ai.api.AiProviderType;

/**
 * Configuration settings for AI provider integration.
 */
public record AiProviderConfig(
    boolean enabled,
    AiProviderType providerType,
    String apiKey,
    String baseUrl,
    String modelName,
    int dailyRequestLimit
) {
    public static AiProviderConfig disabled() {
        return new AiProviderConfig(false, AiProviderType.DISABLED, "", "", "", 50);
    }

    public static AiProviderConfig gemini(String apiKey) {
        return new AiProviderConfig(true, AiProviderType.GEMINI, apiKey, "https://generativelanguage.googleapis.com", "gemini-1.5-flash", 50);
    }

    public static AiProviderConfig localOllama(String modelName) {
        String model = (modelName == null || modelName.isBlank()) ? "qwen2.5:3b" : modelName;
        return new AiProviderConfig(true, AiProviderType.OPENAI_COMPATIBLE, "", "http://localhost:11434/v1", model, 1000);
    }

    public static AiProviderConfig openAiCompatible(String apiKey, String baseUrl, String modelName) {
        return new AiProviderConfig(true, AiProviderType.OPENAI_COMPATIBLE, apiKey, baseUrl, modelName, 100);
    }
}
