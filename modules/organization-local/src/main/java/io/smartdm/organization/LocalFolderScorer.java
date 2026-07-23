package io.smartdm.organization;

import io.smartdm.domain.Category;
import io.smartdm.domain.CategoryRule;
import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.organization.FolderAffinity;
import io.smartdm.domain.organization.FolderSuggestion;
import io.smartdm.domain.repository.CatalogRepository;
import io.smartdm.domain.repository.CategoryRepository;
import io.smartdm.domain.repository.FolderAffinityRepository;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class LocalFolderScorer {

    private final CategoryRepository categoryRepository;
    private final CatalogRepository catalogRepository;
    private final FolderAffinityRepository affinityRepository;

    public LocalFolderScorer(CategoryRepository categoryRepository, CatalogRepository catalogRepository, FolderAffinityRepository affinityRepository) {
        this.categoryRepository = categoryRepository;
        this.catalogRepository = catalogRepository;
        this.affinityRepository = affinityRepository;
    }

    public List<FolderSuggestion> scoreCandidates(List<Path> candidates, String fileName, String mimeType, String sourceHost, long expectedBytes) {
        String extension = getExtension(fileName);
        List<FolderSuggestion> suggestions = new ArrayList<>();

        for (Path path : candidates) {
            double score = 0.0;
            List<String> reasons = new ArrayList<>();
            boolean hasDuplicate = false;

            // 1. Category match
            if (categoryRepository != null) {
                for (Category cat : categoryRepository.findAll()) {
                    if (cat.defaultDestination() != null && cat.defaultDestination().value().equals(path.toAbsolutePath().toString())) {
                        for (CategoryRule rule : cat.rules()) {
                            if (rule.type() == CategoryRule.RuleType.EXTENSION && extension.equalsIgnoreCase(rule.value())) {
                                score += 50.0;
                                reasons.add("Default location for ." + extension + " files");
                                break;
                            }
                            if (rule.type() == CategoryRule.RuleType.MIME_TYPE && mimeType != null && mimeType.contains(rule.value())) {
                                score += 40.0;
                                reasons.add("Default category location (" + cat.name() + ")");
                                break;
                            }
                        }
                    }
                }
            }

            // 2. Folder affinity & learning
            if (affinityRepository != null) {
                Optional<FolderAffinity> affOpt = affinityRepository.findByPath(path.toAbsolutePath().toString());
                if (affOpt.isPresent()) {
                    FolderAffinity aff = affOpt.get();
                    if (aff.isBlacklisted()) continue;

                    if (aff.isPinned()) {
                        score += 30.0;
                        reasons.add("Pinned favorite folder");
                    }
                    if (aff.getChoiceCount() > 0) {
                        double choiceBonus = Math.min(25.0, aff.getChoiceCount() * 5.0);
                        score += choiceBonus;
                        reasons.add("Chosen " + aff.getChoiceCount() + " times recently");
                    }
                    if (aff.getExtensionAffinity() != null && aff.getExtensionAffinity().contains(extension.toLowerCase())) {
                        score += 20.0;
                        reasons.add("Contains similar ." + extension + " files");
                    }
                    if (sourceHost != null && aff.getSourceHostAffinity() != null && aff.getSourceHostAffinity().contains(sourceHost.toLowerCase())) {
                        score += 15.0;
                        reasons.add("Used previously for downloads from " + sourceHost);
                    }
                }
            }

            // 3. Existing duplicate / matching catalog files
            if (catalogRepository != null && fileName != null && !fileName.isBlank()) {
                List<CatalogFile> matchingFiles = catalogRepository.findFilesByNameAndSize(fileName, expectedBytes > 0 ? expectedBytes : 0L);
                for (CatalogFile cf : matchingFiles) {
                    if (cf.getRelativePath() != null && Path.of(cf.getRelativePath()).startsWith(path)) {
                        score += 35.0;
                        hasDuplicate = true;
                        reasons.add("An existing matching file is in this folder");
                        break;
                    }
                }
            }

            // 4. Space availability & path bonus
            try {
                File f = path.toFile();
                long freeSpace = f.getFreeSpace();
                if (expectedBytes > 0 && freeSpace < expectedBytes) {
                    score -= 100.0; // Penalty if disk is full
                } else if (freeSpace > 10L * 1024 * 1024 * 1024) { // >10GB
                    score += 5.0;
                }
            } catch (Exception ignored) {}

            // 5. Semantic extension-to-folder mapping
            String extLower = extension.toLowerCase();
            String folderNameLower = path.getFileName() != null ? path.getFileName().toString().toLowerCase() : "";

            if (extLower.matches("mp4|mkv|avi|webm|mov|flv|m3u8|ts|mpd")) {
                if (folderNameLower.contains("video") || folderNameLower.contains("movie")) {
                    score += 45.0;
                    reasons.add("Recommended for video files");
                } else if (folderNameLower.equalsIgnoreCase("downloads")) {
                    score += 20.0;
                    reasons.add("Standard downloads folder");
                }
            } else if (extLower.matches("mp3|flac|wav|m4a|aac|ogg|wma")) {
                if (folderNameLower.contains("music") || folderNameLower.contains("audio")) {
                    score += 45.0;
                    reasons.add("Recommended for audio files");
                } else if (folderNameLower.equalsIgnoreCase("downloads")) {
                    score += 20.0;
                    reasons.add("Standard downloads folder");
                }
            } else if (extLower.matches("pdf|docx|doc|xlsx|xls|txt|pptx|epub")) {
                if (folderNameLower.contains("document") || folderNameLower.contains("doc")) {
                    score += 45.0;
                    reasons.add("Recommended for document files");
                } else if (folderNameLower.equalsIgnoreCase("downloads")) {
                    score += 20.0;
                    reasons.add("Standard downloads folder");
                }
            } else if (extLower.matches("zip|rar|7z|tar|gz|exe|msi|iso")) {
                if (folderNameLower.contains("compressed") || folderNameLower.contains("program")) {
                    score += 45.0;
                    reasons.add("Recommended for archives & programs");
                } else if (folderNameLower.equalsIgnoreCase("downloads")) {
                    score += 35.0;
                    reasons.add("Recommended for downloaded packages");
                }
            } else if (extLower.matches("jpg|jpeg|png|gif|webp|svg|bmp")) {
                if (folderNameLower.contains("picture") || folderNameLower.contains("image") || folderNameLower.contains("photo")) {
                    score += 45.0;
                    reasons.add("Recommended for image files");
                } else if (folderNameLower.equalsIgnoreCase("downloads")) {
                    score += 20.0;
                    reasons.add("Standard downloads folder");
                }
            }

            // Base score for standard user folders if no reasons accumulated
            if (reasons.isEmpty()) {
                String fName = path.getFileName().toString();
                if (fName.equalsIgnoreCase("Downloads")) {
                    score += 10.0;
                    reasons.add("Standard downloads folder");
                } else {
                    score += 1.0;
                    reasons.add("Local folder suggestion");
                }
            }

            String primaryReason = String.join(", ", reasons);
            String displayName = path.getFileName() != null ? path.getFileName().toString() : path.toString();
            suggestions.add(new FolderSuggestion(path.toAbsolutePath().toString(), displayName, score, primaryReason, hasDuplicate));
        }

        // Sort descending by score
        suggestions.sort((a, b) -> Double.compare(b.score(), a.score()));

        // Return top 3
        return suggestions.stream().limit(3).toList();
    }

    private String getExtension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        return (dot != -1 && dot < fileName.length() - 1) ? fileName.substring(dot + 1) : "";
    }
}
