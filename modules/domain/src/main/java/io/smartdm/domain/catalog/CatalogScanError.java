package io.smartdm.domain.catalog;

import java.time.Instant;

public record CatalogScanError(
        String id,
        String rootId,
        String relativePath,
        String errorCode,
        Instant occurredAt,
        boolean retryable
) {}
