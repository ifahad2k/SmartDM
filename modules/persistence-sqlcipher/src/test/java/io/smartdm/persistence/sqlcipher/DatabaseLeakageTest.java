package io.smartdm.persistence.sqlcipher;

import io.smartdm.persistence.SqlCipherDatabase;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DatabaseLeakageTest {

    @TempDir
    Path tempDir;

    @Test
    void databaseAndAuxiliaryFilesShouldBeEncryptedOnDiskAndNotLeakPlaintext() throws Exception {
        File dbFile = tempDir.resolve("test_encrypted.db").toFile();
        
        byte[] masterKey = "my_super_secret_master_key_12345".getBytes();
        SqlCipherDatabase db = new SqlCipherDatabase(dbFile.toPath(), masterKey);
        
        String urlSentinel = "https://very-secret-url.com/download?token=abcdef";
        String pathSentinel = "C:\\Users\\SecretUser\\Downloads\\private.mp4";
        String tokenSentinel = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret";
        
        List<String> sentinels = List.of(urlSentinel, pathSentinel, tokenSentinel);

        try (Connection conn = db.getConnection();
             Statement stmt = conn.createStatement()) {
            
            stmt.execute("CREATE TABLE secrets (id INTEGER PRIMARY KEY, payload TEXT)");
            stmt.execute("INSERT INTO secrets (payload) VALUES ('" + urlSentinel + "')");
            stmt.execute("INSERT INTO secrets (payload) VALUES ('" + pathSentinel + "')");
            stmt.execute("INSERT INTO secrets (payload) VALUES ('" + tokenSentinel + "')");
        }

        assertThat(dbFile).exists();
        
        // Test all possible SQLite files including auxiliary files
        String baseName = dbFile.getName();
        File[] allFiles = tempDir.toFile().listFiles((dir, name) -> name.startsWith(baseName));
        assertThat(allFiles).isNotEmpty();
        
        byte[] sqliteHeaderBytes = "SQLite format 3".getBytes();
        
        for (File file : allFiles) {
            byte[] rawBytes = Files.readAllBytes(file.toPath());
            
            // Search raw bytes for sentinels
            for (String sentinel : sentinels) {
                assertThat(containsBytes(rawBytes, sentinel.getBytes()))
                    .as("File %s must not leak plaintext sentinel %s", file.getName(), sentinel)
                    .isFalse();
            }
            
            // Assert that SQLite header is not in plaintext
            assertThat(containsBytes(rawBytes, sqliteHeaderBytes))
                .as("File %s must not have plaintext SQLite header", file.getName())
                .isFalse();
        }
        
        // Reopen test with correct key
        SqlCipherDatabase dbReopen = new SqlCipherDatabase(dbFile.toPath(), masterKey);
        try (Connection conn = dbReopen.getConnection();
             Statement stmt = conn.createStatement();
             var rs = stmt.executeQuery("SELECT payload FROM secrets")) {
            assertThat(rs.next()).isTrue();
        }
        
        // Reopen test with wrong key
        byte[] wrongKey = "wrong_master_key_1234567890".getBytes();
        SqlCipherDatabase dbWrong = new SqlCipherDatabase(dbFile.toPath(), wrongKey);
        assertThatThrownBy(() -> {
            try (Connection conn = dbWrong.getConnection();
                 Statement stmt = conn.createStatement();
                 var rs = stmt.executeQuery("SELECT payload FROM secrets")) {
                rs.next();
            }
        }).isInstanceOf(java.sql.SQLException.class)
          .hasMessageContaining("file is not a database");
    }
    
    private boolean containsBytes(byte[] source, byte[] target) {
        if (target.length == 0) return true;
        for (int i = 0; i < source.length - target.length + 1; i++) {
            boolean match = true;
            for (int j = 0; j < target.length; j++) {
                if (source[i + j] != target[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }
}
