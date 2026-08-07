package io.smartdm.media.ytdlp;

import io.smartdm.media.api.MediaMetadata;
import io.smartdm.media.api.MediaToolManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

public class YtDlpExtractorTest {

    @Test
    public void testCookiesFileCreationAndArgumentPassing(@TempDir Path tempDir) throws Exception {
        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        Path mockScript = tempDir.resolve(isWindows ? "mock_ytdlp.cmd" : "mock_ytdlp.sh");
        Path argsFile = tempDir.resolve("args_output.txt");
        Path cookieContentFile = tempDir.resolve("cookie_content.txt");

        if (isWindows) {
            String scriptContent = 
                "@echo off\r\n" +
                "echo %* > \"" + argsFile.toAbsolutePath().toString() + "\"\r\n" +
                ":loop\r\n" +
                "if \"%~1\"==\"\" goto end\r\n" +
                "if \"%~1\"==\"--cookies\" (\r\n" +
                "  type \"%~2\" > \"" + cookieContentFile.toAbsolutePath().toString() + "\"\r\n" +
                ")\r\n" +
                "shift\r\n" +
                "goto loop\r\n" +
                ":end\r\n" +
                "echo {\"id\":\"mock_123\",\"title\":\"Mock Title\",\"duration\":100,\"formats\":[]}\r\n";
            Files.writeString(mockScript, scriptContent);
        } else {
            String scriptContent = 
                "#!/bin/sh\n" +
                "echo \"$@\" > \"" + argsFile.toAbsolutePath() + "\"\n" +
                "prev=\"\"\n" +
                "for arg in \"$@\"; do\n" +
                "  if [ \"$prev\" = \"--cookies\" ]; then\n" +
                "    cat \"$arg\" > \"" + cookieContentFile.toAbsolutePath() + "\"\n" +
                "  fi\n" +
                "  prev=\"$arg\"\n" +
                "done\n" +
                "echo '{\"id\":\"mock_123\",\"title\":\"Mock Title\",\"duration\":100,\"formats\":[]}'\n";
            Files.writeString(mockScript, scriptContent);
            mockScript.toFile().setExecutable(true);
        }

        MediaToolManager toolManager = new MediaToolManager() {
            @Override
            public Optional<Path> getYtDlpPath() {
                return Optional.of(mockScript);
            }

            @Override
            public Optional<Path> getFfmpegPath() {
                return Optional.empty();
            }

            @Override
            public Optional<Path> getFfprobePath() {
                return Optional.empty();
            }

            @Override
            public boolean isAvailable() {
                return true;
            }
        };

        YtDlpExtractor extractor = new YtDlpExtractor(toolManager);
        
        String testCookies = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1780000000\tLOGIN_INFO\tAFmmF28w...\n";
        String testUrl = "https://vimeo.com/123456789";

        CompletableFuture<MediaMetadata> future = extractor.extractMetadataAsync(testUrl, testCookies, "TestUserAgent/1.0");
        MediaMetadata result = future.get(10, TimeUnit.SECONDS);

        assertNotNull(result, "Extracted metadata should not be null");
        assertEquals("Mock Title", result.title());

        assertTrue(Files.exists(argsFile), "Arguments output file should exist");
        String argsOutput = Files.readString(argsFile);
        assertTrue(argsOutput.contains("--cookies"), "Execution arguments should contain --cookies");

        assertTrue(Files.exists(cookieContentFile), "Cookie content file captured by mock script should exist");
        String capturedCookies = Files.readString(cookieContentFile);
        assertEquals(testCookies.trim(), capturedCookies.trim(), "Temporary cookie file content must match passed cookies string");
    }

    @Test
    public void testNetscapeCookieFormattingLogic() {
        String inputRawCookies = "# Netscape HTTP Cookie File\\n.youtube.com\\tTRUE\\t/\\tTRUE\\t1750000000\\tSID\\tval123\\n";
        String cleaned = inputRawCookies.replace("\\n", "\n").replace("\\t", "\t");
        
        assertTrue(cleaned.startsWith("# Netscape HTTP Cookie File"), "Must start with Netscape header");
        String[] lines = cleaned.split("\n");
        assertTrue(lines.length >= 2, "Must contain header and at least one cookie line");
        
        String cookieLine = lines[1];
        String[] parts = cookieLine.split("\t");
        assertEquals(7, parts.length, "Netscape cookie line must contain exactly 7 tab-separated fields");
        assertEquals(".youtube.com", parts[0], "Domain field");
        assertEquals("TRUE", parts[1], "Include subdomains field");
        assertEquals("/", parts[2], "Path field");
        assertEquals("TRUE", parts[3], "Secure flag field");
        assertEquals("1750000000", parts[4], "Expiration timestamp field");
        assertEquals("SID", parts[5], "Cookie name field");
        assertEquals("val123", parts[6], "Cookie value field");
    }
}
