package io.smartdm.persistence;

import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.SourceUri;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class SqlCipherDownloadRepositoryTest {

    private SqlCipherDatabase database;
    private SqlCipherDownloadRepository repository;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        Path dbPath = tempDir.resolve("test.db");
        byte[] masterKey = new byte[32]; // Zero-filled key for tests
        database = new SqlCipherDatabase(dbPath, masterKey);
        database.migrate();
        repository = new SqlCipherDownloadRepository(database);
    }

    @Test
    void shouldSaveAndLoadDownloadWithSegments(@TempDir Path tempDir) {
        DownloadId id = DownloadId.generate();
        Download download = new Download(id, SourceUri.of("https://example.com/file.zip"), Destination.of(tempDir.resolve("file.zip").toAbsolutePath().toString()));
        download.updateState(DownloadState.DOWNLOADING);
        
        List<DownloadSegment> segments = List.of(
            new DownloadSegment(0, 0, 100, 499),
            new DownloadSegment(1, 500, 600, 999),
            new DownloadSegment(2, 1000, 1000, 1499)
        );
        download.updateSegments(segments);

        repository.save(download);

        Optional<Download> retrievedOpt = repository.findById(id);
        assertThat(retrievedOpt).isPresent();
        Download retrieved = retrievedOpt.get();
        
        assertThat(retrieved.state()).isEqualTo(DownloadState.DOWNLOADING);
        assertThat(retrieved.segments()).hasSize(3);
        
        DownloadSegment seg0 = retrieved.segments().get(0);
        assertThat(seg0.index()).isEqualTo(0);
        assertThat(seg0.startOffset()).isEqualTo(0);
        assertThat(seg0.currentOffset()).isEqualTo(100);
        assertThat(seg0.endOffset()).isEqualTo(499);
        
        DownloadSegment seg2 = retrieved.segments().get(2);
        assertThat(seg2.index()).isEqualTo(2);
        assertThat(seg2.startOffset()).isEqualTo(1000);
        assertThat(seg2.currentOffset()).isEqualTo(1000);
        assertThat(seg2.endOffset()).isEqualTo(1499);
        
        // Test update
        seg0.updateOffset(250);
        repository.save(retrieved);
        
        retrieved = repository.findById(id).orElseThrow();
        assertThat(retrieved.segments().get(0).currentOffset()).isEqualTo(250);
    }

    @Test
    void shouldDeleteDownloadAndCascadeSegments(@TempDir Path tempDir) throws Exception {
        DownloadId id = DownloadId.generate();
        Download download = new Download(id, SourceUri.of("https://example.com/file.zip"), Destination.of(tempDir.resolve("file.zip").toAbsolutePath().toString()));
        download.updateSegments(List.of(
            new DownloadSegment(0, 0, 10, 99)
        ));

        repository.save(download);
        assertThat(repository.findById(id)).isPresent();

        repository.delete(id);
        assertThat(repository.findById(id)).isEmpty();

        // Verify segment was deleted too from database via direct query
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT count(*) FROM download_segment WHERE download_id = ?")) {
            stmt.setString(1, id.value());
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    assertThat(rs.getInt(1)).isEqualTo(0);
                }
            }
        }
    }
}
