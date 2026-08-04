package io.smartdm.safety.rules;

import io.smartdm.safety.api.PostDownloadContext;
import io.smartdm.safety.api.PreDownloadContext;
import io.smartdm.safety.api.QuarantineRecord;
import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class LocalQuarantineManagerTest {

    private LocalQuarantineManager quarantineManager;
    private Path quarantineDir;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        quarantineDir = tempDir.resolve("quarantine");
        quarantineManager = new LocalQuarantineManager(quarantineDir);
    }

    @Test
    void testQuarantineFileSuccessfully(@TempDir Path tempDir) throws IOException {
        Path sourceFile = tempDir.resolve("suspect_file.exe");
        Files.writeString(sourceFile, "malicious payload sample content");

        PreDownloadContext preContext = new PreDownloadContext("http://example.com/suspect_file.exe", 30, "application/x-msdownload", "suspect_file.exe", List.of());
        PostDownloadContext postContext = new PostDownloadContext(sourceFile, "dummyhash123", "application/x-msdownload", "exe");
        List<SafetyEvidence> evidence = List.of(
                new SafetyEvidence("EXTENSION", "PRE_EXECUTABLE_EXTENSION", "Executable risk", RiskLevel.HIGH, "exe")
        );

        QuarantineRecord record = quarantineManager.quarantine(sourceFile, "suspect_file.exe", preContext, postContext, evidence);

        assertThat(record).isNotNull();
        assertThat(record.quarantineId()).isNotBlank();
        assertThat(record.originalFilename()).isEqualTo("suspect_file.exe");

        // Verify source file was moved out of original location
        assertThat(Files.exists(sourceFile)).isFalse();

        // Verify quarantine files exist
        assertThat(Files.exists(record.quarantinePath())).isTrue();
        Path sidecarJson = quarantineDir.resolve(record.quarantineId() + ".json");
        assertThat(Files.exists(sidecarJson)).isTrue();
    }

    @Test
    void testListAndGetQuarantineRecord(@TempDir Path tempDir) throws IOException {
        Path sourceFile = tempDir.resolve("test_doc.pdf");
        Files.writeString(sourceFile, "dummy PDF content");

        QuarantineRecord record = quarantineManager.quarantine(sourceFile, "test_doc.pdf");

        List<QuarantineRecord> list = quarantineManager.listQuarantinedFiles();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).quarantineId()).isEqualTo(record.quarantineId());

        Optional<QuarantineRecord> fetched = quarantineManager.getRecord(record.quarantineId());
        assertThat(fetched).isPresent();
        assertThat(fetched.get().originalFilename()).isEqualTo("test_doc.pdf");
    }

    @Test
    void testRestoreQuarantinedFile(@TempDir Path tempDir) throws IOException {
        Path sourceFile = tempDir.resolve("restorable.txt");
        String originalContent = "Important restored content";
        Files.writeString(sourceFile, originalContent);

        QuarantineRecord record = quarantineManager.quarantine(sourceFile, "restorable.txt");

        Path restoreDir = tempDir.resolve("restored_folder");
        boolean restored = quarantineManager.restore(record.quarantineId(), restoreDir);

        assertThat(restored).isTrue();

        Path restoredFile = restoreDir.resolve("restorable.txt");
        assertThat(Files.exists(restoredFile)).isTrue();
        assertThat(Files.readString(restoredFile)).isEqualTo(originalContent);

        // Verify quarantine sidecar and data files were removed
        assertThat(Files.exists(record.quarantinePath())).isFalse();
        assertThat(Files.exists(quarantineDir.resolve(record.quarantineId() + ".json"))).isFalse();
    }

    @Test
    void testPermanentDelete(@TempDir Path tempDir) throws IOException {
        Path sourceFile = tempDir.resolve("to_delete.bin");
        Files.writeString(sourceFile, "delete me");

        QuarantineRecord record = quarantineManager.quarantine(sourceFile, "to_delete.bin");

        boolean deleted = quarantineManager.deletePermanently(record.quarantineId());
        assertThat(deleted).isTrue();

        assertThat(Files.exists(record.quarantinePath())).isFalse();
        assertThat(Files.exists(quarantineDir.resolve(record.quarantineId() + ".json"))).isFalse();
        assertThat(quarantineManager.getRecord(record.quarantineId())).isEmpty();
    }
}
