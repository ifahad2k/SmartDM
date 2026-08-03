package io.smartdm.ai.api;

import java.util.List;
import java.util.Objects;

/**
 * Result returned by an AI provider for an approved task.
 */
public record AiSuggestion(
    boolean success,
    String suggestionText,
    List<String> recommendedCategoryIds,
    String rawResponse,
    String errorMessage
) {
    public AiSuggestion {
        suggestionText = suggestionText == null ? "" : suggestionText;
        recommendedCategoryIds = recommendedCategoryIds == null ? List.of() : List.copyOf(recommendedCategoryIds);
        rawResponse = rawResponse == null ? "" : rawResponse;
        errorMessage = errorMessage == null ? "" : errorMessage;
    }

    public static AiSuggestion success(String text, List<String> categories, String raw) {
        return new AiSuggestion(true, text, categories, raw, "");
    }

    public static AiSuggestion failure(String message) {
        return new AiSuggestion(false, "", List.of(), "", message);
    }
}
