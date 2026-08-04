package io.smartdm.safety.api;

/**
 * Represents the severity level of a safety risk or evidence finding.
 */
public enum RiskLevel {
    CRITICAL,
    HIGH,
    MEDIUM,
    LOW,
    NONE;

    /**
     * Returns true if this risk level is strictly higher in severity than the given level.
     */
    public boolean isHigherThan(RiskLevel other) {
        if (other == null) {
            return true;
        }
        return this.compareTo(other) < 0; // CRITICAL (0) < HIGH (1) < MEDIUM (2) < LOW (3) < NONE (4)
    }
}
