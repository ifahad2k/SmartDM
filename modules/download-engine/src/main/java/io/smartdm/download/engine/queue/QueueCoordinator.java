package io.smartdm.download.engine.queue;

import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadQueue;
import io.smartdm.domain.QueueItem;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

public class QueueCoordinator {
    
    // Stub for engine orchestrator hook
    public interface DownloadStarter {
        void startDownload(DownloadId id);
        void pauseDownload(DownloadId id);
        boolean isActive(DownloadId id);
        boolean isScheduledFuture(DownloadId id);
    }
    
    private final DownloadStarter starter;
    private final Map<String, DownloadQueue> queues = new ConcurrentHashMap<>();
    private final Map<String, List<QueueItem>> queueItems = new ConcurrentHashMap<>();
    private final Map<String, Set<DownloadId>> activeDownloadsPerQueue = new ConcurrentHashMap<>();
    private final AtomicBoolean coordinationRunning = new AtomicBoolean(false);

    public QueueCoordinator(DownloadStarter starter) {
        this.starter = starter;
    }

    public void updateQueue(DownloadQueue queue) {
        queues.put(queue.getId(), queue);
        activeDownloadsPerQueue.putIfAbsent(queue.getId(), ConcurrentHashMap.newKeySet());
        triggerCoordination();
    }

    public void updateQueueItems(String queueId, List<QueueItem> items) {
        // Sort items by priority, then order index
        List<QueueItem> sorted = items.stream()
            .sorted(Comparator.comparingInt(QueueItem::getPriority).reversed()
            .thenComparingInt(QueueItem::getOrderIndex))
            .collect(Collectors.toCollection(CopyOnWriteArrayList::new));
        queueItems.put(queueId, sorted);
        triggerCoordination();
    }
    
    public void markDownloadFinished(DownloadId id) {
        activeDownloadsPerQueue.values().forEach(set -> set.remove(id));
        // Also remove from queueItems to prevent restart
        for (List<QueueItem> items : queueItems.values()) {
            items.removeIf(item -> item.getDownloadId().equals(id));
        }
        triggerCoordination();
    }

    private void triggerCoordination() {
        if (coordinationRunning.compareAndSet(false, true)) {
            try {
                coordinate();
            } finally {
                coordinationRunning.set(false);
            }
        }
    }

    private void coordinate() {
        for (DownloadQueue queue : queues.values()) {
            Set<DownloadId> activeInQueue = activeDownloadsPerQueue.get(queue.getId());
            if (activeInQueue == null) continue;

            List<QueueItem> items = queueItems.get(queue.getId());
            if (items == null) continue;

            if (queue.getStatus() == DownloadQueue.Status.PAUSED) {
                // Pause all active in this queue
                for (DownloadId activeId : activeInQueue) {
                    starter.pauseDownload(activeId);
                    activeInQueue.remove(activeId);
                }
                continue;
            }

            // Queue is active, start downloads up to concurrency limit
            int limit = queue.getConcurrencyLimit();
            
            // First, sync actual active state (some might have failed/finished)
            activeInQueue.removeIf(id -> !starter.isActive(id));
            
            for (QueueItem item : items) {
                if (activeInQueue.size() >= limit) {
                    break;
                }
                
                if (!activeInQueue.contains(item.getDownloadId()) && !starter.isActive(item.getDownloadId())) {
                    if (starter.isScheduledFuture(item.getDownloadId())) {
                        continue; // Skip downloads scheduled for the future
                    }
                    activeInQueue.add(item.getDownloadId());
                    starter.startDownload(item.getDownloadId());
                }
            }
        }
    }
}
