package io.smartdm.safety.rules;

import io.smartdm.safety.api.PreDownloadContext;
import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Evaluates pre-download context against heuristics for network, extension, filename, and MIME risks.
 */
public class PreDownloadRiskRules {

    private static final Set<String> EXECUTABLE_EXTENSIONS = Set.of(
            "exe", "msi", "bat", "cmd", "ps1", "vbs", "js", "jse", "wsf", "wsh",
            "scr", "com", "pif", "cpl", "jar", "py", "sh", "bash", "elf", "app",
            "dmg", "hta", "vbe", "reg", "gadget", "application"
    );

    private static final Set<String> DOCUMENT_OR_MEDIA_EXTENSIONS = Set.of(
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg",
            "png", "gif", "bmp", "txt", "csv", "mp3", "mp4", "avi", "mkv", "zip", "rar"
    );

    private static final Pattern CONTROL_CHAR_PATTERN = Pattern.compile("[\\x00-\\x1F\\x7F\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]");

    /**
     * Evaluates a PreDownloadContext and returns a list of SafetyEvidence items.
     */
    public List<SafetyEvidence> evaluate(PreDownloadContext context) {
        List<SafetyEvidence> evidence = new ArrayList<>();
        if (context == null) {
            return evidence;
        }

        String url = context.url();
        String filename = context.filename();
        String mimeType = context.mimeType();

        // 1. Insecure HTTP check
        if (url != null && url.toLowerCase(Locale.ROOT).startsWith("http://")) {
            evidence.add(new SafetyEvidence(
                    "NETWORK",
                    "PRE_HTTP_INSECURE",
                    "Download URL uses unencrypted HTTP protocol",
                    RiskLevel.MEDIUM,
                    url
            ));
        }

        String effectiveFilename = getEffectiveFilename(filename, url);
        String extension = getExtension(effectiveFilename);

        // 2. Control characters / RTLO check
        if (hasControlCharacters(effectiveFilename) || hasControlCharacters(url)) {
            evidence.add(new SafetyEvidence(
                    "FILENAME",
                    "PRE_CONTROL_CHARACTERS",
                    "Filename or URL contains control characters or spoofing characters (e.g. RTLO)",
                    RiskLevel.CRITICAL,
                    effectiveFilename
            ));
        }

        // 3. Double extension check (e.g. .pdf.exe)
        if (isDoubleExtensionSpoofed(effectiveFilename)) {
            evidence.add(new SafetyEvidence(
                    "EXTENSION",
                    "PRE_DOUBLE_EXTENSION",
                    "Potential double extension spoofing attempt detected: " + effectiveFilename,
                    RiskLevel.CRITICAL,
                    effectiveFilename
            ));
        }

        // 4. Executable / script extension check
        if (extension != null && EXECUTABLE_EXTENSIONS.contains(extension)) {
            evidence.add(new SafetyEvidence(
                    "EXTENSION",
                    "PRE_EXECUTABLE_EXTENSION",
                    "File extension '" + extension + "' indicates an executable or script format",
                    RiskLevel.HIGH,
                    effectiveFilename
            ));
        }

        // 5. MIME / extension mismatch check
        if (mimeType != null && !mimeType.isBlank() && extension != null) {
            String lowerMime = mimeType.toLowerCase(Locale.ROOT).trim();
            if (isMimeMismatch(lowerMime, extension)) {
                evidence.add(new SafetyEvidence(
                        "MIME_MISMATCH",
                        "PRE_MIME_EXTENSION_MISMATCH",
                        "Declared MIME type ('" + mimeType + "') does not match file extension ('." + extension + "')",
                        RiskLevel.HIGH,
                        mimeType + " vs ." + extension
                ));
            }
        }

        return evidence;
    }

    private String getEffectiveFilename(String filename, String url) {
        if (filename != null && !filename.isBlank()) {
            return filename;
        }
        if (url != null && !url.isBlank()) {
            try {
                int lastSlash = url.lastIndexOf('/');
                if (lastSlash >= 0 && lastSlash < url.length() - 1) {
                    String candidate = url.substring(lastSlash + 1);
                    int queryPos = candidate.indexOf('?');
                    if (queryPos >= 0) {
                        candidate = candidate.substring(0, queryPos);
                    }
                    int hashPos = candidate.indexOf('#');
                    if (hashPos >= 0) {
                        candidate = candidate.substring(0, hashPos);
                    }
                    return candidate;
                }
            } catch (Exception ignored) {
            }
        }
        return "";
    }

    private String getExtension(String filename) {
        if (filename == null || filename.isBlank()) {
            return null;
        }
        int lastDot = filename.lastIndexOf('.');
        if (lastDot > 0 && lastDot < filename.length() - 1) {
            return filename.substring(lastDot + 1).toLowerCase(Locale.ROOT);
        }
        return null;
    }

    private boolean isDoubleExtensionSpoofed(String filename) {
        if (filename == null || filename.isBlank()) {
            return false;
        }
        String[] parts = filename.split("\\.");
        if (parts.length < 3) {
            return false;
        }
        String outerExt = parts[parts.length - 1].toLowerCase(Locale.ROOT);
        String innerExt = parts[parts.length - 2].toLowerCase(Locale.ROOT);

        return EXECUTABLE_EXTENSIONS.contains(outerExt) && DOCUMENT_OR_MEDIA_EXTENSIONS.contains(innerExt);
    }

    private boolean hasControlCharacters(String str) {
        if (str == null || str.isEmpty()) {
            return false;
        }
        return CONTROL_CHAR_PATTERN.matcher(str).find();
    }

    private boolean isMimeMismatch(String mimeType, String extension) {
        // Safe MIME prefixes matching executable extensions vs harmless declared MIME
        boolean isExecExt = EXECUTABLE_EXTENSIONS.contains(extension);
        boolean isDocMediaExt = DOCUMENT_OR_MEDIA_EXTENSIONS.contains(extension);

        boolean isExecMime = mimeType.contains("x-msdownload") ||
                mimeType.contains("x-executable") ||
                mimeType.contains("x-dosexec") ||
                mimeType.contains("application/x-sh") ||
                mimeType.contains("application/x-bat");

        boolean isDocMediaMime = mimeType.startsWith("image/") ||
                mimeType.startsWith("audio/") ||
                mimeType.startsWith("video/") ||
                mimeType.equals("application/pdf") ||
                mimeType.contains("word") ||
                mimeType.contains("excel");

        if (isExecExt && isDocMediaMime) {
            return true; // e.g. MIME is image/png but extension is .exe
        }
        if (isDocMediaExt && isExecMime) {
            return true; // e.g. MIME is application/x-msdownload but extension is .pdf
        }
        return false;
    }
}
