package io.smartdm.domain;

import java.io.InputStream;
import java.util.Properties;

/**
 * Centralized Single Source of Truth for SmartDM application versioning.
 * Dynamically loads version information from resources across all modules.
 */
public final class AppVersion {

    private static final String FALLBACK_VERSION = "1.0.5";
    private static final String APP_NAME = "SmartDM";

    private static final String VERSION;

    static {
        String loadedVersion = null;
        try (InputStream is = AppVersion.class.getResourceAsStream("/smartdm-version.properties")) {
            if (is != null) {
                Properties props = new Properties();
                props.load(is);
                loadedVersion = props.getProperty("version");
            }
        } catch (Exception ignored) {}

        if (loadedVersion == null || loadedVersion.isBlank()) {
            loadedVersion = FALLBACK_VERSION;
        }
        VERSION = loadedVersion.trim();
    }

    private AppVersion() {}

    /**
     * Raw version string (e.g. "1.0.5")
     */
    public static String getVersion() {
        return VERSION;
    }

    /**
     * Formatted full version string with 'v' prefix (e.g. "v1.0.5")
     */
    public static String getFullVersion() {
        return "v" + VERSION;
    }

    /**
     * Application brand name (e.g. "SmartDM")
     */
    public static String getAppName() {
        return APP_NAME;
    }

    /**
     * Display title string (e.g. "SmartDM v1.0.5")
     */
    public static String getDisplayTitle() {
        return APP_NAME + " " + getFullVersion();
    }

    @Override
    public String toString() {
        return getFullVersion();
    }
}
