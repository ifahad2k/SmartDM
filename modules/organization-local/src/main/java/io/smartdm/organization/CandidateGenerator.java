package io.smartdm.organization;

import io.smartdm.catalog.DefaultPathFilter;
import io.smartdm.domain.Category;
import io.smartdm.domain.catalog.CatalogRoot;
import io.smartdm.domain.organization.FolderAffinity;
import io.smartdm.domain.repository.CatalogRepository;
import io.smartdm.domain.repository.CategoryRepository;
import io.smartdm.domain.repository.FolderAffinityRepository;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;

public class CandidateGenerator {

    private final CategoryRepository categoryRepository;
    private final CatalogRepository catalogRepository;
    private final FolderAffinityRepository affinityRepository;

    public CandidateGenerator(CategoryRepository categoryRepository, CatalogRepository catalogRepository, FolderAffinityRepository affinityRepository) {
        this.categoryRepository = categoryRepository;
        this.catalogRepository = catalogRepository;
        this.affinityRepository = affinityRepository;
    }

    public Set<Path> generateCandidates() {
        Set<Path> candidates = new HashSet<>();

        // Standard user directories & subfolders
        String userHome = System.getProperty("user.home");
        if (userHome != null) {
            Path home = Paths.get(userHome);
            Path downloads = home.resolve("Downloads");
            addIfValid(candidates, downloads);
            addIfValid(candidates, downloads.resolve("Compressed"));
            addIfValid(candidates, downloads.resolve("Programs"));
            addIfValid(candidates, downloads.resolve("Videos"));
            addIfValid(candidates, downloads.resolve("Music"));
            addIfValid(candidates, downloads.resolve("Documents"));
            addIfValid(candidates, home.resolve("Documents"));
            addIfValid(candidates, home.resolve("Music"));
            addIfValid(candidates, home.resolve("Videos"));
            addIfValid(candidates, home.resolve("Pictures"));
        }

        // Category default paths
        if (categoryRepository != null) {
            for (Category cat : categoryRepository.findAll()) {
                if (cat.defaultDestination() != null) {
                    addIfValid(candidates, Path.of(cat.defaultDestination().value()));
                }
            }
        }

        // Catalog roots
        if (catalogRepository != null) {
            for (CatalogRoot root : catalogRepository.getAllRoots()) {
                addIfValid(candidates, Path.of(root.getPath()));
            }
        }

        // Learned affinity paths
        if (affinityRepository != null) {
            for (FolderAffinity aff : affinityRepository.findAll()) {
                if (!aff.isBlacklisted()) {
                    addIfValid(candidates, Path.of(aff.getFolderPath()));
                }
            }
        }

        return candidates;
    }

    private void addIfValid(Set<Path> candidates, Path path) {
        if (path == null) return;
        try {
            Path abs = path.toAbsolutePath().normalize();
            if (Files.exists(abs) && Files.isDirectory(abs) && Files.isWritable(abs)) {
                if (!DefaultPathFilter.isExcludedPath(abs)) {
                    candidates.add(abs);
                }
            }
        } catch (Exception ignored) {}
    }
}
