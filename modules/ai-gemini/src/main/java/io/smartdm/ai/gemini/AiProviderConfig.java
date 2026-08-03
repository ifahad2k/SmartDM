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

    public static java.nio.file.Path getConfigFile() {
        return java.nio.file.Paths.get(System.getProperty("user.home"), ".smartdm", "ai_config.json");
    }

    public void saveToDisk() {
        try {
            java.nio.file.Path p = getConfigFile();
            java.nio.file.Files.createDirectories(p.getParent());
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.writeValue(p.toFile(), this);
        } catch (Exception ignored) {}
    }

    public static AiProviderConfig loadFromDisk() {
        try {
            java.nio.file.Path p = getConfigFile();
            if (java.nio.file.Files.exists(p)) {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                return mapper.readValue(p.toFile(), AiProviderConfig.class);
            }
        } catch (Exception ignored) {}
        return disabled();
    }
}
