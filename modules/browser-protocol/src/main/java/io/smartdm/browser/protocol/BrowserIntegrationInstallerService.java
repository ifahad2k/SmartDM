package io.smartdm.browser.protocol;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class BrowserIntegrationInstallerService {

    public static boolean applyIntegration(List<BrowserProfile> targetProfiles, Path appExtensionBaseDir) {
        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");
        if (!isWin) return false;

        Path chromeExtDir = appExtensionBaseDir.resolve("chrome");
        Path firefoxExtDir = appExtensionBaseDir.resolve("firefox");

        boolean success = true;

        for (BrowserProfile p : targetProfiles) {
            try {
                if ("firefox".equalsIgnoreCase(p.browserType())) {
                    installFirefoxProfile(p, firefoxExtDir);
                } else {
                    installChromiumProfile(p, chromeExtDir);
                }
            } catch (Exception ex) {
                ex.printStackTrace();
                success = false;
            }
        }

        return success;
    }

    private static void installChromiumProfile(BrowserProfile profile, Path chromeExtDir) throws Exception {
        // 1. Native Messaging Host Registration for Chromium
        String regPath = switch (profile.browserType().toLowerCase()) {
            case "edge" -> "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\io.smartdm.host";
            case "brave" -> "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\io.smartdm.host";
            default -> "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\io.smartdm.host";
        };

        Path hostJsonPath = chromeExtDir.resolve("host").resolve("io.smartdm.host.json");
        runCmd("reg", "add", regPath, "/ve", "/t", "REG_SZ", "/d", hostJsonPath.toAbsolutePath().toString(), "/f");

        // 2. Install extension directly into Profile's Extensions directory
        Path profileExtDir = profile.profilePath().resolve("Extensions").resolve("knldjnnmkkebefogdbmggjijknmjeaoh").resolve("1.0.6_0");
        Files.createDirectories(profileExtDir);
        copyDirectory(chromeExtDir, profileExtDir);

        // 3. Register Browser Registry Extension path
        String extRegPath = switch (profile.browserType().toLowerCase()) {
            case "edge" -> "HKCU\\Software\\Microsoft\\Edge\\Extensions\\knldjnnmkkebefogdbmggjijknmjeaoh";
            case "brave" -> "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\knldjnnmkkebefogdbmggjijknmjeaoh";
            default -> "HKCU\\Software\\Google\\Chrome\\Extensions\\knldjnnmkkebefogdbmggjijknmjeaoh";
        };
        runCmd("reg", "add", extRegPath, "/v", "path", "/t", "REG_SZ", "/d", profileExtDir.toAbsolutePath().toString(), "/f");
        runCmd("reg", "add", extRegPath, "/v", "version", "/t", "REG_SZ", "/d", "1.0.6", "/f");

        // 4. External Extension Directory Injection for Profile
        Path userData = profile.profilePath().getParent();
        if (userData != null) {
            Path extFolder = userData.resolve("External Extensions");
            Files.createDirectories(extFolder);
            String jsonContent = "{\n  \"external_crx\": \"" + profileExtDir.toAbsolutePath().toString().replace('\\', '/') + "\",\n  \"external_version\": \"1.0.6\"\n}";
            Files.writeString(extFolder.resolve("knldjnnmkkebefogdbmggjijknmjeaoh.json"), jsonContent);
        }

        // 5. Inject Preferences setting if possible
        Path prefFile = profile.profilePath().resolve("Preferences");
        if (Files.exists(prefFile)) {
            try {
                String content = Files.readString(prefFile);
                if (!content.contains("knldjnnmkkebefogdbmggjijknmjeaoh")) {
                    String settingSnippet = "\"knldjnnmkkebefogdbmggjijknmjeaoh\":{\"location\":5,\"path\":\"" +
                        profileExtDir.toAbsolutePath().toString().replace('\\', '/') + "\",\"state\":1}";
                    if (content.contains("\"settings\":{")) {
                        content = content.replace("\"settings\":{", "\"settings\":{" + settingSnippet + ",");
                        Files.writeString(prefFile, content);
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private static void copyDirectory(Path source, Path target) {
        if (!Files.exists(source)) return;
        try {
            Files.walk(source).forEach(src -> {
                try {
                    Path dest = target.resolve(source.relativize(src));
                    if (Files.isDirectory(src)) {
                        Files.createDirectories(dest);
                    } else {
                        Files.copy(src, dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private static void installFirefoxProfile(BrowserProfile profile, Path firefoxExtDir) throws Exception {
        // 1. Native Messaging Host Registration for Firefox
        Path hostJsonPath = firefoxExtDir.resolve("host").resolve("io.smartdm.host.firefox.json");
        runCmd("reg", "add", "HKCU\\Software\\Mozilla\\NativeMessagingHosts\\io.smartdm.host", "/ve", "/t", "REG_SZ", "/d", hostJsonPath.toAbsolutePath().toString(), "/f");

        // 2. Profile user.js tweak for persistent unsigned extension support
        Path userJs = profile.profilePath().resolve("user.js");
        String jsLine = "user_pref(\"xpinstall.signatures.required\", false); // SmartDM Integration\n";
        if (Files.exists(userJs)) {
            String existing = Files.readString(userJs);
            if (!existing.contains("xpinstall.signatures.required")) {
                Files.writeString(userJs, existing + "\n" + jsLine);
            }
        } else {
            Files.writeString(userJs, jsLine);
        }

        // 3. Firefox Registry Policy
        runCmd("reg", "add", "HKCU\\Software\\Policies\\Mozilla\\Firefox\\ExtensionSettings\\smartdm-extension@smartdm.io", "/v", "installation_mode", "/t", "REG_SZ", "/d", "normal_installed", "/f");
        runCmd("reg", "add", "HKCU\\Software\\Policies\\Mozilla\\Firefox\\ExtensionSettings\\smartdm-extension@smartdm.io", "/v", "install_url", "/t", "REG_SZ", "/d", "file:///" + firefoxExtDir.resolve("manifest.json").toAbsolutePath().toString().replace('\\', '/'), "/f");
    }

    private static void runCmd(String... args) {
        try {
            ProcessBuilder pb = new ProcessBuilder(args);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            p.waitFor();
        } catch (Exception ignored) {}
    }
}
