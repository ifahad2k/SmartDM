package io.smartdm.securestorage.linux;

import io.smartdm.securestorage.KeyManager;
import io.smartdm.securestorage.fallback.Argon2MasterPasswordFallback;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Console;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

public class SecretServiceMasterKeyStorage implements KeyManager {

    private static final Logger log = LoggerFactory.getLogger(SecretServiceMasterKeyStorage.class);
    private final Argon2MasterPasswordFallback argon2Fallback = new Argon2MasterPasswordFallback();
    private static final String APP_LABEL = "smartdm";
    private static final String APP_ATTRIBUTE = "app";

    private boolean isSecretToolAvailable() {
        try {
            Process p = new ProcessBuilder("secret-tool", "--version").start();
            return p.waitFor(2, TimeUnit.SECONDS) && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public Optional<byte[]> retrieveMasterKey() {
        if (isSecretToolAvailable()) {
            try {
                ProcessBuilder pb = new ProcessBuilder("secret-tool", "lookup", APP_ATTRIBUTE, APP_LABEL);
                Process p = pb.start();
                
                byte[] key = p.getInputStream().readAllBytes();
                boolean finished = p.waitFor(5, TimeUnit.SECONDS);
                
                if (!finished) {
                    p.destroyForcibly();
                    throw new RuntimeException("secret-tool lookup timed out");
                }
                
                if (p.exitValue() == 0 && key.length > 0) {
                    return Optional.of(key);
                }
            } catch (Exception e) {
                log.warn("Failed to retrieve key via secret-tool", e);
            }
        } else {
            log.warn("secret-tool not available, falling back to manual master password.");
        }
        
        return promptManualFallback();
    }

    @Override
    public void storeMasterKey(byte[] key) {
        if (isSecretToolAvailable()) {
            try {
                ProcessBuilder pb = new ProcessBuilder("secret-tool", "store", "--label=SmartDM Master Key", APP_ATTRIBUTE, APP_LABEL);
                Process p = pb.start();
                
                try (OutputStream os = p.getOutputStream()) {
                    os.write(key);
                    os.flush();
                }
                
                boolean finished = p.waitFor(5, TimeUnit.SECONDS);
                if (!finished) {
                    p.destroyForcibly();
                    throw new RuntimeException("secret-tool store timed out");
                }
                
                if (p.exitValue() == 0) {
                    log.info("Master key stored securely via secret-tool");
                    return;
                } else {
                    log.warn("secret-tool store failed with exit code: {}", p.exitValue());
                }
            } catch (Exception e) {
                log.warn("Failed to store key via secret-tool", e);
            }
        }
        
        // If we reach here, we must fail closed. We DO NOT fallback to a plaintext file on disk.
        log.error("Failed to store master key securely. Aborting to prevent plaintext leakage.");
        throw new IllegalStateException("Secure storage unavailable. Cannot store master key.");
    }

    @Override
    public void deleteMasterKey() {
        if (isSecretToolAvailable()) {
            try {
                ProcessBuilder pb = new ProcessBuilder("secret-tool", "clear", APP_ATTRIBUTE, APP_LABEL);
                Process p = pb.start();
                boolean finished = p.waitFor(5, TimeUnit.SECONDS);
                if (!finished) {
                    p.destroyForcibly();
                }
            } catch (Exception e) {
                log.warn("Failed to clear key via secret-tool", e);
            }
        }
    }

    private Optional<byte[]> promptManualFallback() {
        // Fallback asking the user for a master password via CLI if available
        // Note: JavaFX UI should ideally catch the failure and show a dialog,
        // but for safety, we provide an Argon2 console fallback if run from terminal.
        Console console = System.console();
        if (console == null) {
            log.error("Secret Service unavailable and no console attached for password fallback.");
            throw new IllegalStateException("Cannot retrieve master key: Secret Service unavailable and no console for fallback.");
        }
        
        char[] password = console.readPassword("Enter SmartDM Master Password (fallback): ");
        if (password == null || password.length == 0) {
            throw new IllegalStateException("User declined master password fallback.");
        }
        
        byte[] salt = "SmartDMSalt12345".getBytes(StandardCharsets.UTF_8); // Using a fixed deterministic salt for this phase
        byte[] derivedKey = argon2Fallback.deriveKey(new String(password), salt);
        java.util.Arrays.fill(password, ' '); // wipe
        
        return Optional.of(derivedKey);
    }
}
