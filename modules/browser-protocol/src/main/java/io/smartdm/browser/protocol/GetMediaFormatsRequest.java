package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GetMediaFormatsRequest(
    @JsonProperty("url") String url,
    @JsonProperty("cookies") String cookies,
    @JsonProperty("userAgent") String userAgent
) implements NativeMessage {
}
