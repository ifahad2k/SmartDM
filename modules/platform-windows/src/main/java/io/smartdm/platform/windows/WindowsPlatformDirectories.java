package io.smartdm.platform.windows;

import io.smartdm.platform.PlatformDirectories;

import java.nio.file.Path;
import java.nio.file.Paths;

public class WindowsPlatformDirectories implements PlatformDirectories {

    private final Path appData;
    private final Path cache;
    private final Path log;

    public WindowsPlatformDirectories() {
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData == null || localAppData.isEmpty()) {
            localAppData = System.getProperty("user.home") + "\\AppData\\Local";
        }
        
        Path base = Paths.get(localAppData, "SmartDM");
        this.appData = base.resolve("Data");
        this.cache = base.resolve("Cache");
        this.log = base.resolve("Logs");
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
