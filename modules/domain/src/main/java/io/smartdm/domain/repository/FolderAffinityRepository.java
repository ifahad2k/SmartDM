package io.smartdm.domain.repository;

import io.smartdm.domain.organization.FolderAffinity;

import java.util.List;
import java.util.Optional;

public interface FolderAffinityRepository {
    void save(FolderAffinity affinity);
    Optional<FolderAffinity> findByPath(String folderPath);
    List<FolderAffinity> findAll();
    void recordChoiceHistory(String url, String sourceHost, String mimeType, String extension, String chosenFolder, String suggestedFolder, String action);
    void resetLearnedPreferences();
}
