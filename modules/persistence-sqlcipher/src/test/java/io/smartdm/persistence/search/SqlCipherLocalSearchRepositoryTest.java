package io.smartdm.persistence.search;

import io.smartdm.domain.search.*;
import io.smartdm.domain.DownloadState;
import io.smartdm.persistence.SqlCipherDatabase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.EnumSet;

import static org.assertj.core.api.Assertions.assertThat;

class SqlCipherLocalSearchRepositoryTest {

    private SqlCipherDatabase database;
    private SqlCipherLocalSearchRepository repository;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        Path dbPath = tempDir.resolve("test.db");
        byte[] masterKey = new byte[32]; // Zero-filled key for tests
        database = new SqlCipherDatabase(dbPath, masterKey);
        database.migrate();
        repository = new SqlCipherLocalSearchRepository(database);
        
        insertDummyData();
    }

    private void insertDummyData() {
        try (Connection conn = database.getConnection()) {
            
            // Insert Catalog root and file
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO catalog_root (id, path, display_name, created_at) VALUES ('root-1', '/fake/root', 'Root', '2026-08-01T00:00:00Z')")) {
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO catalog_file (id, root_id, relative_path, file_name, file_extension, mime_type, file_size, created_at, modified_at) VALUES ('file-1', 'root-1', 'vacation.mp4', 'vacation.mp4', 'mp4', 'video/mp4', 100000000, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')")) {
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO catalog_file_fts (rowid, file_name, relative_path, file_extension) VALUES (1, 'vacation.mp4', 'vacation.mp4', 'mp4')")) {
                stmt.executeUpdate();
            }
            
            // Insert Download History
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO download (id, source_uri, destination_path, state, total_bytes, downloaded_bytes, created_at) VALUES ('dl-1', 'https://example.com/budget.xlsx', '/downloads/budget.xlsx', 'COMPLETED', 1500000, 1500000, '2026-08-02T12:00:00Z')")) {
                stmt.executeUpdate();
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void shouldFindVideoInCatalog() {
        LocalSearchPlan plan = new LocalSearchPlan(
            Optional.of("vacation"),
            Set.of(FileKind.VIDEO),
            Optional.empty(),
            Optional.empty(),
            Optional.empty(),
            EnumSet.noneOf(DownloadState.class),
            Optional.empty(),
            SortOrder.RELEVANCE,
            List.of()
        );
        
        List<LocalSearchResult> results = repository.executeSearch(plan, 10, 0);
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("vacation.mp4");
        assertThat(results.get(0).isDownloadHistory()).isFalse();
    }

    @Test
    void shouldFindDocumentInDownloadHistory() {
        LocalSearchPlan plan = new LocalSearchPlan(
            Optional.of("budget"),
            EnumSet.noneOf(FileKind.class),
            Optional.empty(),
            Optional.empty(),
            Optional.empty(),
            EnumSet.noneOf(DownloadState.class),
            Optional.empty(),
            SortOrder.RELEVANCE,
            List.of()
        );
        
        List<LocalSearchResult> results = repository.executeSearch(plan, 10, 0);
        
        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("/downloads/budget.xlsx");
        assertThat(results.get(0).isDownloadHistory()).isTrue();
    }

    @Test
    void shouldFindNothingForMismatch() {
        LocalSearchPlan plan = new LocalSearchPlan(
            Optional.of("nonexistent"),
            EnumSet.noneOf(FileKind.class),
            Optional.empty(),
            Optional.empty(),
            Optional.empty(),
            EnumSet.noneOf(DownloadState.class),
            Optional.empty(),
            SortOrder.RELEVANCE,
            List.of()
        );
        
        List<LocalSearchResult> results = repository.executeSearch(plan, 10, 0);
        assertThat(results).isEmpty();
    }
}
