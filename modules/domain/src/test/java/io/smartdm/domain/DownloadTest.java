package io.smartdm.domain;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DownloadTest {

    @Test
    void testDownloadEntityCreation() {
        SourceUri source = SourceUri.of("https://example.com/file.zip");
        Destination dest = Destination.of("/tmp/file.zip");
        
        Download download = Download.create(source, dest);
        
        assertNotNull(download.id());
        assertEquals(DownloadState.QUEUED, download.state());
        assertEquals(ByteCount.UNKNOWN, download.totalBytes());
        assertEquals(ByteCount.ZERO, download.downloadedBytes());
    }

    @Test
    void testValueObjectValidations() {
        assertThrows(IllegalArgumentException.class, () -> SourceUri.of("ftp://example.com"));
        assertThrows(IllegalArgumentException.class, () -> Destination.of(""));
        assertThrows(IllegalArgumentException.class, () -> ByteCount.of(-2));
    }
}
