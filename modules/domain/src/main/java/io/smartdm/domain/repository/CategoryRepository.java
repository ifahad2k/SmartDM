package io.smartdm.domain.repository;

import io.smartdm.domain.Category;
import io.smartdm.domain.CategoryId;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository {
    void save(Category category);
    Optional<Category> findById(CategoryId id);
    List<Category> findAll();
    void delete(CategoryId id);
}
