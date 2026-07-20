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

    private boolean isSecretToolAvailable() {
        try {
            Process p = new ProcessBuilder("secret-tool", "--version").start();
            return p.waitFor() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public Optional<byte[]> retrieveMasterKey() {
        if (isSecretToolAvailable()) {
            try {
                Process p = new ProcessBuilder("secret-tool", "lookup", "app", "smartdm").start();
                byte[] key = p.getInputStream().readAllBytes();
                if (p.waitFor() == 0 && key.length > 0) {
                    return Optional.of(key);
                }
            } catch (Exception e) {
                log.warn("Failed to retrieve key via secret-tool", e);
            }
        }
        
        // Fallback or read from file
        if (Files.exists(keyFile)) {
            try {
                byte[] bytes = Files.readAllBytes(keyFile);
                if (bytes.length > 0) return Optional.of(bytes);
            } catch (IOException e) {
                log.error("Failed to read master key from {}", keyFile, e);
                throw new RuntimeException("Failed to read existing master key", e);
            }
        }
        log.info("Linux master key not found. A new one will be generated.");
        return Optional.empty();
    }

    @Override
    public void storeMasterKey(byte[] key) {
        if (isSecretToolAvailable()) {
            try {
                Process p = new ProcessBuilder("secret-tool", "store", "--label=SmartDM Master Key", "app", "smartdm").start();
                p.getOutputStream().write(key);
                p.getOutputStream().close();
                if (p.waitFor() == 0) {
                    log.info("Master key stored via secret-tool");
                    return;
                }
            } catch (Exception e) {
                log.warn("Failed to store key via secret-tool", e);
            }
        }
        
        // Fallback
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
        if (isSecretToolAvailable()) {
            try {
                new ProcessBuilder("secret-tool", "clear", "app", "smartdm").start().waitFor();
            } catch (Exception e) {
                log.warn("Failed to clear key via secret-tool", e);
            }
        }
        try {
            Files.deleteIfExists(keyFile);
            log.info("Master key deleted from {}", keyFile);
        } catch (IOException e) {
            log.error("Failed to delete master key from {}", keyFile, e);
        }
    }
}
