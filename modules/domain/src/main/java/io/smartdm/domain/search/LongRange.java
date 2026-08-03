package io.smartdm.domain.search;

public record LongRange(Long min, Long max) {
    public LongRange {
        if (min != null && max != null && min > max) {
            throw new IllegalArgumentException("Min must be less than or equal to max");
        }
    }
}
