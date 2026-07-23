package io.smartdm.persistence;

import io.smartdm.domain.Category;
import io.smartdm.domain.CategoryId;
import io.smartdm.domain.CategoryRule;
import io.smartdm.domain.Destination;
import io.smartdm.domain.repository.CategoryRepository;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class SqlCipherCategoryRepository implements CategoryRepository {
    private final SqlCipherDatabase database;

    public SqlCipherCategoryRepository(SqlCipherDatabase database) {
        this.database = database;
    }

    @Override
    public void save(Category category) {
        String insertCategory = "INSERT INTO category (id, name, default_destination_path) VALUES (?, ?, ?) " +
                                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, default_destination_path=excluded.default_destination_path";
        String deleteRules = "DELETE FROM category_rule WHERE category_id = ?";
        String insertRule = "INSERT INTO category_rule (category_id, rule_type, rule_value) VALUES (?, ?, ?)";

        try (Connection conn = database.getConnection()) {
            boolean autoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);

            try {
                try (PreparedStatement stmt = conn.prepareStatement(insertCategory)) {
                    stmt.setString(1, category.id().value());
                    stmt.setString(2, category.name());
                    if (category.defaultDestination() != null) {
                        stmt.setString(3, category.defaultDestination().value().toString());
                    } else {
                        stmt.setNull(3, java.sql.Types.VARCHAR);
                    }
                    stmt.executeUpdate();
                }

                try (PreparedStatement stmt = conn.prepareStatement(deleteRules)) {
                    stmt.setString(1, category.id().value());
                    stmt.executeUpdate();
                }

                if (!category.rules().isEmpty()) {
                    try (PreparedStatement stmt = conn.prepareStatement(insertRule)) {
                        for (CategoryRule rule : category.rules()) {
                            stmt.setString(1, category.id().value());
                            stmt.setString(2, rule.type().name());
                            stmt.setString(3, rule.value());
                            stmt.addBatch();
                        }
                        stmt.executeBatch();
                    }
                }

                conn.commit();
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(autoCommit);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save category", e);
        }
    }

    @Override
    public Optional<Category> findById(CategoryId id) {
        String sql = "SELECT * FROM category WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id.value());
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRow(rs, conn));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find category by id", e);
        }
        return Optional.empty();
    }

    @Override
    public List<Category> findAll() {
        String sql = "SELECT * FROM category";
        List<Category> results = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                results.add(mapRow(rs, conn));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find all categories", e);
        }
        return results;
    }

    @Override
    public void delete(CategoryId id) {
        String sql = "DELETE FROM category WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id.value());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete category", e);
        }
    }

    private Category mapRow(ResultSet rs, Connection conn) throws SQLException {
        CategoryId id = CategoryId.of(rs.getString("id"));
        String name = rs.getString("name");
        String destPathStr = rs.getString("default_destination_path");
        Destination defaultDest = destPathStr != null ? Destination.of(destPathStr) : null;

        List<CategoryRule> rules = new ArrayList<>();
        String rulesSql = "SELECT * FROM category_rule WHERE category_id = ?";
        try (PreparedStatement stmt = conn.prepareStatement(rulesSql)) {
            stmt.setString(1, id.value());
            try (ResultSet rulesRs = stmt.executeQuery()) {
                while (rulesRs.next()) {
                    rules.add(new CategoryRule(
                        CategoryRule.RuleType.valueOf(rulesRs.getString("rule_type")),
                        rulesRs.getString("rule_value")
                    ));
                }
            }
        }
        return new Category(id, name, defaultDest, rules);
    }
}
