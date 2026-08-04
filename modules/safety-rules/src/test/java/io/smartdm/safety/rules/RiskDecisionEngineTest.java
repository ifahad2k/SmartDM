package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import io.smartdm.safety.api.SafetyStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RiskDecisionEngineTest {

    private RiskDecisionEngine engine;

    @BeforeEach
    void setUp() {
        engine = new RiskDecisionEngine();
    }

    @Test
    void testCleanEvidenceProducesNoThreats() {
        List<SafetyEvidence> evidence = List.of();
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.UNSCANNED);
        assertThat(decision.overallRiskLevel()).isEqualTo(RiskLevel.NONE);
    }

    @Test
    void testLowRiskEvidenceProducesNoThreatsDetected() {
        List<SafetyEvidence> evidence = List.of(
                new SafetyEvidence("NETWORK", "PRE_HTTP_INSECURE", "Insecure HTTP", RiskLevel.LOW, "http://example.com")
        );
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.NO_THREATS_DETECTED);
        assertThat(decision.overallRiskLevel()).isEqualTo(RiskLevel.LOW);
    }

    @Test
    void testHighRiskEvidenceProducesSuspicious() {
        List<SafetyEvidence> evidence = List.of(
                new SafetyEvidence("EXTENSION", "PRE_EXECUTABLE_EXTENSION", "Executable file", RiskLevel.HIGH, "file.exe")
        );
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.SUSPICIOUS);
        assertThat(decision.overallRiskLevel()).isEqualTo(RiskLevel.HIGH);
    }

    @Test
    void testCriticalRiskEvidenceProducesMalwareDetected() {
        List<SafetyEvidence> evidence = List.of(
                new SafetyEvidence("MAGIC_BYTES", "MAGIC_BYTE_MISMATCH_EXECUTABLE", "PE MZ in PDF", RiskLevel.CRITICAL, "file.pdf")
        );
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.MALWARE_DETECTED);
        assertThat(decision.overallRiskLevel()).isEqualTo(RiskLevel.CRITICAL);
    }

    @Test
    void testCannotDowngradeMalwareDetected() {
        // Evaluate clean evidence when prior status was MALWARE_DETECTED
        List<SafetyEvidence> emptyEvidence = List.of();
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(SafetyStatus.MALWARE_DETECTED, emptyEvidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.MALWARE_DETECTED);
        assertThat(decision.overallRiskLevel()).isEqualTo(RiskLevel.CRITICAL);
    }

    @Test
    void testCombineStatusesEnforcesMalwareNonDowngrade() {
        SafetyStatus combined = engine.combineStatuses(SafetyStatus.MALWARE_DETECTED, SafetyStatus.NO_THREATS_DETECTED);
        assertThat(combined).isEqualTo(SafetyStatus.MALWARE_DETECTED);

        SafetyStatus combinedReverse = engine.combineStatuses(SafetyStatus.NO_THREATS_DETECTED, SafetyStatus.MALWARE_DETECTED);
        assertThat(combinedReverse).isEqualTo(SafetyStatus.MALWARE_DETECTED);
    }

    @Test
    void testScanFailedStatus() {
        List<SafetyEvidence> evidence = List.of(
                new SafetyEvidence("SCAN_FAILED", "AV_SCAN_FAILED", "Antivirus scan crashed", RiskLevel.NONE, "exit code 1")
        );
        RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidence);

        assertThat(decision.status()).isEqualTo(SafetyStatus.SCAN_FAILED);
    }
}
