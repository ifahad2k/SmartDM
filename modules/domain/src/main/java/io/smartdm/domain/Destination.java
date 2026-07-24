package io.smartdm.domain;

import java.util.Objects;

public record Destination(String value) {
    public Destination {
        Objects.requireNonNull(value, "Destination cannot be null");
        // We cannot use Path or File here due to architecture rules, so we assume the caller validates it
        // or we do basic string checks.
        if (value.isBlank()) {
            throw new IllegalArgumentException("Destination must not be blank");
        }
        
        String normalized = value.replace('\\', '/');
        
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("Path traversal is not allowed: " + value);
        }
    }
    
    public static Destination of(String path) {
        return new Destination(path);
    }
}
