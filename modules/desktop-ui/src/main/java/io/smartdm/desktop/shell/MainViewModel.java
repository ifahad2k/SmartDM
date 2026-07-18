package io.smartdm.desktop.shell;

import io.smartdm.desktop.util.UiDispatcher;

public class MainViewModel {
    private final UiDispatcher dispatcher;
    private String status = "Idle";

    public MainViewModel(UiDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    public String getStatus() {
        return status;
    }

    public void simulateBackgroundWork() {
        // Simulate a background process updating UI via dispatcher
        dispatcher.dispatch(() -> {
            this.status = "Working";
        });
    }
}
