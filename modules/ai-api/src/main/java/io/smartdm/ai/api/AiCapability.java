package io.smartdm.ai.api;

/**
 * Declares capabilities supported by an AI provider.
 */
public record AiCapability(
    boolean supportsQueryParsing,
    boolean supportsFolderClassification,
    boolean supportsSafetyExplanation
) {
    public static AiCapability all() {
        return new AiCapability(true, true, true);
    }

    public static AiCapability none() {
        return new AiCapability(false, false, false);
    }
}
