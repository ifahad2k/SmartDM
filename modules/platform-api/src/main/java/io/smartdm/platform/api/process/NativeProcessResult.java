package io.smartdm.platform.api.process;

import java.time.Duration;

public record NativeProcessResult(
        int exitCode,
        boolean timedOut,
        boolean cancelled,
        boolean stdoutLimitExceeded,
        boolean stderrLimitExceeded,
        Duration elapsed) {

    public boolean succeeded() {
        return exitCode == 0
                && !timedOut
                && !cancelled
                && !stdoutLimitExceeded
                && !stderrLimitExceeded;
    }
}
