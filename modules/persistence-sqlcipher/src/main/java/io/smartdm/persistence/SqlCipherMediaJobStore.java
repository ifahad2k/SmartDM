package io.smartdm.persistence;

import io.smartdm.domain.DownloadId;
import io.smartdm.media.api.job.MediaJobDescriptor;
import io.smartdm.media.api.job.MediaJobStatus;
import io.smartdm.media.api.job.MediaJobStore;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class SqlCipherMediaJobStore implements MediaJobStore {

    private final DataSource dataSource;

    public SqlCipherMediaJobStore(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource);
    }

    @Override
    public boolean exists(DownloadId downloadId) {
        Objects.requireNonNull(downloadId);

        String sql = """
                SELECT 1
                FROM media_job
                WHERE download_id = ?
                """;

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setString(1, downloadId.value());

            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        } catch (SQLException exception) {
            throw new MediaJobPersistenceException(
                    "Could not check media job identity",
                    exception);
        }
    }

    @Override
    public Optional<MediaJobDescriptor> find(DownloadId downloadId) {
        Objects.requireNonNull(downloadId);

        String sql = """
                SELECT download_id,
                       webpage_url,
                       format_argument,
                       status,
                       created_at,
                       updated_at
                FROM media_job
                WHERE download_id = ?
                """;

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setString(1, downloadId.value());

            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return Optional.empty();
                }

                return Optional.of(new MediaJobDescriptor(
                        new DownloadId(result.getString("download_id")),
                        result.getString("webpage_url"),
                        result.getString("format_argument"),
                        MediaJobStatus.valueOf(result.getString("status")),
                        Instant.parse(result.getString("created_at")),
                        Instant.parse(result.getString("updated_at"))));
            }
        } catch (SQLException exception) {
            throw new MediaJobPersistenceException(
                    "Could not read media job",
                    exception);
        }
    }

    @Override
    public void save(MediaJobDescriptor descriptor) {
        Objects.requireNonNull(descriptor);

        String sql = """
                INSERT INTO media_job (
                    download_id,
                    webpage_url,
                    format_argument,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(download_id) DO UPDATE SET
                    webpage_url = excluded.webpage_url,
                    format_argument = excluded.format_argument,
                    status = excluded.status,
                    updated_at = excluded.updated_at
                """;

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setString(1, descriptor.downloadId().value());
            statement.setString(2, descriptor.webpageUrl());
            statement.setString(3, descriptor.formatArgument());
            statement.setString(4, descriptor.status().name());
            statement.setString(5, descriptor.createdAt().toString());
            statement.setString(6, descriptor.updatedAt().toString());

            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new MediaJobPersistenceException(
                    "Could not save media job",
                    exception);
        }
    }

    @Override
    public void delete(DownloadId downloadId) {
        Objects.requireNonNull(downloadId);

        String sql = "DELETE FROM media_job WHERE download_id = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setString(1, downloadId.value());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new MediaJobPersistenceException(
                    "Could not delete media job",
                    exception);
        }
    }
}
