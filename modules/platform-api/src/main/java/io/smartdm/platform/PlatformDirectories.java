package io.smartdm.platform;

import java.nio.file.Path;

/**
 * Resolves standard platform directories for the application.
 */
public interface PlatformDirectories {
    
    /**
     * @return The directory for storing application data (e.g., database, settings, keys).
     */
    Path getAppDataDirectory();

    /**
     * @return The directory for storing temporary cache files.
     */
    Path getCacheDirectory();

    /**
     * @return The directory for storing application logs.
     */
    Path getLogDirectory();
}
