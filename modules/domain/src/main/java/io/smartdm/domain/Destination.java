package io.smartdm.domain;

import java.nio.file.Path;
import java.util.Objects;

public record Destination(Path value) {
    public Destination {
        Objects.requireNonNull(value, "Destination cannot be null");
        if (!value.isAbsolute()) {
            throw new IllegalArgumentException("Destination must be an absolute path");
        }
    }
    
    public static Destination of(Path path) {
        return new Destination(path);
    }
}
