package io.smartdm.domain.search;

import java.time.Instant;

public record LocalSearchResult(
    String id,
    String name,
    String path,
    long sizeBytes,
    Instant date,
    FileKind kind,
    String sourceHost,
    String matchReason,
    boolean isDownloadHistory
) {}
