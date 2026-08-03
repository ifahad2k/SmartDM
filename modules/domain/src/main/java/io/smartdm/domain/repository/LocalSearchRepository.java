package io.smartdm.domain.repository;

import io.smartdm.domain.search.LocalSearchPlan;
import io.smartdm.domain.search.LocalSearchResult;

import java.util.List;

public interface LocalSearchRepository {
    List<LocalSearchResult> executeSearch(LocalSearchPlan plan, int limit, int offset);
}
