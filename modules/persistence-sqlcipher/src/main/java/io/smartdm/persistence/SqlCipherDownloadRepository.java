package io.smartdm.persistence;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.repository.DownloadRepository;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class SqlCipherDownloadRepository implements DownloadRepository {
    private final SqlCipherDatabase database;

    public SqlCipherDownloadRepository(SqlCipherDatabase database) {
        this.database = database;
    }

    @Override
    public void save(Download download) {
        String insertDownloadSql = "INSERT INTO download (id, source_uri, destination_path, state, total_bytes, downloaded_bytes, etag, last_modified) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET " +
                     "state=excluded.state, " +
                     "total_bytes=excluded.total_bytes, " +
                     "downloaded_bytes=excluded.downloaded_bytes, " +
                     "etag=excluded.etag, " +
                     "last_modified=excluded.last_modified";

        String deleteSegmentsSql = "DELETE FROM download_segment WHERE download_id = ?";
        
        String insertSegmentSql = "INSERT INTO download_segment (download_id, segment_index, start_offset, current_offset, end_offset) " +
                                  "VALUES (?, ?, ?, ?, ?)";

        try (Connection conn = database.getConnection()) {
            boolean autoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);
            
            try {
                // 1. Save main download record
                try (PreparedStatement stmt = conn.prepareStatement(insertDownloadSql)) {
                    stmt.setString(1, download.id().value());
                    stmt.setString(2, download.source().value().toString());
                    stmt.setString(3, download.destination().value().toString());
                    stmt.setString(4, download.state().name());
                    stmt.setLong(5, download.totalBytes().value());
                    stmt.setLong(6, download.downloadedBytes().value());
                    stmt.setString(7, download.etag());
                    stmt.setString(8, download.lastModified());
                    stmt.executeUpdate();
                }

                // 2. Save segments if they exist
                if (!download.segments().isEmpty()) {
                    try (PreparedStatement deleteStmt = conn.prepareStatement(deleteSegmentsSql)) {
                        deleteStmt.setString(1, download.id().value());
                        deleteStmt.executeUpdate();
                    }
                    
                    try (PreparedStatement insertStmt = conn.prepareStatement(insertSegmentSql)) {
                        for (DownloadSegment segment : download.segments()) {
                            insertStmt.setString(1, download.id().value());
                            insertStmt.setInt(2, segment.index());
                            insertStmt.setLong(3, segment.startOffset());
                            insertStmt.setLong(4, segment.currentOffset());
                            insertStmt.setLong(5, segment.endOffset());
                            insertStmt.addBatch();
                        }
                        insertStmt.executeBatch();
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
            throw new RuntimeException("Failed to save download", e);
        }
    }

    @Override
    public Optional<Download> findById(DownloadId id) {
        String sql = "SELECT * FROM download WHERE id = ?";
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, id.value());
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    Download download = mapRow(rs, conn);
                    return Optional.of(download);
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find download by id", e);
        }
        return Optional.empty();
    }

    @Override
    public List<Download> findAll() {
        String sql = "SELECT * FROM download";
        List<Download> results = new ArrayList<>();
        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
             
            while (rs.next()) {
                results.add(mapRow(rs, conn));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find all downloads", e);
        }
        return results;
    }

    @Override
    public void delete(DownloadId id) {
        String deleteDownloadSql = "DELETE FROM download WHERE id = ?";
        String deleteSegmentsSql = "DELETE FROM download_segment WHERE download_id = ?";
        
        try (Connection conn = database.getConnection()) {
            boolean autoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);
            try {
                try (PreparedStatement stmt = conn.prepareStatement(deleteSegmentsSql)) {
                    stmt.setString(1, id.value());
                    stmt.executeUpdate();
                }
                try (PreparedStatement stmt = conn.prepareStatement(deleteDownloadSql)) {
                    stmt.setString(1, id.value());
                    stmt.executeUpdate();
                }
                conn.commit();
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(autoCommit);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete download: " + id.value(), e);
        }
    }
    
    private Download mapRow(ResultSet rs, Connection conn) throws SQLException {
        DownloadId id = new DownloadId(rs.getString("id"));
        SourceUri source = SourceUri.of(rs.getString("source_uri"));
        Destination dest = Destination.of(Path.of(rs.getString("destination_path")));
        DownloadState state = DownloadState.valueOf(rs.getString("state"));
        ByteCount total = ByteCount.of(rs.getLong("total_bytes"));
        ByteCount downloaded = ByteCount.of(rs.getLong("downloaded_bytes"));
        String etag = rs.getString("etag");
        String lastModified = rs.getString("last_modified");
        
        Download d = new Download(id, source, dest);
        d.updateState(state);
        d.updateProgress(downloaded, total);
        d.updateIdentity(etag, lastModified);
        
        // Load segments
        List<DownloadSegment> segments = new ArrayList<>();
        String segmentSql = "SELECT * FROM download_segment WHERE download_id = ? ORDER BY segment_index ASC";
        try (PreparedStatement stmt = conn.prepareStatement(segmentSql)) {
            stmt.setString(1, id.value());
            try (ResultSet segmentRs = stmt.executeQuery()) {
                while (segmentRs.next()) {
                    segments.add(new DownloadSegment(
                        segmentRs.getInt("segment_index"),
                        segmentRs.getLong("start_offset"),
                        segmentRs.getLong("current_offset"),
                        segmentRs.getLong("end_offset")
                    ));
                }
            }
        }
        d.updateSegments(segments);
        
        return d;
    }
}
