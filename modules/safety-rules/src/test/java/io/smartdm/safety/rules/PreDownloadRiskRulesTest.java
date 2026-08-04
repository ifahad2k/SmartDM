package io.smartdm.safety.rules;

import io.smartdm.safety.api.PreDownloadContext;
import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PreDownloadRiskRulesTest {

    private PreDownloadRiskRules rules;

    @BeforeEach
    void setUp() {
        rules = new PreDownloadRiskRules();
    }

    @Test
    void testInsecureHttpUrlProducesEvidence() {
        PreDownloadContext context = new PreDownloadContext("http://example.com/file.zip", 1024, "application/zip", "file.zip", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("PRE_HTTP_INSECURE");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.MEDIUM);
        });
    }

    @Test
    void testHttpsUrlDoesNotProduceInsecureEvidence() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/file.zip", 1024, "application/zip", "file.zip", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).noneMatch(e -> e.ruleId().equals("PRE_HTTP_INSECURE"));
    }

    @Test
    void testExecutableExtensions() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/setup.exe", 2048, "application/x-msdownload", "setup.exe", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("PRE_EXECUTABLE_EXTENSION");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.HIGH);
        });
    }

    @Test
    void testDoubleExtensionSpoofing() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/invoice.pdf.exe", 2048, "application/octet-stream", "invoice.pdf.exe", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("PRE_DOUBLE_EXTENSION");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.CRITICAL);
        });
    }

    @Test
    void testControlCharactersInFilename() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/test.txt", 1024, "text/plain", "doc\u202Eexe.pdf", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("PRE_CONTROL_CHARACTERS");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.CRITICAL);
        });
    }

    @Test
    void testMimeTypeMismatch() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/image.png", 1024, "image/png", "malware.exe", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).anySatisfy(e -> {
            assertThat(e.ruleId()).isEqualTo("PRE_MIME_EXTENSION_MISMATCH");
            assertThat(e.riskLevel()).isEqualTo(RiskLevel.HIGH);
        });
    }

    @Test
    void testCleanPreDownloadContext() {
        PreDownloadContext context = new PreDownloadContext("https://example.com/photo.png", 5000, "image/png", "photo.png", List.of());
        List<SafetyEvidence> evidence = rules.evaluate(context);

        assertThat(evidence).isEmpty();
    }
}
