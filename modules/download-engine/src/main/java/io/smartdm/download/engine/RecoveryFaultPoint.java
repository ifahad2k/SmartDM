package io.smartdm.download.engine;

/**
 * Fault points for deterministic crash recovery testing.
 * Inject these via SingleDownloadCoordinator's test hooks to simulate process termination.
 */
public enum RecoveryFaultPoint {
    AFTER_SEGMENT_WRITE,
    AFTER_PROGRESS_COMMIT,
    BEFORE_FINAL_MOVE,
    AFTER_FINAL_MOVE,
    BEFORE_COMPLETION_COMMIT
}
