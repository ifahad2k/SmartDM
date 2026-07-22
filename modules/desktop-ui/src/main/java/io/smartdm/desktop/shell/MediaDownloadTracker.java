package io.smartdm.desktop.shell;

import io.smartdm.domain.ByteCount;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import io.smartdm.media.ytdlp.LocalMediaToolManager;
import javafx.application.Platform;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import io.smartdm.domain.DownloadRepository;
import io.smartdm.domain.EventPublisher;
import io.smartdm.domain.DownloadEvent;
public final class MediaDownloadTracker {

    public static record TaskInfo(
        Download download,
        Path targetPath,
        String webpageUrl,
        String formatArg
    ) {}

    private static final Map<DownloadId, Process> activeProcesses = new ConcurrentHashMap<>();
    private static final Map<DownloadId, TaskInfo> taskRegistry = new ConcurrentHashMap<>();
    private static final Map<DownloadId, Double> maxProgressMap = new ConcurrentHashMap<>();

    private static DownloadRepository repository;
    private static EventPublisher eventPublisher;

    public static void init(DownloadRepository repo, EventPublisher pub) {
        repository = repo;
        eventPublisher = pub;
    }

    public static boolean isMediaDownload(DownloadId id) {
        return taskRegistry.containsKey(id);
    }

    public static void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        TaskInfo info = new TaskInfo(download, targetPath, webpageUrl, formatArg);
        taskRegistry.put(download.id(), info);
        runYtDlp(info);
    }

    public static void pauseDownload(Download download) {
        download.updateState(DownloadState.PAUSED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.PAUSED, download));
        Process p = activeProcesses.remove(download.id());
        killProcessTree(p);
    }

    public static void resumeDownload(Download download) {
        TaskInfo info = taskRegistry.get(download.id());
        if (info != null) {
            runYtDlp(info);
        } else {
            download.updateState(DownloadState.FAILED);
            if (repository != null) repository.save(download);
            if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.FAILED, download));
        }
    }

    public static void cancelDownload(Download download) {
        download.updateState(DownloadState.CANCELED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
        Process p = activeProcesses.remove(download.id());
        killProcessTree(p);
        maxProgressMap.remove(download.id());
    }

    public static void deleteDownload(Download download, boolean permanent) {
        cancelDownload(download);
        TaskInfo info = taskRegistry.remove(download.id());
        if (permanent) {
            deleteMediaFiles(download.destination().value());
            if (info != null && info.targetPath() != null) {
                deleteMediaFiles(info.targetPath());
            }
        }
    }

    public static void deleteMediaFiles(Path targetPath) {
        if (targetPath == null) return;
        
        try { Thread.sleep(200); } catch (Exception ignored) {}

        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                Files.deleteIfExists(targetPath);
                Files.deleteIfExists(Path.of(targetPath.toString() + ".part"));
                Files.deleteIfExists(Path.of(targetPath.toString() + ".ytdl"));
                Files.deleteIfExists(Path.of(targetPath.toString() + ".temp"));

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

    private static void killProcessTree(Process p) {
        if (p == null) return;
        try {
            long pid = p.pid();
            if (System.getProperty("os.name").toLowerCase().contains("win")) {
                new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(pid)).start().waitFor();
            } else {
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                p.destroyForcibly();
            }
        } catch (Exception e) {
            p.destroyForcibly();
        }
    }

    private static void runYtDlp(TaskInfo info) {
        LocalMediaToolManager toolMgr = new LocalMediaToolManager();
        if (!toolMgr.isAvailable() || toolMgr.getYtDlpPath().isEmpty()) {
            info.download().updateState(DownloadState.FAILED);
            return;
        }

        Path ytDlp = toolMgr.getYtDlpPath().get();
        String formatArg = (info.formatArg() != null && !info.formatArg().isBlank()) ? info.formatArg() : "b";

        new Thread(() -> {
            try {
                Platform.runLater(() -> {
                    info.download().updateState(DownloadState.DOWNLOADING);
                    if (repository != null) repository.save(info.download());
                    if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.DOWNLOADING, info.download()));
                });

                ProcessBuilder pb = new ProcessBuilder(
                    ytDlp.toString(),
                    "--newline",
                    "--continue",
                    "-N", "4",
                    "-f", formatArg,
                    "-o", info.targetPath().toString(),
                    info.webpageUrl()
                );
                pb.redirectErrorStream(true);

                Process p = pb.start();
                activeProcesses.put(info.download().id(), p);

                Pattern progressPattern = Pattern.compile("\\[download\\]\\s+([\\d\\.]+)%");
                Pattern sizePattern = Pattern.compile("of\\s+~?([\\d\\.]+)\\s*(\\w+)");

                try (var reader = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream()))) {
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

                                    long totalBytes = 100 * 1024 * 1024L;

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

                                    if (finalTotal > 0) {
                                        long segSize = finalTotal / 4;
                                        List<DownloadSegment> segs = new ArrayList<>();
                                        for (int i = 0; i < 4; i++) {
                                            long sStart = i * segSize;
                                            long sEnd = (i == 3) ? finalTotal - 1 : (i + 1) * segSize - 1;
                                            long sDownloaded = (long) (finalDownloaded * 0.25);
                                            long sCurrent = sStart + Math.min(sDownloaded, sEnd - sStart + 1);
                                            segs.add(new DownloadSegment(i, sStart, sCurrent, sEnd));
                                        }

                                        Platform.runLater(() -> {
                                            if (info.download().state() == DownloadState.DOWNLOADING) {
                                                info.download().updateSegments(segs);
                                                info.download().updateProgress(
                                                    ByteCount.of(finalDownloaded),
                                                    ByteCount.of(finalTotal)
                                                );
                                                if (repository != null && System.currentTimeMillis() % 1000 < 200) {
                                                    repository.save(info.download());
                                                }
                                                if (eventPublisher != null) {
                                                    eventPublisher.publish(new DownloadEvent.ProgressUpdated(info.download().id(), info.download()));
                                                }
                                            }
                                        });
                                    }
                                }
                            } catch (Exception ignored) {}
                        }
                    }
                }

                int exitCode = p.waitFor();
                activeProcesses.remove(info.download().id());

                if (exitCode == 0 && info.download().state() == DownloadState.DOWNLOADING) {
                    Platform.runLater(() -> info.download().updateState(DownloadState.COMPLETED));
                } else if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    Platform.runLater(() -> info.download().updateState(DownloadState.FAILED));
                }
            } catch (Exception ex) {
                if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    Platform.runLater(() -> info.download().updateState(DownloadState.FAILED));
                }
            }
        }).start();
    }
}
