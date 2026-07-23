package io.smartdm.catalog;

import io.smartdm.domain.catalog.CatalogDuplicateMatch;
import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;
import io.smartdm.domain.repository.CatalogRepository;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CatalogService {

    private final CatalogRepository catalogRepository;
    private final FileCatalogScanner scanner;
    private final DuplicateDetector duplicateDetector;
    private final ExecutorService scanExecutor;

    public CatalogService(CatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
        this.scanner = new FileCatalogScanner(catalogRepository);
        this.duplicateDetector = new DuplicateDetector(catalogRepository);
        this.scanExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "smartdm-catalog-scanner");
            t.setDaemon(true);
            return t;
        });
    }

    public CatalogRoot addApprovedRoot(String path, String displayName) {
        String id = UUID.randomUUID().toString();
        CatalogRoot root = new CatalogRoot(id, path, displayName, Instant.now(), "IDLE", null);
        catalogRepository.addRoot(root);
        triggerScan(id);
        return root;
    }

    public void removeApprovedRoot(String rootId) {
        catalogRepository.clearFilesForRoot(rootId);
        catalogRepository.removeRoot(rootId);
    }

    public List<CatalogRoot> getApprovedRoots() {
        return catalogRepository.getAllRoots();
    }

    public void triggerScan(String rootId) {
        Optional<CatalogRoot> rootOpt = catalogRepository.getRootById(rootId);
        if (rootOpt.isPresent()) {
            scanExecutor.submit(() -> scanner.scanRoot(rootOpt.get()));
        }
    }

    public List<CatalogDuplicateMatch> checkForDuplicates(String fileName, Path localFilePath) {
        return duplicateDetector.findDuplicates(fileName, localFilePath);
    }

    public List<CatalogFile> searchLocalFiles(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return catalogRepository.searchFilesFts(query);
    }

    public void shutdown() {
        scanExecutor.shutdownNow();
    }
}
