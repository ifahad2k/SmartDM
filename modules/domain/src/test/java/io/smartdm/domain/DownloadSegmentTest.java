package io.smartdm.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DownloadSegmentTest {

    @Test
    @DisplayName("Basic segment properties and progress tracking")
    void testBasicProperties() {
        DownloadSegment segment = new DownloadSegment(0, 0, 100, 999);
        assertEquals(0, segment.index());
        assertEquals(0, segment.startOffset());
        assertEquals(100, segment.currentOffset());
        assertEquals(999, segment.endOffset());
        assertEquals(100, segment.downloadedBytes());
        assertEquals(1000, segment.totalBytes());
        assertEquals(900, segment.remainingBytes());
    }

    @Test
    @DisplayName("50/50 Bisection split divides remaining bytes equally with zero gaps or overlaps")
    void testDefaultSplit() {
        DownloadSegment seg = new DownloadSegment(0, 0, 0, 999); // 1000 bytes remaining
        DownloadSegment stolen = seg.split(1, 100);

        assertNotNull(stolen);
        assertEquals(1, stolen.index());

        // seg gets first 500 bytes [0..499]
        assertEquals(499, seg.endOffset());
        assertEquals(500, seg.remainingBytes());

        // stolen gets next 500 bytes [500..999]
        assertEquals(500, stolen.startOffset());
        assertEquals(500, stolen.currentOffset());
        assertEquals(999, stolen.endOffset());
        assertEquals(500, stolen.remainingBytes());

        // Conservation of bytes
        assertEquals(1000, seg.remainingBytes() + stolen.remainingBytes());
    }

    @Test
    @DisplayName("Predictive throughput-proportional split allocates byte shares according to worker speeds")
    void testProportionalSplit() {
        DownloadSegment seg = new DownloadSegment(0, 0, 0, 999); // 1000 bytes remaining
        // Owner is 3x faster than thief -> owner gets 75%, thief gets 25%
        DownloadSegment stolen = seg.split(1, 100, 0.75);

        assertNotNull(stolen);
        // Owner gets 75% = 750 bytes [0..749]
        assertEquals(749, seg.endOffset());
        assertEquals(750, seg.remainingBytes());

        // Stolen gets 25% = 250 bytes [750..999]
        assertEquals(750, stolen.startOffset());
        assertEquals(750, stolen.currentOffset());
        assertEquals(999, stolen.endOffset());
        assertEquals(250, stolen.remainingBytes());

        assertEquals(1000, seg.remainingBytes() + stolen.remainingBytes());
    }

    @Test
    @DisplayName("Proportional split clamps extreme ratios to safe bounds (0.20 - 0.80)")
    void testProportionalSplitClamping() {
        DownloadSegment seg1 = new DownloadSegment(0, 0, 0, 999);
        DownloadSegment stolen1 = seg1.split(1, 100, 0.05); // Should clamp to 0.20
        assertNotNull(stolen1);
        assertEquals(199, seg1.endOffset()); // 20%
        assertEquals(200, stolen1.startOffset());

        DownloadSegment seg2 = new DownloadSegment(0, 0, 0, 999);
        DownloadSegment stolen2 = seg2.split(1, 100, 0.99); // Should clamp to 0.80
        assertNotNull(stolen2);
        assertEquals(799, seg2.endOffset()); // 80%
        assertEquals(800, stolen2.startOffset());
    }

    @Test
    @DisplayName("Split refuses if remaining bytes are less than minStealBytes")
    void testMinStealSizeRefusal() {
        DownloadSegment seg = new DownloadSegment(0, 0, 900, 999); // Only 100 bytes left
        DownloadSegment stolen = seg.split(1, 200); // Demands 200 min bytes
        assertNull(stolen);
        assertEquals(999, seg.endOffset()); // Untouched
    }

    @Test
    @DisplayName("Split on completed segment returns null")
    void testCompletedSegmentSplit() {
        DownloadSegment seg = new DownloadSegment(0, 0, 1000, 999); // Done
        assertNull(seg.split(1, 10));
    }
}
