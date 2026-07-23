package io.smartdm.platform.api.process;

public record OutputLimits(
        long maxStdoutBytes,
        long maxStderrBytes,
        int maxLineCharacters) {

    public OutputLimits {
        if (maxStdoutBytes <= 0) {
            throw new IllegalArgumentException("maxStdoutBytes must be positive");
        }
        if (maxStderrBytes <= 0) {
            throw new IllegalArgumentException("maxStderrBytes must be positive");
        }
        if (maxLineCharacters <= 0) {
            throw new IllegalArgumentException("maxLineCharacters must be positive");
        }
    }

    public static OutputLimits mediaDefaults() {
        return new OutputLimits(
                64L * 1024L * 1024L,
                64L * 1024L * 1024L,
                64 * 1024);
    }

    /* test-only */
    static OutputLimits testDefaults() {
        return new OutputLimits(
                1024L * 1024L,
                1024L * 1024L,
                16 * 1024);
    }
}
