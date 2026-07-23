package io.smartdm.domain.catalog;

import java.util.Objects;

public class CatalogDuplicateMatch {
    private final CatalogFile existingFile;
    private final DuplicateTier tier;
    private final String matchedProperty;

    public CatalogDuplicateMatch(CatalogFile existingFile, DuplicateTier tier, String matchedProperty) {
        this.existingFile = Objects.requireNonNull(existingFile, "existingFile must not be null");
        this.tier = Objects.requireNonNull(tier, "tier must not be null");
        this.matchedProperty = matchedProperty != null ? matchedProperty : "";
    }

    public CatalogFile getExistingFile() { return existingFile; }
    public DuplicateTier getTier() { return tier; }
    public String getMatchedProperty() { return matchedProperty; }
}
