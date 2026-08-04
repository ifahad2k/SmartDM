package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class ArchiveStructureInspectorTest {

    private ArchiveStructureInspector inspector;

    @BeforeEach
    void setUp() {
        inspector = new ArchiveStructureInspector();
    }

    @Test
    void testPathTraversalDetectionInZip(@TempDir Path tempDir) throws IOException {
        Path zipFile = tempDir.resolve("malicious.zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            ZipEntry entry = new ZipEntry("../../../etc/passwd");
            zos.putNextEntry(entry);
            zos.write("root:x:0:0".getBytes());
            zos.closeEntry();
        }

        List<SafetyEvidence> evidence = inspector.inspectArchive(zipFile);
        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("ARCHIVE_PATH_TRAVERSAL");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.CRITICAL);
        });
    }

    @Test
    void testExcessiveEntryCountLimit(@TempDir Path tempDir) throws IOException {
        ArchiveStructureInspector strictInspector = new ArchiveStructureInspector(5, 100.0, 10);
        Path zipFile = tempDir.resolve("many_files.zip");

        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            for (int i = 0; i < 10; i++) {
                ZipEntry entry = new ZipEntry("file_" + i + ".txt");
                zos.putNextEntry(entry);
                zos.write("content".getBytes());
                zos.closeEntry();
            }
        }

        List<SafetyEvidence> evidence = strictInspector.inspectArchive(zipFile);
        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("ARCHIVE_EXCESSIVE_ENTRIES");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.HIGH);
        });
    }

    @Test
    void testExcessiveNestingDepth(@TempDir Path tempDir) throws IOException {
        ArchiveStructureInspector strictInspector = new ArchiveStructureInspector(100, 100.0, 3);
        Path zipFile = tempDir.resolve("deep.zip");

        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            ZipEntry entry = new ZipEntry("level1/level2/level3/level4/level5/deepfile.txt");
            zos.putNextEntry(entry);
            zos.write("deep".getBytes());
            zos.closeEntry();
        }

        List<SafetyEvidence> evidence = strictInspector.inspectArchive(zipFile);
        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("ARCHIVE_NESTING_DEPTH");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.MEDIUM);
        });
    }

    @Test
    void testCleanZipArchive(@TempDir Path tempDir) throws IOException {
        Path zipFile = tempDir.resolve("clean.zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            ZipEntry entry1 = new ZipEntry("doc1.txt");
            zos.putNextEntry(entry1);
            zos.write("Hello World".getBytes());
            zos.closeEntry();

            ZipEntry entry2 = new ZipEntry("images/photo.png");
            zos.putNextEntry(entry2);
            zos.write("PNG bytes".getBytes());
            zos.closeEntry();
        }

        List<SafetyEvidence> evidence = inspector.inspectArchive(zipFile);
        assertThat(evidence).isEmpty();
    }
}
