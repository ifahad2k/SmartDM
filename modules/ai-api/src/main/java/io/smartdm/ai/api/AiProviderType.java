package io.smartdm.ai.api;

/**
 * Supported AI providers for SmartDM.
 */
public enum AiProviderType {
    DISABLED("Disabled (100% Offline Local Engine)"),
    GEMINI("Google Gemini (Free API Key)"),
    OPENAI_COMPATIBLE("Local AI / OpenAI Compatible (Ollama, Groq, DeepSeek, OpenAI)");

    private final String displayName;

    AiProviderType(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
