package io.smartdm.desktop.shell.settings;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@JsonIgnoreProperties(ignoreUnknown = true)
public class AppSettings {

    private static final ObjectMapper MAPPER = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    private boolean runOnStartup = false;
    private boolean closeToTray = true;
    private boolean autoCheckUpdates = true;
    private boolean autoDownloadUpdates = false;
    private String reportBugUrl = "https://github.com/ifahad2k/SmartDM/issues";
    private int maxParallelSegments = 8;
    private boolean enableSpeedLimit = false;
    private int defaultSpeedLimitKbps = 1000;
    private String theme = "Dark";
    private String language = "en";

    public AppSettings() {}

    public boolean isRunOnStartup() { return runOnStartup; }
    public void setRunOnStartup(boolean runOnStartup) { this.runOnStartup = runOnStartup; }

    public boolean isCloseToTray() { return closeToTray; }
    public void setCloseToTray(boolean closeToTray) { this.closeToTray = closeToTray; }

    public boolean isAutoCheckUpdates() { return autoCheckUpdates; }
    public void setAutoCheckUpdates(boolean autoCheckUpdates) { this.autoCheckUpdates = autoCheckUpdates; }

    public boolean isAutoDownloadUpdates() { return autoDownloadUpdates; }
    public void setAutoDownloadUpdates(boolean autoDownloadUpdates) { this.autoDownloadUpdates = autoDownloadUpdates; }

    public String getReportBugUrl() { return reportBugUrl; }
    public void setReportBugUrl(String reportBugUrl) { this.reportBugUrl = reportBugUrl; }

    public int getMaxParallelSegments() { return maxParallelSegments; }
    public void setMaxParallelSegments(int maxParallelSegments) { this.maxParallelSegments = maxParallelSegments; }

    public boolean isEnableSpeedLimit() { return enableSpeedLimit; }
    public void setEnableSpeedLimit(boolean enableSpeedLimit) { this.enableSpeedLimit = enableSpeedLimit; }

    public int getDefaultSpeedLimitKbps() { return defaultSpeedLimitKbps; }
    public void setDefaultSpeedLimitKbps(int defaultSpeedLimitKbps) { this.defaultSpeedLimitKbps = defaultSpeedLimitKbps; }

    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    private static Path getSettingsPath() {
        return Paths.get(System.getProperty("user.home"), ".smartdm", "app_settings.json");
    }

    public static AppSettings loadFromDisk() {
        try {
            Path p = getSettingsPath();
            if (Files.exists(p)) {
                return MAPPER.readValue(p.toFile(), AppSettings.class);
            }
        } catch (Exception e) {
            System.err.println("Could not load app settings: " + e.getMessage());
        }
        return new AppSettings();
    }

    public void saveToDisk() {
        try {
            Path p = getSettingsPath();
            if (!Files.exists(p.getParent())) {
                Files.createDirectories(p.getParent());
            }
            MAPPER.writeValue(p.toFile(), this);
        } catch (Exception e) {
            System.err.println("Could not save app settings: " + e.getMessage());
        }
    }
}
