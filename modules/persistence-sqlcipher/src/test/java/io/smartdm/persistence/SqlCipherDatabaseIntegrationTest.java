package io.smartdm.persistence;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SqlCipherDatabaseIntegrationTest {

    @Test
    void shouldEncryptDatabaseAndLeakNoPlaintext(@TempDir Path tempDir) throws Exception {
        Path dbPath = tempDir.resolve("test.db");
        byte[] masterKey = new byte[32]; // 32 zero bytes for test
        
        SqlCipherDatabase db = new SqlCipherDatabase(dbPath, masterKey);
        db.migrate(); // creates schema
        
        // Write some very sensitive data
        String sensitiveData = UUID.randomUUID().toString() + "_SUPER_SECRET_URL_DO_NOT_LEAK";
        try (Connection conn = db.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.executeUpdate("INSERT INTO app_setting (key, value) VALUES ('test_key', '" + sensitiveData + "')");
        }
        
        // Force SQLite to write to disk
        db.getConnection().close();

        // 1. Verify the DB file exists
        assertThat(Files.exists(dbPath)).isTrue();
        
        // 2. Read raw bytes of the DB file
        byte[] rawDbBytes = Files.readAllBytes(dbPath);
        String rawDbString = new String(rawDbBytes);
        
        // 3. ASSERTION: The sensitive data MUST NOT exist in plaintext anywhere in the file!
        assertThat(rawDbString).doesNotContain("SUPER_SECRET_URL_DO_NOT_LEAK");
        assertThat(rawDbString).doesNotContain("app_setting");
        
        // Ensure SQLCipher signature is present (first 16 bytes of salt, SQLite header is absent)
        assertThat(rawDbString).doesNotContain("SQLite format 3");
    }
}
