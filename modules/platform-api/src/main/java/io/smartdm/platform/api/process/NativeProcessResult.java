package io.smartdm.platform.api.process;

import java.time.Duration;

import java.util.List;

public record NativeProcessResult(
        int exitCode,
        boolean timedOut,
        boolean cancelled,
        boolean stdoutLimitExceeded,
        boolean stderrLimitExceeded,
        List<NativeProcessFailure> failures,
        Duration elapsed) {

    public boolean succeeded() {
        return exitCode == 0
                && !timedOut
                && !cancelled
                && !stdoutLimitExceeded
                && !stderrLimitExceeded
                && (failures == null || failures.isEmpty());
    }
}
