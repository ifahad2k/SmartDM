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
import io.smartdm.domain.repository.DownloadRepository;

import io.smartdm.domain.DownloadEvent;
public final class MediaDownloadTracker {

    public static record TaskInfo(
        Download download,
        Path targetPath,
        String webpageUrl,
        String directStreamUrl,
        String formatArg,
        String cookies
    ) {}

    private static final Map<DownloadId, Process> activeProcesses = new ConcurrentHashMap<>();
    private static final Map<DownloadId, Process> dyingProcesses = new ConcurrentHashMap<>();
    private static final Map<DownloadId, TaskInfo> taskRegistry = new ConcurrentHashMap<>();
    private static final Map<DownloadId, Double> maxProgressMap = new ConcurrentHashMap<>();
    private static final Map<DownloadId, Long> lastProgressUpdateMap = new ConcurrentHashMap<>();

    private static DownloadRepository repository;
    private static DownloadEvent.Publisher eventPublisher;

    public static void init(DownloadRepository repo, DownloadEvent.Publisher pub) {
        repository = repo;
        eventPublisher = pub;
    }

    public static boolean isMediaDownload(DownloadId id) {
        return taskRegistry.containsKey(id);
    }

    public static void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg) {
        startDownload(download, targetPath, webpageUrl, null, formatArg, null);
    }

    public static void startDownload(Download download, Path targetPath, String webpageUrl, String formatArg, String cookies) {
        startDownload(download, targetPath, webpageUrl, null, formatArg, cookies);
    }

    public static void startDownload(Download download, Path targetPath, String webpageUrl, String directStreamUrl, String formatArg, String cookies) {
        TaskInfo info = new TaskInfo(download, targetPath, webpageUrl, directStreamUrl, formatArg, cookies);
        taskRegistry.put(download.id(), info);
        runYtDlp(info);
    }

    public static void pauseDownload(Download download) {
        download.updateState(DownloadState.PAUSED);
        if (repository != null) repository.save(download);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.PAUSED, download));
        Process p = activeProcesses.remove(download.id());
        if (p != null) {
            dyingProcesses.put(download.id(), p);
            new Thread(() -> {
                killProcessTree(p);
                dyingProcesses.remove(download.id());
            }, "media-kill-thread").start();
        }
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
        if (p != null) {
            new Thread(() -> killProcessTree(p), "media-kill-thread").start();
        }
        maxProgressMap.remove(download.id());
    }

    public static void deleteDownload(Download download, boolean permanent) {
        download.updateState(DownloadState.CANCELED);
        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(download.id(), DownloadState.CANCELED, download));
        Process p = activeProcesses.remove(download.id());
        if (p != null) {
            new Thread(() -> killProcessTree(p), "media-kill-thread").start();
        }
        maxProgressMap.remove(download.id());
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
            Process dying = dyingProcesses.get(info.download().id());
            if (dying != null) {
                try { dying.waitFor(5, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception ignored) {}
            }
            try {
                Platform.runLater(() -> {
                    info.download().updateState(DownloadState.DOWNLOADING);
                    if (repository != null) repository.save(info.download());
                    if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.DOWNLOADING, info.download()));
                });

                Path appTempDir = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "SmartDM", "temp", info.download().id().value());
                try {
                    java.nio.file.Files.createDirectories(appTempDir);
                } catch (Exception ignored) {}

                Path tempOutputFile = appTempDir.resolve(info.targetPath().getFileName());

                Path persistentCacheDir = java.nio.file.Paths.get(System.getProperty("user.home"), ".smartdm", "cache", "ytdlp");
                try { java.nio.file.Files.createDirectories(persistentCacheDir); } catch (Exception ignored) {}

                List<String> commandList = new ArrayList<>();
                commandList.add(ytDlp.toString());
                commandList.add("--newline");
                commandList.add("--continue");
                commandList.add("--no-check-certificates");
                commandList.add("--no-warnings");
                commandList.add("--ignore-config");
                commandList.add("--no-playlist");
                commandList.add("--cache-dir");
                commandList.add(persistentCacheDir.toAbsolutePath().toString());
                commandList.add("--no-mtime");
                commandList.add("--socket-timeout");
                commandList.add("10");
                commandList.add("--buffer-size");
                commandList.add("64k");
                commandList.add("--http-chunk-size");
                commandList.add("10M");
                commandList.add("-N");
                commandList.add("16");
                commandList.add("--paths");
                commandList.add("temp:" + appTempDir.toString());
                commandList.add("--paths");
                commandList.add("home:" + appTempDir.toString());

                commandList.add("--user-agent");
                commandList.add("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");

                if (toolMgr.getFfmpegPath().isPresent()) {
                    commandList.add("--ffmpeg-location");
                    commandList.add(toolMgr.getFfmpegPath().get().toAbsolutePath().toString());
                }

                if (info.webpageUrl() != null && (info.webpageUrl().contains("youtube.com") || info.webpageUrl().contains("youtu.be"))) {
                    commandList.add("--extractor-args");
                    commandList.add("youtube:player_client=android,mweb");
                } else if (info.webpageUrl() != null && info.webpageUrl().contains("instagram.com")) {
                    commandList.add("--referer");
                    commandList.add("https://www.instagram.com/");
                }

                if (info.cookies() != null && !info.cookies().isBlank()) {
                    try {
                        Path cookieFile = appTempDir.resolve("cookies.txt");
                        java.nio.file.Files.writeString(cookieFile, info.cookies());
                        commandList.add("--cookies");
                        commandList.add(cookieFile.toAbsolutePath().toString());
                    } catch (Exception ignored) {}
                }

                String fArg;
                if (formatArg == null || formatArg.isBlank() || "best".equalsIgnoreCase(formatArg) || "b".equalsIgnoreCase(formatArg)) {
                    fArg = "bv*+ba/b/best";
                } else if (formatArg.startsWith("audio_") || formatArg.toLowerCase().contains("audio") || "ba".equalsIgnoreCase(formatArg) || "bestaudio".equalsIgnoreCase(formatArg)) {
                    fArg = formatArg;
                } else {
                    fArg = formatArg + "+ba/" + formatArg + "+bestaudio/" + formatArg + "/bv*+ba/b/best";
                }

                boolean isYouTube = info.webpageUrl() != null && (info.webpageUrl().contains("youtube.com") || info.webpageUrl().contains("youtu.be"));
                String targetUrl = (!isYouTube && info.directStreamUrl() != null && !info.directStreamUrl().isBlank()) ? info.directStreamUrl() : info.webpageUrl();

                commandList.add("-f");
                commandList.add(fArg);
                commandList.add("--merge-output-format");
                commandList.add("mp4");
                commandList.add("-o");
                commandList.add(tempOutputFile.toString());
                commandList.add("--force-ipv4");
                commandList.add(targetUrl);

                ProcessBuilder pb = new ProcessBuilder(commandList);
                pb.redirectErrorStream(true);

                Process p = pb.start();
                activeProcesses.put(info.download().id(), p);

                // Publish immediate initial progress event so UI progress bar activates instantly (<50ms)
                Platform.runLater(() -> {
                    if (eventPublisher != null) {
                        eventPublisher.publish(new DownloadEvent.ProgressUpdated(
                            info.download().id(), ByteCount.of(0), ByteCount.of(100_000_000L), info.download()));
                    }
                });

                Pattern progressPattern = Pattern.compile("\\[download\\]\\s+([\\d\\.]+)%");
                Pattern sizePattern = Pattern.compile("of\\s+~?\\s*([\\d\\.]+)\\s*([a-zA-Z]+)");

                try (var reader = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (info.download().state() == DownloadState.PAUSED || info.download().state() == DownloadState.CANCELED) {
                            break;
                        }
                        line = line.trim();
                        if (line.contains("[download] Destination:") || line.contains("[download] Downloading item")) {
                            maxProgressMap.put(info.download().id(), 0.0);
                        }

                        Matcher matcher = progressPattern.matcher(line);
                        if (matcher.find()) {
                            try {
                                double pct = Double.parseDouble(matcher.group(1));
                                double currentMax = maxProgressMap.getOrDefault(info.download().id(), 0.0);

                                if (pct < currentMax - 10.0) {
                                    currentMax = 0.0;
                                }

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

                                    final long finalTotal = (totalBytes > 0) ? totalBytes : 100_000_000L;
                                    final long finalDownloaded = (long) (finalTotal * (pct / 100.0));

                                    long segSize = finalTotal / 4;
                                    List<DownloadSegment> segs = new ArrayList<>();
                                    for (int i = 0; i < 4; i++) {
                                        long sStart = i * segSize;
                                        long sEnd = (i == 3) ? finalTotal - 1 : (i + 1) * segSize - 1;
                                        long sDownloaded = (long) (finalDownloaded * 0.25);
                                        long sCurrent = sStart + Math.min(sDownloaded, sEnd - sStart + 1);
                                        segs.add(new DownloadSegment(i, sStart, sCurrent, sEnd));
                                    }

                                    long now = System.currentTimeMillis();
                                    Long lastUpd = lastProgressUpdateMap.get(info.download().id());
                                    if (lastUpd == null || (now - lastUpd) >= 100 || pct >= 100.0) {
                                        lastProgressUpdateMap.put(info.download().id(), now);
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
                                                    eventPublisher.publish(new DownloadEvent.ProgressUpdated(info.download().id(), ByteCount.of(finalDownloaded), ByteCount.of(finalTotal), info.download()));
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
                    try {
                        if (java.nio.file.Files.exists(tempOutputFile)) {
                            java.nio.file.Files.move(tempOutputFile, info.targetPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        } else if (java.nio.file.Files.exists(appTempDir)) {
                            try (var s = java.nio.file.Files.list(appTempDir)) {
                                s.filter(f -> !f.toString().endsWith(".part") && !f.toString().endsWith(".ytdl"))
                                 .findFirst()
                                 .ifPresent(f -> {
                                     try { java.nio.file.Files.move(f, info.targetPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING); } catch (Exception ignored) {}
                                 });
                            }
                        }
                    } catch (Exception ex) {
                        System.err.println("Error moving temp download file to target destination: " + ex.getMessage());
                    }

                    Platform.runLater(() -> {
                        info.download().updateState(DownloadState.COMPLETED);
                        if (repository != null) repository.save(info.download());
                        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.COMPLETED, info.download()));
                    });
                } else if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    Platform.runLater(() -> {
                        info.download().updateState(DownloadState.FAILED);
                        if (repository != null) repository.save(info.download());
                        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.FAILED, info.download()));
                    });
                }
            } catch (Exception ex) {
                if (info.download().state() != DownloadState.PAUSED && info.download().state() != DownloadState.CANCELED) {
                    Platform.runLater(() -> {
                        info.download().updateState(DownloadState.FAILED);
                        if (repository != null) repository.save(info.download());
                        if (eventPublisher != null) eventPublisher.publish(new DownloadEvent.StateChanged(info.download().id(), DownloadState.FAILED, info.download()));
                    });
                }
            } finally {
                try {
                    java.nio.file.Path appTempDir = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "SmartDM", "temp", info.download().id().value());
                    if (java.nio.file.Files.exists(appTempDir)) {
                        try (java.util.stream.Stream<java.nio.file.Path> walk = java.nio.file.Files.walk(appTempDir)) {
                            walk.sorted(java.util.Comparator.reverseOrder())
                                .map(java.nio.file.Path::toFile)
                                .forEach(java.io.File::delete);
                        }
                    }
                } catch (Exception ignored) {}
            }
        }).start();
    }
}
