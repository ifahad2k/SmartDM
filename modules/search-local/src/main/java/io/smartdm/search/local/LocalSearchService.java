package io.smartdm.search.local;

import io.smartdm.ai.api.*;
import io.smartdm.domain.repository.LocalSearchRepository;
import io.smartdm.domain.search.LocalSearchPlan;
import io.smartdm.domain.search.LocalSearchResult;
import io.smartdm.search.local.parser.LocalSearchQueryParser;

import java.util.List;

public class LocalSearchService {
    
    private final LocalSearchRepository repository;
    private final LocalSearchQueryParser parser;
    private OptionalAiAdvisor aiAdvisor;
    private ConsentFirewall consentFirewall;

    public LocalSearchService(LocalSearchRepository repository) {
        this(repository, null);
    }

    public LocalSearchService(LocalSearchRepository repository, OptionalAiAdvisor aiAdvisor) {
        this.repository = repository;
        this.parser = new LocalSearchQueryParser();
        this.aiAdvisor = aiAdvisor;
        this.consentFirewall = new ConsentFirewall();
    }

    public void setAiAdvisor(OptionalAiAdvisor aiAdvisor) {
        this.aiAdvisor = aiAdvisor;
    }

    public List<LocalSearchResult> search(String query, int limit, int offset) {
        LocalSearchPlan plan = parser.parse(query);

        // Optional AI fallback integration for ambiguous terms
        if (aiAdvisor != null && aiAdvisor.capability() != null && aiAdvisor.capability().supportsQueryParsing()) {
            try {
                ApprovedPayload payload = consentFirewall.sanitizeAndApprove(
                    AiTask.QUERY_PARSING,
                    query,
                    List.of(),
                    "Interpret ambiguous query terms"
                );
                AiSuggestion suggestion = aiAdvisor.request(AiTask.QUERY_PARSING, payload, null)
                    .toCompletableFuture().get(3, java.util.concurrent.TimeUnit.SECONDS);
                if (suggestion != null && suggestion.success()) {
                    System.out.println("[AI Search Advisor] Received AI suggestion: " + suggestion.suggestionText());
                }
            } catch (Exception ignored) {
                // Silent local fallback on AI failure, timeout, or refusal
            }
        }

        return repository.executeSearch(plan, limit, offset);
    }

    public LocalSearchQueryParser getParser() {
        return parser;
    }
}
