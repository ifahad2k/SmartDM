package io.smartdm.desktop.shell;

public final class SoundNotificationService {

    private SoundNotificationService() {}

    public static void playFinishSound() {
        try {
            // Standard OS system sound feedback beep / notification tone
            java.awt.Toolkit.getDefaultToolkit().beep();
        } catch (Exception ignored) {}
    }

    public static void playErrorSound() {
        try {
            java.awt.Toolkit.getDefaultToolkit().beep();
        } catch (Exception ignored) {}
    }
}
