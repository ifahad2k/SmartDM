package io.smartdm.application.diagnostics;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SecureLogAppenderTest {

    @Test
    void shouldRedactUrls() {
        String msg = "Failed to download from https://youtube.com/watch?v=12345 randomly";
        String redacted = SecureLogAppender.redact(msg);
        assertThat(redacted).isEqualTo("Failed to download from [REDACTED_URL] randomly");
    }

    @Test
    void shouldRedactIps() {
        String msg = "Connection timeout to 192.168.1.55 on port 8080";
        String redacted = SecureLogAppender.redact(msg);
        assertThat(redacted).isEqualTo("Connection timeout to [REDACTED_IP] on port 8080");
    }

    @Test
    void shouldRedactPaths() {
        String msg = "Cannot write to C:\\Users\\Admin\\Downloads\\file.txt";
        String redacted = SecureLogAppender.redact(msg);
        assertThat(redacted).isEqualTo("Cannot write to [REDACTED_PATH]");
        
        String linuxMsg = "Cannot write to /home/user/Downloads/file.txt";
        String linuxRedacted = SecureLogAppender.redact(linuxMsg);
        assertThat(linuxRedacted).isEqualTo("Cannot write to [REDACTED_PATH]");
    }
}
