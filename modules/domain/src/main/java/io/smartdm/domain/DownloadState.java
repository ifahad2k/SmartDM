package io.smartdm.domain;

public enum DownloadState {
    QUEUED,
    PROBING,
    DOWNLOADING,
    VERIFYING,
    COMPLETED,
    FAILED,
    CANCELED
}
