package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AddDownloadRequest(
    @JsonProperty("url") String url,
    @JsonProperty("fileName") String fileName,
    @JsonProperty("referer") String referer,
    @JsonProperty("userAgent") String userAgent,
    @JsonProperty("cookies") String cookies
) implements NativeMessage {
}
