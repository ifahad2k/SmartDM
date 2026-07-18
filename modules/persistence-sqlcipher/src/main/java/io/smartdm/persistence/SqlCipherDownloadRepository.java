package io.smartdm.persistence;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
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
        String sql = "INSERT INTO download (id, source_uri, destination_path, state, total_bytes, downloaded_bytes) " +
                     "VALUES (?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET " +
                     "state=excluded.state, " +
                     "total_bytes=excluded.total_bytes, " +
                     "downloaded_bytes=excluded.downloaded_bytes";

        try (Connection conn = database.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, download.id().value());
            stmt.setString(2, download.source().value().toString());
            stmt.setString(3, download.destination().value().toString());
            stmt.setString(4, download.state().name());
            stmt.setLong(5, download.totalBytes().value());
            stmt.setLong(6, download.downloadedBytes().value());
            
            stmt.executeUpdate();
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
                    return Optional.of(mapRow(rs));
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
                results.add(mapRow(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find all downloads", e);
        }
        return results;
    }
    
    private Download mapRow(ResultSet rs) throws SQLException {
        DownloadId id = new DownloadId(rs.getString("id"));
        SourceUri source = SourceUri.of(rs.getString("source_uri"));
        Destination dest = Destination.of(Path.of(rs.getString("destination_path")));
        DownloadState state = DownloadState.valueOf(rs.getString("state"));
        ByteCount total = ByteCount.of(rs.getLong("total_bytes"));
        ByteCount downloaded = ByteCount.of(rs.getLong("downloaded_bytes"));
        
        Download d = new Download(id, source, dest);
        d.updateState(state);
        d.updateProgress(downloaded, total);
        return d;
    }
}
