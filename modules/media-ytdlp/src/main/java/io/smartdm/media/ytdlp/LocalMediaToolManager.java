package io.smartdm.media.ytdlp;

import io.smartdm.media.api.MediaToolManager;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public class LocalMediaToolManager implements MediaToolManager {

    private static final Map<String, Optional<Path>> CACHE = new ConcurrentHashMap<>();

    private final Path ytDlpPath;
    private final Path ffmpegPath;
    private final Path ffprobePath;

    public LocalMediaToolManager() {
        this.ytDlpPath = findExecutableCached("yt-dlp");
        this.ffmpegPath = findExecutableCached("ffmpeg");
        this.ffprobePath = findExecutableCached("ffprobe");
    }

    @Override
    public Optional<Path> getYtDlpPath() {
        return Optional.ofNullable(ytDlpPath);
    }

    @Override
    public Optional<Path> getFfmpegPath() {
        return Optional.ofNullable(ffmpegPath);
    }

    @Override
    public Optional<Path> getFfprobePath() {
        return Optional.ofNullable(ffprobePath);
    }

    @Override
    public boolean isAvailable() {
        return ytDlpPath != null;
    }

    private static Path findExecutableCached(String name) {
        return CACHE.computeIfAbsent(name, LocalMediaToolManager::findExecutable).orElse(null);
    }

    private static Optional<Path> findExecutable(String name) {
        String isWindows = System.getProperty("os.name").toLowerCase().contains("win") ? ".exe" : "";
        String execName = name + isWindows;

        // 1. Check ~/.local/share/smartdm/tools/ or %LOCALAPPDATA%/SmartDM/tools/
        Path userTools = Paths.get(System.getProperty("user.home"), ".local", "share", "smartdm", "tools", execName);
        if (Files.isExecutable(userTools) && !Files.isDirectory(userTools)) {
            return Optional.of(userTools.toAbsolutePath());
        }

        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null) {
            Path appDataTools = Paths.get(localAppData, "SmartDM", "tools", execName);
            if (Files.isExecutable(appDataTools) && !Files.isDirectory(appDataTools)) {
                return Optional.of(appDataTools.toAbsolutePath());
            }
        }

        // 2. Check CodeSource Location (JAR directory / installation dir)
        try {
            var codeSource = LocalMediaToolManager.class.getProtectionDomain().getCodeSource();
            if (codeSource != null) {
                Path codePath = Paths.get(codeSource.getLocation().toURI());
                Path jarDir = codePath.getParent();
                if (jarDir != null) {
                    Path p1 = jarDir.resolve("tools").resolve(execName);
                    if (Files.isExecutable(p1) && !Files.isDirectory(p1)) {
                        return Optional.of(p1.toAbsolutePath());
                    }
                    if (jarDir.getFileName() != null && jarDir.getFileName().toString().equalsIgnoreCase("lib")) {
                        Path appRoot = jarDir.getParent();
                        if (appRoot != null) {
                            Path p2 = appRoot.resolve("tools").resolve(execName);
                            if (Files.isExecutable(p2) && !Files.isDirectory(p2)) {
                                return Optional.of(p2.toAbsolutePath());
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        // Check app.dir system property
        String appDir = System.getProperty("app.dir");
        if (appDir != null && !appDir.isBlank()) {
            Path p = Paths.get(appDir, "tools", execName);
            if (Files.isExecutable(p) && !Files.isDirectory(p)) {
                return Optional.of(p.toAbsolutePath());
            }
        }

        // 3. Check relative working directory "tools"
        Path localTools = Paths.get("tools", execName);
        if (Files.isExecutable(localTools) && !Files.isDirectory(localTools)) {
            return Optional.of(localTools.toAbsolutePath());
        }

        // 4. Check PATH env variable
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            String[] dirs = pathEnv.split(File.pathSeparator);
            for (String dir : dirs) {
                try {
                    Path p = Paths.get(dir, execName);
                    if (Files.isExecutable(p) && !Files.isDirectory(p)) {
                        return Optional.of(p.toAbsolutePath());
                    }
                } catch (Exception ignored) {}
            }
        }

        // 5. Check WinGet locations
        if (localAppData != null) {
            Path wingetLinks = Paths.get(localAppData, "Microsoft", "WinGet", "Links", execName);
            if (Files.isExecutable(wingetLinks)) {
                return Optional.of(wingetLinks.toAbsolutePath());
            }
            Path wingetPackages = Paths.get(localAppData, "Microsoft", "WinGet", "Packages");
            if (Files.isDirectory(wingetPackages)) {
                try (var stream = Files.walk(wingetPackages, 3)) {
                    Optional<Path> found = stream
                        .filter(p -> p.getFileName().toString().equalsIgnoreCase(execName))
                        .filter(Files::isExecutable)
                        .findFirst();
                    if (found.isPresent()) return Optional.of(found.get().toAbsolutePath());
                } catch (Exception ignored) {}
            }
        }

        // 6. If yt-dlp is missing, attempt auto-downloading to LOCALAPPDATA/SmartDM/tools/
        if ("yt-dlp".equalsIgnoreCase(name) && localAppData != null) {
            try {
                Path targetDir = Paths.get(localAppData, "SmartDM", "tools");
                Files.createDirectories(targetDir);
                Path targetFile = targetDir.resolve(execName);
                String downloadUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
                System.out.println("yt-dlp not found locally. Auto-downloading from " + downloadUrl + "...");
                
                java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                    .followRedirects(java.net.http.HttpClient.Redirect.ALWAYS)
                    .build();
                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(downloadUrl))
                    .header("User-Agent", "SmartDM/1.0")
                    .GET()
                    .build();
                java.net.http.HttpResponse<Path> resp = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofFile(targetFile, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.WRITE, java.nio.file.StandardOpenOption.TRUNCATE_EXISTING));
                if (resp.statusCode() == 200 && Files.isExecutable(targetFile)) {
                    System.out.println("yt-dlp auto-downloaded successfully: " + targetFile.toAbsolutePath());
                    return Optional.of(targetFile.toAbsolutePath());
                }
            } catch (Exception ex) {
                System.err.println("Auto-downloading yt-dlp failed: " + ex.getMessage());
            }
        }

        return Optional.empty();
    }
}
