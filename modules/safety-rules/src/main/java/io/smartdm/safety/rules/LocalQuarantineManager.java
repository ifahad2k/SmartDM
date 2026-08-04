package io.smartdm.safety.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.safety.api.PostDownloadContext;
import io.smartdm.safety.api.PreDownloadContext;
import io.smartdm.safety.api.QuarantineRecord;
import io.smartdm.safety.api.QuarantineService;
import io.smartdm.safety.api.SafetyEvidence;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Local implementation of QuarantineService managing isolated storage and sidecar metadata in AppData/user directory.
 */
public class LocalQuarantineManager implements QuarantineService {

    private final Path quarantineDirectory;
    private final ObjectMapper objectMapper;

    /**
     * DTO for sidecar metadata JSON persistence without complex type modules.
     */
    private record QuarantineMetaData(
            String quarantineId,
            String originalFilename,
            String originalPath,
            String quarantinePath,
            String quarantinedAt,
            long fileSize,
            PreDownloadContext preContext,
            PostDownloadContext postContext,
            List<SafetyEvidence> evidence
    ) {
        public QuarantineRecord toRecord() {
            return new QuarantineRecord(
                    quarantineId,
                    originalFilename,
                    originalPath != null ? Path.of(originalPath) : null,
                    quarantinePath != null ? Path.of(quarantinePath) : null,
                    quarantinedAt != null ? Instant.parse(quarantinedAt) : Instant.now(),
                    fileSize,
                    preContext,
                    postContext,
                    evidence != null ? evidence : List.of()
            );
        }

        public static QuarantineMetaData fromRecord(QuarantineRecord record) {
            return new QuarantineMetaData(
                    record.quarantineId(),
                    record.originalFilename(),
                    record.originalPath() != null ? record.originalPath().toString() : null,
                    record.quarantinePath() != null ? record.quarantinePath().toString() : null,
                    record.quarantinedAt() != null ? record.quarantinedAt().toString() : Instant.now().toString(),
                    record.fileSize(),
                    record.preContext(),
                    record.postContext(),
                    record.evidence()
            );
        }
    }

    public LocalQuarantineManager() {
        this(Path.of(System.getProperty("user.home"), ".smartdm", "quarantine"));
    }

    public LocalQuarantineManager(Path quarantineDirectory) {
        this.quarantineDirectory = Objects.requireNonNull(quarantineDirectory, "quarantineDirectory cannot be null");
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public QuarantineRecord quarantine(Path sourceFile, String originalFilename, PreDownloadContext preContext, PostDownloadContext postContext, List<SafetyEvidence> evidence) throws IOException {
        if (sourceFile == null || !Files.exists(sourceFile)) {
            throw new IllegalArgumentException("Source file to quarantine does not exist: " + sourceFile);
        }

        Files.createDirectories(quarantineDirectory);

        String id = UUID.randomUUID().toString();
        Path targetDataPath = quarantineDirectory.resolve(id + ".data");
        Path targetMetaPath = quarantineDirectory.resolve(id + ".json");

        String filename = originalFilename != null && !originalFilename.isBlank() ?
                originalFilename : sourceFile.getFileName().toString();

        long size = Files.size(sourceFile);
        Instant quarantinedAt = Instant.now();

        // Move source file into quarantine data storage
        try {
            Files.move(sourceFile, targetDataPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            // Fall back to copy + delete if atomic move across volumes fails
            Files.copy(sourceFile, targetDataPath, StandardCopyOption.REPLACE_EXISTING);
            Files.delete(sourceFile);
        }

        QuarantineRecord record = new QuarantineRecord(
                id,
                filename,
                sourceFile.toAbsolutePath(),
                targetDataPath.toAbsolutePath(),
                quarantinedAt,
                size,
                preContext,
                postContext,
                evidence != null ? evidence : List.of()
        );

        QuarantineMetaData metaData = QuarantineMetaData.fromRecord(record);

        // Write sidecar metadata file
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(targetMetaPath.toFile(), metaData);

        return record;
    }

    @Override
    public QuarantineRecord quarantine(Path sourceFile, String originalFilename) throws IOException {
        return quarantine(sourceFile, originalFilename, null, null, List.of());
    }

    @Override
    public boolean restore(String quarantineId, Path targetDirectory) throws IOException {
        if (quarantineId == null || quarantineId.isBlank() || targetDirectory == null) {
            return false;
        }

        Path metaPath = quarantineDirectory.resolve(quarantineId + ".json");
        Path dataPath = quarantineDirectory.resolve(quarantineId + ".data");

        if (!Files.exists(metaPath) || !Files.exists(dataPath)) {
            return false;
        }

        QuarantineMetaData metaData = objectMapper.readValue(metaPath.toFile(), QuarantineMetaData.class);
        QuarantineRecord record = metaData.toRecord();
        Files.createDirectories(targetDirectory);

        Path restoreDestination = targetDirectory.resolve(record.originalFilename());

        try {
            Files.move(dataPath, restoreDestination, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            Files.copy(dataPath, restoreDestination, StandardCopyOption.REPLACE_EXISTING);
            Files.delete(dataPath);
        }

        Files.deleteIfExists(metaPath);
        return true;
    }

    @Override
    public boolean deletePermanently(String quarantineId) throws IOException {
        if (quarantineId == null || quarantineId.isBlank()) {
            return false;
        }

        Path metaPath = quarantineDirectory.resolve(quarantineId + ".json");
        Path dataPath = quarantineDirectory.resolve(quarantineId + ".data");

        boolean deletedData = Files.deleteIfExists(dataPath);
        boolean deletedMeta = Files.deleteIfExists(metaPath);

        return deletedData || deletedMeta;
    }

    @Override
    public List<QuarantineRecord> listQuarantinedFiles() throws IOException {
        if (!Files.exists(quarantineDirectory)) {
            return List.of();
        }

        List<QuarantineRecord> records = new ArrayList<>();
        try (Stream<Path> stream = Files.list(quarantineDirectory)) {
            List<Path> jsonFiles = stream.filter(p -> p.getFileName().toString().endsWith(".json")).toList();
            for (Path jsonPath : jsonFiles) {
                try {
                    QuarantineMetaData metaData = objectMapper.readValue(jsonPath.toFile(), QuarantineMetaData.class);
                    records.add(metaData.toRecord());
                } catch (Exception ignored) {
                }
            }
        }
        return records;
    }

    @Override
    public Optional<QuarantineRecord> getRecord(String quarantineId) throws IOException {
        if (quarantineId == null || quarantineId.isBlank()) {
            return Optional.empty();
        }
        Path metaPath = quarantineDirectory.resolve(quarantineId + ".json");
        if (!Files.exists(metaPath)) {
            return Optional.empty();
        }
        try {
            QuarantineMetaData metaData = objectMapper.readValue(metaPath.toFile(), QuarantineMetaData.class);
            return Optional.of(metaData.toRecord());
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public Path getQuarantineDirectory() {
        return quarantineDirectory;
    }
}
