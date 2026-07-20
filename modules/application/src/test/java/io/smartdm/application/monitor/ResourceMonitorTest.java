package io.smartdm.application.monitor;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.SourceUri;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ResourceMonitorTest {

    @TempDir
    Path tempDir;

    @Test
    void testNoPressure() {
        AtomicBoolean pressureFound = new AtomicBoolean(true); // default true to see if it changes
        
        ResourceMonitor monitor = new ResourceMonitor(pressureFound::set, () -> new ArrayList<>(), tempDir);
        
        // Use reflection to run checkResources, since it is private
        try {
            java.lang.reflect.Method method = ResourceMonitor.class.getDeclaredMethod("checkResources");
            method.setAccessible(true);
            method.invoke(monitor);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        
        assertFalse(pressureFound.get(), "Should not report pressure when no downloads");
    }
}
