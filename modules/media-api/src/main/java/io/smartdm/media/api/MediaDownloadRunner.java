package io.smartdm.media.api;

import io.smartdm.domain.Download;
import java.nio.file.Path;

public interface MediaDownloadRunner {
    void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg);
    void pauseDownload(Download download);
    void resumeDownload(Download download);
    void cancelDownload(Download download);
    void deleteDownload(Download download, boolean permanent, Path targetPath);
    void deleteMediaFiles(Path targetPath);
    boolean isMediaDownload(io.smartdm.domain.DownloadId id);
}
