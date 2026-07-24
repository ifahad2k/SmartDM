package io.smartdm.persistence;

import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadQueue;
import io.smartdm.domain.QueueItem;
import io.smartdm.domain.repository.QueueRepository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class SqlCipherQueueRepository implements QueueRepository {
    private final SqlCipherDatabase dbManager;

    public SqlCipherQueueRepository(SqlCipherDatabase dbManager) {
        this.dbManager = Objects.requireNonNull(dbManager, "dbManager must not be null");
    }

    @Override
    public void saveQueue(DownloadQueue queue) {
        String sql = "INSERT INTO download_queue (id, name, concurrency_limit, bandwidth_limit_bytes, status) " +
                     "VALUES (?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET " +
                     "name=excluded.name, concurrency_limit=excluded.concurrency_limit, " +
                     "bandwidth_limit_bytes=excluded.bandwidth_limit_bytes, status=excluded.status";

        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, queue.getId());
            stmt.setString(2, queue.getName());
            stmt.setInt(3, queue.getConcurrencyLimit());
            if (queue.getBandwidthLimitBytes().isPresent()) {
                stmt.setLong(4, queue.getBandwidthLimitBytes().get());
            } else {
                stmt.setNull(4, java.sql.Types.INTEGER);
            }
            stmt.setString(5, queue.getStatus().name());
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save download queue: " + queue.getId(), e);
        }
    }

    @Override
    public Optional<DownloadQueue> findQueueById(String id) {
        String sql = "SELECT * FROM download_queue WHERE id = ?";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapQueue(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find queue: " + id, e);
        }
        return Optional.empty();
    }

    @Override
    public List<DownloadQueue> findAllQueues() {
        List<DownloadQueue> queues = new ArrayList<>();
        String sql = "SELECT * FROM download_queue";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                queues.add(mapQueue(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find all queues", e);
        }
        return queues;
    }

    @Override
    public void deleteQueue(String id) {
        String sql = "DELETE FROM download_queue WHERE id = ?";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, id);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete queue: " + id, e);
        }
    }

    @Override
    public void saveQueueItems(String queueId, List<QueueItem> items) {
        String deleteSql = "DELETE FROM queue_item WHERE queue_id = ?";
        String insertSql = "INSERT INTO queue_item (id, queue_id, download_id, priority, order_index) VALUES (?, ?, ?, ?, ?)";

        try (Connection conn = dbManager.getConnection()) {
            conn.setAutoCommit(false);
            try {
                try (PreparedStatement delStmt = conn.prepareStatement(deleteSql)) {
                    delStmt.setString(1, queueId);
                    delStmt.executeUpdate();
                }
                try (PreparedStatement insStmt = conn.prepareStatement(insertSql)) {
                    for (QueueItem item : items) {
                        insStmt.setString(1, item.getId());
                        insStmt.setString(2, queueId);
                        insStmt.setString(3, item.getDownloadId().value());
                        insStmt.setInt(4, item.getPriority());
                        insStmt.setInt(5, item.getOrderIndex());
                        insStmt.addBatch();
                    }
                    insStmt.executeBatch();
                }
                conn.commit();
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save queue items for queue: " + queueId, e);
        }
    }

    @Override
    public List<QueueItem> findItemsByQueueId(String queueId) {
        List<QueueItem> items = new ArrayList<>();
        String sql = "SELECT * FROM queue_item WHERE queue_id = ? ORDER BY priority DESC, order_index ASC";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, queueId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    items.add(new QueueItem(
                            rs.getString("id"),
                            rs.getString("queue_id"),
                            new DownloadId(rs.getString("download_id")),
                            rs.getInt("priority"),
                            rs.getInt("order_index")
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find queue items for: " + queueId, e);
        }
        return items;
    }

    @Override
    public void deleteQueueItem(String itemId) {
        String sql = "DELETE FROM queue_item WHERE id = ?";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, itemId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete queue item: " + itemId, e);
        }
    }

    private DownloadQueue mapQueue(ResultSet rs) throws SQLException {
        Long bwLimit = rs.getObject("bandwidth_limit_bytes") != null ? rs.getLong("bandwidth_limit_bytes") : null;
        return new DownloadQueue(
                rs.getString("id"),
                rs.getString("name"),
                rs.getInt("concurrency_limit"),
                bwLimit,
                DownloadQueue.Status.valueOf(rs.getString("status"))
        );
    }
}
