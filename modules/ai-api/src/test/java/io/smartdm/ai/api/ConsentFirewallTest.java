package io.smartdm.ai.api;

import org.junit.jupiter.api.Test;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ConsentFirewallTest {

    private final ConsentFirewall firewall = new ConsentFirewall();

    @Test
    void testApproveValidPayload() {
        ApprovedPayload payload = firewall.sanitizeAndApprove(
            AiTask.QUERY_PARSING,
            "videos over 100MB downloaded yesterday",
            List.of("cat-1", "cat-2"),
            "Search Query Helper"
        );

        assertNotNull(payload);
        assertEquals("videos over 100MB downloaded yesterday", payload.sanitizedPrompt());
        assertEquals(2, payload.candidateIds().size());
    }

    @Test
    void testRejectSecretApiKeyInPayload() {
        assertThrows(SecurityException.class, () -> {
            firewall.sanitizeAndApprove(
                AiTask.QUERY_PARSING,
                "my_api_key = secret123456",
                List.of(),
                "Search"
            );
        });
    }

    @Test
    void testRejectRawHashInPayload() {
        assertThrows(SecurityException.class, () -> {
            firewall.sanitizeAndApprove(
                AiTask.QUERY_PARSING,
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                List.of(),
                "Search"
            );
        });
    }

    @Test
    void testRejectSystemDirectoryPathInPayload() {
        assertThrows(SecurityException.class, () -> {
            firewall.sanitizeAndApprove(
                AiTask.QUERY_PARSING,
                "files in /etc/passwd",
                List.of(),
                "Search"
            );
        });
    }
}
