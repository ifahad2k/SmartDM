package io.smartdm.domain;

public class DownloadSegment {
    private final int index;
    private final long startOffset;
    private long currentOffset;
    private final long endOffset;

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

    public void updateOffset(long newOffset) {
        this.currentOffset = newOffset;
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
