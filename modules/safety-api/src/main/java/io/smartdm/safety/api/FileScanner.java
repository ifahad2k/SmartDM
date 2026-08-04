package io.smartdm.safety.api;

import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

public interface FileScanner {
    boolean isAvailable();

    CompletableFuture<ScanResult> scanFileAsync(Path file);

    default String getScannerName() {
        return getClass().getSimpleName();
    }
}
