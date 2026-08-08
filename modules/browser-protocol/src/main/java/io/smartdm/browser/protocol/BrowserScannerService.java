package io.smartdm.browser.protocol;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BrowserScannerService {

    public static List<BrowserProfile> scanAllProfiles() {
        List<BrowserProfile> profiles = new ArrayList<>();

        String userHome = System.getProperty("user.home");
        String localAppData = System.getenv("LOCALAPPDATA");
        String appData = System.getenv("APPDATA");

        if (localAppData == null || localAppData.isBlank()) {
            localAppData = userHome + File.separator + "AppData" + File.separator + "Local";
        }
        if (appData == null || appData.isBlank()) {
            appData = userHome + File.separator + "AppData" + File.separator + "Roaming";
        }

        // 1. Google Chrome
        Path chromeData = Paths.get(localAppData, "Google", "Chrome", "User Data");
        scanChromiumBrowser("Google Chrome", "chrome", chromeData, profiles);

        // 2. Microsoft Edge
        Path edgeData = Paths.get(localAppData, "Microsoft", "Edge", "User Data");
        scanChromiumBrowser("Microsoft Edge", "edge", edgeData, profiles);

        // 3. Brave Browser
        Path braveData = Paths.get(localAppData, "BraveSoftware", "Brave-Browser", "User Data");
        scanChromiumBrowser("Brave Browser", "brave", braveData, profiles);

        // 4. Vivaldi
        Path vivaldiData = Paths.get(localAppData, "Vivaldi", "User Data");
        scanChromiumBrowser("Vivaldi", "vivaldi", vivaldiData, profiles);

        // 5. Opera
        Path operaData = Paths.get(appData, "Opera Software", "Opera Stable");
        if (Files.exists(operaData)) {
            profiles.add(new BrowserProfile("Opera", "opera", "Default", "Default Profile", operaData, checkChromiumIntegrated("opera", operaData)));
        }

        // 6. Mozilla Firefox
        Path firefoxData = Paths.get(appData, "Mozilla", "Firefox");
        scanFirefoxBrowser(firefoxData, profiles);

        return profiles;
    }

    private static void scanChromiumBrowser(String browserName, String browserType, Path userDataDir, List<BrowserProfile> outList) {
        if (!Files.exists(userDataDir)) return;

        Path localStateFile = userDataDir.resolve("Local State");
        String localStateJson = "";
        if (Files.exists(localStateFile)) {
            try {
                localStateJson = Files.readString(localStateFile);
            } catch (Exception ignored) {}
        }

        // Scan directories inside User Data (Default, Profile 1, Profile 2...)
        File[] subDirs = userDataDir.toFile().listFiles(File::isDirectory);
        if (subDirs == null) return;

        for (File dir : subDirs) {
            String dirName = dir.getName();
            if (dirName.equalsIgnoreCase("Default") || dirName.startsWith("Profile ")) {
                String displayName = dirName;

                // Try extracting custom profile name from Local State JSON
                if (!localStateJson.isBlank()) {
                    Pattern p = Pattern.compile("\"" + Pattern.quote(dirName) + "\"\\s*:\\s*\\{[^\\}]*\"name\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher m = p.matcher(localStateJson);
                    if (m.find()) {
                        displayName = m.group(1) + " (" + dirName + ")";
                    }
                }

                boolean isIntegrated = checkChromiumIntegrated(browserType, dir.toPath());
                outList.add(new BrowserProfile(browserName, browserType, dirName, displayName, dir.toPath(), isIntegrated));
            }
        }
    }

    private static void scanFirefoxBrowser(Path firefoxDir, List<BrowserProfile> outList) {
        if (!Files.exists(firefoxDir)) return;

        Path iniFile = firefoxDir.resolve("profiles.ini");
        if (!Files.exists(iniFile)) return;

        try {
            List<String> lines = Files.readAllLines(iniFile);
            String currentName = null;
            String currentPath = null;
            boolean isRelative = true;

            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("[Profile")) {
                    if (currentName != null && currentPath != null) {
                        Path profPath = isRelative ? firefoxDir.resolve(currentPath) : Paths.get(currentPath);
                        if (Files.exists(profPath)) {
                            outList.add(new BrowserProfile("Mozilla Firefox", "firefox", currentName, currentName, profPath, checkFirefoxIntegrated(profPath)));
                        }
                    }
                    currentName = null;
                    currentPath = null;
                    isRelative = true;
                } else if (line.toLowerCase().startsWith("name=")) {
                    currentName = line.substring(5).trim();
                } else if (line.toLowerCase().startsWith("path=")) {
                    currentPath = line.substring(5).trim().replace('/', File.separatorChar);
                } else if (line.toLowerCase().startsWith("isrelative=")) {
                    isRelative = !"0".equals(line.substring(11).trim());
                }
            }

            if (currentName != null && currentPath != null) {
                Path profPath = isRelative ? firefoxDir.resolve(currentPath) : Paths.get(currentPath);
                if (Files.exists(profPath)) {
                    outList.add(new BrowserProfile("Mozilla Firefox", "firefox", currentName, currentName, profPath, checkFirefoxIntegrated(profPath)));
                }
            }
        } catch (Exception ignored) {}
    }

    private static boolean checkChromiumIntegrated(String browserType, Path profileDir) {
        Path securePref = profileDir.resolve("Secure Preferences");
        if (!Files.exists(securePref)) return false;
        try {
            String content = Files.readString(securePref);
            return content.contains("knldjnnmkkebefogdbmggjijknmjeaoh");
        } catch (Exception ignored) {}
        return false;
    }

    public static boolean isDeveloperModeEnabled(Path profileDir) {
        if (profileDir == null) return false;
        Path securePref = profileDir.resolve("Secure Preferences");
        Path pref = profileDir.resolve("Preferences");

        return checkDevModeInFile(securePref) || checkDevModeInFile(pref);
    }

    private static boolean checkDevModeInFile(Path file) {
        if (!Files.exists(file)) return false;
        try {
            String content = Files.readString(file);
            return content.contains("\"developer_mode\":true") || content.contains("\"developer_mode\": true");
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean checkFirefoxIntegrated(Path profileDir) {
        Path userJs = profileDir.resolve("user.js");
        if (Files.exists(userJs)) {
            try {
                String content = Files.readString(userJs);
                if (content.contains("smartdm")) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }
}
