package io.smartdm.organization;

public record FolderScoringWeights(
        double defaultExtensionMatch,
        double defaultMimeMatch,
        double pinnedBonus,
        double choiceFrequencyWeight,
        double extensionAffinityBonus,
        double hostAffinityBonus,
        double duplicateLocationBonus,
        double largeDiskSpaceBonus,
        double fullDiskPenalty,
        double semanticVideoBonus
) {
    public static FolderScoringWeights defaults() {
        return new FolderScoringWeights(
                50.0,
                40.0,
                30.0,
                5.0,
                20.0,
                15.0,
                35.0,
                5.0,
                -100.0,
                45.0
        );
    }
}
