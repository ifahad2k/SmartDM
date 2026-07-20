package io.smartdm.domain;

import java.util.Objects;
import java.util.UUID;

public class CategoryId {
    private final String value;

    private CategoryId(String value) {
        this.value = Objects.requireNonNull(value);
    }

    public static CategoryId of(String value) {
        return new CategoryId(value);
    }

    public static CategoryId generate() {
        return new CategoryId(UUID.randomUUID().toString());
    }

    public String value() {
        return value;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CategoryId)) return false;
        CategoryId that = (CategoryId) o;
        return value.equals(that.value);
    }

    @Override
    public int hashCode() {
        return Objects.hash(value);
    }

    @Override
    public String toString() {
        return value;
    }
}
