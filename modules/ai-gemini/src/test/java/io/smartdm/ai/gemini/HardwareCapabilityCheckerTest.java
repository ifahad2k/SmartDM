package io.smartdm.ai.gemini;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class HardwareCapabilityCheckerTest {

    @Test
    void testCheckSystemHardwareReturnsValidStatus() {
        HardwareCapabilityChecker.HardwareStatus status = HardwareCapabilityChecker.checkSystemHardware();

        assertNotNull(status);
        assertTrue(status.cpuCores() > 0);
        assertNotNull(status.suitability());
        assertNotNull(status.summaryMessage());
        assertNotNull(status.recommendedModel());
    }
}
