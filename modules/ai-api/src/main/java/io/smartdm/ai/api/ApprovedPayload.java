package io.smartdm.ai.api;

import java.util.List;
import java.util.Objects;

/**
 * An immutable, sanitized payload approved by the user consent firewall.
 * Must NOT contain file bytes, secrets, raw hashes, cookies, or unapproved absolute paths.
 */
public record ApprovedPayload(
    AiTask task,
    String sanitizedPrompt,
    List<String> candidateIds,
    String purposeNotice
) {
    public ApprovedPayload {
        Objects.requireNonNull(task, "task must not be null");
        Objects.requireNonNull(sanitizedPrompt, "sanitizedPrompt must not be null");
        candidateIds = candidateIds == null ? List.of() : List.copyOf(candidateIds);
        purposeNotice = purposeNotice == null ? "" : purposeNotice;
    }
}
