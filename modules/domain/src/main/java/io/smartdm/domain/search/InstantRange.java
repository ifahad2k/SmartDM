package io.smartdm.domain.search;

import java.time.Instant;
import java.util.Objects;

public record InstantRange(Instant start, Instant end) {
    public InstantRange {
        if (start != null && end != null && start.isAfter(end)) {
            throw new IllegalArgumentException("Start must be before or equal to end");
        }
    }
}
