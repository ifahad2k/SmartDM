package io.smartdm.safety.api;

/**
 * Represents the safety evaluation status of a file or download context.
 */
public enum SafetyStatus {
    MALWARE_DETECTED,
    SUSPICIOUS,
    SCAN_FAILED,
    NO_THREATS_DETECTED,
    UNSCANNED
}
