package io.smartdm.domain.catalog;

import java.time.Instant;
import java.util.Objects;

public class CatalogFile {
    private final String id;
    private final String rootId;
    private final String relativePath;
    private final String fileName;
    private final String fileExtension;
    private final String mimeType;
    private final long fileSize;
    private final Instant createdAt;
    private final Instant modifiedAt;
    private String quickHash;
    private String fullHash;
    private String metadataJson;

    public CatalogFile(String id, String rootId, String relativePath, String fileName,
                       String fileExtension, String mimeType, long fileSize,
                       Instant createdAt, Instant modifiedAt, String quickHash,
                       String fullHash, String metadataJson) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.rootId = Objects.requireNonNull(rootId, "rootId must not be null");
        this.relativePath = Objects.requireNonNull(relativePath, "relativePath must not be null");
        this.fileName = Objects.requireNonNull(fileName, "fileName must not be null");
        this.fileExtension = fileExtension != null ? fileExtension : "";
        this.mimeType = mimeType != null ? mimeType : "application/octet-stream";
        this.fileSize = fileSize;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
        this.modifiedAt = modifiedAt != null ? modifiedAt : Instant.now();
        this.quickHash = quickHash;
        this.fullHash = fullHash;
        this.metadataJson = metadataJson;
    }

    public String getId() { return id; }
    public String getRootId() { return rootId; }
    public String getRelativePath() { return relativePath; }
    public String getFileName() { return fileName; }
    public String getFileExtension() { return fileExtension; }
    public String getMimeType() { return mimeType; }
    public long getFileSize() { return fileSize; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getModifiedAt() { return modifiedAt; }
    public String getQuickHash() { return quickHash; }
    public String getFullHash() { return fullHash; }
    public String getMetadataJson() { return metadataJson; }

    public void setQuickHash(String quickHash) { this.quickHash = quickHash; }
    public void setFullHash(String fullHash) { this.fullHash = fullHash; }
    public void setMetadataJson(String metadataJson) { this.metadataJson = metadataJson; }
}
