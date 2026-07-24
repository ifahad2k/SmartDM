package io.smartdm.media.api;

public interface MediaSiteAdapter {
    boolean canHandle(String url);
    String canonicalize(String url);
    String getSiteName();
    String getAccessibilityLabel();
}
