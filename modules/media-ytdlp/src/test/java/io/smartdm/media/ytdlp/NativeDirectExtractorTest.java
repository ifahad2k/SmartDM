package io.smartdm.media.ytdlp;

import io.smartdm.media.api.MediaMetadata;
import org.junit.jupiter.api.Test;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

public class NativeDirectExtractorTest {

    @Test
    public void testYouTubeExtraction() {
        NativeDirectExtractor extractor = new NativeDirectExtractor(new com.fasterxml.jackson.databind.ObjectMapper());
        Optional<MediaMetadata> result = extractor.tryExtract("https://www.youtube.com/watch?v=dQw4w9WgXcQ", null, null);
        assertTrue(result.isPresent(), "Result should be present");
        MediaMetadata meta = result.get();
        System.out.println("Extracted Title: " + meta.title());
        System.out.println("Formats Count: " + meta.formats().size());
        meta.formats().forEach(f -> System.out.println("Format: " + f.resolution() + " - " + f.ext() + " - " + f.getFormattedSize()));
        assertTrue(meta.formats().size() > 1, "Should have more than 1 format");
    }
}
