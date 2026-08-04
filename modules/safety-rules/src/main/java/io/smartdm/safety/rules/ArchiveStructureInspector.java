package io.smartdm.safety.rules;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Inspects ZIP and TAR archive structures for zip bombs, path traversal attacks, excessive entries, and nesting depth.
 */
public class ArchiveStructureInspector {

    private final int maxEntries;
    private final double maxCompressionRatio;
    private final int maxNestingDepth;

    public ArchiveStructureInspector() {
        this(10_000, 100.0, 10);
    }

    public ArchiveStructureInspector(int maxEntries, double maxCompressionRatio, int maxNestingDepth) {
        this.maxEntries = maxEntries;
        this.maxCompressionRatio = maxCompressionRatio;
        this.maxNestingDepth = maxNestingDepth;
    }

    /**
     * Inspects an archive file at the given Path and returns a list of SafetyEvidence findings.
     */
    public List<SafetyEvidence> inspectArchive(Path file) {
        List<SafetyEvidence> evidence = new ArrayList<>();
        if (file == null || !Files.exists(file) || !Files.isRegularFile(file)) {
            return evidence;
        }

        String fileNameLower = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileNameLower.endsWith(".zip") || fileNameLower.endsWith(".jar") ||
                fileNameLower.endsWith(".docx") || fileNameLower.endsWith(".xlsx") ||
                fileNameLower.endsWith(".pptx") || fileNameLower.endsWith(".apk")) {
            inspectZipArchive(file, evidence);
        } else if (fileNameLower.endsWith(".tar")) {
            inspectTarArchive(file, evidence);
        }

        return evidence;
    }

    private void inspectZipArchive(Path file, List<SafetyEvidence> evidence) {
        int entryCount = 0;
        long totalCompressedSize = 0;
        long totalUncompressedSize = 0;
        int maxObservedDepth = 0;
        boolean pathTraversalDetected = false;
        boolean maxEntriesExceeded = false;
        boolean highRatioDetected = false;

        try (InputStream fis = Files.newInputStream(file);
             BufferedInputStream bis = new BufferedInputStream(fis);
             ZipInputStream zis = new ZipInputStream(bis)) {

            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > maxEntries && !maxEntriesExceeded) {
                    maxEntriesExceeded = true;
                }

                String name = entry.getName();
                if (name != null) {
                    if (containsPathTraversal(name) && !pathTraversalDetected) {
                        pathTraversalDetected = true;
                        evidence.add(new SafetyEvidence(
                                "ARCHIVE",
                                "ARCHIVE_PATH_TRAVERSAL",
                                "Archive entry contains path traversal sequence: '" + name + "'",
                                RiskLevel.CRITICAL,
                                name
                        ));
                    }

                    int depth = calculateDepth(name);
                    if (depth > maxObservedDepth) {
                        maxObservedDepth = depth;
                    }
                }

                long cSize = entry.getCompressedSize();
                long uSize = entry.getSize();
                if (cSize > 0 && uSize > 0) {
                    totalCompressedSize += cSize;
                    totalUncompressedSize += uSize;
                    double entryRatio = (double) uSize / cSize;
                    if (entryRatio > maxCompressionRatio && !highRatioDetected) {
                        highRatioDetected = true;
                        evidence.add(new SafetyEvidence(
                                "ARCHIVE",
                                "ARCHIVE_HIGH_COMPRESSION_RATIO",
                                String.format(Locale.ROOT, "Archive entry '%s' has compression ratio %.1f:1 exceeding max limit (%.1f:1)",
                                        name, entryRatio, maxCompressionRatio),
                                RiskLevel.CRITICAL,
                                "Compressed: " + cSize + ", Uncompressed: " + uSize
                        ));
                    }
                }

                zis.closeEntry();
            }
        } catch (Exception e) {
            // Unreadable or malformed zip
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_MALFORMED",
                    "Failed to parse ZIP archive structure: " + e.getMessage(),
                    RiskLevel.MEDIUM,
                    e.toString()
            ));
        }

        if (maxEntriesExceeded) {
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_EXCESSIVE_ENTRIES",
                    "Archive contains " + entryCount + " entries, exceeding maximum limit of " + maxEntries,
                    RiskLevel.HIGH,
                    "Total entries: " + entryCount
            ));
        }

        if (totalCompressedSize > 0 && totalUncompressedSize > 0 && !highRatioDetected) {
            double overallRatio = (double) totalUncompressedSize / totalCompressedSize;
            if (overallRatio > maxCompressionRatio) {
                evidence.add(new SafetyEvidence(
                        "ARCHIVE",
                        "ARCHIVE_HIGH_COMPRESSION_RATIO",
                        String.format(Locale.ROOT, "Overall archive compression ratio %.1f:1 exceeds maximum limit (%.1f:1)",
                                overallRatio, maxCompressionRatio),
                        RiskLevel.CRITICAL,
                        "Total Compressed: " + totalCompressedSize + ", Total Uncompressed: " + totalUncompressedSize
                ));
            }
        }

        if (maxObservedDepth > maxNestingDepth) {
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_NESTING_DEPTH",
                    "Archive directory nesting depth (" + maxObservedDepth + ") exceeds limit (" + maxNestingDepth + ")",
                    RiskLevel.MEDIUM,
                    "Max depth: " + maxObservedDepth
            ));
        }
    }

    private void inspectTarArchive(Path file, List<SafetyEvidence> evidence) {
        int entryCount = 0;
        int maxObservedDepth = 0;
        boolean pathTraversalDetected = false;
        boolean maxEntriesExceeded = false;

        try (InputStream fis = Files.newInputStream(file);
             BufferedInputStream bis = new BufferedInputStream(fis)) {

            byte[] header = new byte[512];
            while (bis.read(header, 0, 512) == 512) {
                // Check if empty block (end of tar archive is two empty 512-byte blocks)
                if (isEmptyBlock(header)) {
                    break;
                }

                entryCount++;
                if (entryCount > maxEntries && !maxEntriesExceeded) {
                    maxEntriesExceeded = true;
                }

                String name = parseTarName(header);
                if (containsPathTraversal(name) && !pathTraversalDetected) {
                    pathTraversalDetected = true;
                    evidence.add(new SafetyEvidence(
                            "ARCHIVE",
                            "ARCHIVE_PATH_TRAVERSAL",
                            "TAR archive entry contains path traversal sequence: '" + name + "'",
                            RiskLevel.CRITICAL,
                            name
                    ));
                }

                int depth = calculateDepth(name);
                if (depth > maxObservedDepth) {
                    maxObservedDepth = depth;
                }

                long size = parseTarOctal(header, 124, 12);
                long blocksToSkip = (size + 511) / 512;
                long skipped = bis.skip(blocksToSkip * 512);
                if (skipped < blocksToSkip * 512) {
                    break; // EOF
                }
            }
        } catch (Exception e) {
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_MALFORMED",
                    "Failed to parse TAR archive structure: " + e.getMessage(),
                    RiskLevel.MEDIUM,
                    e.toString()
            ));
        }

        if (maxEntriesExceeded) {
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_EXCESSIVE_ENTRIES",
                    "TAR archive contains " + entryCount + " entries, exceeding maximum limit of " + maxEntries,
                    RiskLevel.HIGH,
                    "Total entries: " + entryCount
            ));
        }

        if (maxObservedDepth > maxNestingDepth) {
            evidence.add(new SafetyEvidence(
                    "ARCHIVE",
                    "ARCHIVE_NESTING_DEPTH",
                    "TAR archive directory nesting depth (" + maxObservedDepth + ") exceeds limit (" + maxNestingDepth + ")",
                    RiskLevel.MEDIUM,
                    "Max depth: " + maxObservedDepth
            ));
        }
    }

    private boolean containsPathTraversal(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }
        String normalized = name.replace('\\', '/');
        return normalized.contains("../") || normalized.contains("/..") ||
                normalized.startsWith("../") || normalized.equals("..") ||
                normalized.startsWith("/") || (normalized.length() >= 3 && normalized.charAt(1) == ':');
    }

    private int calculateDepth(String name) {
        if (name == null || name.isBlank()) {
            return 0;
        }
        String[] parts = name.replace('\\', '/').split("/");
        int count = 0;
        for (String p : parts) {
            if (!p.isBlank() && !p.equals(".")) {
                count++;
            }
        }
        return count;
    }

    private boolean isEmptyBlock(byte[] block) {
        for (byte b : block) {
            if (b != 0) return false;
        }
        return true;
    }

    private String parseTarName(byte[] header) {
        int length = 0;
        while (length < 100 && header[length] != 0) {
            length++;
        }
        return new String(header, 0, length).trim();
    }

    private long parseTarOctal(byte[] header, int offset, int length) {
        long result = 0;
        for (int i = offset; i < offset + length; i++) {
            byte b = header[i];
            if (b == 0 || b == ' ' || b == '\t') {
                continue;
            }
            if (b >= '0' && b <= '7') {
                result = (result << 3) + (b - '0');
            }
        }
        return result;
    }

    public int getMaxEntries() {
        return maxEntries;
    }

    public double getMaxCompressionRatio() {
        return maxCompressionRatio;
    }

    public int getMaxNestingDepth() {
        return maxNestingDepth;
    }
}
