package io.smartdm.desktop.util;

/**
 * Abstracts UI thread dispatching so view models can be tested without a JavaFX Application thread.
 */
public interface UiDispatcher {
    /**
     * Executes the action on the UI thread asynchronously.
     */
    void dispatch(Runnable action);
    
    /**
     * Executes the action on the UI thread and blocks until it completes.
     */
    void dispatchAndWait(Runnable action);

    /**
     * Returns true if the current thread is the UI thread.
     */
    boolean isUiMode();
}
