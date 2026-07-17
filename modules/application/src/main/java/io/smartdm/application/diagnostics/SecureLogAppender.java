package io.smartdm.application.diagnostics;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SecureLogAppender extends AppenderBase<ILoggingEvent> {

    // Matches URLs like http://..., https://...
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s]+");
    
    // Matches IP addresses like 192.168.1.1
    private static final Pattern IP_PATTERN = Pattern.compile("\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b");
    
    private static final Pattern PATH_PATTERN = Pattern.compile("(?i)(?:[a-z]:|/home/|/Users/)[^\\s]+");

    @Override
    protected void append(ILoggingEvent eventObject) {
        String originalMessage = eventObject.getFormattedMessage();
        String redactedMessage = redact(originalMessage);
        
        // In a real implementation, this would write to the diagnostic_event table
        // or a RollingFileAppender. For Phase 2, we just demonstrate the redaction logic.
        System.out.println("[SECURE] " + redactedMessage);
    }

    public static String redact(String message) {
        if (message == null) return null;
        
        String result = message;
        
        // Redact URLs
        result = URL_PATTERN.matcher(result).replaceAll("[REDACTED_URL]");
        
        // Redact IPs
        result = IP_PATTERN.matcher(result).replaceAll("[REDACTED_IP]");
        
        // Redact Paths
        result = PATH_PATTERN.matcher(result).replaceAll("[REDACTED_PATH]");
        
        return result;
    }
}
