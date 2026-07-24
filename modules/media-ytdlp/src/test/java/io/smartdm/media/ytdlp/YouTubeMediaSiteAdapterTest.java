package io.smartdm.media.ytdlp;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class YouTubeMediaSiteAdapterTest {

    private final YouTubeMediaSiteAdapter adapter = new YouTubeMediaSiteAdapter();

    @Test
    void testCanHandle() {
        assertTrue(adapter.canHandle("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assertTrue(adapter.canHandle("https://youtu.be/dQw4w9WgXcQ"));
        assertTrue(adapter.canHandle("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
        assertFalse(adapter.canHandle("https://example.com/video.mp4"));
    }

    @Test
    void testCanonicalize() {
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", adapter.canonicalize("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", adapter.canonicalize("https://youtu.be/dQw4w9WgXcQ"));
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", adapter.canonicalize("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", adapter.canonicalize("https://www.youtube.com/embed/dQw4w9WgXcQ"));
    }

    @Test
    void testAccessibilityLabel() {
        assertEquals("YouTube", adapter.getSiteName());
        assertNotNull(adapter.getAccessibilityLabel());
        assertFalse(adapter.getAccessibilityLabel().isBlank());
    }
}
