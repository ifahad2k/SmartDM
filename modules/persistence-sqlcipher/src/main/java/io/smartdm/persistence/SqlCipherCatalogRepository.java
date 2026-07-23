package io.smartdm.persistence;

import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;
import io.smartdm.domain.repository.CatalogRepository;

import java.sql.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class SqlCipherCatalogRepository implements CatalogRepository {

    private final SqlCipherDatabase database;

    public SqlCipherCatalogRepository(SqlCipherDatabase database) {
        this.database = database;
    }

    @Override
    public void addRoot(CatalogRoot root) {
        String sql = "INSERT INTO catalog_root (id, path, display_name, created_at, scan_state, last_scanned_at) " +
                     "VALUES (?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET path=excluded.path, display_name=excluded.display_name, " +
                     "scan_state=excluded.scan_state, last_scanned_at=excluded.last_scanned_at";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, root.getId());
            stmt.setString(2, root.getPath());
            stmt.setString(3, root.getDisplayName());
            stmt.setString(4, root.getCreatedAt().toString());
            stmt.setString(5, root.getScanState());
            stmt.setString(6, root.getLastScannedAt() != null ? root.getLastScannedAt().toString() : null);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to add catalog root", e);
        }
    }

    @Override
    public void removeRoot(String rootId) {
        String sql = "DELETE FROM catalog_root WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, rootId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to remove catalog root", e);
        }
    }

    @Override
    public List<CatalogRoot> getAllRoots() {
        String sql = "SELECT id, path, display_name, created_at, scan_state, last_scanned_at FROM catalog_root";
        List<CatalogRoot> list = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                list.add(mapRoot(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list catalog roots", e);
        }
        return list;
    }

    @Override
    public Optional<CatalogRoot> getRootById(String id) {
        String sql = "SELECT id, path, display_name, created_at, scan_state, last_scanned_at FROM catalog_root WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRoot(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to get catalog root by id", e);
        }
        return Optional.empty();
    }

    @Override
    public void updateRootState(String rootId, String scanState) {
        String sql = "UPDATE catalog_root SET scan_state = ?, last_scanned_at = ? WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, scanState);
            stmt.setString(2, Instant.now().toString());
            stmt.setString(3, rootId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to update root scan state", e);
        }
    }

    @Override
    public void saveFile(CatalogFile file) {
        String sql = "INSERT INTO catalog_file (id, root_id, relative_path, file_name, file_extension, mime_type, " +
                     "file_size, created_at, modified_at, quick_hash, full_hash, metadata_json) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET relative_path=excluded.relative_path, file_name=excluded.file_name, " +
                     "file_extension=excluded.file_extension, mime_type=excluded.mime_type, file_size=excluded.file_size, " +
                     "modified_at=excluded.modified_at, quick_hash=excluded.quick_hash, full_hash=excluded.full_hash, " +
                     "metadata_json=excluded.metadata_json";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, file.getId());
            stmt.setString(2, file.getRootId());
            stmt.setString(3, file.getRelativePath());
            stmt.setString(4, file.getFileName());
            stmt.setString(5, file.getFileExtension());
            stmt.setString(6, file.getMimeType());
            stmt.setLong(7, file.getFileSize());
            stmt.setString(8, file.getCreatedAt().toString());
            stmt.setString(9, file.getModifiedAt().toString());
            stmt.setString(10, file.getQuickHash());
            stmt.setString(11, file.getFullHash());
            stmt.setString(12, file.getMetadataJson());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save catalog file", e);
        }
    }

    @Override
    public void removeFile(String fileId) {
        String sql = "DELETE FROM catalog_file WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, fileId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to remove catalog file", e);
        }
    }

    @Override
    public Optional<CatalogFile> getFileById(String id) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapFile(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to get catalog file by id", e);
        }
        return Optional.empty();
    }

    @Override
    public List<CatalogFile> getFilesForRoot(String rootId) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file WHERE root_id = ?";
        return queryFileList(sql, rootId);
    }

    @Override
    public List<CatalogFile> findFilesBySize(long fileSize) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file WHERE file_size = ?";
        return queryFileListByLongParam(sql, fileSize);
    }

    @Override
    public List<CatalogFile> findFilesByNameAndSize(String fileName, long fileSize) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file " +
                     "WHERE LOWER(file_name) = LOWER(?) AND file_size = ?";
        List<CatalogFile> list = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, fileName);
            stmt.setLong(2, fileSize);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    list.add(mapFile(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find files by name and size", e);
        }
        return list;
    }

    @Override
    public List<CatalogFile> findFilesByQuickHash(String quickHash) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file WHERE quick_hash = ?";
        return queryFileList(sql, quickHash);
    }

    @Override
    public List<CatalogFile> findFilesByFullHash(String fullHash) {
        String sql = "SELECT id, root_id, relative_path, file_name, file_extension, mime_type, file_size, " +
                     "created_at, modified_at, quick_hash, full_hash, metadata_json FROM catalog_file WHERE full_hash = ?";
        return queryFileList(sql, fullHash);
    }

    @Override
    public List<CatalogFile> searchFilesFts(String query) {
        String sql = "SELECT f.id, f.root_id, f.relative_path, f.file_name, f.file_extension, f.mime_type, " +
                     "f.file_size, f.created_at, f.modified_at, f.quick_hash, f.full_hash, f.metadata_json " +
                     "FROM catalog_file f JOIN catalog_file_fts fts ON f.rowid = fts.rowid " +
                     "WHERE catalog_file_fts MATCH ?";
        return queryFileList(sql, query);
    }

    @Override
    public void clearFilesForRoot(String rootId) {
        String sql = "DELETE FROM catalog_file WHERE root_id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, rootId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to clear files for root", e);
        }
    }

    private List<CatalogFile> queryFileList(String sql, String param) {
        List<CatalogFile> list = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, param);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    list.add(mapFile(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query catalog files", e);
        }
        return list;
    }

    private List<CatalogFile> queryFileListByLongParam(String sql, long param) {
        List<CatalogFile> list = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, param);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    list.add(mapFile(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query catalog files", e);
        }
        return list;
    }

    private CatalogRoot mapRoot(ResultSet rs) throws SQLException {
        String lastScannedStr = rs.getString("last_scanned_at");
        return new CatalogRoot(
            rs.getString("id"),
            rs.getString("path"),
            rs.getString("display_name"),
            Instant.parse(rs.getString("created_at")),
            rs.getString("scan_state"),
            lastScannedStr != null ? Instant.parse(lastScannedStr) : null
        );
    }

    private CatalogFile mapFile(ResultSet rs) throws SQLException {
        return new CatalogFile(
            rs.getString("id"),
            rs.getString("root_id"),
            rs.getString("relative_path"),
            rs.getString("file_name"),
            rs.getString("file_extension"),
            rs.getString("mime_type"),
            rs.getLong("file_size"),
            Instant.parse(rs.getString("created_at")),
            Instant.parse(rs.getString("modified_at")),
            rs.getString("quick_hash"),
            rs.getString("full_hash"),
            rs.getString("metadata_json")
        );
    }
}
