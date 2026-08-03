package io.smartdm.ai.gemini;

import io.smartdm.ai.api.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CompletionStage;

import static org.junit.jupiter.api.Assertions.*;

class GeminiAiAdvisorTest {

    @Test
    void testDisabledConfigReturnsFailure() throws Exception {
        AiProviderConfig config = AiProviderConfig.disabled();
        GeminiAiAdvisor advisor = new GeminiAiAdvisor(config);

        assertFalse(advisor.capability().supportsQueryParsing());

        ApprovedPayload payload = new ApprovedPayload(AiTask.QUERY_PARSING, "test prompt", List.of(), "Test");
        CompletionStage<AiSuggestion> stage = advisor.request(AiTask.QUERY_PARSING, payload, null);
        AiSuggestion suggestion = stage.toCompletableFuture().get();

        assertFalse(suggestion.success());
        assertTrue(suggestion.errorMessage().contains("disabled"));
    }

    @Test
    void testSecretRedactionInErrorMessage() throws Exception {
        String secretKey = "AIzaSySecretTestKey123456789";
        AiProviderConfig config = AiProviderConfig.gemini(secretKey);
        GeminiAiAdvisor advisor = new GeminiAiAdvisor(config);

        ApprovedPayload payload = new ApprovedPayload(AiTask.QUERY_PARSING, "invalid host test", List.of(), "Test");
        CompletionStage<AiSuggestion> stage = advisor.request(AiTask.QUERY_PARSING, payload, null);
        AiSuggestion suggestion = stage.toCompletableFuture().get();

        assertFalse(suggestion.success());
        assertFalse(suggestion.errorMessage().contains(secretKey), "API secret key MUST be redacted from exception message");
    }
}
