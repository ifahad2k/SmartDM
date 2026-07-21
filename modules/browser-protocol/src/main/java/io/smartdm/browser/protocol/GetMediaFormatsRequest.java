package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GetMediaFormatsRequest(
    @JsonProperty("url") String url
) implements NativeMessage {
}
