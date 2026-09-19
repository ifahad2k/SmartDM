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

    /**
     * Pre-allocates disk storage for the file up to totalSize.
     * Uses native Windows Win32 instant allocation when running on Windows,
     * falling back to channel position allocation on other platforms.
     * Prevents NTFS/ext4 fragmentation and file expansion stalls during multi-stream downloads.
     */
    public void preallocate(long totalSize) {
        if (totalSize <= 0) return;
        try {
            if (channel != null && channel.isOpen() && channel.size() < totalSize) {
                boolean nativeAllocated = false;
                if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
                    nativeAllocated = WindowsFilePreallocator.tryPreallocate(tempFile, totalSize);
                }
                if (!nativeAllocated) {
                    ByteBuffer zeroBuf = ByteBuffer.allocate(1);
                    zeroBuf.put((byte) 0);
                    zeroBuf.flip();
                    channel.write(zeroBuf, totalSize - 1);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Writes direct or heap ByteBuffer at the specified offset.
     */
    public void writeAt(long offset, ByteBuffer buffer) throws IOException {
        long currentOffset = offset;
        while (buffer.hasRemaining()) {
            int written = channel.write(buffer, currentOffset);
            currentOffset += written;
        }
    }

    /**
     * Writes data at the specified offset. Thread-safe for positional writes
     * on standard JVM implementations (FileChannel.write(buf, pos) is atomic
     * for non-overlapping regions).
     */
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
        Path targetParent = finalDestination.value().getParent();
        if (targetParent != null && !Files.exists(targetParent)) {
            Files.createDirectories(targetParent);
        }
        int maxAttempts = 5;
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                try {
                    Files.move(tempFile, finalDestination.value(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                    Files.copy(tempFile, finalDestination.value(), StandardCopyOption.REPLACE_EXISTING);
                    Files.deleteIfExists(tempFile);
                }
                return;
            } catch (IOException e) {
                if (attempt == maxAttempts - 1) {
                    throw e;
                }
                try {
                    Thread.sleep(100L * (attempt + 1));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
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
