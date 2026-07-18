package io.smartdm.domain;

public enum DownloadState {
    QUEUED,
    PROBING,
    DOWNLOADING,
    PAUSING,
    PAUSED,
    VERIFYING,
    COMPLETED,
    FAILED,
    CANCELED
}
