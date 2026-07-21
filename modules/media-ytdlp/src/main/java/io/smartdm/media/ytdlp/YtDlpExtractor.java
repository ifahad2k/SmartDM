package io.smartdm.media.ytdlp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.media.api.MediaExtractor;
import io.smartdm.media.api.MediaFormat;
import io.smartdm.media.api.MediaMetadata;
import io.smartdm.media.api.MediaToolManager;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class YtDlpExtractor implements MediaExtractor {

    private final MediaToolManager toolManager;
    private final ObjectMapper mapper;

    public YtDlpExtractor(MediaToolManager toolManager) {
        this.toolManager = toolManager;
        this.mapper = new ObjectMapper();
    }

    @Override
    public CompletableFuture<MediaMetadata> extractMetadataAsync(String url) {
        return CompletableFuture.supplyAsync(() -> {
            Path ytDlp = toolManager.getYtDlpPath().orElseThrow(() -> 
                new IllegalStateException("yt-dlp executable not found. Please install yt-dlp."));

            try {
                ProcessBuilder pb = new ProcessBuilder(
                    ytDlp.toString(),
                    "--dump-json",
                    "--no-playlist",
                    "--no-warnings",
                    url
                );

                Process process = pb.start();
                String jsonOutput;
                try (InputStream is = process.getInputStream()) {
                    jsonOutput = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }

                int exitCode = process.waitFor();
                if (exitCode != 0 || jsonOutput.isBlank()) {
                    throw new RuntimeException("yt-dlp metadata extraction failed with exit code " + exitCode);
                }

                JsonNode root = mapper.readTree(jsonOutput);
                return parseMetadata(root, url);
            } catch (Exception ex) {
                throw new RuntimeException("Failed to extract media metadata: " + ex.getMessage(), ex);
            }
        });
    }

    private MediaMetadata parseMetadata(JsonNode root, String originalUrl) {
        String id = root.path("id").asText("");
        String title = root.path("title").asText("Untitled Video");
        long duration = root.path("duration").asLong(0);
        String webpageUrl = root.path("webpage_url").asText(originalUrl);
        String thumbnail = root.path("thumbnail").asText("");

        List<MediaFormat> formatsList = new ArrayList<>();
        JsonNode formatsNode = root.path("formats");
        if (formatsNode.isArray()) {
            for (JsonNode f : formatsNode) {
                String formatId = f.path("format_id").asText("");
                String ext = f.path("ext").asText("mp4");
                String resolution = f.path("resolution").asText("");
                if (resolution.isBlank() && f.has("height") && f.get("height").asInt() > 0) {
                    resolution = f.get("height").asInt() + "p";
                }
                String formatNote = f.path("format_note").asText("");
                long fileSize = f.path("filesize").asLong(f.path("filesize_approx").asLong(0));
                String vcodec = f.path("vcodec").asText("none");
                String acodec = f.path("acodec").asText("none");
                double tbr = f.path("tbr").asDouble(0);
                int fps = f.path("fps").asInt(0);

                // Skip storyboards and non-media formats
                if (formatNote.toLowerCase().contains("storyboard") || "mhtml".equalsIgnoreCase(ext)) {
                    continue;
                }
                if ("none".equalsIgnoreCase(vcodec) && "none".equalsIgnoreCase(acodec)) {
                    continue;
                }

                boolean isAudioOnly = "none".equalsIgnoreCase(vcodec) && !"none".equalsIgnoreCase(acodec);
                boolean isVideoOnly = !"none".equalsIgnoreCase(vcodec) && "none".equalsIgnoreCase(acodec);

                formatsList.add(new MediaFormat(
                    formatId, ext, resolution, formatNote, fileSize, vcodec, acodec, tbr, fps, isAudioOnly, isVideoOnly
                ));
            }
        }

        // Sort formats: combined video+audio or high-res video first, then audio-only
        formatsList.sort((a, b) -> Double.compare(b.tbr(), a.tbr()));

        List<String> subtitles = new ArrayList<>();
        JsonNode subsNode = root.path("subtitles");
        if (subsNode.isObject()) {
            subsNode.fieldNames().forEachRemaining(subtitles::add);
        }

        return new MediaMetadata(id, title, duration, webpageUrl, thumbnail, formatsList, subtitles);
    }
}
