package io.smartdm.catalog;

import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;
import io.smartdm.domain.repository.CatalogRepository;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.UUID;

public class FileCatalogScanner {

    private final CatalogRepository catalogRepository;

    public FileCatalogScanner(CatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    public void scanRoot(CatalogRoot root) {
        Path rootPath = Paths.get(root.getPath());
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath) || DefaultPathFilter.isExcludedPath(rootPath)) {
            catalogRepository.updateRootState(root.getId(), "ERROR");
            return;
        }

        catalogRepository.updateRootState(root.getId(), "SCANNING");

        try {
            Files.walkFileTree(rootPath, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (DefaultPathFilter.isExcludedPath(dir)) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile() && !DefaultPathFilter.isExcludedPath(file)) {
                        try {
                            String fileName = file.getFileName().toString();
                            String ext = getExtension(fileName);
                            String mimeType = guessMimeType(fileName);
                            long size = attrs.size();
                            Instant created = attrs.creationTime().toInstant();
                            Instant modified = attrs.lastModifiedTime().toInstant();

                            Path relativePath = rootPath.relativize(file);
                            String quickHash = QuickFingerprintCalculator.calculateQuickHash(file);

                            CatalogFile catalogFile = new CatalogFile(
                                UUID.randomUUID().toString(),
                                root.getId(),
                                relativePath.toString(),
                                fileName,
                                ext,
                                mimeType,
                                size,
                                created,
                                modified,
                                quickHash,
                                null,
                                null
                            );

                            catalogRepository.saveFile(catalogFile);
                        } catch (Exception ignored) {
                            // Skip individual file on permission/access error
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });

            catalogRepository.updateRootState(root.getId(), "COMPLETED");

        } catch (Exception e) {
            catalogRepository.updateRootState(root.getId(), "ERROR");
        }
    }

    private String getExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return (dot > 0 && dot < fileName.length() - 1) ? fileName.substring(dot + 1).toLowerCase() : "";
    }

    private String guessMimeType(String fileName) {
        try {
            String contentType = Files.probeContentType(Paths.get(fileName));
            if (contentType != null) return contentType;
        } catch (Exception ignored) {}

        String ext = getExtension(fileName);
        return switch (ext) {
            case "mp4", "mkv", "webm", "avi" -> "video/" + ext;
            case "mp3", "flac", "wav", "m4a", "ogg" -> "audio/" + ext;
            case "jpg", "jpeg", "png", "gif", "svg" -> "image/" + ext;
            case "pdf" -> "application/pdf";
            case "zip", "rar", "7z", "tar", "gz" -> "application/zip";
            default -> "application/octet-stream";
        };
    }
}
