package io.smartdm.desktop.util;

/**
 * A synchronous implementation of UiDispatcher for unit tests.
 * Runs actions immediately on the current thread, avoiding JavaFX toolkit requirements.
 */
public class TestUiDispatcher implements UiDispatcher {

    @Override
    public void dispatch(Runnable action) {
        action.run();
    }

    @Override
    public void dispatchAndWait(Runnable action) {
        action.run();
    }

    @Override
    public boolean isUiMode() {
        return true;
    }
}
