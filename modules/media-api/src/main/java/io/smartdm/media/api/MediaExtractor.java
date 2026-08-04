package io.smartdm.media.api;

import java.util.concurrent.CompletableFuture;

public interface MediaExtractor {
    CompletableFuture<MediaMetadata> extractMetadataAsync(String url, String cookies);
    CompletableFuture<MediaMetadata> extractMetadataAsync(String url, String cookies, String userAgent);
}
