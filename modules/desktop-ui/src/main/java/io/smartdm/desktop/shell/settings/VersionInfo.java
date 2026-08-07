package io.smartdm.desktop.shell.settings;

import io.smartdm.domain.AppVersion;

/**
 * Adapter delegating to centralized AppVersion single source of truth.
 */
public final class VersionInfo {
    public static final String VERSION = AppVersion.getVersion();
    public static final String FULL_VERSION = AppVersion.getFullVersion();
    public static final String APP_TITLE = AppVersion.getAppName();

    private VersionInfo() {}

    public static String getVersion() {
        return AppVersion.getVersion();
    }

    public static String getFullVersion() {
        return AppVersion.getFullVersion();
    }
}
