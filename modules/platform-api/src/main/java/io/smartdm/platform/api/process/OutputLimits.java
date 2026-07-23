package io.smartdm.platform.api.process;

import java.time.Duration;
import java.util.Optional;

public record OutputLimits(
    int maxStdoutLines,
    int maxStderrLines,
    Duration timeout
) {
    public static OutputLimits unbounded() {
        return new OutputLimits(Integer.MAX_VALUE, Integer.MAX_VALUE, Duration.ofDays(365));
    }
}
