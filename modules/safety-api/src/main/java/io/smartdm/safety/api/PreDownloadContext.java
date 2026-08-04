package io.smartdm.safety.api;

import java.util.List;
import java.util.Objects;

/**
 * Context parameters evaluated prior to downloading a file.
 */
public record PreDownloadContext(
        String url,
        long claimedSize,
        String mimeType,
        String filename,
        List<String> redirects
) {
    public PreDownloadContext {
        url = url == null ? "" : url;
        mimeType = mimeType == null ? "" : mimeType;
        filename = filename == null ? "" : filename;
        redirects = redirects == null ? List.of() : List.copyOf(redirects);
    }
}
