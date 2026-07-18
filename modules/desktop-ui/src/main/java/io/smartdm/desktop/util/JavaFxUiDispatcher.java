package io.smartdm.desktop.util;

import javafx.application.Platform;
import java.util.concurrent.CountDownLatch;

public class JavaFxUiDispatcher implements UiDispatcher {

    @Override
    public void dispatch(Runnable action) {
        if (Platform.isFxApplicationThread()) {
            action.run();
        } else {
            Platform.runLater(action);
        }
    }

    @Override
    public void dispatchAndWait(Runnable action) {
        if (Platform.isFxApplicationThread()) {
            action.run();
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        Platform.runLater(() -> {
            try {
                action.run();
            } finally {
                latch.countDown();
            }
        });
        
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public boolean isUiMode() {
        return Platform.isFxApplicationThread();
    }
}
