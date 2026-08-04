package io.smartdm.safety.api;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Service interface for managing quarantined files and sidecar metadata.
 */
public interface QuarantineService {
    /**
     * Quarantines a file by moving it to isolated storage with full safety evidence and context metadata.
     */
    QuarantineRecord quarantine(Path sourceFile, String originalFilename, PreDownloadContext preContext, PostDownloadContext postContext, List<SafetyEvidence> evidence) throws IOException;

    /**
     * Overloaded convenience method to quarantine a file with basic parameters.
     */
    QuarantineRecord quarantine(Path sourceFile, String originalFilename) throws IOException;

    /**
     * Safely restores a quarantined file back to a target directory.
     *
     * @param quarantineId unique ID of the quarantined item
     * @param targetDirectory destination folder to restore the file
     * @return true if successfully restored, false if quarantine ID not found
     */
    boolean restore(String quarantineId, Path targetDirectory) throws IOException;

    /**
     * Permanently deletes a quarantined file and its sidecar metadata.
     *
     * @param quarantineId unique ID of the quarantined item
     * @return true if successfully deleted, false if not found
     */
    boolean deletePermanently(String quarantineId) throws IOException;

    /**
     * Returns a list of all currently quarantined records.
     */
    List<QuarantineRecord> listQuarantinedFiles() throws IOException;

    /**
     * Gets a specific quarantine record by its ID.
     */
    Optional<QuarantineRecord> getRecord(String quarantineId) throws IOException;
}
