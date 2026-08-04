package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import io.smartdm.safety.api.SafetyStatus;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Engine that combines evidence from PreDownload, PostDownload, MagicByte, Archive, and Antivirus sources
 * to produce the final SafetyStatus and overall RiskLevel.
 *
 * NOTE: The engine enforces the security invariant that MALWARE_DETECTED status can NEVER be downgraded.
 */
public class RiskDecisionEngine {

    /**
     * Result structure produced by evaluating safety evidence.
     */
    public record SafetyDecision(
            SafetyStatus status,
            RiskLevel overallRiskLevel,
            List<SafetyEvidence> evidence
    ) {
        public SafetyDecision {
            Objects.requireNonNull(status, "status cannot be null");
            overallRiskLevel = overallRiskLevel == null ? RiskLevel.NONE : overallRiskLevel;
            evidence = evidence == null ? List.of() : List.copyOf(evidence);
        }
    }

    /**
     * Evaluates a list of evidence to produce a SafetyDecision with SafetyStatus.UNSCANNED as base.
     */
    public SafetyDecision evaluate(List<SafetyEvidence> evidence) {
        return evaluate(SafetyStatus.UNSCANNED, evidence);
    }

    /**
     * Evaluates prior SafetyStatus alongside new evidence to produce a final SafetyDecision.
     * Enforces non-downgrade of MALWARE_DETECTED.
     */
    public SafetyDecision evaluate(SafetyStatus priorStatus, List<SafetyEvidence> evidence) {
        List<SafetyEvidence> allEvidence = evidence == null ? List.of() : List.copyOf(evidence);
        RiskLevel highestRisk = calculateHighestRiskLevel(allEvidence);

        SafetyStatus computedStatus = computeStatusFromEvidence(priorStatus, allEvidence, highestRisk);

        // Enforce invariant: MALWARE_DETECTED cannot be downgraded
        if (priorStatus == SafetyStatus.MALWARE_DETECTED) {
            computedStatus = SafetyStatus.MALWARE_DETECTED;
            highestRisk = RiskLevel.CRITICAL;
        }

        return new SafetyDecision(computedStatus, highestRisk, allEvidence);
    }

    /**
     * Combines two SafetyStatus values, returning the more severe status and ensuring MALWARE_DETECTED is preserved.
     */
    public SafetyStatus combineStatuses(SafetyStatus status1, SafetyStatus status2) {
        if (status1 == SafetyStatus.MALWARE_DETECTED || status2 == SafetyStatus.MALWARE_DETECTED) {
            return SafetyStatus.MALWARE_DETECTED;
        }
        if (status1 == SafetyStatus.SUSPICIOUS || status2 == SafetyStatus.SUSPICIOUS) {
            return SafetyStatus.SUSPICIOUS;
        }
        if (status1 == SafetyStatus.SCAN_FAILED || status2 == SafetyStatus.SCAN_FAILED) {
            return SafetyStatus.SCAN_FAILED;
        }
        if (status1 == SafetyStatus.NO_THREATS_DETECTED || status2 == SafetyStatus.NO_THREATS_DETECTED) {
            return SafetyStatus.NO_THREATS_DETECTED;
        }
        return SafetyStatus.UNSCANNED;
    }

    /**
     * Combines multiple lists of SafetyEvidence from different scanners/rules.
     */
    @SafeVarargs
    public final List<SafetyEvidence> combineEvidence(List<SafetyEvidence>... evidenceLists) {
        List<SafetyEvidence> combined = new ArrayList<>();
        if (evidenceLists != null) {
            for (List<SafetyEvidence> list : evidenceLists) {
                if (list != null) {
                    combined.addAll(list);
                }
            }
        }
        return List.copyOf(combined);
    }

    private SafetyStatus computeStatusFromEvidence(SafetyStatus priorStatus, List<SafetyEvidence> evidence, RiskLevel highestRisk) {
        boolean hasMalware = highestRisk == RiskLevel.CRITICAL ||
                evidence.stream().anyMatch(e -> "ANTIVIRUS".equalsIgnoreCase(e.category()) && e.riskLevel() == RiskLevel.CRITICAL) ||
                evidence.stream().anyMatch(e -> e.ruleId().toLowerCase().contains("malware") || e.ruleId().toLowerCase().contains("virus"));

        if (hasMalware) {
            return SafetyStatus.MALWARE_DETECTED;
        }

        boolean hasSuspicious = highestRisk == RiskLevel.HIGH || highestRisk == RiskLevel.MEDIUM;
        if (hasSuspicious) {
            return SafetyStatus.SUSPICIOUS;
        }

        boolean hasScanFailed = evidence.stream().anyMatch(e -> "SCAN_FAILED".equalsIgnoreCase(e.category()) ||
                e.ruleId().toLowerCase().contains("read_error") ||
                e.ruleId().toLowerCase().contains("scan_failed"));
        if (hasScanFailed) {
            return SafetyStatus.SCAN_FAILED;
        }

        if (priorStatus == SafetyStatus.SCAN_FAILED) {
            return SafetyStatus.SCAN_FAILED;
        }

        if (!evidence.isEmpty()) {
            return SafetyStatus.NO_THREATS_DETECTED;
        }

        return priorStatus != null ? priorStatus : SafetyStatus.UNSCANNED;
    }

    private RiskLevel calculateHighestRiskLevel(List<SafetyEvidence> evidence) {
        RiskLevel highest = RiskLevel.NONE;
        for (SafetyEvidence item : evidence) {
            if (item.riskLevel() != null && item.riskLevel().isHigherThan(highest)) {
                highest = item.riskLevel();
            }
        }
        return highest;
    }
}
