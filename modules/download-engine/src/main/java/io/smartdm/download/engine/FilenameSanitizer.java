package io.smartdm.download.engine;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Validates and sanitizes filenames extracted from Content-Disposition headers
 * or URL paths. This is a security-critical component for Phase 4.
 *
 * <p>Rejects: path traversal, null bytes, reserved Windows device names,
 * and overlong filenames. Strips directory components and control characters.
 */
public final class FilenameSanitizer {

    private FilenameSanitizer() {}

    /** Maximum filename length we allow (Windows MAX_PATH minus some room for paths). */
    private static final int MAX_FILENAME_LENGTH = 200;

    /** Windows reserved device names. Case-insensitive, with or without extensions. */
    private static final Set<String> WINDOWS_RESERVED = Set.of(
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    );

    private static final Pattern CONTENT_DISPOSITION_FILENAME =
            Pattern.compile("filename\\*?\\s*=\\s*\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE);

    /**
     * Extracts a filename from a Content-Disposition header value.
     * Returns null if the header is absent, empty, or the extracted name is unsafe.
     */
    public static String fromContentDisposition(String headerValue) {
        if (headerValue == null || headerValue.isBlank()) {
            return null;
        }

        Matcher m = CONTENT_DISPOSITION_FILENAME.matcher(headerValue);
        if (!m.find()) {
            return null;
        }

        String raw = m.group(1).trim();
        return sanitize(raw);
    }

    /**
     * Sanitizes a raw filename string. Returns null if the name is fundamentally
     * unsafe and cannot be salvaged.
     */
    public static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }

        // 1. Reject null bytes immediately
        if (raw.indexOf('\0') >= 0) {
            return null;
        }

        // 2. Strip any directory components (path traversal defense)
        //    Handle both / and \ separators
        int lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        if (lastSlash >= 0) {
            raw = raw.substring(lastSlash + 1);
        }

        // 3. Strip leading dots (prevents hidden files and .. traversal remnants)
        while (raw.startsWith(".")) {
            raw = raw.substring(1);
        }

        if (raw.isBlank()) {
            return null;
        }

        // 4. Strip control characters
        raw = raw.replaceAll("[\\x00-\\x1F\\x7F]", "");

        if (raw.isBlank()) {
            return null;
        }

        // 5. Check for Windows reserved device names
        //    "CON", "CON.txt", etc. are all reserved
        String baseName = raw.contains(".") ? raw.substring(0, raw.indexOf('.')) : raw;
        if (WINDOWS_RESERVED.contains(baseName.toUpperCase())) {
            return null;
        }

        // 6. Reject overlong filenames
        if (raw.length() > MAX_FILENAME_LENGTH) {
            return null;
        }

        // 7. Replace remaining Windows-illegal characters
        raw = raw.replaceAll("[<>:\"|?*]", "_");

        return raw;
    }
}
