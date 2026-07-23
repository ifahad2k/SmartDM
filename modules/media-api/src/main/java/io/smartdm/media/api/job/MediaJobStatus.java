package io.smartdm.media.api.job;

public enum MediaJobStatus {
    CREATED,
    RUNNING,
    PAUSING,
    PAUSED,
    CANCELING,
    CANCELED,
    FINALIZING,
    COMPLETED,
    FAILED,
    DELETING
}
