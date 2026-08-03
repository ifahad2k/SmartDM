package io.smartdm.ai.api;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Token to request cancellation of asynchronous AI tasks.
 */
public final class CancellationToken {
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public void cancel() {
        cancelled.set(true);
    }

    public boolean isCancelled() {
        return cancelled.get();
    }
}
