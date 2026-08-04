package io.smartdm.safety.api;

import java.nio.file.Path;

/**
 * Context parameters evaluated after completing a file download.
 */
public record PostDownloadContext(
        Path file,
        String sha256,
        String mimeType,
        String claimedExtension
) {
    public PostDownloadContext {
        sha256 = sha256 == null ? "" : sha256;
        mimeType = mimeType == null ? "" : mimeType;
        claimedExtension = claimedExtension == null ? "" : claimedExtension;
    }
}
