package io.smartdm.domain;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public class DownloadQueue {
    
    public enum Status {
        ACTIVE,
        PAUSED
    }

    private final String id;
    private final String name;
    private final int concurrencyLimit;
    private final Long bandwidthLimitBytes;
    private final Status status;

    public DownloadQueue(String id, String name, int concurrencyLimit, Long bandwidthLimitBytes, Status status) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.name = Objects.requireNonNull(name, "name must not be null");
        if (concurrencyLimit <= 0) {
            throw new IllegalArgumentException("Concurrency limit must be > 0");
        }
        this.concurrencyLimit = concurrencyLimit;
        this.bandwidthLimitBytes = bandwidthLimitBytes;
        this.status = Objects.requireNonNull(status, "status must not be null");
    }
    
    public static DownloadQueue createNew(String name, int concurrencyLimit, Long bandwidthLimitBytes) {
        return new DownloadQueue(UUID.randomUUID().toString(), name, concurrencyLimit, bandwidthLimitBytes, Status.ACTIVE);
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getConcurrencyLimit() {
        return concurrencyLimit;
    }

    public Optional<Long> getBandwidthLimitBytes() {
        return Optional.ofNullable(bandwidthLimitBytes);
    }

    public Status getStatus() {
        return status;
    }

    public DownloadQueue withStatus(Status newStatus) {
        return new DownloadQueue(this.id, this.name, this.concurrencyLimit, this.bandwidthLimitBytes, newStatus);
    }
    
    public DownloadQueue withConcurrencyLimit(int newLimit) {
        return new DownloadQueue(this.id, this.name, newLimit, this.bandwidthLimitBytes, this.status);
    }
    
    public DownloadQueue withBandwidthLimit(Long newLimit) {
        return new DownloadQueue(this.id, this.name, this.concurrencyLimit, newLimit, this.status);
    }
}
