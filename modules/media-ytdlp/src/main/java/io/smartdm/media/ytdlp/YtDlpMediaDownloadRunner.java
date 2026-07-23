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
import io.smartdm.platform.api.process.NativeProcessController;
import io.smartdm.platform.api.process.NativeProcessHandle;
import io.smartdm.platform.api.process.NativeProcessRequest;
import io.smartdm.platform.api.process.OutputLimits;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class YtDlpMediaDownloadRunner implements MediaDownloadRunner {

    private record TaskInfo(Download download, Path targetPath, String webpageUrl, String formatArg) {}

    private final NativeProcessController processController;
    private final DownloadRepository repository;
    private final DownloadEvent.Publisher eventPublisher;
    private final MediaToolManager toolManager;

    private final Map<DownloadId, NativeProcessHandle> activeProcesses = new ConcurrentHashMap<>();
    private final Map<DownloadId, TaskInfo> taskRegistry = new ConcurrentHashMap<>();
    private final Map<DownloadId, Double> maxProgressMap = new ConcurrentHashMap<>();

    public YtDlpMediaDownloadRunner(
            NativeProcessController processController,
            DownloadRepository repository,
            DownloadEvent.Publisher eventPublisher,
            MediaToolManager toolManager) {
        this.processController = processController;
        this.repository = repository;
        this.eventPublisher = eventPublisher;
        this.toolManager = toolManager;
    }

    @Override
    public void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        TaskInfo info = new TaskInfo(download, targetPath, webpageUrl, formatArg);
        taskRegistry.put(download.id(), info);
        runYtDlp(info);
    }

    @Override
    public void pauseDownload(Download download) {
        download.updateState(DownloadState.PAUSED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.PAUSED, download));
        NativeProcessHandle p = activeProcesses.remove(download.id());
        if (p != null) {
            p.killTree();
        }
    }

    @Override
    public void resumeDownload(Download download) {
        TaskInfo info = taskRegistry.get(download.id());
        if (info != null) {
            runYtDlp(info);
        } else {
            download.updateState(DownloadState.FAILED);
            if (repository != null) repository.save(download);
            if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.FAILED, download));
        }
    }

    @Override
    public void cancelDownload(Download download) {
        download.updateState(DownloadState.CANCELED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
        NativeProcessHandle p = activeProcesses.remove(download.id());
        if (p != null) {
            p.killTree();
        }
        maxProgressMap.remove(download.id());
    }

    @Override
    public void deleteDownload(Download download, boolean permanent, Path targetPath) {
        download.updateState(DownloadState.CANCELED);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
        NativeProcessHandle p = activeProcesses.remove(download.id());
        if (p != null) {
            p.killTree();
        }
        maxProgressMap.remove(download.id());
        taskRegistry.remove(download.id());
        if (permanent && targetPath != null) {
            deleteMediaFiles(targetPath);
        }
    }

    @Override
    public boolean isMediaDownload(DownloadId id) {
        return taskRegistry.containsKey(id);
    }

    @Override
    public void deleteMediaFiles(Path targetPath) {
        if (targetPath == null) return;

        try { Thread.sleep(200); } catch (Exception ignored) {}

        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                Files.deleteIfExists(targetPath);
                Files.deleteIfExists(Paths.get(targetPath.toString() + ".part"));
                Files.deleteIfExists(Paths.get(targetPath.toString() + ".ytdl"));
                Files.deleteIfExists(Paths.get(targetPath.toString() + ".temp"));

                Path parent = targetPath.getParent();
                if (parent != null && Files.exists(parent)) {
                    String baseName = targetPath.getFileName().toString();
                    int dotIdx = baseName.lastIndexOf('.');
                    String prefix = (dotIdx > 0) ? baseName.substring(0, dotIdx) : baseName;

                    try (var stream = Files.newDirectoryStream(parent, prefix + "*")) {
                        for (Path p : stream) {
                            try {
                                Files.deleteIfExists(p);
                            } catch (Exception ignored) {}
                        }
                    }
                }
                break;
            } catch (Exception ex) {
                try { Thread.sleep(150); } catch (Exception ignored) {}
            }
        }
    }

    private void runYtDlp(TaskInfo info) {
        if (!toolManager.isAvailable() || toolManager.getYtDlpPath().isEmpty()) {
            info.download().updateState(DownloadState.FAILED);
            return;
        }

        Path ytDlp = toolManager.getYtDlpPath().get();
        String formatArg = (info.formatArg() != null && !info.formatArg().isBlank()) ? info.formatArg() : "b";

        new Thread(() -> {
            try {
                info.download().updateState(DownloadState.DOWNLOADING);
                if (repository != null) repository.save(info.download());
                if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.DOWNLOADING, info.download()));

                Path appTempDir = Paths.get(System.getProperty("user.home"), "AppData", "Local", "SmartDM", "temp", info.download().id().value());
                try {
                    Files.createDirectories(appTempDir);
                } catch (Exception ignored) {}

                Path tempOutputFile = appTempDir.resolve(info.targetPath().getFileName());

                List<String> args = Arrays.asList(
                    "--newline",
                    "--continue",
                    "-N", "4",
                    "--paths", "temp:" + appTempDir.toString(),
                    "--paths", "home:" + appTempDir.toString(),
                    "-f", formatArg,
                    "-o", tempOutputFile.toString(),
                    info.webpageUrl()
                );

                NativeProcessRequest request = new NativeProcessRequest(
                    ytDlp,
                    args,
                    Optional.empty(),
                    Duration.ofHours(24),
                    OutputLimits.unbounded()
                );

                NativeProcessHandle p = processController.start(request);
                activeProcesses.put(info.download().id(), p);

                Pattern progressPattern = Pattern.compile("\\[download\\]\\s+([\\d\\.]+)%");
                Pattern sizePattern = Pattern.compile("of\\s+~?\\s*([\\d\\.]+)\\s*([a-zA-Z]+)");

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (info.download().state() == DownloadState.PAUSED || info.download().state() == DownloadState.CANCELED) {
                            break;
                        }
                        line = line.trim();
                        Matcher matcher = progressPattern.matcher(line);
                        if (matcher.find()) {
                            try {
                                double pct = Double.parseDouble(matcher.group(1));
                                double currentMax = maxProgressMap.getOrDefault(info.download().id(), 0.0);

                                if (pct >= currentMax) {
                                    maxProgressMap.put(info.download().id(), pct);
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

                                    if (finalTotal > 0 && info.download().state() == DownloadState.DOWNLOADING) {
                                        long segSize = finalTotal / 4;
                                        List<DownloadSegment> segs = new ArrayList<>();
                                        for (int i = 0; i < 4; i++) {
                                            long sStart = i * segSize;
                                            long sEnd = (i == 3) ? finalTotal - 1 : (i + 1) * segSize - 1;
                                            long sDownloaded = (long) (finalDownloaded * 0.25);
                                            long sCurrent = sStart + Math.min(sDownloaded, sEnd - sStart + 1);
                                            segs.add(new DownloadSegment(i, sStart, sCurrent, sEnd));
                                        }

                                        info.download().updateSegments(segs);
                                        info.download().updateProgress(ByteCount.of(finalDownloaded), ByteCount.of(finalTotal));
                                        
                                        if (repository != null && System.currentTimeMillis() % 1000 < 200) {
                                            repository.save(info.download());
                                        }
                                        if (eventPublisher != null) {
                                            eventPublisher.publish(new DownloadEvent.ProgressUpdated(info.download().id(), ByteCount.of(finalDownloaded), ByteCount.of(finalTotal), info.download()));
                                        }
                                    }
                                }
                            } catch (Exception ignored) {}
                        }
                    }
                }

                int exitCode = p.waitFor();
                activeProcesses.remove(info.download().id());

                if (exitCode == 0 && info.download().state() == DownloadState.DOWNLOADING) {
                    try {
                        if (Files.exists(tempOutputFile)) {
                            Files.move(tempOutputFile, info.targetPath(), StandardCopyOption.REPLACE_EXISTING);
                        } else if (Files.exists(appTempDir)) {
                            try (Stream<Path> s = Files.list(appTempDir)) {
                                s.filter(f -> !f.toString().endsWith(".part") && !f.toString().endsWith(".ytdl"))
                                 .findFirst()
                                 .ifPresent(f -> {
                                     try { Files.move(f, info.targetPath(), StandardCopyOption.REPLACE_EXISTING); } catch (Exception ignored) {}
                                 });
                            }
                        }
                    } catch (Exception ex) {
                        System.err.println("Error moving temp download file to target destination: " + ex.getMessage());
                    }

                    info.download().updateState(DownloadState.COMPLETED);
                    if (repository != null) repository.save(info.download());
                    if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.COMPLETED, info.download()));
                } else if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    info.download().updateState(DownloadState.FAILED);
                    if (repository != null) repository.save(info.download());
                    if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.FAILED, info.download()));
                }
            } catch (Exception ex) {
                if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    info.download().updateState(DownloadState.FAILED);
                    if (repository != null) repository.save(info.download());
                    if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.FAILED, info.download()));
                }
            } finally {
                try {
                    Path appTempDir = Paths.get(System.getProperty("user.home"), "AppData", "Local", "SmartDM", "temp", info.download().id().value());
                    if (Files.exists(appTempDir)) {
                        try (Stream<Path> walk = Files.walk(appTempDir)) {
                            walk.sorted(java.util.Comparator.reverseOrder())
                                .map(Path::toFile)
                                .forEach(java.io.File::delete);
                        }
                    }
                } catch (Exception ignored) {}
            }
        }, "YtDlpDownload-" + info.download().id().value()).start();
    }
}
