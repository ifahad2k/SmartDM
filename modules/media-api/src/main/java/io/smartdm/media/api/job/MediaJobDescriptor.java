package io.smartdm.media.api.job;

import io.smartdm.domain.DownloadId;

import java.time.Instant;
import java.util.Objects;

public record MediaJobDescriptor(
        DownloadId downloadId,
        String webpageUrl,
        String formatArgument,
        MediaJobStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public MediaJobDescriptor {
        Objects.requireNonNull(downloadId, "downloadId");
        Objects.requireNonNull(webpageUrl, "webpageUrl");
        Objects.requireNonNull(formatArgument, "formatArgument");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public MediaJobDescriptor withStatus(
            MediaJobStatus newStatus,
            Instant updateTime) {

        return new MediaJobDescriptor(
                downloadId,
                webpageUrl,
                formatArgument,
                newStatus,
                createdAt,
                updateTime);
    }
}
