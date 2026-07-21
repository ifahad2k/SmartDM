package io.smartdm.browser.protocol;

public record RefreshSourceRequest(String downloadId, String newUrl) implements NativeMessage {
}
