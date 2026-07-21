package io.smartdm.browser.protocol;

import java.util.List;

public record ListPageLinksRequest(List<String> links, String pageUrl, String pageTitle) implements NativeMessage {
}
