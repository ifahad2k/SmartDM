package io.smartdm.ai.api;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Policy engine & sanitizer that enforces forbidden field rules on all AI payloads
 * before user consent or transmission.
 */
public final class ConsentFirewall {

    private static final Pattern SENSITIVE_KEY_PATTERN = Pattern.compile(
        "(?i)(api[_-]?key|secret|password|bearer|authorization|cookie|session|token|auth)"
    );

    private static final Pattern SHA256_HASH_PATTERN = Pattern.compile("^[a-fA-F0-9]{64}$");
    private static final Pattern ABSOLUTE_SYSTEM_PATH_PATTERN = Pattern.compile("(?i)(/etc/|/var/|/usr/|C:\\\\Windows\\\\|C:\\\\Program Files)");

    /**
     * Inspects and sanitizes a proposed payload.
     * Throws SecurityException if forbidden fields are detected.
     */
    public ApprovedPayload sanitizeAndApprove(AiTask task, String rawPrompt, List<String> candidates, String purpose) {
        if (rawPrompt == null || rawPrompt.isBlank()) {
            throw new IllegalArgumentException("Prompt cannot be empty");
        }

        // 1. Check for secret / key patterns
        if (SENSITIVE_KEY_PATTERN.matcher(rawPrompt).find()) {
            throw new SecurityException("Forbidden field violation: Payload contains potential secret, key, or authorization header");
        }

        // 2. Check for raw file hashes
        for (String word : rawPrompt.split("\\s+")) {
            if (SHA256_HASH_PATTERN.matcher(word.trim()).matches()) {
                throw new SecurityException("Forbidden field violation: Payload contains raw file hash");
            }
        }

        // 3. Check for restricted OS system paths
        if (ABSOLUTE_SYSTEM_PATH_PATTERN.matcher(rawPrompt).find()) {
            throw new SecurityException("Forbidden field violation: Payload contains restricted system directory path");
        }

        // Clean and build ApprovedPayload
        String cleanPrompt = rawPrompt.trim();
        return new ApprovedPayload(task, cleanPrompt, candidates, purpose);
    }
}
