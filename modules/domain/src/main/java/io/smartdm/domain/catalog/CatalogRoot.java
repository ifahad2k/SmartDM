package io.smartdm.domain.catalog;

import java.time.Instant;
import java.util.Objects;

public class CatalogRoot {
    private final String id;
    private final String path;
    private final String displayName;
    private final Instant createdAt;
    private String scanState;
    private Instant lastScannedAt;

    public CatalogRoot(String id, String path, String displayName, Instant createdAt, String scanState, Instant lastScannedAt) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.path = Objects.requireNonNull(path, "path must not be null");
        this.displayName = Objects.requireNonNull(displayName, "displayName must not be null");
        this.createdAt = createdAt != null ? createdAt : Instant.now();
        this.scanState = scanState != null ? scanState : "IDLE";
        this.lastScannedAt = lastScannedAt;
    }

    public String getId() { return id; }
    public String getPath() { return path; }
    public String getDisplayName() { return displayName; }
    public Instant getCreatedAt() { return createdAt; }
    public String getScanState() { return scanState; }
    public Instant getLastScannedAt() { return lastScannedAt; }

    public void setScanState(String scanState) { this.scanState = scanState; }
    public void setLastScannedAt(Instant lastScannedAt) { this.lastScannedAt = lastScannedAt; }
}
