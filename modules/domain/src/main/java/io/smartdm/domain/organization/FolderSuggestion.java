package io.smartdm.domain.organization;

public record FolderSuggestion(
    String folderPath,
    String displayName,
    double score,
    String reason,
    boolean containsDuplicate
) {}
