package io.smartdm.download.engine;

import io.smartdm.domain.Destination;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

public class SegmentedFileChannel implements AutoCloseable {
    private final Path tempFile;
    private final Destination finalDestination;
    private final FileChannel channel;

    public SegmentedFileChannel(Destination finalDestination, Path tempDir, String partFileName) throws IOException {
        this.finalDestination = finalDestination;
        if (!Files.exists(tempDir)) {
            Files.createDirectories(tempDir);
        }
        this.tempFile = tempDir.resolve(partFileName);
        this.channel = FileChannel.open(tempFile, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.READ);
    }

    public void writeAt(long offset, byte[] data, int length) throws IOException {
        ByteBuffer buffer = ByteBuffer.wrap(data, 0, length);
        long currentOffset = offset;
        while (buffer.hasRemaining()) {
            int written = channel.write(buffer, currentOffset);
            currentOffset += written;
        }
    }

    public void commit() throws IOException {
        close();
        Path destPath = Path.of(finalDestination.value());
        Path targetParent = destPath.getParent();
        if (targetParent != null && !Files.exists(targetParent)) {
            Files.createDirectories(targetParent);
        }
        try {
            Files.move(tempFile, destPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.copy(tempFile, destPath, StandardCopyOption.REPLACE_EXISTING);
            Files.deleteIfExists(tempFile);
        }
    }

    public void cleanup() {
        try {
            close();
        } catch (Exception ignored) {}
        try {
            Files.deleteIfExists(tempFile);
        } catch (IOException ignored) {}
    }

    public Path getTempFile() {
        return tempFile;
    }

    public void truncate(long size) throws IOException {
        if (channel != null && channel.isOpen()) {
            channel.truncate(size);
        }
    }

    public void force(boolean metaData) throws IOException {
        if (channel != null && channel.isOpen()) {
            channel.force(metaData);
        }
    }

    @Override
    public void close() throws IOException {
        if (channel != null && channel.isOpen()) {
            channel.close();
        }
    }
}
