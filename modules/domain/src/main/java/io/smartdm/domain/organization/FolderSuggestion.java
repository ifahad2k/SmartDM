package io.smartdm.domain.organization;

import java.nio.file.Path;

public record FolderSuggestion(
    Path folderPath,
    String displayName,
    double score,
    String reason,
    boolean containsDuplicate
) {}
