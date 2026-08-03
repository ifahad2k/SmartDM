package io.smartdm.ai.api;

import java.util.concurrent.CompletionStage;

/**
 * Provider interface port for optional AI assistance in SmartDM.
 * Enforces strict boundary: provider implementations receive ONLY ApprovedPayload,
 * never database, repository, filesystem, or catalog interfaces.
 */
public interface OptionalAiAdvisor {

    AiCapability capability();

    CompletionStage<AiSuggestion> request(
        AiTask task,
        ApprovedPayload payload,
        CancellationToken cancellation);
}
