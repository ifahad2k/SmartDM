package io.smartdm.domain;

import java.net.URI;
import java.util.Objects;

public record SourceUri(URI value) {
    public SourceUri {
        Objects.requireNonNull(value, "SourceUri cannot be null");
        if (!"http".equalsIgnoreCase(value.getScheme()) && !"https".equalsIgnoreCase(value.getScheme())) {
            throw new IllegalArgumentException("SourceUri must be an HTTP or HTTPS URI");
        }
    }
    
    public static SourceUri of(String uri) {
        return new SourceUri(URI.create(uri));
    }
}
