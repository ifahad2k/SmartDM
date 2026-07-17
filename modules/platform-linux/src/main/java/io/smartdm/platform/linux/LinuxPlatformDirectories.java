package io.smartdm.platform.linux;

import io.smartdm.platform.PlatformDirectories;

import java.nio.file.Path;
import java.nio.file.Paths;

public class LinuxPlatformDirectories implements PlatformDirectories {

    private final Path appData;
    private final Path cache;
    private final Path log;

    public LinuxPlatformDirectories() {
        String userHome = System.getProperty("user.home");
        
        String xdgDataHome = System.getenv("XDG_DATA_HOME");
        if (xdgDataHome == null || xdgDataHome.isEmpty()) {
            xdgDataHome = userHome + "/.local/share";
        }
        this.appData = Paths.get(xdgDataHome, "smartdm");
        
        String xdgCacheHome = System.getenv("XDG_CACHE_HOME");
        if (xdgCacheHome == null || xdgCacheHome.isEmpty()) {
            xdgCacheHome = userHome + "/.cache";
        }
        this.cache = Paths.get(xdgCacheHome, "smartdm");
        
        String xdgStateHome = System.getenv("XDG_STATE_HOME");
        if (xdgStateHome == null || xdgStateHome.isEmpty()) {
            xdgStateHome = userHome + "/.local/state";
        }
        this.log = Paths.get(xdgStateHome, "smartdm", "log");
    }

    @Override
    public Path getAppDataDirectory() {
        return appData;
    }

    @Override
    public Path getCacheDirectory() {
        return cache;
    }

    @Override
    public Path getLogDirectory() {
        return log;
    }
}
