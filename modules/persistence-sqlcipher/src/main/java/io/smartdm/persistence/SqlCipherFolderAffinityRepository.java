package io.smartdm.persistence;

import io.smartdm.domain.organization.FolderAffinity;
import io.smartdm.domain.repository.FolderAffinityRepository;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class SqlCipherFolderAffinityRepository implements FolderAffinityRepository {

    private final SqlCipherDatabase database;

    public SqlCipherFolderAffinityRepository(SqlCipherDatabase database) {
        this.database = database;
    }

    @Override
    public void save(FolderAffinity affinity) {
        String sql = """
            INSERT INTO folder_affinity (folder_path, category_id, extension_affinity, source_host_affinity, choice_count, last_used_at, is_pinned, is_blacklisted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(folder_path) DO UPDATE SET
                category_id = excluded.category_id,
                extension_affinity = excluded.extension_affinity,
                source_host_affinity = excluded.source_host_affinity,
                choice_count = excluded.choice_count,
                last_used_at = excluded.last_used_at,
                is_pinned = excluded.is_pinned,
                is_blacklisted = excluded.is_blacklisted
        """;
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, affinity.getFolderPath().toAbsolutePath().normalize().toString());
            stmt.setString(2, affinity.getCategoryId());
            stmt.setString(3, affinity.getExtensionAffinity());
            stmt.setString(4, affinity.getSourceHostAffinity());
            stmt.setInt(5, affinity.getChoiceCount());
            stmt.setLong(6, affinity.getLastUsedAt());
            stmt.setBoolean(7, affinity.isPinned());
            stmt.setBoolean(8, affinity.isBlacklisted());
            stmt.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("Failed to save folder affinity: " + e.getMessage(), e);
        }
    }

    @Override
    public Optional<FolderAffinity> findByPath(Path folderPath) {
        if (folderPath == null) return Optional.empty();
        String sql = "SELECT * FROM folder_affinity WHERE folder_path = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, folderPath.toAbsolutePath().normalize().toString());
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRow(rs));
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to find folder affinity by path: " + e.getMessage(), e);
        }
        return Optional.empty();
    }

    @Override
    public List<FolderAffinity> findAll() {
        String sql = "SELECT * FROM folder_affinity ORDER BY last_used_at DESC";
        List<FolderAffinity> list = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to find all folder affinities: " + e.getMessage(), e);
        }
        return list;
    }

    @Override
    public void recordChoiceHistory(String url, String sourceHost, String mimeType, String extension, Path chosenFolder, Path suggestedFolder, String action) {
        String sql = """
            INSERT INTO folder_choice_history (id, download_url, source_host, mime_type, file_extension, chosen_folder_path, suggested_folder_path, action, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, UUID.randomUUID().toString());
            stmt.setString(2, url);
            stmt.setString(3, sourceHost);
            stmt.setString(4, mimeType);
            stmt.setString(5, extension);
            stmt.setString(6, chosenFolder != null ? chosenFolder.toAbsolutePath().normalize().toString() : "");
            stmt.setString(7, suggestedFolder != null ? suggestedFolder.toAbsolutePath().normalize().toString() : null);
            stmt.setString(8, action);
            stmt.setLong(9, System.currentTimeMillis());
            stmt.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("Failed to record folder choice history: " + e.getMessage(), e);
        }
    }

    @Override
    public void resetLearnedPreferences() {
        try (Connection conn = database.getConnection()) {
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM folder_affinity WHERE is_pinned = 0")) {
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM folder_choice_history")) {
                stmt.executeUpdate();
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to reset learned preferences: " + e.getMessage(), e);
        }
    }

    private FolderAffinity mapRow(ResultSet rs) throws Exception {
        return new FolderAffinity(
            Paths.get(rs.getString("folder_path")),
            rs.getString("category_id"),
            rs.getString("extension_affinity"),
            rs.getString("source_host_affinity"),
            rs.getInt("choice_count"),
            rs.getLong("last_used_at"),
            rs.getBoolean("is_pinned"),
            rs.getBoolean("is_blacklisted")
        );
    }
}
