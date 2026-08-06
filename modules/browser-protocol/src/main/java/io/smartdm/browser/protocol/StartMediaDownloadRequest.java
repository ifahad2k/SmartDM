package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record StartMediaDownloadRequest(
    @JsonProperty("url") String url,
    @JsonProperty("videoUrl") String videoUrl,
    @JsonProperty("audioUrl") String audioUrl,
    @JsonProperty("formatId") String formatId,
    @JsonProperty("fileName") String fileName,
    @JsonProperty("title") String title,
    @JsonProperty("referer") String referer,
    @JsonProperty("userAgent") String userAgent,
    @JsonProperty("cookies") String cookies
) implements NativeMessage {
}
