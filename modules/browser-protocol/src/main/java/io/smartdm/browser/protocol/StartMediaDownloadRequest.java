package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record StartMediaDownloadRequest(
    @JsonProperty("url") String url,
    @JsonProperty("formatId") String formatId,
    @JsonProperty("fileName") String fileName,
    @JsonProperty("referer") String referer,
    @JsonProperty("userAgent") String userAgent
) implements NativeMessage {
}
