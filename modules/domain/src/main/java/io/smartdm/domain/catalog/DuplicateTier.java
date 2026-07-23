package io.smartdm.domain.catalog;

public enum DuplicateTier {
    POSSIBLE_MATCH("Possible Match (Name & Size)"),
    STRONG_MATCH("Strong Match (Size & Quick Fingerprint)"),
    EXACT_MATCH("Exact Match (Full SHA-256 Hash)");

    private final String description;

    DuplicateTier(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
