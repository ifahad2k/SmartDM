package io.smartdm.domain;

public interface DownloadEvent {
    DownloadId downloadId();
    DownloadState state();
    Download download();
    
    record StateChanged(DownloadId downloadId, DownloadState state, Download download) implements DownloadEvent {}
    
    record ProgressUpdated(DownloadId downloadId, ByteCount bytesDownloaded, ByteCount totalBytes, Download download) implements DownloadEvent {
        @Override
        public DownloadState state() {
            return DownloadState.DOWNLOADING;
        }
    }
    
    interface Publisher {
        void publish(DownloadEvent event);
    }
}
