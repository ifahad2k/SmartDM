package io.smartdm.media.ytdlp;

import io.smartdm.media.api.MediaToolManager;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

public class LocalMediaToolManager implements MediaToolManager {

    private final Path ytDlpPath;
    private final Path ffmpegPath;
    private final Path ffprobePath;

    public LocalMediaToolManager() {
        this.ytDlpPath = findExecutable("yt-dlp");
        this.ffmpegPath = findExecutable("ffmpeg");
        this.ffprobePath = findExecutable("ffprobe");
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

    private static Path findExecutable(String name) {
        String isWindows = System.getProperty("os.name").toLowerCase().contains("win") ? ".exe" : "";
        String execName = name + isWindows;

        // Check PATH env variable
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            String[] dirs = pathEnv.split(File.pathSeparator);
            for (String dir : dirs) {
                try {
                    Path p = Paths.get(dir, execName);
                    if (Files.isExecutable(p) && !Files.isDirectory(p)) {
                        return p.toAbsolutePath();
                    }
                } catch (Exception ignored) {}
            }
        }

        // Check common WinGet / LocalAppData locations on Windows
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null) {
            Path wingetLinks = Paths.get(localAppData, "Microsoft", "WinGet", "Links", execName);
            if (Files.isExecutable(wingetLinks)) {
                return wingetLinks.toAbsolutePath();
            }
            Path wingetPackages = Paths.get(localAppData, "Microsoft", "WinGet", "Packages");
            if (Files.isDirectory(wingetPackages)) {
                try (var stream = Files.walk(wingetPackages, 3)) {
                    Optional<Path> found = stream
                        .filter(p -> p.getFileName().toString().equalsIgnoreCase(execName))
                        .filter(Files::isExecutable)
                        .findFirst();
                    if (found.isPresent()) return found.get().toAbsolutePath();
                } catch (Exception ignored) {}
            }
        }

        return null;
    }
}
