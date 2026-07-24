package io.smartdm.download.engine.queue;

import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadQueue;
import io.smartdm.domain.QueueItem;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;

class QueueCoordinatorTest {

    @Test
    void shouldRespectConcurrencyLimitAndPriority() {
        Set<DownloadId> started = ConcurrentHashMap.newKeySet();
        Set<DownloadId> paused = ConcurrentHashMap.newKeySet();

        QueueCoordinator.DownloadStarter starter = new QueueCoordinator.DownloadStarter() {
            @Override
            public void startDownload(DownloadId id) { started.add(id); paused.remove(id); }
            @Override
            public void pauseDownload(DownloadId id) { paused.add(id); started.remove(id); }
            @Override
            public boolean isActive(DownloadId id) { return started.contains(id); }
            @Override
            public boolean isScheduledFuture(DownloadId id) { return false; }
        };

        QueueCoordinator coordinator = new QueueCoordinator(starter);

        DownloadQueue queue = DownloadQueue.createNew("Main", 2, null);
        coordinator.updateQueue(queue);

        DownloadId id1 = DownloadId.generate();
        DownloadId id2 = DownloadId.generate();
        DownloadId id3 = DownloadId.generate();

        QueueItem item1 = QueueItem.createNew(queue.getId(), id1, 1, 1);
        QueueItem item2 = QueueItem.createNew(queue.getId(), id2, 5, 2); // highest priority
        QueueItem item3 = QueueItem.createNew(queue.getId(), id3, 1, 3);

        coordinator.updateQueueItems(queue.getId(), List.of(item1, item2, item3));

        // Limit is 2, item2 has highest priority, so it should start first, then item1 (since it has higher order index than 3? No order index 1 is lower, so it comes first).
        assertThat(started).contains(id2, id1);
        assertThat(started).doesNotContain(id3);
        
        // Mark id2 as finished, id3 should start
        started.remove(id2);
        coordinator.updateQueueItems(queue.getId(), List.of(item1, item3));
        coordinator.markDownloadFinished(id2);
        
        assertThat(started).contains(id1, id3);
    }

    @Test
    void shouldRestoreQueueWithoutImmediateSideEffects() {
        Set<DownloadId> started = ConcurrentHashMap.newKeySet();

        QueueCoordinator.DownloadStarter starter = new QueueCoordinator.DownloadStarter() {
            @Override public void startDownload(DownloadId id) { started.add(id); }
            @Override public void pauseDownload(DownloadId id) { started.remove(id); }
            @Override public boolean isActive(DownloadId id) { return started.contains(id); }
            @Override public boolean isScheduledFuture(DownloadId id) { return false; }
        };

        QueueCoordinator coordinator = new QueueCoordinator(starter);

        DownloadQueue queue1 = new DownloadQueue("q1", "Queue 1", 1, null, DownloadQueue.Status.ACTIVE);
        DownloadQueue queue2 = new DownloadQueue("q2", "Queue 2", 2, null, DownloadQueue.Status.PAUSED);

        DownloadId id1 = DownloadId.generate();
        DownloadId id2 = DownloadId.generate();
        DownloadId id3 = DownloadId.generate();

        QueueItem item1 = QueueItem.createNew("q1", id1, 10, 1);
        QueueItem item2 = QueueItem.createNew("q1", id2, 5, 2);
        QueueItem item3 = QueueItem.createNew("q2", id3, 1, 1);

        coordinator.restoreQueue(queue1, List.of(item1, item2));
        coordinator.restoreQueue(queue2, List.of(item3));

        // Activate Queue 1
        coordinator.updateQueue(queue1);
        assertThat(started).containsExactly(id1);

        // Activate Queue 2
        coordinator.updateQueue(queue2.withStatus(DownloadQueue.Status.ACTIVE));
        assertThat(started).contains(id1, id3);
    }
}
