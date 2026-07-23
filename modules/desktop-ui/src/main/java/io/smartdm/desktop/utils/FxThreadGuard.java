package io.smartdm.desktop.utils;

import javafx.application.Platform;

public final class FxThreadGuard {

    private FxThreadGuard() {
        // utility class
    }

    /**
     * Throws an IllegalStateException if the current thread is the JavaFX Application Thread.
     * Use this to protect heavy IO/crypto operations from blocking the UI.
     */
    public static void requireBackgroundThread() {
        boolean isFxThread = false;
        try {
            isFxThread = Platform.isFxApplicationThread();
        } catch (IllegalStateException e) {
            // "Toolkit not initialized" exception is thrown when JavaFX is not started.
            // In headless non-JavaFX contexts (like pure domain tests), we can safely ignore it.
            return;
        } catch (NoClassDefFoundError e) {
            return;
        }
        
        if (isFxThread) {
            throw new IllegalStateException("Blocking operation detected on the JavaFX Application Thread! " +
                    "This will cause the UI to freeze. Move this operation to a background Task/Thread.");
        }
    }
}
