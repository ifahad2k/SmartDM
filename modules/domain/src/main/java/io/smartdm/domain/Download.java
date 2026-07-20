package io.smartdm.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class Download {
    private final DownloadId id;
    private final SourceUri source;
    private final Destination destination;
    private volatile DownloadState state;
    private volatile ByteCount totalBytes;
    private volatile ByteCount downloadedBytes;
    private volatile String etag;
    private volatile String lastModified;
    private volatile Long scheduledStartTime;
    private volatile String expectedHash;
    private volatile CategoryId categoryId;
    private volatile AuthCredential credential;
    private final List<DownloadSegment> segments = new ArrayList<>();

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

    public void updateIdentity(String etag, String lastModified) {
        this.etag = etag;
        this.lastModified = lastModified;
    }

    public void updateScheduledStartTime(Long scheduledStartTime) {
        this.scheduledStartTime = scheduledStartTime;
    }

    public void updateExpectedHash(String expectedHash) {
        this.expectedHash = expectedHash;
    }

    public void updateCategoryId(CategoryId categoryId) {
        this.categoryId = categoryId;
    }

    public void updateCredential(AuthCredential credential) {
        this.credential = credential;
    }

    public DownloadId id() { return id; }
    public SourceUri source() { return source; }
    public Destination destination() { return destination; }
    public DownloadState state() { return state; }
    public ByteCount totalBytes() { return totalBytes; }
    public String etag() { return etag; }
    public String lastModified() { return lastModified; }
    public Long scheduledStartTime() { return scheduledStartTime; }
    public String expectedHash() { return expectedHash; }
    public CategoryId categoryId() { return categoryId; }
    public AuthCredential credential() { return credential; }
    
    public ByteCount downloadedBytes() {
        if (!segments.isEmpty()) {
            long sum = 0;
            for (DownloadSegment s : segments) {
                sum += s.downloadedBytes();
            }
            return ByteCount.of(sum);
        }
        return downloadedBytes;
    }

    public List<DownloadSegment> segments() {
        return segments;
    }

    public void updateSegments(List<DownloadSegment> newSegments) {
        this.segments.clear();
        if (newSegments != null) {
            this.segments.addAll(newSegments);
        }
    }
}
