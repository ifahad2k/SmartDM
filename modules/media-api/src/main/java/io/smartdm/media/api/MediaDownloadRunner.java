package io.smartdm.media.api;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;

import java.nio.file.Path;
import java.util.concurrent.CompletionStage;

public interface MediaDownloadRunner extends AutoCloseable {

    CompletionStage<Void> startDownload(
            Download download,
            Path targetPath,
            String webpageUrl,
            String formatArgument);

    CompletionStage<Void> pauseDownload(Download download);

    CompletionStage<Void> resumeDownload(Download download);

    CompletionStage<Void> cancelDownload(Download download);

    CompletionStage<Void> deleteDownload(
            Download download,
            boolean permanent,
            Path targetPath);

    CompletionStage<Void> deleteMediaFiles(Path targetPath);

    boolean isMediaDownload(DownloadId id);

    @Override
    void close();
}
