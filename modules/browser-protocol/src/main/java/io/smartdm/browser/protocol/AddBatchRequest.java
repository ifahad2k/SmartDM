package io.smartdm.browser.protocol;

import java.util.List;

public record AddBatchRequest(List<String> urls, String referer, String userAgent) implements NativeMessage {
}
