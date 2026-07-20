package io.smartdm.desktop.shell;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.Arrays;
import java.util.Set;
import java.util.HashSet;
import javafx.scene.input.Clipboard;
import javafx.scene.input.DataFormat;

public class ClipboardMonitor {

    private final Set<String> ignoredDomains = new HashSet<>();
    private boolean enabled = true;
    private String lastProcessedContent = "";

    public ClipboardMonitor() {
        // Some default ignored domains to avoid accidentally grabbing internal/sensitive links
        ignoredDomains.addAll(Arrays.asList(
            "localhost",
            "127.0.0.1",
            "bank",
            "auth"
        ));
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void ignoreDomain(String domain) {
        ignoredDomains.add(domain.toLowerCase());
    }

    /**
     * Call this when the application window gains focus.
     * It checks the clipboard for valid HTTP/HTTPS URLs and returns them.
     * It remembers the last processed content to avoid prompting for the same URL twice.
     * 
     * @return List of newly found valid URLs.
     */
    public List<String> checkClipboardOnFocus() {
        List<String> foundUrls = new ArrayList<>();
        
        if (!enabled) {
            return foundUrls;
        }

        Clipboard clipboard = Clipboard.getSystemClipboard();
        if (clipboard.hasString()) {
            String content = clipboard.getString();
            
            // Only process if it changed
            if (content != null && !content.trim().isEmpty() && !content.equals(lastProcessedContent)) {
                lastProcessedContent = content;
                
                // Extremely basic parsing: split by whitespace in case multiple URLs are copied
                String[] tokens = content.split("\\s+");
                for (String token : tokens) {
                    if (isValidDownloadUrl(token)) {
                        foundUrls.add(token);
                    }
                }
            }
        }
        
        return foundUrls;
    }

    private boolean isValidDownloadUrl(String url) {
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
                return false;
            }
            
            String host = uri.getHost();
            if (host != null) {
                for (String ignored : ignoredDomains) {
                    if (host.toLowerCase().contains(ignored)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
