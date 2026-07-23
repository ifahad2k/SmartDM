package io.smartdm.persistence.sqlcipher;

import io.smartdm.persistence.SqlCipherDatabase;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseLeakageTest {

    @TempDir
    Path tempDir;

    @Test
    void databaseFileShouldBeEncryptedOnDiskAndNotLeakPlaintext() throws Exception {
        File dbFile = tempDir.resolve("test_encrypted.db").toFile();
        
        byte[] masterKey = "my_super_secret_master_key_12345".getBytes();
        SqlCipherDatabase db = new SqlCipherDatabase(dbFile.toPath(), masterKey);
        
        String sensitiveData = "SUPER_SECRET_PAYLOAD_123456789";

        try (Connection conn = db.getConnection();
             Statement stmt = conn.createStatement()) {
            
            stmt.execute("CREATE TABLE secrets (id INTEGER PRIMARY KEY, payload TEXT)");
            stmt.execute("INSERT INTO secrets (payload) VALUES ('" + sensitiveData + "')");
        }

        assertThat(dbFile).exists();
        
        // Read raw bytes from the SQLite file
        String rawFileContent = new String(Files.readAllBytes(dbFile.toPath()));

        // Assert that the sensitive data does NOT appear in the raw bytes
        assertThat(rawFileContent)
                .as("The database file must be encrypted and should not contain plaintext data")
                .doesNotContain(sensitiveData);
        
        // Assert that SQLite header is scrambled (SQLCipher doesn't start with "SQLite format 3")
        assertThat(rawFileContent).doesNotStartWith("SQLite format 3");
    }
}
