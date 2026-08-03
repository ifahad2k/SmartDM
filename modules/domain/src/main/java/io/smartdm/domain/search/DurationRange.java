package io.smartdm.domain.search;

import java.time.Duration;

public record DurationRange(Duration min, Duration max) {
    public DurationRange {
        if (min != null && max != null && min.compareTo(max) > 0) {
            throw new IllegalArgumentException("Min duration must be less than or equal to max duration");
        }
    }
}
