package io.smartdm.desktop.util;

import javafx.application.Platform;
import javafx.stage.Stage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testfx.framework.junit5.ApplicationExtension;
import org.testfx.framework.junit5.Start;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(ApplicationExtension.class)
public class UiFrameTimeTest {

    private JavaFxUiDispatcher dispatcher;

    @Start
    private void start(Stage stage) {
        dispatcher = new JavaFxUiDispatcher();
        stage.show();
    }

    @Test
    void uiThreadRemainsResponsiveUnderBackgroundLoad() throws InterruptedException {
        // Start a heavy background task
        Thread heavyThread = new Thread(() -> {
            long startTime = System.currentTimeMillis();
            while (System.currentTimeMillis() - startTime < 1000) {
                // Spin wait simulating heavy CPU load
            }
        });
        heavyThread.start();

        // Measure time it takes for UI thread to process an event
        AtomicLong executeTime = new AtomicLong();
        CountDownLatch latch = new CountDownLatch(1);
        
        long submitTime = System.nanoTime();
        
        dispatcher.dispatch(() -> {
            executeTime.set(System.nanoTime());
            latch.countDown();
        });
        
        latch.await();
        
        long delayNs = executeTime.get() - submitTime;
        long delayMs = delayNs / 1_000_000;
        
        // Ensure delay is under 16ms (approx 1 frame at 60fps)
        assertThat(delayMs).isLessThan(16);
        
        heavyThread.join();
    }
}
