package io.smartdm.media.ytdlp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.media.api.MediaExtractor;
import io.smartdm.media.api.MediaFormat;
import io.smartdm.media.api.MediaMetadata;
import io.smartdm.media.api.MediaToolManager;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class TikTokExtractor implements MediaExtractor {

    private final MediaToolManager toolManager;
    private final ObjectMapper mapper;

    public TikTokExtractor(MediaToolManager toolManager) {
        this.toolManager = toolManager;
        this.mapper = new ObjectMapper();
    }

    private static boolean isValidHttpUrl(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        try {
            java.net.URI uri = java.net.URI.create(url.trim());
            String scheme = uri.getScheme();
            return scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"));
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public CompletableFuture<MediaMetadata> extractMetadataAsync(String urlInput, String cookies) {
        return extractMetadataAsync(urlInput, cookies, null);
    }

    @Override
    public CompletableFuture<MediaMetadata> extractMetadataAsync(String urlInput, String cookies, String userAgent) {
        if (!isValidHttpUrl(urlInput)) {
            System.err.println("TikTokExtractor: Invalid URL provided (scheme must be http/https): " + urlInput);
            return CompletableFuture.completedFuture(null);
        }
        return CompletableFuture.supplyAsync(() -> {
            Path cookieFile = null;
            try {
                Path ytDlp = toolManager.getYtDlpPath().orElseThrow(() -> 
                    new IllegalStateException("yt-dlp executable not found. Please install yt-dlp."));

                String cleanCookies = (cookies != null) ? cookies.replace("\\\\n", "\n").replace("\\\\t", "\t").replace("\\n", "\n").replace("\\t", "\t") : null;

                String ua = (userAgent != null && !userAgent.isBlank()) ? userAgent : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                List<String> cmd = new ArrayList<>(List.of(
                    ytDlp.toString(),
                    "--dump-json",
                    "--no-playlist",
                    "--user-agent",
                    ua
                ));

                if (cleanCookies != null && !cleanCookies.isBlank()) {
                    cookieFile = Files.createTempFile("smartdm_tiktok_cookies_", ".txt");
                    if (System.getProperty("os.name").toLowerCase().contains("linux") || System.getProperty("os.name").toLowerCase().contains("mac")) {
                        try {
                            Files.setPosixFilePermissions(cookieFile, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
                        } catch (Exception ignored) {}
                    }
                    Files.writeString(cookieFile, cleanCookies, StandardCharsets.UTF_8);
                    cmd.add("--cookies");
                    cmd.add(cookieFile.toAbsolutePath().toString());
                }

                cmd.add("--");
                cmd.add(urlInput);

                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.redirectErrorStream(true);
                Process process = pb.start();

                String combinedOutput;
                try (InputStream is = process.getInputStream()) {
                    combinedOutput = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }

                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    System.err.println("TikTokExtractor warning: yt-dlp process exited with code " + exitCode + ", output: " + combinedOutput);
                    return null;
                }

                int start = combinedOutput.indexOf('{');
                int end = combinedOutput.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    String jsonOutput = combinedOutput.substring(start, end + 1);
                    JsonNode root = mapper.readTree(jsonOutput);
                    MediaMetadata meta = parseMetadata(root, urlInput);
                    if (meta != null && meta.formats() != null && !meta.formats().isEmpty()) {
                        return meta;
                    }
                }
            } catch (Exception ex) {
                System.err.println("TikTokExtractor warning for URL [" + urlInput + "]: " + ex.getMessage());
            } finally {
                if (cookieFile != null) {
                    try {
                        Files.deleteIfExists(cookieFile);
                    } catch (Exception e) {
                        System.err.println("Failed to delete temp TikTok cookie file: " + e.getMessage());
                    }
                }
            }
            return null;
        });
    }

    private MediaMetadata parseMetadata(JsonNode root, String originalUrl) {
        String id = root.path("id").asText("");
        String title = root.path("title").asText("TikTok Video");
        long duration = root.path("duration").asLong(0);
        String webpageUrl = root.path("webpage_url").asText(originalUrl);
        String thumbnail = root.path("thumbnail").asText("");

        List<MediaFormat> formatsList = new ArrayList<>();

        if (root.has("url") && !root.path("url").asText().isBlank()) {
            String res = root.path("resolution").asText("");
            if (res.isBlank() && root.has("height") && root.get("height").asInt() > 0) {
                res = root.get("height").asInt() + "p";
            }
            if (res.isBlank()) res = "Best Quality (MP4)";
            formatsList.add(new MediaFormat(
                "best", "mp4", res, "Best Quality Video + Audio", 0, "h264", "aac", 0, 0, false, false
            ));
        }

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

        boolean hasCombined = formatsList.stream().anyMatch(f -> !f.isVideoOnly() && !f.isAudioOnly());
        if (!hasCombined && !formatsList.isEmpty()) {
            MediaFormat topFmt = formatsList.get(0);
            String res = topFmt.resolution() != null && !topFmt.resolution().isBlank() ? topFmt.resolution() : "High Quality";
            formatsList.add(0, new MediaFormat(
                "best", "mp4", res, "Best Quality (Video + Audio)", 0, "h264", "aac", 0, 0, false, false
            ));
        }

        formatsList.sort((a, b) -> Double.compare(b.tbr(), a.tbr()));

        List<MediaFormat> cleanList = new ArrayList<>();
        java.util.Set<String> seenResolutions = new java.util.HashSet<>();
        for (MediaFormat fmt : formatsList) {
            String key;
            if (fmt.isAudioOnly()) {
                key = "audio_" + fmt.ext() + "_" + fmt.formatId();
            } else {
                key = (fmt.resolution() != null && !fmt.resolution().isBlank()) 
                    ? fmt.resolution() 
                    : ((fmt.formatNote() != null && !fmt.formatNote().isBlank()) ? fmt.formatNote() : fmt.formatId());
            }
            if (!key.isBlank() && !seenResolutions.contains(key)) {
                seenResolutions.add(key);
                cleanList.add(fmt);
            }
        }
        if (cleanList.isEmpty()) {
            cleanList = formatsList;
        }

        List<String> subtitles = new ArrayList<>();
        JsonNode subsNode = root.path("subtitles");
        if (subsNode.isObject()) {
            subsNode.fieldNames().forEachRemaining(subtitles::add);
        }

        return new MediaMetadata(id, title, duration, webpageUrl, thumbnail, cleanList, subtitles);
    }
}
