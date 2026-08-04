package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Checks file header magic bytes against expected signatures for declared extensions.
 */
public class MagicByteVerifier {

    private static final byte[] PE_MZ = new byte[]{(byte) 0x4D, (byte) 0x5A}; // "MZ"
    private static final byte[] ELF_MAGIC = new byte[]{(byte) 0x7F, (byte) 0x45, (byte) 0x4C, (byte) 0x46}; // "\x7fELF"
    private static final byte[] ZIP_MAGIC = new byte[]{(byte) 0x50, (byte) 0x4B, (byte) 0x03, (byte) 0x04}; // "PK\x03\x04"
    private static final byte[] PNG_MAGIC = new byte[]{(byte) 0x89, (byte) 0x50, (byte) 0x4E, (byte) 0x47, (byte) 0x0D, (byte) 0x0A, (byte) 0x1A, (byte) 0x0A};
    private static final byte[] PDF_MAGIC = new byte[]{(byte) 0x25, (byte) 0x50, (byte) 0x44, (byte) 0x46, (byte) 0x2D}; // "%PDF-"
    private static final byte[] JPG_MAGIC = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] GIF_MAGIC = new byte[]{(byte) 0x47, (byte) 0x49, (byte) 0x46}; // "GIF"
    private static final byte[] GZIP_MAGIC = new byte[]{(byte) 0x1F, (byte) 0x8B};
    private static final byte[] SEVENZ_MAGIC = new byte[]{(byte) 0x37, (byte) 0x7A, (byte) 0xBC, (byte) 0xAF, (byte) 0x27, (byte) 0x1C};
    private static final byte[] RAR_MAGIC = new byte[]{(byte) 0x52, (byte) 0x61, (byte) 0x72, (byte) 0x21}; // "Rar!"

    private static final Set<String> NON_EXECUTABLE_EXTENSIONS = Set.of(
            "pdf", "png", "jpg", "jpeg", "gif", "bmp", "txt", "csv", "doc", "docx",
            "xls", "xlsx", "ppt", "pptx", "mp3", "mp4", "avi", "mkv", "wav"
    );

    /**
     * Verifies magic bytes of the file at the given Path against declared extension.
     */
    public List<SafetyEvidence> verify(Path file, String declaredExtension) {
        List<SafetyEvidence> evidence = new ArrayList<>();
        if (file == null || !Files.exists(file) || !Files.isRegularFile(file)) {
            evidence.add(new SafetyEvidence(
                    "MAGIC_BYTES",
                    "MAGIC_BYTE_READ_ERROR",
                    "File does not exist or is not readable: " + file,
                    RiskLevel.LOW,
                    file != null ? file.toString() : "null"
            ));
            return evidence;
        }

        byte[] header = new byte[300];
        int bytesRead = 0;
        try (InputStream in = Files.newInputStream(file)) {
            bytesRead = in.read(header, 0, header.length);
        } catch (Exception e) {
            evidence.add(new SafetyEvidence(
                    "MAGIC_BYTES",
                    "MAGIC_BYTE_READ_ERROR",
                    "Failed to read file header magic bytes: " + e.getMessage(),
                    RiskLevel.LOW,
                    e.toString()
            ));
            return evidence;
        }

        if (bytesRead <= 0) {
            evidence.add(new SafetyEvidence(
                    "MAGIC_BYTES",
                    "MAGIC_BYTE_EMPTY_FILE",
                    "File is empty (0 bytes)",
                    RiskLevel.LOW,
                    file.toString()
            ));
            return evidence;
        }

        byte[] actualBytes = Arrays.copyOf(header, bytesRead);
        return verify(actualBytes, declaredExtension);
    }

    /**
     * Verifies header byte array against declared extension.
     */
    public List<SafetyEvidence> verify(byte[] headerBytes, String declaredExtension) {
        List<SafetyEvidence> evidence = new ArrayList<>();
        if (headerBytes == null || headerBytes.length == 0) {
            return evidence;
        }

        String ext = normalizeExtension(declaredExtension);
        boolean isExecutableHeader = startsWith(headerBytes, PE_MZ) || startsWith(headerBytes, ELF_MAGIC);

        // 1. Executable magic byte mismatch (PE or ELF header when non-executable declared extension)
        if (isExecutableHeader && ext != null && NON_EXECUTABLE_EXTENSIONS.contains(ext)) {
            String headerType = startsWith(headerBytes, PE_MZ) ? "PE Executable (MZ)" : "ELF Executable";
            evidence.add(new SafetyEvidence(
                    "MAGIC_BYTES",
                    "MAGIC_BYTE_MISMATCH_EXECUTABLE",
                    "File claims extension '." + ext + "' but header magic bytes indicate " + headerType,
                    RiskLevel.CRITICAL,
                    "Declared: ." + ext + ", Actual header: " + headerType
            ));
            return evidence;
        }

        // 2. Specific format signature checks
        if (ext != null) {
            switch (ext) {
                case "png" -> {
                    if (!startsWith(headerBytes, PNG_MAGIC)) {
                        evidence.add(createMismatchEvidence("png", "PNG image signature"));
                    }
                }
                case "pdf" -> {
                    if (!startsWith(headerBytes, PDF_MAGIC)) {
                        evidence.add(createMismatchEvidence("pdf", "%PDF- document signature"));
                    }
                }
                case "jpg", "jpeg" -> {
                    if (!startsWith(headerBytes, JPG_MAGIC)) {
                        evidence.add(createMismatchEvidence(ext, "JPEG image signature"));
                    }
                }
                case "gif" -> {
                    if (!startsWith(headerBytes, GIF_MAGIC)) {
                        evidence.add(createMismatchEvidence("gif", "GIF image signature"));
                    }
                }
                case "zip", "jar", "docx", "xlsx", "pptx" -> {
                    if (!startsWith(headerBytes, ZIP_MAGIC)) {
                        evidence.add(createMismatchEvidence(ext, "ZIP archive signature"));
                    }
                }
                case "gz", "tgz" -> {
                    if (!startsWith(headerBytes, GZIP_MAGIC)) {
                        evidence.add(createMismatchEvidence(ext, "GZIP signature"));
                    }
                }
                case "7z" -> {
                    if (!startsWith(headerBytes, SEVENZ_MAGIC)) {
                        evidence.add(createMismatchEvidence("7z", "7-Zip signature"));
                    }
                }
                case "rar" -> {
                    if (!startsWith(headerBytes, RAR_MAGIC)) {
                        evidence.add(createMismatchEvidence("rar", "RAR archive signature"));
                    }
                }
                case "tar" -> {
                    if (!isTarHeader(headerBytes)) {
                        evidence.add(createMismatchEvidence("tar", "TAR archive signature (ustar)"));
                    }
                }
                default -> {
                }
            }
        }

        return evidence;
    }

    private SafetyEvidence createMismatchEvidence(String ext, String expectedSignature) {
        return new SafetyEvidence(
                "MAGIC_BYTES",
                "MAGIC_BYTE_MISMATCH",
                "File header magic bytes do not match expected " + expectedSignature + " for declared extension '." + ext + "'",
                RiskLevel.HIGH,
                "Declared: ." + ext + ", Expected: " + expectedSignature
        );
    }

    private String normalizeExtension(String ext) {
        if (ext == null || ext.isBlank()) {
            return null;
        }
        String trimmed = ext.trim();
        if (trimmed.startsWith(".")) {
            trimmed = trimmed.substring(1);
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private boolean startsWith(byte[] source, byte[] target) {
        if (source == null || target == null || source.length < target.length) {
            return false;
        }
        for (int i = 0; i < target.length; i++) {
            if (source[i] != target[i]) {
                return false;
            }
        }
        return true;
    }

    private boolean isTarHeader(byte[] header) {
        if (header.length < 262) {
            return false;
        }
        // TAR magic "ustar" at offset 257
        byte[] ustar = new byte[]{(byte) 0x75, (byte) 0x73, (byte) 0x74, (byte) 0x61, (byte) 0x72};
        for (int i = 0; i < ustar.length; i++) {
            if (header[257 + i] != ustar[i]) {
                return false;
            }
        }
        return true;
    }
}
