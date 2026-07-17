package io.smartdm.persistence;

import org.flywaydb.core.Flyway;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Base64;
import java.util.Properties;

public class SqlCipherDatabase {

    private final String url;
    private final byte[] key;
    private final SQLiteDataSource dataSource;

    public SqlCipherDatabase(Path dbFile, byte[] key) {
        this.url = "jdbc:sqlite:" + dbFile.toAbsolutePath();
        this.key = key;
        
        SQLiteConfig config = new SQLiteConfig();
        
        // Pass the key to the Willena SQLCipher JDBC driver
        String encodedKey = Base64.getEncoder().encodeToString(key);
        config.setPragma(SQLiteConfig.Pragma.PASSWORD, encodedKey);
        
        this.dataSource = new SQLiteDataSource(config);
        this.dataSource.setUrl(url);
    }

    public void migrate() {
        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load();
        flyway.migrate();
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }
}
