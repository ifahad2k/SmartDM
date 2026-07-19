package io.smartdm.domain;

import java.util.Objects;
import java.util.UUID;

public class QueueItem {
    private final String id;
    private final String queueId;
    private final DownloadId downloadId;
    private final int priority;
    private final int orderIndex;

    public QueueItem(String id, String queueId, DownloadId downloadId, int priority, int orderIndex) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.queueId = Objects.requireNonNull(queueId, "queueId must not be null");
        this.downloadId = Objects.requireNonNull(downloadId, "downloadId must not be null");
        this.priority = priority;
        this.orderIndex = orderIndex;
    }

    public static QueueItem createNew(String queueId, DownloadId downloadId, int priority, int orderIndex) {
        return new QueueItem(UUID.randomUUID().toString(), queueId, downloadId, priority, orderIndex);
    }

    public String getId() {
        return id;
    }

    public String getQueueId() {
        return queueId;
    }

    public DownloadId getDownloadId() {
        return downloadId;
    }

    public int getPriority() {
        return priority;
    }

    public int getOrderIndex() {
        return orderIndex;
    }

    public QueueItem withPriority(int newPriority) {
        return new QueueItem(this.id, this.queueId, this.downloadId, newPriority, this.orderIndex);
    }

    public QueueItem withOrderIndex(int newOrderIndex) {
        return new QueueItem(this.id, this.queueId, this.downloadId, this.priority, newOrderIndex);
    }
}
