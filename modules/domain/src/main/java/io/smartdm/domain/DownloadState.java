package io.smartdm.domain;

public enum DownloadState {
    QUEUED,
    PROBING,
    DOWNLOADING,
    PAUSING,
    PAUSED,
    VERIFYING,
    RETRY_WAIT,
    COMPLETED,
    FAILED,
    CANCELED,
    REQUIRES_AUTH
}
