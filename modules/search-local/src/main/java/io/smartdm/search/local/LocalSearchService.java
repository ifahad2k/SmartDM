package io.smartdm.search.local;

import io.smartdm.domain.repository.LocalSearchRepository;
import io.smartdm.domain.search.LocalSearchPlan;
import io.smartdm.domain.search.LocalSearchResult;
import io.smartdm.search.local.parser.LocalSearchQueryParser;

import java.util.List;

public class LocalSearchService {
    
    private final LocalSearchRepository repository;
    private final LocalSearchQueryParser parser;

    public LocalSearchService(LocalSearchRepository repository) {
        this.repository = repository;
        this.parser = new LocalSearchQueryParser();
    }

    public List<LocalSearchResult> search(String query, int limit, int offset) {
        LocalSearchPlan plan = parser.parse(query);
        return repository.executeSearch(plan, limit, offset);
    }

    public LocalSearchQueryParser getParser() {
        return parser;
    }
}
