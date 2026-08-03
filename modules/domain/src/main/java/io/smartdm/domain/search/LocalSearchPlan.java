package io.smartdm.domain.search;

import io.smartdm.domain.DownloadState;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public record LocalSearchPlan(
    Optional<String> text,
    Set<FileKind> kinds,
    Optional<InstantRange> dateRange,
    Optional<LongRange> sizeBytes,
    Optional<DurationRange> mediaDuration,
    Set<DownloadState> states,
    Optional<PathScope> scope,
    SortOrder sortOrder,
    List<String> unparsedTerms,
    Optional<Integer> maxResults
) {
    public LocalSearchPlan(
        Optional<String> text,
        Set<FileKind> kinds,
        Optional<InstantRange> dateRange,
        Optional<LongRange> sizeBytes,
        Optional<DurationRange> mediaDuration,
        Set<DownloadState> states,
        Optional<PathScope> scope,
        SortOrder sortOrder,
        List<String> unparsedTerms
    ) {
        this(text, kinds, dateRange, sizeBytes, mediaDuration, states, scope, sortOrder, unparsedTerms, Optional.empty());
    }
}
