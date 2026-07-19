package io.smartdm.securestorage.linux;

import io.smartdm.securestorage.KeyManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

public class SecretServiceMasterKeyStorage implements KeyManager {

    private static final Logger log = LoggerFactory.getLogger(SecretServiceMasterKeyStorage.class);
    private final Path keyFile;

    public SecretServiceMasterKeyStorage() {
        String userHome = System.getProperty("user.home");
        keyFile = Paths.get(userHome, ".config", "smartdm", "db.key");
    }

    @Override
    public Optional<byte[]> retrieveMasterKey() {
        if (Files.exists(keyFile)) {
            try {
                return Optional.of(Files.readAllBytes(keyFile));
            } catch (IOException e) {
                log.error("Failed to read master key from {}", keyFile, e);
                return Optional.empty();
            }
        }
        log.info("Linux master key not found at {}. A new one will be generated.", keyFile);
        return Optional.empty();
    }

    @Override
    public void storeMasterKey(byte[] key) {
        try {
            Files.createDirectories(keyFile.getParent());
            Files.write(keyFile, key);
            try {
                Set<PosixFilePermission> perms = EnumSet.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE
                );
                Files.setPosixFilePermissions(keyFile, perms);
            } catch (UnsupportedOperationException e) {
                log.warn("POSIX permissions not supported on this filesystem.");
            }
            log.info("Master key stored at {}", keyFile);
        } catch (IOException e) {
            throw new RuntimeException("Failed to store master key", e);
        }
    }

    @Override
    public void deleteMasterKey() {
        try {
            Files.deleteIfExists(keyFile);
            log.info("Master key deleted from {}", keyFile);
        } catch (IOException e) {
            log.error("Failed to delete master key from {}", keyFile, e);
        }
    }
}
