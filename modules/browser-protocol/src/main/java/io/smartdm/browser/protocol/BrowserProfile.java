package io.smartdm.browser.protocol;

import java.nio.file.Path;

public record BrowserProfile(
    String browserName,
    String browserType, // "chrome", "firefox", "edge", "brave", "opera", "vivaldi"
    String profileId,   // "Default", "Profile 1", "default-release"
    String profileName, // "Personal", "Work", "Fahad"
    Path profilePath,
    boolean isIntegrated
) {}
