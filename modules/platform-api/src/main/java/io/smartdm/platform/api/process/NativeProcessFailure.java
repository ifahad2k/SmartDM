package io.smartdm.platform.api.process;

public enum NativeProcessFailure {
    STDOUT_READ_FAILED,
    STDERR_READ_FAILED,
    OUTPUT_LISTENER_FAILED,
    LINE_LIMIT_EXCEEDED,
    TERMINATION_FAILED
}
