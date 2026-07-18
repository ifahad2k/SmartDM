package io.smartdm.domain;

import java.util.Objects;

public class Download {
    private final DownloadId id;
    private final SourceUri source;
    private final Destination destination;
    private DownloadState state;
    private ByteCount totalBytes;
    private ByteCount downloadedBytes;

    public Download(DownloadId id, SourceUri source, Destination destination) {
        this.id = Objects.requireNonNull(id);
        this.source = Objects.requireNonNull(source);
        this.destination = Objects.requireNonNull(destination);
        this.state = DownloadState.QUEUED;
        this.totalBytes = ByteCount.UNKNOWN;
        this.downloadedBytes = ByteCount.ZERO;
    }

    public static Download create(SourceUri source, Destination destination) {
        return new Download(DownloadId.generate(), source, destination);
    }

    public void updateState(DownloadState newState) {
        this.state = Objects.requireNonNull(newState);
    }

    public void updateProgress(ByteCount downloaded, ByteCount total) {
        this.downloadedBytes = Objects.requireNonNull(downloaded);
        this.totalBytes = Objects.requireNonNull(total);
    }

    public DownloadId id() { return id; }
    public SourceUri source() { return source; }
    public Destination destination() { return destination; }
    public DownloadState state() { return state; }
    public ByteCount totalBytes() { return totalBytes; }
    public ByteCount downloadedBytes() { return downloadedBytes; }
}
