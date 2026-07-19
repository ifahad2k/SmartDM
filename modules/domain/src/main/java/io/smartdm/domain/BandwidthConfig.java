package io.smartdm.domain;

import java.util.Optional;

public class BandwidthConfig {
    
    private final Long limitBytesPerSecond;
    
    private BandwidthConfig(Long limitBytesPerSecond) {
        if (limitBytesPerSecond != null && limitBytesPerSecond < 0) {
            throw new IllegalArgumentException("Bandwidth limit cannot be negative");
        }
        // As per requirements: “Unlimited” is represented explicitly, never as zero permits.
        // We use null to represent unlimited explicitly.
        if (limitBytesPerSecond != null && limitBytesPerSecond == 0) {
            throw new IllegalArgumentException("Bandwidth limit cannot be exactly zero. Use unlimited.");
        }
        this.limitBytesPerSecond = limitBytesPerSecond;
    }

    public static BandwidthConfig unlimited() {
        return new BandwidthConfig(null);
    }
    
    public static BandwidthConfig of(long bytesPerSecond) {
        return new BandwidthConfig(bytesPerSecond);
    }

    public Optional<Long> getLimitBytesPerSecond() {
        return Optional.ofNullable(limitBytesPerSecond);
    }
    
    public boolean isUnlimited() {
        return limitBytesPerSecond == null;
    }
}
