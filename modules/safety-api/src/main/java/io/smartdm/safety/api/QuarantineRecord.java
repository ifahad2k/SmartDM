package io.smartdm.safety.api;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Record representing metadata for a quarantined download item.
 */
public record QuarantineRecord(
        String quarantineId,
        String originalFilename,
        Path originalPath,
        Path quarantinePath,
        Instant quarantinedAt,
        long fileSize,
        PreDownloadContext preContext,
        PostDownloadContext postContext,
        List<SafetyEvidence> evidence
) {
    public QuarantineRecord {
        Objects.requireNonNull(quarantineId, "quarantineId cannot be null");
        originalFilename = originalFilename == null ? "unknown" : originalFilename;
        quarantinedAt = quarantinedAt == null ? Instant.now() : quarantinedAt;
        evidence = evidence == null ? List.of() : List.copyOf(evidence);
    }
}
