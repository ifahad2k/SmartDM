package io.smartdm.persistence;

import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SqlCipherCatalogRepositoryTest {

    private SqlCipherDatabase database;
    private SqlCipherCatalogRepository repository;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        Path dbPath = tempDir.resolve("test_catalog.db");
        byte[] masterKey = new byte[32];
        database = new SqlCipherDatabase(dbPath, masterKey);
        database.migrate();
        repository = new SqlCipherCatalogRepository(database);
    }

    @Test
    void shouldSaveAndQueryCatalogRootAndFiles() {
        String rootId = UUID.randomUUID().toString();
        CatalogRoot root = new CatalogRoot(rootId, "C:/Downloads", "Downloads", Instant.now(), "IDLE", null);
        repository.addRoot(root);

        List<CatalogRoot> roots = repository.getAllRoots();
        assertThat(roots).hasSize(1);
        assertThat(roots.get(0).getPath()).isEqualTo("C:/Downloads");

        String fileId = UUID.randomUUID().toString();
        CatalogFile file = new CatalogFile(
            fileId,
            rootId,
            "sub/sample.mp4",
            "sample.mp4",
            "mp4",
            "video/mp4",
            1048576L,
            Instant.now(),
            Instant.now(),
            "quickhash123",
            "fullhash456",
            "{}"
        );
        repository.saveFile(file);

        Optional<CatalogFile> loaded = repository.getFileById(fileId);
        assertThat(loaded).isPresent();
        assertThat(loaded.get().getFileName()).isEqualTo("sample.mp4");
        assertThat(loaded.get().getFileSize()).isEqualTo(1048576L);

        List<CatalogFile> bySize = repository.findFilesBySize(1048576L);
        assertThat(bySize).hasSize(1);

        List<CatalogFile> byNameAndSize = repository.findFilesByNameAndSize("sample.mp4", 1048576L);
        assertThat(byNameAndSize).hasSize(1);

        List<CatalogFile> byQuickHash = repository.findFilesByQuickHash("quickhash123");
        assertThat(byQuickHash).hasSize(1);

        List<CatalogFile> byFullHash = repository.findFilesByFullHash("fullhash456");
        assertThat(byFullHash).hasSize(1);

        repository.clearFilesForRoot(rootId);
        assertThat(repository.getFilesForRoot(rootId)).isEmpty();
    }
}
