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
        try {
            if (Platform.isFxApplicationThread()) {
                throw new IllegalStateException("Blocking operation detected on the JavaFX Application Thread! " +
                        "This will cause the UI to freeze. Move this operation to a background Task/Thread.");
            }
        } catch (NoClassDefFoundError | IllegalStateException e) {
            // In headless non-JavaFX contexts (like tests without JavaFX initialized),
            // Platform.isFxApplicationThread() might throw. We can safely ignore it.
        }
    }
}
