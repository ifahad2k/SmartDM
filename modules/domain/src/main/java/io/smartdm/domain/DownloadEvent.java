package io.smartdm.domain;

public interface DownloadEvent {
    DownloadId downloadId();
    DownloadState state();
    
    record StateChanged(DownloadId downloadId, DownloadState state) implements DownloadEvent {}
    
    record ProgressUpdated(DownloadId downloadId, ByteCount bytesDownloaded, ByteCount totalBytes) implements DownloadEvent {
        @Override
        public DownloadState state() {
            return DownloadState.DOWNLOADING;
        }
    }
    
    interface Publisher {
        void publish(DownloadEvent event);
    }
}
