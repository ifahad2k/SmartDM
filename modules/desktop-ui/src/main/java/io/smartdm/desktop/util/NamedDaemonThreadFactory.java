package io.smartdm.desktop.util;

import java.util.Objects;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

public final class NamedDaemonThreadFactory implements ThreadFactory {

    private final String prefix;
    private final AtomicInteger counter = new AtomicInteger(1);

    public NamedDaemonThreadFactory(String prefix) {
        this.prefix = Objects.requireNonNull(prefix);
    }

    @Override
    public Thread newThread(Runnable runnable) {
        Thread thread = new Thread(runnable);
        thread.setName(prefix + "-" + counter.getAndIncrement());
        thread.setDaemon(true);
        return thread;
    }
}
