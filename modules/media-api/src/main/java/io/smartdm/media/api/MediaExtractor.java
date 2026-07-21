package io.smartdm.media.api;

import java.util.concurrent.CompletableFuture;

public interface MediaExtractor {
    CompletableFuture<MediaMetadata> extractMetadataAsync(String url);
}
