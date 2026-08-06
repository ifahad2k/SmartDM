package io.smartdm.desktop.shell.settings;

public final class VersionInfo {
    public static final String VERSION = "1.0.3";
    public static final String FULL_VERSION = "v1.0.3";
    public static final String APP_TITLE = "SmartDM";

    private VersionInfo() {}

    public static String getVersion() {
        return VERSION;
    }

    public static String getFullVersion() {
        return FULL_VERSION;
    }
}
