package io.smartdm.application.monitor;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadState;

import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Supplier;

public class ResourceMonitor {
    
    private static final long MIN_FREE_SPACE_BYTES = 100L * 1024 * 1024; // 100 MB buffer
    
    private final Consumer<Boolean> diskPressureNotifier;
    private final Supplier<List<Download>> activeDownloadsSupplier;
    private final Path tempDir;
    private ScheduledExecutorService executor;
    private volatile boolean underPressure = false;

    public ResourceMonitor(Consumer<Boolean> diskPressureNotifier, Supplier<List<Download>> activeDownloadsSupplier, Path tempDir) {
        this.diskPressureNotifier = diskPressureNotifier;
        this.activeDownloadsSupplier = activeDownloadsSupplier;
        this.tempDir = tempDir;
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
    
    private void checkResources() {
        if (activeDownloadsSupplier == null) return;
        
        boolean pressureFound = false;
        
        List<Download> downloads = activeDownloadsSupplier.get();
        if (downloads != null) {
            Map<String, Long> remainingPerDrive = new HashMap<>();
            
            for (Download d : downloads) {
                if (d.state() == DownloadState.DOWNLOADING || d.state() == DownloadState.PROBING) {
                    long total = d.totalBytes().value();
                    long downloaded = d.downloadedBytes().value();
                    long remaining = (total > downloaded) ? (total - downloaded) : 0;
                    
                    String destPath = d.destination().value();
                    File destRoot = getRoot(new File(destPath));
                    if (destRoot != null) {
                        String key = destRoot.getAbsolutePath();
                        remainingPerDrive.put(key, remainingPerDrive.getOrDefault(key, 0L) + remaining);
                    }
                }
            }
            
            // Check temp dir as well since part files are there
            File tempRoot = getRoot(tempDir.toFile());
            if (tempRoot != null) {
                long tempUsable = tempRoot.getUsableSpace();
                long totalRemaining = remainingPerDrive.values().stream().mapToLong(Long::longValue).sum();
                if (tempUsable < totalRemaining + MIN_FREE_SPACE_BYTES) {
                    pressureFound = true;
                }
            }
            
            for (Map.Entry<String, Long> entry : remainingPerDrive.entrySet()) {
                File root = new File(entry.getKey());
                if (root.getUsableSpace() < entry.getValue() + MIN_FREE_SPACE_BYTES) {
                    pressureFound = true;
                    break;
                }
            }
        }
        
        if (pressureFound != underPressure) {
            underPressure = pressureFound;
            diskPressureNotifier.accept(underPressure);
        }
    }
    
    private File getRoot(File file) {
        if (file == null) return null;
        File current = file;
        while (current != null && current.getParentFile() != null) {
            current = current.getParentFile();
        }
        return current;
    }
    
    public boolean isUnderPressure() {
        return underPressure;
    }
}
