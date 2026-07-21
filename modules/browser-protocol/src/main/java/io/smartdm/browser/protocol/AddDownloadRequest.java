package io.smartdm.browser.protocol;

public record AddDownloadRequest(String url, String fileName, String referer, String userAgent) implements NativeMessage {
}
