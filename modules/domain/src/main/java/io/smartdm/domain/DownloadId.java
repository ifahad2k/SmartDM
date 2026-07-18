package io.smartdm.domain;

import java.util.Objects;
import java.util.UUID;

public record DownloadId(String value) {
    public DownloadId {
        Objects.requireNonNull(value, "DownloadId cannot be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException("DownloadId cannot be blank");
        }
    }
    
    public static DownloadId generate() {
        return new DownloadId(UUID.randomUUID().toString());
    }
}
