package io.smartdm.browser.protocol;

import java.util.List;

public record AddMediaBatchRequest(
        List<String> urls
) implements NativeMessage {
}
