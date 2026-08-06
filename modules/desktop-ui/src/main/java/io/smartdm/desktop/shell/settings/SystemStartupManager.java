package io.smartdm.desktop.shell.settings;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class SystemStartupManager {

    private static final String REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    private static final String APP_NAME = "SmartDM";

    public static boolean setStartup(boolean enable) {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) {
            return setWindowsStartup(enable);
        }
        return false;
    }

    private static boolean setWindowsStartup(boolean enable) {
        try {
            if (enable) {
                String appPath = getExecutablePath();
                if (appPath == null || appPath.isBlank()) return false;

                String cmdValue = "\"" + appPath + "\" --autostart";
                ProcessBuilder pb = new ProcessBuilder(
                    "reg", "add", REG_KEY, "/v", APP_NAME, "/t", "REG_SZ", "/d", cmdValue, "/f"
                );
                return pb.start().waitFor() == 0;
            } else {
                ProcessBuilder pb = new ProcessBuilder(
                    "reg", "delete", REG_KEY, "/v", APP_NAME, "/f"
                );
                return pb.start().waitFor() == 0;
            }
        } catch (Exception e) {
            System.err.println("Failed to set startup registry key: " + e.getMessage());
            return false;
        }
    }

    public static String getExecutablePath() {
        try {
            // 1. Check CodeSource location (JAR directory / app root)
            var codeSource = SystemStartupManager.class.getProtectionDomain().getCodeSource();
            if (codeSource != null) {
                Path codePath = Paths.get(codeSource.getLocation().toURI());
                Path jarDir = codePath.getParent();
                if (jarDir != null) {
                    Path exe1 = jarDir.resolve("SmartDM.exe");
                    if (Files.isExecutable(exe1) && !Files.isDirectory(exe1)) {
                        return exe1.toAbsolutePath().toString();
                    }
                    if (jarDir.getFileName() != null && jarDir.getFileName().toString().equalsIgnoreCase("lib")) {
                        Path appRoot = jarDir.getParent();
                        if (appRoot != null) {
                            Path exe2 = appRoot.resolve("SmartDM.exe");
                            if (Files.isExecutable(exe2) && !Files.isDirectory(exe2)) {
                                return exe2.toAbsolutePath().toString();
                            }
                        }
                    }
                }
            }

            // 2. Check app.dir system property
            String appDir = System.getProperty("app.dir");
            if (appDir != null && !appDir.isBlank()) {
                Path exe = Paths.get(appDir, "SmartDM.exe");
                if (Files.isExecutable(exe) && !Files.isDirectory(exe)) {
                    return exe.toAbsolutePath().toString();
                }
            }

            // 3. Check current working directory
            Path localExe = Paths.get("SmartDM.exe");
            if (Files.isExecutable(localExe) && !Files.isDirectory(localExe)) {
                return localExe.toAbsolutePath().toString();
            }

            // 4. Check sun.java.command fallback
            String sunJavaCommand = System.getProperty("sun.java.command", "");
            if (!sunJavaCommand.isBlank()) {
                String jarOrClass = sunJavaCommand.split(" ")[0];
                File f = new File(jarOrClass);
                if (f.exists()) {
                    return f.getAbsolutePath();
                }
            }
            return System.getProperty("java.home") + File.separator + "bin" + File.separator + "javaw.exe";
        } catch (Exception e) {
            return null;
        }
    }
}
