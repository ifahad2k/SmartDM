package io.smartdm.media.api.job;

import io.smartdm.domain.DownloadId;
import io.smartdm.media.api.DestinationConflictPolicy;

import java.time.Instant;
import java.util.Objects;

public record MediaJobDescriptor(
        DownloadId downloadId,
        String webpageUrl,
        String formatArgument,
        DestinationConflictPolicy conflictPolicy,
        MediaJobStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public MediaJobDescriptor {
        Objects.requireNonNull(downloadId, "downloadId");
        Objects.requireNonNull(webpageUrl, "webpageUrl");
        Objects.requireNonNull(formatArgument, "formatArgument");
        if (conflictPolicy == null) {
            conflictPolicy = DestinationConflictPolicy.REPLACE;
        }
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public MediaJobDescriptor(
            DownloadId downloadId,
            String webpageUrl,
            String formatArgument,
            MediaJobStatus status,
            Instant createdAt,
            Instant updatedAt) {
        this(downloadId, webpageUrl, formatArgument, DestinationConflictPolicy.REPLACE, status, createdAt, updatedAt);
    }

    public MediaJobDescriptor withStatus(
            MediaJobStatus newStatus,
            Instant updateTime) {

        return new MediaJobDescriptor(
                downloadId,
                webpageUrl,
                formatArgument,
                conflictPolicy,
                newStatus,
                createdAt,
                updateTime);
    }
}
