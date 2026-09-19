package io.smartdm.domain;

public class DownloadSegment {
    private final int index;
    private final long startOffset;
    private volatile long currentOffset;
    private volatile long endOffset;

    public DownloadSegment(int index, long startOffset, long currentOffset, long endOffset) {
        this.index = index;
        this.startOffset = startOffset;
        this.currentOffset = currentOffset;
        this.endOffset = endOffset;
    }

    public int index() {
        return index;
    }

    public long startOffset() {
        return startOffset;
    }

    public long currentOffset() {
        return currentOffset;
    }

    public long endOffset() {
        return endOffset;
    }

    public synchronized void updateOffset(long newOffset) {
        this.currentOffset = newOffset;
    }

    public synchronized void updateEndOffset(long newEndOffset) {
        this.endOffset = newEndOffset;
    }

    public synchronized long remainingBytes() {
        if (endOffset < 0) return Long.MAX_VALUE;
        long cur = currentOffset;
        long end = endOffset;
        if (cur > end) return 0;
        return end - cur + 1;
    }

    /**
     * Atomically splits this segment proportionally according to ownerRatio (clamped between 0.20 and 0.80).
     * Contracts this segment's endOffset to midpoint, and returns a new DownloadSegment
     * covering [midpoint + 1, originalEndOffset].
     *
     * @param newIndex the index for the newly created segment
     * @param minStealBytes minimum bytes needed to justify splitting
     * @param ownerRatio the proportion of remaining bytes retained by the current worker
     * @return the newly created stolen segment, or null if split is not possible
     */
    public synchronized DownloadSegment split(int newIndex, long minStealBytes, double ownerRatio) {
        if (endOffset < 0) return null;
        long cur = currentOffset;
        long end = endOffset;
        if (cur > end) return null;
        long remaining = end - cur + 1;
        if (remaining < minStealBytes) {
            return null;
        }
        double clampedRatio = Math.max(0.20, Math.min(0.80, ownerRatio));
        long ownerShare = Math.round(remaining * clampedRatio);
        long mid = cur + ownerShare - 1;
        if (mid <= cur || mid >= end) {
            return null;
        }
        this.endOffset = mid;
        return new DownloadSegment(newIndex, mid + 1, mid + 1, end);
    }

    /**
     * Atomically splits this segment with default 50/50 bisection.
     */
    public synchronized DownloadSegment split(int newIndex, long minStealBytes) {
        return split(newIndex, minStealBytes, 0.50);
    }

    public long downloadedBytes() {
        // Safe check for current offset
        if (currentOffset < startOffset) {
            return 0;
        }
        return currentOffset - startOffset;
    }

    public long totalBytes() {
        if (endOffset < startOffset) {
            return 0;
        }
        return endOffset - startOffset + 1;
    }
}
