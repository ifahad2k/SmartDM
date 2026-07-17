package io.smartdm.securestorage;

import java.util.Optional;

/**
 * Manages the generation, storage, and retrieval of the master database encryption key.
 */
public interface KeyManager {
    
    /**
     * @return The master key if it exists, otherwise empty.
     */
    Optional<byte[]> retrieveMasterKey();

    /**
     * Stores the generated master key securely.
     * @param key The 256-bit AES master key for SQLCipher.
     */
    void storeMasterKey(byte[] key);
    
    /**
     * Removes the master key from secure storage.
     */
    void deleteMasterKey();
}
