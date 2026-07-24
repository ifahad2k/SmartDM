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

    default void setBlacklisted(String folderPath, boolean blacklisted) {
        Optional<FolderAffinity> affOpt = findByPath(folderPath);
        FolderAffinity aff = affOpt.orElseGet(() -> new FolderAffinity(folderPath, null, null, null, 0, System.currentTimeMillis(), false, false));
        aff.setBlacklisted(blacklisted);
        save(aff);
    }

    default void setPinned(String folderPath, boolean pinned) {
        Optional<FolderAffinity> affOpt = findByPath(folderPath);
        FolderAffinity aff = affOpt.orElseGet(() -> new FolderAffinity(folderPath, null, null, null, 0, System.currentTimeMillis(), false, false));
        aff.setPinned(pinned);
        save(aff);
    }
}
