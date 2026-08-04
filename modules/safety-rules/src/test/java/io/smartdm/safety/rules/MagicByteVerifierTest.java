package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MagicByteVerifierTest {

    private MagicByteVerifier verifier;

    @BeforeEach
    void setUp() {
        verifier = new MagicByteVerifier();
    }

    @Test
    void testValidPngHeader() {
        byte[] pngHeader = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0};
        List<SafetyEvidence> evidence = verifier.verify(pngHeader, "png");
        assertThat(evidence).isEmpty();
    }

    @Test
    void testExecutableHeaderDisguisedAsPdf() {
        byte[] peHeader = new byte[]{0x4D, 0x5A, (byte) 0x90, 0, 3, 0, 0, 0}; // MZ header
        List<SafetyEvidence> evidence = verifier.verify(peHeader, "pdf");

        assertThat(evidence).hasSize(1);
        assertThat(evidence.get(0).ruleId()).isEqualTo("MAGIC_BYTE_MISMATCH_EXECUTABLE");
        assertThat(evidence.get(0).riskLevel()).isEqualTo(RiskLevel.CRITICAL);
    }

    @Test
    void testElfHeaderDisguisedAsPng() {
        byte[] elfHeader = new byte[]{0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0}; // \x7fELF header
        List<SafetyEvidence> evidence = verifier.verify(elfHeader, "png");

        assertThat(evidence).hasSize(1);
        assertThat(evidence.get(0).ruleId()).isEqualTo("MAGIC_BYTE_MISMATCH_EXECUTABLE");
        assertThat(evidence.get(0).riskLevel()).isEqualTo(RiskLevel.CRITICAL);
    }

    @Test
    void testMismatchedHeaderForDeclaredPng() {
        byte[] dummyBytes = new byte[]{1, 2, 3, 4, 5, 6, 7, 8};
        List<SafetyEvidence> evidence = verifier.verify(dummyBytes, "png");

        assertThat(evidence).hasSize(1);
        assertThat(evidence.get(0).ruleId()).isEqualTo("MAGIC_BYTE_MISMATCH");
        assertThat(evidence.get(0).riskLevel()).isEqualTo(RiskLevel.HIGH);
    }

    @Test
    void testFileVerificationFromFilePath(@TempDir Path tempDir) throws IOException {
        Path fakeFile = tempDir.resolve("fake_document.pdf");
        byte[] peHeader = new byte[]{0x4D, 0x5A, 0x00, 0x00, 0x00};
        Files.write(fakeFile, peHeader);

        List<SafetyEvidence> evidence = verifier.verify(fakeFile, "pdf");
        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("MAGIC_BYTE_MISMATCH_EXECUTABLE");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.CRITICAL);
        });
    }
}
