package io.smartdm.browser.protocol;

public record StartMediaDownloadRequest(String url, String formatId, String fileName) implements NativeMessage {
}
