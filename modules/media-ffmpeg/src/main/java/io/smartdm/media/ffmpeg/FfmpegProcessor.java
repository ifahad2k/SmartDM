package io.smartdm.media.ffmpeg;

import io.smartdm.media.api.MediaToolManager;

import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

public class FfmpegProcessor {

    private final MediaToolManager toolManager;

    public FfmpegProcessor(MediaToolManager toolManager) {
        this.toolManager = toolManager;
    }

    public CompletableFuture<Path> mergeVideoAndAudioAsync(Path videoPath, Path audioPath, Path outputPath) {
        return CompletableFuture.supplyAsync(() -> {
            Path ffmpeg = toolManager.getFfmpegPath().orElseThrow(() -> 
                new IllegalStateException("FFmpeg executable not found on system."));

            try {
                ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg.toString(),
                    "-y",
                    "-i", videoPath.toString(),
                    "-i", audioPath.toString(),
                    "-c", "copy",
                    outputPath.toString()
                );

                Process process = pb.start();
                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    throw new RuntimeException("FFmpeg merge failed with exit code " + exitCode);
                }
                return outputPath;
            } catch (Exception ex) {
                throw new RuntimeException("Failed to merge media files: " + ex.getMessage(), ex);
            }
        });
    }

    public CompletableFuture<Path> extractAudioAsync(Path inputPath, Path outputPath) {
        return CompletableFuture.supplyAsync(() -> {
            Path ffmpeg = toolManager.getFfmpegPath().orElseThrow(() -> 
                new IllegalStateException("FFmpeg executable not found on system."));

            try {
                ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg.toString(),
                    "-y",
                    "-i", inputPath.toString(),
                    "-vn",
                    "-acodec", "copy",
                    outputPath.toString()
                );

                Process process = pb.start();
                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    throw new RuntimeException("FFmpeg audio extraction failed with exit code " + exitCode);
                }
                return outputPath;
            } catch (Exception ex) {
                throw new RuntimeException("Failed to extract audio: " + ex.getMessage(), ex);
            }
        });
    }
}
