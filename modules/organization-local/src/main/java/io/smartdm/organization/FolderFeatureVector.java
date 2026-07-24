package io.smartdm.organization;

public record FolderFeatureVector(
        boolean categoryExtensionMatch,
        boolean categoryMimeMatch,
        boolean isPinned,
        int choiceCount,
        long lastUsedAt,
        boolean extensionAffinityMatch,
        boolean hostAffinityMatch,
        boolean duplicateLocationMatch,
        boolean isDiskFull,
        boolean isLargeDiskSpace,
        boolean semanticVideoMatch
) {
    public double computeScore(FolderScoringWeights weights) {
        double score = 0.0;
        if (categoryExtensionMatch) score += weights.defaultExtensionMatch();
        if (categoryMimeMatch) score += weights.defaultMimeMatch();
        if (isPinned) score += weights.pinnedBonus();
        
        if (choiceCount > 0) {
            double base = Math.min(25.0, choiceCount * weights.choiceFrequencyWeight());
            double recency = 1.0;
            if (lastUsedAt > 0) {
                long days = (System.currentTimeMillis() - lastUsedAt) / (1000L * 60 * 60 * 24);
                if (days > 30) recency = 0.25;
                else if (days > 7) recency = 0.5;
            }
            score += base * recency;
        }

        if (extensionAffinityMatch) score += weights.extensionAffinityBonus();
        if (hostAffinityMatch) score += weights.hostAffinityBonus();
        if (duplicateLocationMatch) score += weights.duplicateLocationBonus();
        if (isDiskFull) score += weights.fullDiskPenalty();
        else if (isLargeDiskSpace) score += weights.largeDiskSpaceBonus();
        if (semanticVideoMatch) score += weights.semanticVideoBonus();

        return score;
    }
}
