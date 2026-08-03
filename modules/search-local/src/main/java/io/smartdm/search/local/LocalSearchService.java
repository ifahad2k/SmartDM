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

        // Optional AI fallback integration for natural language queries
        if (aiAdvisor != null && aiAdvisor.capability() != null && aiAdvisor.capability().supportsQueryParsing()) {
            try {
                ApprovedPayload payload = consentFirewall.sanitizeAndApprove(
                    AiTask.QUERY_PARSING,
                    query,
                    List.of(),
                    "Interpret natural language query intent"
                );
                AiSuggestion suggestion = aiAdvisor.request(AiTask.QUERY_PARSING, payload, null)
                    .toCompletableFuture().get(4, java.util.concurrent.TimeUnit.SECONDS);
                if (suggestion != null && suggestion.success() && suggestion.suggestionText() != null) {
                    System.out.println("[AI Search Advisor] LLM parsed intent: " + suggestion.suggestionText());
                    String text = suggestion.suggestionText().toLowerCase();
                    if (text.contains("limit\": 1") || text.contains("single") || text.contains("last") || text.contains("latest")) {
                        plan = new io.smartdm.domain.search.LocalSearchPlan(
                            plan.text(),
                            plan.kinds(),
                            plan.dateRange(),
                            plan.sizeBytes(),
                            plan.mediaDuration(),
                            plan.states(),
                            plan.scope(),
                            io.smartdm.domain.search.SortOrder.DATE_DESC,
                            plan.unparsedTerms(),
                            java.util.Optional.of(1)
                        );
                    }
                }
            } catch (Exception ignored) {
                // Silent local fallback on AI failure, timeout, or refusal
            }
        }

        int effectiveLimit = plan.maxResults().isPresent() ? plan.maxResults().get() : limit;
        return repository.executeSearch(plan, effectiveLimit, offset);
    }

    public LocalSearchQueryParser getParser() {
        return parser;
    }
}
