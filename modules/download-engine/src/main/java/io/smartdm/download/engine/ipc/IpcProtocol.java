package io.smartdm.download.engine.ipc;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

public class IpcProtocol {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CommandMessage {
        public String command; // START_DOWNLOAD, PAUSE_DOWNLOAD, RESUME_DOWNLOAD, CANCEL_DOWNLOAD, SET_RATE_LIMIT, PING
        public String downloadId;
        public String url;
        public String destinationPath;
        public Integer maxConnections;
        public Long rateLimitBytesPerSec;
        public String referer;
        public String userAgent;
        public String cookies;

        public CommandMessage() {}
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EventMessage {
        public String event; // PONG, DOWNLOAD_PROGRESS, DOWNLOAD_STATUS, PREALLOCATION_COMPLETED
        public String downloadId;
        public String status; // QUEUED, PROBING, DOWNLOADING, PAUSED, COMPLETED, CANCELED, ERROR
        public Long downloadedBytes;
        public Long totalBytes;
        public Double speedBytesPerSec;
        public Integer activeSockets;
        public Double elapsedPreallocMs;
        public String error;
        public List<SegmentProgressDto> segments;

        public EventMessage() {}

        public EventMessage(String event) {
            this.event = event;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SegmentProgressDto {
        public int index;
        public long startByte;
        public long endByte;
        public long currentByte;
        public long downloadedBytes;
        public boolean isActive;
        public boolean isCompleted;
        public double speedMbps;

        public SegmentProgressDto() {}

        public SegmentProgressDto(int index, long startByte, long endByte, long currentByte, long downloadedBytes, boolean isActive, boolean isCompleted, double speedMbps) {
            this.index = index;
            this.startByte = startByte;
            this.endByte = endByte;
            this.currentByte = currentByte;
            this.downloadedBytes = downloadedBytes;
            this.isActive = isActive;
            this.isCompleted = isCompleted;
            this.speedMbps = speedMbps;
        }
    }
}
