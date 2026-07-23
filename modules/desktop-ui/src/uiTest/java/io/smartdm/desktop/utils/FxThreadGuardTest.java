package io.smartdm.desktop.utils;

import javafx.application.Platform;
import org.junit.jupiter.api.Test;
import org.testfx.framework.junit5.ApplicationTest;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FxThreadGuardTest extends ApplicationTest {

    @Override
    public void start(javafx.stage.Stage stage) {
        // Just need JavaFX to be initialized for this test
    }

    @Test
    void requireBackgroundThread_throwsOnFxThread() throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Throwable> exceptionRef = new AtomicReference<>();

        Platform.runLater(() -> {
            try {
                FxThreadGuard.requireBackgroundThread();
            } catch (Throwable t) {
                exceptionRef.set(t);
            } finally {
                latch.countDown();
            }
        });

        latch.await();
        
        assertThat(exceptionRef.get())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Blocking operation detected on the JavaFX Application Thread");
    }

    @Test
    void requireBackgroundThread_doesNotThrowOnWorkerThread() {
        // This is running on the JUnit worker thread, not the FX thread
        assertThat(Platform.isFxApplicationThread()).isFalse();
        
        // Should not throw
        FxThreadGuard.requireBackgroundThread();
    }
}
