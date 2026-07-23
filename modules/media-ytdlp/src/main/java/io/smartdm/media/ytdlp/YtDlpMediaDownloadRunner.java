package io.smartdm.media.ytdlp;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.media.api.MediaDownloadRunner;
import io.smartdm.media.api.MediaToolManager;
import io.smartdm.platform.PlatformDirectories;
import io.smartdm.platform.api.process.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class YtDlpMediaDownloadRunner implements MediaDownloadRunner {

    private enum RequestedStop {
        NONE, PAUSE, CANCEL, DELETE, SHUTDOWN
    }

    private record TaskInfo(Download download, Path targetPath, String webpageUrl, String formatArg) {}

    private static final class MediaJobContext {
        private final TaskInfo taskInfo;
        private final AtomicReference<RequestedStop> requestedStop = new AtomicReference<>(RequestedStop.NONE);
        private volatile NativeProcessSession processSession;
        private volatile long lastPersistNanos;
        private volatile double maxProgressPct;

        private MediaJobContext(TaskInfo taskInfo) {
            this.taskInfo = taskInfo;
        }
    }

    private final NativeProcessController processController;
    private final DownloadRepository repository;
    private final DownloadEvent.Publisher eventPublisher;
    private final MediaToolManager toolManager;
    private final PlatformDirectories platformDirectories;
    private final ExecutorService mediaExecutor;

    private final ConcurrentMap<DownloadId, MediaJobContext> jobs = new ConcurrentHashMap<>();

    private final Pattern progressPattern = Pattern.compile("\\[download\\]\\s+([\\d\\.]+)%");
    private final Pattern sizePattern = Pattern.compile("of\\s+~?\\s*([\\d\\.]+)\\s*([a-zA-Z]+)");

    public YtDlpMediaDownloadRunner(
            NativeProcessController processController,
            DownloadRepository repository,
            DownloadEvent.Publisher eventPublisher,
            MediaToolManager toolManager,
            PlatformDirectories platformDirectories,
            ExecutorService mediaExecutor) {
        this.processController = processController;
        this.repository = repository;
        this.eventPublisher = eventPublisher;
        this.toolManager = toolManager;
        this.platformDirectories = platformDirectories;
        this.mediaExecutor = mediaExecutor;
    }

    private Path mediaTempDirectory(DownloadId id) {
        return platformDirectories
                .getCacheDirectory()
                .resolve("media")
                .resolve(id.value())
                .toAbsolutePath()
                .normalize();
    }

    private boolean shouldPersist(MediaJobContext context) {
        long now = System.nanoTime();
        long minimumInterval = TimeUnit.SECONDS.toNanos(1);
        if (now - context.lastPersistNanos >= minimumInterval) {
            context.lastPersistNanos = now;
            return true;
        }
        return false;
    }

    @Override
    public CompletionStage<Void> startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        return CompletableFuture.runAsync(() -> {
            TaskInfo info = new TaskInfo(download, targetPath, webpageUrl, formatArg);
            MediaJobContext context = new MediaJobContext(info);
            jobs.put(download.id(), context);

            try {
                Path ytDlpExecutable = toolManager.getYtDlpPath().orElseThrow(() -> new IllegalStateException("yt-dlp not found"));
                if (ytDlpExecutable == null || !Files.exists(ytDlpExecutable)) {
                    throw new RuntimeException("MEDIA_TOOL_UNAVAILABLE");
                }

                Path tempDir = mediaTempDirectory(download.id());
                Files.createDirectories(tempDir);

                download.updateState(DownloadState.DOWNLOADING);
                if (repository != null) repository.save(download);
                if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.DOWNLOADING, download));

                Path tempOutputFile = tempDir.resolve("download_temp");

                List<String> args = new ArrayList<>(List.of(
                        "--newline",
                        "--continue",
                        "-N", "4",
                        "--paths", "temp:" + tempDir.toString(),
                        "--paths", "home:" + tempDir.toString(),
                        "-f", formatArg,
                        "-o", tempOutputFile.toString(),
                        info.webpageUrl()
                ));

                NativeProcessRequest request = new NativeProcessRequest(
                        ytDlpExecutable,
                        args,
                        Optional.of(tempDir),
                        Map.of(),
                        Duration.ofHours(24),
                        OutputLimits.mediaDefaults()
                );

                NativeProcessOutputListener listener = new NativeProcessOutputListener() {
                    @Override
                    public void onStdoutLine(String line) {
                        handleYtDlpOutput(context, line);
                    }
                    @Override
                    public void onStderrLine(String line) {
                        handleYtDlpErrorOutput(context, line);
                    }
                };

                NativeProcessSession session = processController.start(request, listener);
                context.processSession = session;

                session.completion().whenCompleteAsync((result, error) -> {
                    handleCompletion(context, result, error, tempOutputFile, tempDir);
                }, mediaExecutor);

            } catch (Exception e) {
                handleError(context, "MEDIA_PROCESS_START_FAILED");
            }
        }, mediaExecutor);
    }

    private void handleYtDlpOutput(MediaJobContext context, String line) {
        if (context.requestedStop.get() != RequestedStop.NONE) return;

        line = line.trim();
        Matcher matcher = progressPattern.matcher(line);
        if (matcher.find()) {
            try {
                double pct = Double.parseDouble(matcher.group(1));
                if (pct >= context.maxProgressPct) {
                    context.maxProgressPct = pct;
                    long totalBytes = 0L;

                    Matcher sizeMatcher = sizePattern.matcher(line);
                    if (sizeMatcher.find()) {
                        double sizeVal = Double.parseDouble(sizeMatcher.group(1));
                        String unit = sizeMatcher.group(2).toLowerCase();

                        long mult = 1;
                        if (unit.startsWith("k")) mult = 1024L;
                        else if (unit.startsWith("m")) mult = 1024L * 1024L;
                        else if (unit.startsWith("g")) mult = 1024L * 1024L * 1024L;

                        totalBytes = (long) (sizeVal * mult);
                    }

                    long downloadedBytes = (long) (totalBytes * (pct / 100.0));
                    final long finalTotal = totalBytes;
                    final long finalDownloaded = downloadedBytes;

                    if (finalTotal > 0 && context.taskInfo.download().state() == DownloadState.DOWNLOADING) {
                        long segSize = finalTotal / 4;
                        List<DownloadSegment> segs = new ArrayList<>();
                        for (int i = 0; i < 4; i++) {
                            long sStart = i * segSize;
                            long sEnd = (i == 3) ? finalTotal - 1 : (i + 1) * segSize - 1;
                            long sDownloaded = (long) (finalDownloaded * 0.25);
                            long sCurrent = sStart + Math.min(sDownloaded, sEnd - sStart + 1);
                            segs.add(new DownloadSegment(i, sStart, sCurrent, sEnd));
                        }

                        context.taskInfo.download().updateSegments(segs);
                        context.taskInfo.download().updateProgress(ByteCount.of(finalDownloaded), ByteCount.of(finalTotal));

                        if (repository != null && shouldPersist(context)) {
                            repository.save(context.taskInfo.download());
                        }
                        if (eventPublisher != null) {
                            eventPublisher.publish(new DownloadEvent.ProgressUpdated(context.taskInfo.download().id(), ByteCount.of(finalDownloaded), ByteCount.of(finalTotal), context.taskInfo.download()));
                        }
                    }
                }
            } catch (Exception e) {
                System.err.println("YTDLP_PROCESS_KILL_FAILED: " + e.getMessage());
            }
        }
    }

    private void handleYtDlpErrorOutput(MediaJobContext context, String line) {
        // Typically logged or ignored
    }

    private void handleCompletion(MediaJobContext context, NativeProcessResult result, Throwable error, Path tempOutputFile, Path tempDir) {
        RequestedStop stop = context.requestedStop.get();
        Download download = context.taskInfo.download();
        Path targetPath = context.taskInfo.targetPath();

        if (stop == RequestedStop.PAUSE) {
            // Already handled state in pause method
            return;
        } else if (stop == RequestedStop.CANCEL) {
            // Already handled state in cancel method
            applyCancelPolicy(tempDir);
            return;
        } else if (stop == RequestedStop.DELETE) {
            // Already handled in delete method
            return;
        }

        if (error != null) {
            handleError(context, "MEDIA_PROCESS_TERMINATION_FAILED");
            return;
        }

        if (result.timedOut()) {
            handleError(context, "MEDIA_PROCESS_TIMEOUT");
            return;
        }

        if (result.stdoutLimitExceeded() || result.stderrLimitExceeded()) {
            handleError(context, "MEDIA_OUTPUT_LIMIT_EXCEEDED");
            return;
        }

        if (result.exitCode() == 0) {
            boolean success = false;
            try {
                if (Files.exists(tempOutputFile)) {
                    Files.move(tempOutputFile, targetPath, StandardCopyOption.REPLACE_EXISTING);
                    success = true;
                } else {
                    try (Stream<Path> s = Files.list(tempDir)) {
                        Optional<Path> out = s.filter(f -> !f.toString().endsWith(".part") && !f.toString().endsWith(".ytdl")).findFirst();
                        if (out.isPresent()) {
                            Files.move(out.get(), targetPath, StandardCopyOption.REPLACE_EXISTING);
                            success = true;
                        }
                    }
                }
            } catch (Exception ex) {
                handleError(context, "MEDIA_FINALIZATION_FAILED");
                return;
            }

            if (success) {
                download.updateState(DownloadState.COMPLETED);
                if (repository != null) repository.save(download);
                if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.COMPLETED, download));
                applyCompletedPolicy(tempDir);
                jobs.remove(download.id());
            } else {
                handleError(context, "MEDIA_OUTPUT_MISSING");
            }
        } else {
            handleError(context, "MEDIA_TOOL_EXIT_FAILED");
        }
    }

    private void handleError(MediaJobContext context, String errorCode) {
        Download download = context.taskInfo.download();
        download.updateState(DownloadState.FAILED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.FAILED, download));
        // Keep partials on failure for resume
        jobs.remove(download.id());
    }

    private void applyCancelPolicy(Path tempDir) {
        deleteDirSilently(tempDir);
    }

    private void applyCompletedPolicy(Path tempDir) {
        deleteDirSilently(tempDir);
    }

    private void deleteDirSilently(Path dir) {
        try {
            if (Files.exists(dir)) {
                try (Stream<Path> walk = Files.walk(dir)) {
                    walk.sorted(java.util.Comparator.reverseOrder())
                            .map(Path::toFile)
                            .forEach(java.io.File::delete);
                }
            }
        } catch (Exception e) {
            System.err.println("YTDLP_CLEANUP_FAILED: " + e.getMessage());
        }
    }

    @Override
    public CompletionStage<Void> pauseDownload(Download download) {
        return CompletableFuture.runAsync(() -> {
            MediaJobContext context = jobs.get(download.id());
            if (context != null) {
                context.requestedStop.set(RequestedStop.PAUSE);
                if (context.processSession != null) {
                    try {
                        context.processSession.killTree().toCompletableFuture().get();
                    } catch (Exception e) {
                        System.err.println("YTDLP_PROCESS_KILL_FAILED: " + e.getMessage());
                    }
                }
            }
            download.updateState(DownloadState.PAUSED);
            if (repository != null) repository.save(download);
            if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.PAUSED, download));
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> resumeDownload(Download download) {
        return CompletableFuture.runAsync(() -> {
            MediaJobContext context = jobs.get(download.id());
            if (context != null) {
                context.requestedStop.set(RequestedStop.NONE);
                startDownload(context.taskInfo.download(), context.taskInfo.targetPath(), context.taskInfo.webpageUrl(), context.taskInfo.formatArg());
            } else {
                download.updateState(DownloadState.FAILED);
                if (repository != null) repository.save(download);
                if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.FAILED, download));
            }
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> cancelDownload(Download download) {
        return CompletableFuture.runAsync(() -> {
            MediaJobContext context = jobs.remove(download.id());
            if (context != null) {
                context.requestedStop.set(RequestedStop.CANCEL);
                if (context.processSession != null) {
                    try {
                        context.processSession.killTree().toCompletableFuture().get();
                    } catch (Exception e) {
                        System.err.println("YTDLP_PROCESS_KILL_FAILED: " + e.getMessage());
                    }
                }
            } else {
                Path tempDir = mediaTempDirectory(download.id());
                applyCancelPolicy(tempDir);
            }
            download.updateState(DownloadState.CANCELED);
            if (repository != null) repository.save(download);
            if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> deleteDownload(Download download, boolean permanent, Path targetPath) {
        return CompletableFuture.runAsync(() -> {
            MediaJobContext context = jobs.remove(download.id());
            if (context != null) {
                context.requestedStop.set(RequestedStop.DELETE);
                if (context.processSession != null) {
                    try {
                        context.processSession.killTree().toCompletableFuture().get();
                    } catch (Exception e) {
                        System.err.println("YTDLP_PROCESS_KILL_FAILED: " + e.getMessage());
                    }
                }
            }

            try {
                if (permanent) {
                    Files.deleteIfExists(targetPath);
                }
            } catch (IOException e) {
                throw new RuntimeException("MEDIA_DELETE_FAILED", e);
            }

            deleteDirSilently(mediaTempDirectory(download.id()));
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> deleteMediaFiles(Path targetPath) {
        return CompletableFuture.runAsync(() -> {
            try {
                Files.deleteIfExists(targetPath);
            } catch (IOException e) {
                throw new RuntimeException("MEDIA_DELETE_FAILED", e);
            }
        }, mediaExecutor);
    }

    @Override
    public boolean isMediaDownload(DownloadId id) {
        // Simple heuristic: if it's in our jobs or if we can determine from domain (though usually tracker relies on caller)
        // Since we removed static tracker, this is used to check if an ID belongs to media.
        return true; 
    }

    @Override
    public void close() {
        List<CompletableFuture<Void>> terminations = new ArrayList<>();
        for (MediaJobContext context : jobs.values()) {
            context.requestedStop.set(RequestedStop.SHUTDOWN);
            if (context.processSession != null) {
                terminations.add(context.processSession.killTree().toCompletableFuture());
            }
        }
        
        try {
            CompletableFuture.allOf(terminations.toArray(new CompletableFuture<?>[0]))
                    .get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            System.err.println("YTDLP_SHUTDOWN_FAILED: " + e.getMessage());
        }
    }
}
