package io.smartdm.download.engine;

import io.smartdm.domain.Destination;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.function.Consumer;

public class ManagedFileStream {
    private final Path tempFile;
    private final Destination finalDestination;

    public ManagedFileStream(Destination finalDestination, Path tempDir) throws IOException {
        this.finalDestination = finalDestination;
        if (!Files.exists(tempDir)) {
            Files.createDirectories(tempDir);
        }
        this.tempFile = tempDir.resolve(UUID.randomUUID().toString() + ".part");
    }

    public void writeFrom(InputStream inputStream, Consumer<Long> progressCallback) throws IOException {
        try (OutputStream out = Files.newOutputStream(tempFile, StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            byte[] buffer = new byte[8192];
            int read;
            long totalRead = 0;
            while ((read = inputStream.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                totalRead += read;
                if (progressCallback != null) {
                    progressCallback.accept(totalRead);
                }
            }
        }
    }

    public void commit() throws IOException {
        Path targetParent = finalDestination.value().getParent();
        if (targetParent != null && !Files.exists(targetParent)) {
            Files.createDirectories(targetParent);
        }
        Files.move(tempFile, finalDestination.value(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    public void cleanup() {
        try {
            Files.deleteIfExists(tempFile);
        } catch (IOException ignored) {
        }
    }
}
