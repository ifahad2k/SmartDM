package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonProperty;

public record StartMediaDownloadRequest(
    @JsonProperty("url") String url,
    @JsonProperty("formatId") String formatId,
    @JsonProperty("fileName") String fileName
) implements NativeMessage {
}
