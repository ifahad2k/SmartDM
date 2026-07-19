package io.smartdm.application;

import io.smartdm.platform.PlatformDirectories;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class ProfileLock implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(ProfileLock.class);
    private static final String LOCK_FILE_NAME = "profile.lock";

    private final Path lockFilePath;
    private FileChannel fileChannel;
    private FileLock fileLock;
    private boolean acquired = false;

    public ProfileLock(PlatformDirectories platformDirectories) {
        this.lockFilePath = platformDirectories.getAppDataDirectory().resolve(LOCK_FILE_NAME);
    }

    public boolean tryAcquire() {
        if (acquired) return true;
        
        try {
            Files.createDirectories(lockFilePath.getParent());
            fileChannel = FileChannel.open(lockFilePath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            fileLock = fileChannel.tryLock();
            
            if (fileLock == null) {
                log.warn("Another instance is already running and holds the profile lock.");
                closeChannelSilently();
                return false;
            }
            
            acquired = true;
            log.info("Profile lock acquired successfully.");
            return true;
        } catch (OverlappingFileLockException e) {
            log.warn("Another thread in this instance already holds the profile lock.");
            closeChannelSilently();
            return false;
        } catch (IOException e) {
            log.error("Failed to acquire profile lock due to an IO error.", e);
            closeChannelSilently();
            return false;
        }
    }

    private void closeChannelSilently() {
        if (fileChannel != null) {
            try {
                fileChannel.close();
            } catch (IOException ignored) {}
            fileChannel = null;
        }
    }

    @Override
    public void close() {
        if (!acquired) {
            return;
        }
        try {
            if (fileLock != null) {
                fileLock.release();
            }
            if (fileChannel != null) {
                fileChannel.close();
            }
            log.info("Profile lock released.");
        } catch (IOException e) {
            log.error("Error releasing profile lock.", e);
        } finally {
            acquired = false;
            fileLock = null;
            fileChannel = null;
        }
    }
}
