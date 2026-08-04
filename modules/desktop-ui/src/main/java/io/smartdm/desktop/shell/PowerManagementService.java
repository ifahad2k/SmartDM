package io.smartdm.desktop.shell;

import java.util.concurrent.CompletableFuture;

public final class PowerManagementService {

    private PowerManagementService() {}

    public static void shutdownComputer() {
        CompletableFuture.runAsync(() -> {
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                if (os.contains("win")) {
                    // Windows shutdown with 30s timeout giving user time to cancel if needed
                    new ProcessBuilder("shutdown.exe", "/s", "/t", "30", "/c", "SmartDM Downloads Completed - Shutting down system").start();
                } else if (os.contains("mac")) {
                    new ProcessBuilder("osascript", "-e", "tell app \"System Events\" to shut down").start();
                } else {
                    new ProcessBuilder("shutdown", "-h", "+1").start();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public static void sleepComputer() {
        CompletableFuture.runAsync(() -> {
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                if (os.contains("win")) {
                    // Windows suspend/sleep mode command
                    new ProcessBuilder("rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0").start();
                } else if (os.contains("mac")) {
                    new ProcessBuilder("pmset", "sleepnow").start();
                } else {
                    new ProcessBuilder("systemctl", "suspend").start();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }
}
