package io.smartdm.securestorage.linux;

import io.smartdm.securestorage.KeyManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Optional;

public class SecretServiceMasterKeyStorage implements KeyManager {

    private static final Logger log = LoggerFactory.getLogger(SecretServiceMasterKeyStorage.class);

    @Override
    public Optional<byte[]> retrieveMasterKey() {
        log.warn("Linux Secret Service integration is a stub in this phase. Falling back to master password.");
        return Optional.empty();
    }

    @Override
    public void storeMasterKey(byte[] key) {
        log.warn("Cannot store key in Linux Secret Service (stub)");
    }

    @Override
    public void deleteMasterKey() {
        log.warn("Cannot delete key from Linux Secret Service (stub)");
    }
}
