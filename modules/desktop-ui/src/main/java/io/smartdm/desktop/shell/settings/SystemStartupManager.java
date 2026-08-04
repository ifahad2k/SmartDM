package io.smartdm.desktop.shell.settings;

import java.io.File;

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
                // Get current executable path or java jar path
                String appPath = getExecutablePath();
                if (appPath == null || appPath.isBlank()) return false;

                ProcessBuilder pb = new ProcessBuilder(
                    "reg", "add", REG_KEY, "/v", APP_NAME, "/t", "REG_SZ", "/d", "\"" + appPath + "\"", "/f"
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

    private static String getExecutablePath() {
        try {
            // Check if running as packaged executable or fallback to javaw command
            String sunJavaCommand = System.getProperty("sun.java.command", "");
            if (!sunJavaCommand.isBlank()) {
                String jarOrClass = sunJavaCommand.split(" ")[0];
                File f = new File(jarOrClass);
                if (f.exists()) {
                    return f.getAbsolutePath();
                }
            }
            // Fallback to java executable running main app
            return System.getProperty("java.home") + File.separator + "bin" + File.separator + "javaw.exe";
        } catch (Exception e) {
            return null;
        }
    }
}
