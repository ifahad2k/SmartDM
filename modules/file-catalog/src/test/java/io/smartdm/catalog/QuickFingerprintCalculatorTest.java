package io.smartdm.catalog;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class QuickFingerprintCalculatorTest {

    @Test
    void shouldCalculateQuickHashAndFullHash(@TempDir Path tempDir) throws Exception {
        Path testFile = tempDir.resolve("sample.txt");
        Files.writeString(testFile, "SmartDM File Catalog Phase 11 Test Content!");

        String quickHash = QuickFingerprintCalculator.calculateQuickHash(testFile);
        String fullHash = QuickFingerprintCalculator.calculateFullHash(testFile);

        assertThat(quickHash).isNotNull().isNotEmpty();
        assertThat(fullHash).isNotNull().isNotEmpty();
    }
}
