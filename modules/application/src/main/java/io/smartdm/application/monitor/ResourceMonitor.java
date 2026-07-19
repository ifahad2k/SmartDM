package io.smartdm.application.monitor;

import java.io.File;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class ResourceMonitor {
    
    private static final long MIN_FREE_SPACE_BYTES = 500L * 1024 * 1024; // 500 MB
    
    private final Set<File> activeDestinations = new CopyOnWriteArraySet<>();
    private final Consumer<Boolean> diskPressureNotifier;
    private ScheduledExecutorService executor;
    private volatile boolean underPressure = false;

    public ResourceMonitor(Consumer<Boolean> diskPressureNotifier) {
        this.diskPressureNotifier = diskPressureNotifier;
    }
    
    public void start() {
        executor = Executors.newSingleThreadScheduledExecutor();
        executor.scheduleAtFixedRate(this::checkResources, 0, 5, TimeUnit.SECONDS);
    }
    
    public void stop() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }
    
    public void registerDestination(File directory) {
        activeDestinations.add(directory);
    }
    
    public void unregisterDestination(File directory) {
        activeDestinations.remove(directory);
    }
    
    private void checkResources() {
        boolean pressureFound = false;
        
        for (File dir : activeDestinations) {
            long usableSpace = dir.getUsableSpace();
            if (usableSpace < MIN_FREE_SPACE_BYTES) {
                pressureFound = true;
                break;
            }
        }
        
        if (pressureFound != underPressure) {
            underPressure = pressureFound;
            diskPressureNotifier.accept(underPressure);
        }
    }
    
    public boolean isUnderPressure() {
        return underPressure;
    }
}
