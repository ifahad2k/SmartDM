package io.smartdm.media.ytdlp;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.media.api.MediaDownloadRunner;
import io.smartdm.media.api.MediaOperationException;
import io.smartdm.media.api.MediaToolManager;
import io.smartdm.media.api.job.MediaJobDescriptor;
import io.smartdm.media.api.job.MediaJobStatus;
import io.smartdm.media.api.job.MediaJobStore;
import io.smartdm.platform.PlatformDirectories;
import io.smartdm.platform.api.process.*;

import java.io.BufferedReader;
import java.io.EOFException;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.CopyOption;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import io.smartdm.media.api.DestinationConflictPolicy;

public class YtDlpMediaDownloadRunner implements MediaDownloadRunner {

    private enum RequestedStop {
        NONE, PAUSE, CANCEL, DELETE, SHUTDOWN
    }

    private record TaskInfo(Download download, Path targetPath, String webpageUrl, String formatArg, DestinationConflictPolicy conflictPolicy) {}

    private static final class MediaJobContext {
        private final TaskInfo taskInfo;
        private final AtomicReference<RequestedStop> requestedStop = new AtomicReference<>(RequestedStop.NONE);
        private final AtomicBoolean completionHandled = new AtomicBoolean(false);
        private final ReentrantLock operationLock = new ReentrantLock();
        
        private final AtomicReference<String> lastDiagnostic = new AtomicReference<>();
        private final AtomicReference<String> detectedFailure = new AtomicReference<>();
        
        private volatile NativeProcessSession processSession;
        private volatile long lastPersistNanos;
        private volatile double maxProgressPct;

        private MediaJobContext(TaskInfo taskInfo) {
            this.taskInfo = taskInfo;
        }
    }

    private final NativeProcessController processController;
    private final DownloadRepository downloadRepository;
    private final MediaJobStore mediaJobStore;
    private final DownloadEvent.Publisher eventPublisher;
    private final MediaToolManager toolManager;
    private final PlatformDirectories platformDirectories;
    private final ExecutorService mediaExecutor;
    private final Clock clock;

    private final ConcurrentMap<DownloadId, MediaJobContext> jobs = new ConcurrentHashMap<>();

    private final Pattern progressPattern = Pattern.compile("\\[download\\]\\s+([\\d\\.]+)%");
    private final Pattern sizePattern = Pattern.compile("of\\s+~?\\s*([\\d\\.]+)\\s*([a-zA-Z]+)");

    public YtDlpMediaDownloadRunner(
            NativeProcessController processController,
            DownloadRepository downloadRepository,
            MediaJobStore mediaJobStore,
            DownloadEvent.Publisher eventPublisher,
            MediaToolManager toolManager,
            PlatformDirectories platformDirectories,
            ExecutorService mediaExecutor,
            Clock clock) {
        this.processController = Objects.requireNonNull(processController);
        this.downloadRepository = Objects.requireNonNull(downloadRepository);
        this.mediaJobStore = Objects.requireNonNull(mediaJobStore);
        this.eventPublisher = Objects.requireNonNull(eventPublisher);
        this.toolManager = Objects.requireNonNull(toolManager);
        this.platformDirectories = Objects.requireNonNull(platformDirectories);
        this.mediaExecutor = Objects.requireNonNull(mediaExecutor);
        this.clock = Objects.requireNonNull(clock);
    }

    public YtDlpMediaDownloadRunner(
            NativeProcessController processController,
            DownloadRepository downloadRepository,
            MediaJobStore mediaJobStore,
            DownloadEvent.Publisher eventPublisher,
            MediaToolManager toolManager,
            PlatformDirectories platformDirectories,
            Clock clock) {
        this(processController, downloadRepository, mediaJobStore, eventPublisher, toolManager, platformDirectories, Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "media-runner-worker");
            t.setDaemon(true);
            return t;
        }), clock);
    }

    private CompletionStage<Void> onMediaExecutor(Runnable operation) {
        return CompletableFuture.runAsync(operation, mediaExecutor);
    }

    private Path managedJobDirectory(DownloadId id) {
        Path mediaRoot = platformDirectories
                .getCacheDirectory()
                .resolve("media")
                .toAbsolutePath()
                .normalize();

        Path jobDirectory = mediaRoot
                .resolve(id.value())
                .normalize();

        if (!jobDirectory.startsWith(mediaRoot)) {
            throw new MediaOperationException(
                    "MEDIA_TEMP_PATH_INVALID",
                    "Media job directory escaped the cache root");
        }

        return jobDirectory;
    }

    private void deleteManagedDirectory(DownloadId id) {
        Path directory = managedJobDirectory(id);
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        } catch (IOException exception) {
            throw new MediaOperationException(
                    "MEDIA_DELETE_FAILED",
                    "Could not delete managed media files",
                    exception);
        }
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

    private void updateDownloadState(MediaJobContext context, DownloadState state, MediaJobStatus mediaStatus) {
        Download download = context.taskInfo.download();
        download.updateState(state);
        downloadRepository.save(download);

        MediaJobDescriptor current = mediaJobStore.find(download.id()).orElse(null);
        if (current != null) {
            mediaJobStore.save(current.withStatus(mediaStatus, clock.instant()));
        } else if (mediaStatus != null) {
            Instant now = clock.instant();
            MediaJobDescriptor newDesc = new MediaJobDescriptor(
                    download.id(),
                    context.taskInfo.webpageUrl(),
                    context.taskInfo.formatArg(),
                    context.taskInfo.conflictPolicy(),
                    mediaStatus,
                    now,
                    now);
            mediaJobStore.save(newDesc);
        }

        eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), state, download));
    }

    @Override
    public boolean isMediaDownload(DownloadId id) {
        Objects.requireNonNull(id);
        return jobs.containsKey(id) || mediaJobStore.exists(id);
    }

    @Override
    public CompletionStage<Void> startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        return startDownload(download, targetPath, webpageUrl, formatArg, DestinationConflictPolicy.REPLACE);
    }

    @Override
    public CompletionStage<Void> startDownload(Download download, Path targetPath, String webpageUrl, String formatArg, DestinationConflictPolicy conflictPolicy) {
        CompletableFuture<Void> startFuture = new CompletableFuture<>();
        mediaExecutor.execute(() -> {
            TaskInfo info = new TaskInfo(download, targetPath, webpageUrl, formatArg, conflictPolicy);
            MediaJobContext newContext = new MediaJobContext(info);
            
            MediaJobContext existing = jobs.putIfAbsent(download.id(), newContext);
            if (existing != null) {
                startFuture.completeExceptionally(new MediaOperationException("MEDIA_JOB_ALREADY_ACTIVE", "A media job is already active for this download"));
                return;
            }
            
            try {
                Path ytDlpExecutable = toolManager.getYtDlpPath().orElseThrow(() -> new IllegalStateException("yt-dlp not found"));
                if (ytDlpExecutable == null || !Files.exists(ytDlpExecutable)) {
                    throw new RuntimeException("MEDIA_TOOL_UNAVAILABLE");
                }
                
                Path normalizedTarget = targetPath.toAbsolutePath().normalize();
                Path targetParent = normalizedTarget.getParent();
                if (targetParent == null) {
                    throw new MediaOperationException("MEDIA_DESTINATION_INVALID", "Destination has no parent directory");
                }
                Files.createDirectories(targetParent);
                if (!Files.isWritable(targetParent)) {
                    throw new MediaOperationException("MEDIA_DESTINATION_NOT_WRITABLE", "Destination folder is not writable");
                }

                Instant now = clock.instant();
                MediaJobDescriptor descriptor = new MediaJobDescriptor(
                        download.id(), webpageUrl, formatArg, conflictPolicy, MediaJobStatus.CREATED, now, now);
                mediaJobStore.save(descriptor);

                Path tempDir = managedJobDirectory(download.id());
                Files.createDirectories(tempDir);

                updateDownloadState(newContext, DownloadState.DOWNLOADING, MediaJobStatus.RUNNING);

                Path outputManifest = tempDir.resolve("smartdm-final-output.txt");
                Path outputTemplate = tempDir.resolve("media-output.%(ext)s");

                List<String> args = new ArrayList<>(List.of(
                        "--newline",
                        "--continue",
                        "-N", "4",
                        "-f", formatArg,
                        "-o", outputTemplate.toString(),
                        "--print-to-file", "after_move:%(filepath)s",
                        outputManifest.toString(),
                        webpageUrl
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
                        handleYtDlpOutput(newContext, line);
                    }
                    @Override
                    public void onStderrLine(String line) {
                        handleYtDlpErrorOutput(newContext, line);
                    }
                };

                NativeProcessSession session = processController.start(request, listener);
                newContext.processSession = session;

                session.completion().whenCompleteAsync((result, error) -> {
                    handleCompletion(newContext, result, error, outputManifest, tempDir, targetPath);
                }, mediaExecutor);

                startFuture.complete(null);

            } catch (Exception e) {
                jobs.remove(download.id(), newContext);
                failJob(newContext, "MEDIA_PROCESS_START_FAILED", e);
                startFuture.completeExceptionally(e instanceof MediaOperationException ? e : new MediaOperationException("MEDIA_PROCESS_START_FAILED", "Could not start media download", e));
            }
        });
        return startFuture;
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

                        if (shouldPersist(context)) {
                            downloadRepository.save(context.taskInfo.download());
                        }
                        eventPublisher.publish(new DownloadEvent.ProgressUpdated(context.taskInfo.download().id(), ByteCount.of(finalDownloaded), ByteCount.of(finalTotal), context.taskInfo.download()));
                    }
                }
            } catch (Exception e) {
                // Ignore parse errors from yt-dlp
            }
        }
    }

    private void handleYtDlpErrorOutput(MediaJobContext context, String line) {
        if (line == null || line.isBlank()) return;
        String sanitized = sanitizeUrl(line.trim());
        context.lastDiagnostic.set(sanitized);

        if (line.contains("No space left")) {
            context.detectedFailure.set("DISK_FULL");
        } else if (line.contains("Requested format is not available")) {
            context.detectedFailure.set("FORMAT_UNAVAILABLE");
        } else if (line.contains("Permission denied")) {
            context.detectedFailure.set("PERMISSION_DENIED");
        } else if (line.contains("HTTP Error 403")) {
            context.detectedFailure.set("HTTP_FORBIDDEN");
        }
    }

    private static String sanitizeUrl(String text) {
        if (text == null) return null;
        return text.replaceAll("(https?://[^?\\s]+)\\?[^\\s]*", "$1?[REDACTED]");
    }

    private void handleCompletion(MediaJobContext context, NativeProcessResult result, Throwable error, Path outputManifest, Path tempDir, Path targetPath) {
        boolean claimed = false;
        context.operationLock.lock();
        try {
            if (context.completionHandled.compareAndSet(false, true)) {
                RequestedStop stop = context.requestedStop.get();
                if (stop == RequestedStop.NONE) {
                    claimed = true;
                }
            }
        } finally {
            context.operationLock.unlock();
        }

        if (!claimed) {
            return;
        }

        if (error != null) {
            failJob(context, "MEDIA_PROCESS_FAILED", error);
            return;
        }
        if (result.timedOut()) {
            failJob(context, "MEDIA_PROCESS_TIMEOUT", null);
            return;
        }
        if (result.stdoutLimitExceeded() || result.stderrLimitExceeded()) {
            failJob(context, "MEDIA_OUTPUT_LIMIT_EXCEEDED", null);
            return;
        }
        if (result.exitCode() != 0) {
            failJob(context, "MEDIA_TOOL_EXIT_FAILED", null);
            return;
        }
        
        finalizeCompletedJob(context, outputManifest, tempDir, targetPath);
    }

    private void failJob(MediaJobContext context, String defaultCode, Throwable error) {
        String code = context.detectedFailure.get() != null ? context.detectedFailure.get() : defaultCode;
        String diagnostic = context.lastDiagnostic.get() != null ? context.lastDiagnostic.get() : (error != null ? error.getMessage() : null);
        updateDownloadState(context, DownloadState.FAILED, MediaJobStatus.FAILED);
        eventPublisher.publish(new DownloadEvent.Failed(context.taskInfo.download().id(), DownloadState.FAILED, code, diagnostic, context.taskInfo.download()));
        jobs.remove(context.taskInfo.download().id(), context);
    }

    private void finalizeCompletedJob(MediaJobContext context, Path outputManifest, Path tempDir, Path targetPath) {
        try {
            Path finalOutput = readFinalOutputPath(outputManifest, tempDir);
            finalizeOutput(finalOutput, targetPath, context.taskInfo.conflictPolicy());
            updateDownloadState(context, DownloadState.COMPLETED, MediaJobStatus.COMPLETED);
        } catch (Exception e) {
            failJob(context, "MEDIA_FINALIZATION_FAILED", e);
            return;
        }

        try {
            deleteManagedDirectory(context.taskInfo.download().id());
        } catch (Exception cleanupFailure) {
            System.err.println("Warning: Managed directory cleanup failed for download " + context.taskInfo.download().id() + ": " + cleanupFailure.getMessage());
        } finally {
            jobs.remove(context.taskInfo.download().id(), context);
        }
    }

    private Path readFinalOutputPath(Path manifest, Path approvedTempRoot) {
        if (!Files.isRegularFile(manifest)) {
            throw new MediaOperationException("MEDIA_OUTPUT_MANIFEST_MISSING", "yt-dlp did not report its final output");
        }
        final String line;
        try (BufferedReader reader = Files.newBufferedReader(manifest, StandardCharsets.UTF_8)) {
            line = reader.readLine();
        } catch (IOException exception) {
            throw new MediaOperationException("MEDIA_OUTPUT_MANIFEST_READ_FAILED", "Could not read yt-dlp output manifest", exception);
        }
        if (line == null || line.isBlank()) {
            throw new MediaOperationException("MEDIA_OUTPUT_MANIFEST_EMPTY", "yt-dlp output manifest was empty");
        }
        if (line.length() > 32_768) {
            throw new MediaOperationException("MEDIA_OUTPUT_MANIFEST_INVALID", "yt-dlp output path was too long");
        }
        Path output = Path.of(line).toAbsolutePath().normalize();
        Path approved = approvedTempRoot.toAbsolutePath().normalize();
        if (!output.startsWith(approved)) {
            throw new MediaOperationException("MEDIA_OUTPUT_OUTSIDE_TEMP_ROOT", "yt-dlp reported an output outside the managed directory");
        }
        if (!Files.isRegularFile(output)) {
            throw new MediaOperationException("MEDIA_OUTPUT_MISSING", "The reported media output does not exist");
        }
        return output;
    }

    private void finalizeOutput(Path source, Path target, DestinationConflictPolicy policy) {
        Path normalizedSource = source.toAbsolutePath().normalize();
        Path normalizedTarget = target.toAbsolutePath().normalize();
        
        if (Files.exists(normalizedTarget)) {
            if (policy == DestinationConflictPolicy.FAIL) {
                throw new MediaOperationException("DESTINATION_EXISTS", "Target file already exists: " + normalizedTarget);
            } else if (policy == DestinationConflictPolicy.RENAME) {
                normalizedTarget = resolveUniqueTargetName(normalizedTarget);
            }
        }

        Path targetParent = Objects.requireNonNull(normalizedTarget.getParent(), "Target parent is required");
        try {
            Files.createDirectories(targetParent);
            CopyOption[] moveOptions = (policy == DestinationConflictPolicy.REPLACE)
                    ? new CopyOption[] { StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING }
                    : new CopyOption[] { StandardCopyOption.ATOMIC_MOVE };
            try {
                Files.move(normalizedSource, normalizedTarget, moveOptions);
                return;
            } catch (FileSystemException atomicFailure) {
                copyThroughDestinationTemp(normalizedSource, normalizedTarget, policy);
            }
        } catch (IOException exception) {
            throw new MediaOperationException("MEDIA_FINALIZATION_FAILED", "Could not finalize the media output", exception);
        }
    }

    private static Path resolveUniqueTargetName(Path target) {
        Path parent = target.getParent();
        String filename = target.getFileName().toString();
        String name = filename;
        String ext = "";
        int dot = filename.lastIndexOf('.');
        if (dot > 0) {
            name = filename.substring(0, dot);
            ext = filename.substring(dot);
        }
        int count = 1;
        Path candidate = target;
        while (Files.exists(candidate)) {
            candidate = parent.resolve(name + " (" + count + ")" + ext);
            count++;
        }
        return candidate;
    }

    private void copyThroughDestinationTemp(Path source, Path target, DestinationConflictPolicy policy) throws IOException {
        Path parent = target.getParent();
        String tempName = "." + target.getFileName() + ".smartdm-finalizing-" + UUID.randomUUID();
        Path destinationTemp = parent.resolve(tempName).normalize();
        if (!destinationTemp.getParent().equals(parent)) {
            throw new IOException("Destination temporary path escaped its parent");
        }
        long expectedSize = Files.size(source);
        try {
            try (FileChannel input = FileChannel.open(source, StandardOpenOption.READ);
                 FileChannel output = FileChannel.open(destinationTemp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                long position = 0;
                while (position < expectedSize) {
                    long transferred = input.transferTo(position, expectedSize - position, output);
                    if (transferred <= 0) {
                        throw new EOFException("Media copy stopped before completion");
                    }
                    position += transferred;
                }
                output.force(true);
            }
            long copiedSize = Files.size(destinationTemp);
            if (copiedSize != expectedSize) {
                throw new IOException("Copied media size did not match source size");
            }
            CopyOption[] moveOptions = (policy == DestinationConflictPolicy.REPLACE)
                    ? new CopyOption[] { StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING }
                    : new CopyOption[] { StandardCopyOption.ATOMIC_MOVE };
            try {
                Files.move(destinationTemp, target, moveOptions);
            } catch (AtomicMoveNotSupportedException exception) {
                if (policy == DestinationConflictPolicy.REPLACE) {
                    Files.move(destinationTemp, target, StandardCopyOption.REPLACE_EXISTING);
                } else {
                    Files.move(destinationTemp, target);
                }
            }
            Files.delete(source);
        } catch (Throwable failure) {
            try {
                Files.deleteIfExists(destinationTemp);
            } catch (IOException cleanupFailure) {
                failure.addSuppressed(cleanupFailure);
            }
            if (failure instanceof IOException ioFailure) throw ioFailure;
            if (failure instanceof RuntimeException runtimeFailure) throw runtimeFailure;
            throw new IOException("Unexpected media finalization failure", failure);
        }
    }

    @Override
    public CompletionStage<Void> pauseDownload(Download download) {
        Objects.requireNonNull(download);
        MediaJobContext context = jobs.get(download.id());
        if (context == null) {
            return CompletableFuture.failedFuture(new MediaOperationException("MEDIA_JOB_NOT_ACTIVE", "The media job is not active"));
        }
        if (!context.requestedStop.compareAndSet(RequestedStop.NONE, RequestedStop.PAUSE)) {
            return CompletableFuture.failedFuture(new MediaOperationException("MEDIA_OPERATION_CONFLICT", "Another media operation is already in progress"));
        }
        
        MediaJobDescriptor current = mediaJobStore.find(download.id())
                .orElseThrow(() -> new MediaOperationException("MEDIA_JOB_MISSING", "Media descriptor is missing"));
        mediaJobStore.save(current.withStatus(MediaJobStatus.PAUSING, clock.instant()));

        NativeProcessSession session = context.processSession;
        CompletionStage<Void> termination = session == null ? CompletableFuture.completedFuture(null) : session.killTree();

        return termination.thenRunAsync(() -> {
            boolean claimed = false;
            context.operationLock.lock();
            try {
                claimed = context.completionHandled.compareAndSet(false, true);
            } finally {
                context.operationLock.unlock();
            }
            if (claimed) {
                updateDownloadState(context, DownloadState.PAUSED, MediaJobStatus.PAUSED);
                jobs.remove(download.id(), context);
            }
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> resumeDownload(Download download) {
        Objects.requireNonNull(download);
        MediaJobContext oldContext = jobs.get(download.id());
        if (oldContext != null && oldContext.processSession != null && oldContext.processSession.isAlive()) {
            return CompletableFuture.failedFuture(new MediaOperationException("MEDIA_JOB_ALREADY_ACTIVE", "The media process is already running"));
        }
        return CompletableFuture.supplyAsync(() -> mediaJobStore.find(download.id())
                .orElseThrow(() -> new MediaOperationException("MEDIA_JOB_NOT_FOUND", "No persisted media job exists")), mediaExecutor)
        .thenCompose(descriptor -> {
            Path targetPath = Path.of(download.destination().value());
            return startDownload(download, targetPath, descriptor.webpageUrl(), descriptor.formatArgument(), descriptor.conflictPolicy());
        });
    }

    @Override
    public CompletionStage<Void> cancelDownload(Download download) {
        Objects.requireNonNull(download);
        MediaJobContext context = jobs.get(download.id());
        if (context == null) {
            return onMediaExecutor(() -> {
                deleteManagedDirectory(download.id());
                download.updateState(DownloadState.CANCELED);
                downloadRepository.save(download);
                MediaJobDescriptor current = mediaJobStore.find(download.id()).orElse(null);
                if (current != null) {
                    mediaJobStore.save(current.withStatus(MediaJobStatus.CANCELED, clock.instant()));
                }
                eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
            });
        }
        if (!context.requestedStop.compareAndSet(RequestedStop.NONE, RequestedStop.CANCEL)) {
            return CompletableFuture.failedFuture(new MediaOperationException("MEDIA_OPERATION_CONFLICT", "Another media operation is already in progress"));
        }

        CompletionStage<Void> termination = context.processSession == null ? CompletableFuture.completedFuture(null) : context.processSession.killTree();
        return termination.thenRunAsync(() -> {
            boolean claimed = false;
            context.operationLock.lock();
            try {
                claimed = context.completionHandled.compareAndSet(false, true);
            } finally {
                context.operationLock.unlock();
            }
            if (claimed) {
                deleteManagedDirectory(download.id());
                updateDownloadState(context, DownloadState.CANCELED, MediaJobStatus.CANCELED);
                jobs.remove(download.id(), context);
            }
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> deleteDownload(Download download, boolean permanent, Path targetPath) {
        Objects.requireNonNull(download);
        Objects.requireNonNull(targetPath);
        MediaJobContext context = jobs.get(download.id());
        CompletionStage<Void> termination;
        if (context == null || context.processSession == null) {
            termination = CompletableFuture.completedFuture(null);
        } else {
            context.requestedStop.set(RequestedStop.DELETE);
            termination = context.processSession.killTree();
        }

        return termination.thenRunAsync(() -> {
            if (permanent) {
                try {
                    Files.deleteIfExists(targetPath);
                } catch (IOException e) {
                    throw new MediaOperationException("MEDIA_DELETE_FAILED", "Could not delete media output", e);
                }
            }
            deleteManagedDirectory(download.id());
            mediaJobStore.delete(download.id());
            if (context != null) {
                jobs.remove(download.id(), context);
            }
        }, mediaExecutor);
    }

    @Override
    public CompletionStage<Void> deleteMediaFiles(Path targetPath) {
        return onMediaExecutor(() -> {
            try {
                Files.deleteIfExists(targetPath);
            } catch (IOException e) {
                throw new MediaOperationException("MEDIA_DELETE_FAILED", "Could not delete media files", e);
            }
        });
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
        } catch (TimeoutException failure) {
            throw new MediaOperationException("MEDIA_SHUTDOWN_TIMEOUT", "Active media processes did not terminate in time", failure);
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new MediaOperationException("MEDIA_SHUTDOWN_INTERRUPTED", "Media shutdown was interrupted", failure);
        } catch (ExecutionException failure) {
            throw new MediaOperationException("MEDIA_SHUTDOWN_FAILED", "One or more media processes failed to terminate", failure.getCause());
        } catch (Exception failure) {
            throw new MediaOperationException("MEDIA_SHUTDOWN_FAILED", "Shutdown failed", failure);
        }
    }
}
