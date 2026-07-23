package io.smartdm.domain.repository;

import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;

import java.util.List;
import java.util.Optional;

public interface CatalogRepository {
    void addRoot(CatalogRoot root);
    void removeRoot(String rootId);
    List<CatalogRoot> getAllRoots();
    Optional<CatalogRoot> getRootById(String id);
    void updateRootState(String rootId, String scanState);

    void saveFile(CatalogFile file);
    void removeFile(String fileId);
    Optional<CatalogFile> getFileById(String id);
    List<CatalogFile> getFilesForRoot(String rootId);

    List<CatalogFile> findFilesBySize(long fileSize);
    List<CatalogFile> findFilesByNameAndSize(String fileName, long fileSize);
    List<CatalogFile> findFilesByQuickHash(String quickHash);
    List<CatalogFile> findFilesByFullHash(String fullHash);
    List<CatalogFile> searchFilesFts(String query);

    void clearFilesForRoot(String rootId);
}
