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
            String nameToSearch = (fileName != null && !fileName.isBlank()) ? fileName : localFilePath.getFileName().toString();

            // Tier 1 Check (Lowest Cost): Query candidates by Name + Size or Size
            List<CatalogFile> candidates = catalogRepository.findFilesByNameAndSize(nameToSearch, size);
            if (candidates.isEmpty()) {
                candidates = catalogRepository.findFilesBySize(size);
            }
            if (candidates.isEmpty()) {
                // Zero candidate matches -> Return immediately without calculating expensive hashes
                return matches;
            }

            // Tier 2 Check (Medium Cost): Compute Quick Fingerprint only when candidates exist
            String quickHash = QuickFingerprintCalculator.calculateQuickHash(localFilePath);
            List<CatalogFile> strongCandidates = new ArrayList<>();
            if (quickHash != null) {
                for (CatalogFile candidate : candidates) {
                    if (quickHash.equals(candidate.getQuickHash())) {
                        strongCandidates.add(candidate);
                    }
                }
                if (strongCandidates.isEmpty()) {
                    List<CatalogFile> quickHashMatches = catalogRepository.findFilesByQuickHash(quickHash);
                    if (quickHashMatches != null) strongCandidates.addAll(quickHashMatches);
                }
            }

            if (strongCandidates.isEmpty()) {
                // Return Tier 1 possible matches if quick hash didn't match
                for (CatalogFile f : candidates) {
                    matches.add(new CatalogDuplicateMatch(f, DuplicateTier.POSSIBLE_MATCH, "FileName & Size (" + size + " bytes)"));
                }
                return matches;
            }

            // Tier 3 Check (Highest Cost): Compute full SHA-256 hash only for strong candidates
            String fullHash = QuickFingerprintCalculator.calculateFullHash(localFilePath);
            if (fullHash != null) {
                for (CatalogFile f : strongCandidates) {
                    if (fullHash.equals(f.getFullHash())) {
                        matches.add(new CatalogDuplicateMatch(f, DuplicateTier.EXACT_MATCH, "SHA-256: " + fullHash));
                    }
                }
                if (matches.isEmpty()) {
                    List<CatalogFile> fullHashMatches = catalogRepository.findFilesByFullHash(fullHash);
                    if (fullHashMatches != null) {
                        for (CatalogFile f : fullHashMatches) {
                            matches.add(new CatalogDuplicateMatch(f, DuplicateTier.EXACT_MATCH, "SHA-256: " + fullHash));
                        }
                    }
                }
            }

            if (matches.isEmpty()) {
                // If full hash didn't match, return Tier 2 strong matches
                for (CatalogFile f : strongCandidates) {
                    matches.add(new CatalogDuplicateMatch(f, DuplicateTier.STRONG_MATCH, "QuickFingerprint: " + quickHash));
                }
            }

        } catch (Exception e) {
            // Ignore extraction errors during duplicate check
        }

        return matches;
    }
}
