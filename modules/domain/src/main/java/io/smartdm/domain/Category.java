package io.smartdm.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

public class Category {
    private final CategoryId id;
    private final String name;
    private final Destination defaultDestination;
    private final List<CategoryRule> rules;

    public Category(CategoryId id, String name, Destination defaultDestination, List<CategoryRule> rules) {
        this.id = Objects.requireNonNull(id);
        this.name = Objects.requireNonNull(name);
        this.defaultDestination = defaultDestination; // Can be null if no default
        this.rules = new ArrayList<>(Objects.requireNonNull(rules));
    }

    public CategoryId id() { return id; }
    public String name() { return name; }
    public Destination defaultDestination() { return defaultDestination; }
    public List<CategoryRule> rules() { return Collections.unmodifiableList(rules); }
}
