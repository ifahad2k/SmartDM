package io.smartdm.catalog;

import io.smartdm.domain.catalog.CatalogDuplicateMatch;
import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.DuplicateTier;
import io.smartdm.domain.repository.CatalogRepository;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class DuplicateDetector {

    private final CatalogRepository catalogRepository;

    public DuplicateDetector(CatalogRepository catalogRepository) {
        this.catalogRepository = Objects.requireNonNull(catalogRepository, "catalogRepository must not be null");
    }

    public List<CatalogDuplicateMatch> findDuplicates(String fileName, Path localFilePath) {
        List<CatalogDuplicateMatch> matches = new ArrayList<>();
        if (localFilePath == null || !Files.exists(localFilePath)) {
            return matches;
        }

        try {
            long size = Files.size(localFilePath);
            String quickHash = QuickFingerprintCalculator.calculateQuickHash(localFilePath);

            // Tier 3 Check: Exact Match (Full Hash)
            String fullHash = QuickFingerprintCalculator.calculateFullHash(localFilePath);
            if (fullHash != null) {
                List<CatalogFile> exactFiles = catalogRepository.findFilesByFullHash(fullHash);
                for (CatalogFile f : exactFiles) {
                    matches.add(new CatalogDuplicateMatch(f, DuplicateTier.EXACT_MATCH, "SHA-256: " + fullHash));
                }
            }

            // Tier 2 Check: Strong Match (Quick Fingerprint + Size)
            if (matches.isEmpty() && quickHash != null) {
                List<CatalogFile> strongFiles = catalogRepository.findFilesByQuickHash(quickHash);
                for (CatalogFile f : strongFiles) {
                    matches.add(new CatalogDuplicateMatch(f, DuplicateTier.STRONG_MATCH, "QuickFingerprint: " + quickHash));
                }
            }

            // Tier 1 Check: Possible Match (FileName + Size)
            if (matches.isEmpty() && fileName != null && !fileName.isBlank()) {
                List<CatalogFile> possibleFiles = catalogRepository.findFilesByNameAndSize(fileName, size);
                for (CatalogFile f : possibleFiles) {
                    matches.add(new CatalogDuplicateMatch(f, DuplicateTier.POSSIBLE_MATCH, "FileName & Size (" + size + " bytes)"));
                }
            }

        } catch (Exception e) {
            // Ignore extraction errors during duplicate check
        }

        return matches;
    }
}
