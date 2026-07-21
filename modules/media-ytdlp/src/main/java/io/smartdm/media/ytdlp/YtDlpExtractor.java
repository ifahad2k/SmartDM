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
                    "--ignore-config",
                    url
                );

                Process process = pb.start();
                String jsonOutput;
                String errOutput;
                try (InputStream is = process.getInputStream();
                     InputStream es = process.getErrorStream()) {
                    jsonOutput = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                    errOutput = new String(es.readAllBytes(), StandardCharsets.UTF_8);
                }

                int exitCode = process.waitFor();
                if (exitCode != 0 || jsonOutput.isBlank()) {
                    System.err.println("yt-dlp error output: " + errOutput);
                    throw new RuntimeException("yt-dlp metadata extraction failed with exit code " + exitCode + ": " + errOutput);
                }

                int start = jsonOutput.indexOf('{');
                int end = jsonOutput.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    jsonOutput = jsonOutput.substring(start, end + 1);
                }

                JsonNode root = mapper.readTree(jsonOutput);
                return parseMetadata(root, url);
            } catch (Exception ex) {
                System.err.println("YtDlpExtractor error for URL [" + url + "]: " + ex.getMessage());
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

        formatsList.sort((a, b) -> Double.compare(b.tbr(), a.tbr()));

        List<String> subtitles = new ArrayList<>();
        JsonNode subsNode = root.path("subtitles");
        if (subsNode.isObject()) {
            subsNode.fieldNames().forEachRemaining(subtitles::add);
        }

        return new MediaMetadata(id, title, duration, webpageUrl, thumbnail, formatsList, subtitles);
    }
}
