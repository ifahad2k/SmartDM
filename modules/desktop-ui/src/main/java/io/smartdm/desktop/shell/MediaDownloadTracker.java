package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadState;
import io.smartdm.media.api.MediaDownloadRunner;
import java.nio.file.Path;

public final class MediaDownloadTracker {

    private static MediaDownloadRunner runner;

    public static void init(MediaDownloadRunner downloadRunner) {
        runner = downloadRunner;
    }

    public static boolean isMediaDownload(DownloadId id) {
        return runner != null && runner.isMediaDownload(id);
    }

    public static void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        if (runner != null) {
            runner.startDownload(download, targetPath, webpageUrl, formatArg);
        }
    }

    public static void pauseDownload(Download download) {
        if (runner != null) runner.pauseDownload(download);
    }

    public static void resumeDownload(Download download) {
        if (runner != null) runner.resumeDownload(download);
    }

    public static void cancelDownload(Download download) {
        if (runner != null) runner.cancelDownload(download);
    }

    public static void deleteDownload(Download download, boolean permanent) {
        if (runner != null) runner.deleteDownload(download, permanent, Path.of(download.destination().value()));
    }

    public static void deleteMediaFiles(Path targetPath) {
        io.smartdm.desktop.utils.FxThreadGuard.requireBackgroundThread();
        if (runner != null) {
            runner.deleteMediaFiles(targetPath);
        }
    }
}
