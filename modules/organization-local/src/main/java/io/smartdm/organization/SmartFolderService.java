package io.smartdm.organization;

import io.smartdm.domain.organization.FolderAffinity;
import io.smartdm.domain.organization.FolderSuggestion;
import io.smartdm.domain.repository.CatalogRepository;
import io.smartdm.domain.repository.CategoryRepository;
import io.smartdm.domain.repository.FolderAffinityRepository;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class SmartFolderService {

    private final CandidateGenerator candidateGenerator;
    private final LocalFolderScorer localFolderScorer;
    private final FolderAffinityRepository affinityRepository;

    public SmartFolderService(CategoryRepository categoryRepository, CatalogRepository catalogRepository, FolderAffinityRepository affinityRepository) {
        this.candidateGenerator = new CandidateGenerator(categoryRepository, catalogRepository, affinityRepository);
        this.localFolderScorer = new LocalFolderScorer(categoryRepository, catalogRepository, affinityRepository);
        this.affinityRepository = affinityRepository;
    }

    public List<FolderSuggestion> suggestFolders(String url, String fileName, String mimeType, long expectedBytes) {
        String sourceHost = extractHost(url);
        List<Path> candidates = new ArrayList<>(candidateGenerator.generateCandidates());
        List<FolderSuggestion> suggestions = localFolderScorer.scoreCandidates(candidates, fileName, mimeType, sourceHost, expectedBytes);
        suggestions.sort((a, b) -> Double.compare(b.score(), a.score()));
        if (suggestions.size() > 3) {
            return new ArrayList<>(suggestions.subList(0, 3));
        }
        return suggestions;
    }

    public java.util.concurrent.CompletableFuture<List<FolderSuggestion>> suggestFoldersAsync(
            String url, String fileName, String mimeType, long expectedBytes, java.util.concurrent.Executor executor) {
        java.util.concurrent.Executor exec = executor != null ? executor : java.util.concurrent.ForkJoinPool.commonPool();
        return java.util.concurrent.CompletableFuture.supplyAsync(
                () -> suggestFolders(url, fileName, mimeType, expectedBytes),
                exec
        );
    }

    public void recordUserChoice(String url, String fileName, String mimeType, Path chosenFolder, Path suggestedFolder) {
        if (affinityRepository == null || chosenFolder == null) return;

        String sourceHost = extractHost(url);
        String extension = getExtension(fileName);

        Optional<FolderAffinity> affOpt = affinityRepository.findByPath(chosenFolder.toAbsolutePath().toString());
        FolderAffinity affinity;
        if (affOpt.isPresent()) {
            affinity = affOpt.get();
            affinity.incrementChoiceCount();
            affinity.setLastUsedAt(System.currentTimeMillis());
        } else {
            affinity = new FolderAffinity(chosenFolder.toAbsolutePath().toString(), null, extension, sourceHost, 1, System.currentTimeMillis(), false, false);
        }
        affinityRepository.save(affinity);

        String action = (suggestedFolder != null && suggestedFolder.equals(chosenFolder)) ? "ACCEPTED" : "OVERRIDDEN";
        affinityRepository.recordChoiceHistory(url, sourceHost, mimeType, extension, chosenFolder.toAbsolutePath().toString(), suggestedFolder != null ? suggestedFolder.toAbsolutePath().toString() : null, action);
    }

    public void resetLearnedPreferences() {
        if (affinityRepository != null) {
            affinityRepository.resetLearnedPreferences();
        }
    }

    private String extractHost(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            java.net.URI uri = java.net.URI.create(url);
            return uri.getHost();
        } catch (Exception e) {
            return null;
        }
    }

    private String getExtension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        return (dot != -1 && dot < fileName.length() - 1) ? fileName.substring(dot + 1) : "";
    }
}
