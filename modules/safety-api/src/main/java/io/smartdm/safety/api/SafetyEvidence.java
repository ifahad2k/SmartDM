package io.smartdm.safety.api;

import java.util.Objects;

/**
 * Record representing a piece of safety evidence returned by risk rules or scanners.
 */
public record SafetyEvidence(
        String category,
        String ruleId,
        String description,
        RiskLevel riskLevel,
        String rawDetails
) {
    public SafetyEvidence {
        Objects.requireNonNull(category, "category cannot be null");
        Objects.requireNonNull(ruleId, "ruleId cannot be null");
        Objects.requireNonNull(description, "description cannot be null");
        riskLevel = riskLevel == null ? RiskLevel.NONE : riskLevel;
        rawDetails = rawDetails == null ? "" : rawDetails;
    }
}
