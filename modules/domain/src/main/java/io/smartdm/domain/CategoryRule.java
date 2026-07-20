package io.smartdm.domain;

import java.util.Objects;

public class CategoryRule {
    public enum RuleType {
        EXTENSION,
        MIME_TYPE,
        HOST,
        MIN_SIZE,
        MAX_SIZE
    }

    private final RuleType type;
    private final String value;

    public CategoryRule(RuleType type, String value) {
        this.type = Objects.requireNonNull(type);
        this.value = Objects.requireNonNull(value);
    }

    public RuleType type() { return type; }
    public String value() { return value; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CategoryRule)) return false;
        CategoryRule that = (CategoryRule) o;
        return type == that.type && value.equals(that.value);
    }

    @Override
    public int hashCode() {
        return Objects.hash(type, value);
    }
}
