package io.smartdm.domain.repository;

import io.smartdm.domain.organization.FolderAffinity;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

public interface FolderAffinityRepository {
    void save(FolderAffinity affinity);
    Optional<FolderAffinity> findByPath(Path folderPath);
    List<FolderAffinity> findAll();
    void recordChoiceHistory(String url, String sourceHost, String mimeType, String extension, Path chosenFolder, Path suggestedFolder, String action);
    void resetLearnedPreferences();
}
