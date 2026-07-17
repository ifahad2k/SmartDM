package io.smartdm.securestorage.windows;

import io.smartdm.securestorage.KeyManager;
import com.sun.jna.platform.win32.Crypt32Util;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

public class DpapiMasterKeyStorage implements KeyManager {
    
    private static final Logger log = LoggerFactory.getLogger(DpapiMasterKeyStorage.class);
    private final Path keyFilePath;
    
    public DpapiMasterKeyStorage() {
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData == null || localAppData.isEmpty()) {
            localAppData = System.getProperty("user.home") + "\\AppData\\Local";
        }
        this.keyFilePath = Paths.get(localAppData, "SmartDM", "Data", "master.key");
    }

    @Override
    public Optional<byte[]> retrieveMasterKey() {
        if (!Files.exists(keyFilePath)) {
            return Optional.empty();
        }
        try {
            byte[] encryptedKey = Files.readAllBytes(keyFilePath);
            byte[] decryptedKey = Crypt32Util.cryptUnprotectData(encryptedKey);
            return Optional.of(decryptedKey);
        } catch (Exception e) {
            log.error("Failed to unprotect master key using DPAPI", e);
            return Optional.empty();
        }
    }

    @Override
    public void storeMasterKey(byte[] key) {
        try {
            Files.createDirectories(keyFilePath.getParent());
            byte[] encryptedKey = Crypt32Util.cryptProtectData(key);
            Files.write(keyFilePath, encryptedKey);
        } catch (Exception e) {
            log.error("Failed to protect and store master key using DPAPI", e);
            throw new RuntimeException("Failed to store master key", e);
        }
    }

    @Override
    public void deleteMasterKey() {
        try {
            Files.deleteIfExists(keyFilePath);
        } catch (IOException e) {
            log.error("Failed to delete master key file", e);
        }
    }
}
