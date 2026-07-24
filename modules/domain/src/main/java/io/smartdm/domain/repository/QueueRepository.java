package io.smartdm.domain.repository;

import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadQueue;
import io.smartdm.domain.QueueItem;

import java.util.List;
import java.util.Optional;

public interface QueueRepository {
    void saveQueue(DownloadQueue queue);
    Optional<DownloadQueue> findQueueById(String id);
    List<DownloadQueue> findAllQueues();
    void deleteQueue(String id);

    void saveQueueItems(String queueId, List<QueueItem> items);
    List<QueueItem> findItemsByQueueId(String queueId);
    void deleteQueueItem(String itemId);

    Optional<String> findQueueIdForDownload(DownloadId downloadId);
}
