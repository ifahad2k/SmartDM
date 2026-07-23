package io.smartdm.catalog;

import io.smartdm.domain.catalog.CatalogDuplicateMatch;
import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.DuplicateTier;
import io.smartdm.domain.repository.CatalogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

class DuplicateDetectorTest {

    private CatalogRepository catalogRepository;
    private DuplicateDetector duplicateDetector;

    @BeforeEach
    void setUp() {
        catalogRepository = Mockito.mock(CatalogRepository.class);
        duplicateDetector = new DuplicateDetector(catalogRepository);
    }

    @Test
    void shouldDetectExactDuplicateMatchByFullHash(@TempDir Path tempDir) throws Exception {
        Path testFile = tempDir.resolve("test.bin");
        Files.writeString(testFile, "Duplicate Content Data");

        String fullHash = QuickFingerprintCalculator.calculateFullHash(testFile);
        CatalogFile existing = new CatalogFile(
            UUID.randomUUID().toString(),
            "root1",
            "test.bin",
            "test.bin",
            "bin",
            "application/octet-stream",
            Files.size(testFile),
            Instant.now(),
            Instant.now(),
            "quickhash",
            fullHash,
            "{}"
        );

        when(catalogRepository.findFilesByFullHash(fullHash)).thenReturn(List.of(existing));

        List<CatalogDuplicateMatch> matches = duplicateDetector.findDuplicates("test.bin", testFile);
        assertThat(matches).hasSize(1);
        assertThat(matches.get(0).getTier()).isEqualTo(DuplicateTier.EXACT_MATCH);
    }
}
