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
    public CompletableFuture<MediaMetadata> extractMetadataAsync(String urlInput, String cookies) {
        return extractMetadataAsync(urlInput, cookies, null);
    }

    @Override
    public CompletableFuture<MediaMetadata> extractMetadataAsync(String urlInput, String cookies, String userAgent) {
        return CompletableFuture.supplyAsync(() -> {
            String url = urlInput;
            if (url != null && url.contains("instagram.com")) {
                url = url.replaceAll("instagram\\.com/reels/([A-Za-z0-9_-]+)", "instagram.com/reel/$1");
            }
            if (url != null && (url.contains("facebook.com") || url.contains("fb.watch"))) {
                url = url.replaceAll("facebook\\.com/reels/([0-9A-Za-z_-]+)", "facebook.com/reel/$1");
            }
            Path ytDlp = toolManager.getYtDlpPath().orElseThrow(() -> 
                new IllegalStateException("yt-dlp executable not found. Please install yt-dlp."));

            try {
                Path cookieFile = null;
                if (cookies != null && !cookies.isBlank()) {
                    String cleanCookies = cookies.replace("\\n", "\n").replace("\\t", "\t");
                    cookieFile = java.nio.file.Files.createTempFile("smartdm_cookies_", ".txt");
                    if (System.getProperty("os.name").toLowerCase().contains("linux") || System.getProperty("os.name").toLowerCase().contains("mac")) {
                        java.nio.file.Files.setPosixFilePermissions(cookieFile, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
                    }
                    java.nio.file.Files.writeString(cookieFile, cleanCookies, StandardCharsets.UTF_8);
                }

                try {
                    String ua = (userAgent != null && !userAgent.isBlank()) ? userAgent : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
                    List<String> cmd = new ArrayList<>(List.of(
                        ytDlp.toString(),
                        "--dump-json",
                        "--no-playlist",
                        "--no-warnings",
                        "--ignore-config",
                        "--no-check-certificates",
                        "--force-ipv4",
                        "--user-agent",
                        ua,
                        "--add-header",
                        "Accept-Language:en-US,en;q=0.9"
                    ));
                    
                    if (url != null && (url.contains("youtube.com") || url.contains("youtu.be"))) {
                        cmd.add("--extractor-args");
                        cmd.add("youtube:player_client=web,default");
                    } else if (url != null && url.contains("instagram.com")) {
                        cmd.add("--referer");
                        cmd.add("https://www.instagram.com/");
                    } else if (url != null && (url.contains("facebook.com") || url.contains("fb.watch"))) {
                        cmd.add("--referer");
                        cmd.add("https://www.facebook.com/");
                    }
                    
                    if (cookieFile != null) {
                        cmd.add("--cookies");
                        cmd.add(cookieFile.toAbsolutePath().toString());
                    }
                    cmd.add(url);

                    ProcessBuilder pb = new ProcessBuilder(cmd);
                    pb.redirectErrorStream(true);
                    Process process = pb.start();
                    String combinedOutput;
                    try (InputStream is = process.getInputStream()) {
                        combinedOutput = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                    }

                    int exitCode = process.waitFor();
                    if (exitCode != 0 || combinedOutput.isBlank() || (!combinedOutput.contains("{") && !combinedOutput.contains("}"))) {
                        System.err.println("yt-dlp standard dump failed: " + combinedOutput + ". Attempting fallback player_client...");
                        
                        List<String> fallbackCmd = new ArrayList<>(List.of(
                            ytDlp.toString(),
                            "--dump-json",
                            "--no-playlist",
                            "--no-warnings",
                            "--ignore-config",
                            "--no-check-certificates",
                            "--force-ipv4",
                            "--user-agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                            "--add-header",
                            "Accept-Language:en-US,en;q=0.9"
                        ));
                        
                        if (url != null && (url.contains("youtube.com") || url.contains("youtu.be"))) {
                            fallbackCmd.add("--extractor-args");
                            fallbackCmd.add("youtube:player_client=mweb,default");
                        } else if (url != null && url.contains("instagram.com")) {
                            fallbackCmd.add("--referer");
                            fallbackCmd.add("https://www.instagram.com/");
                        } else if (url != null && (url.contains("facebook.com") || url.contains("fb.watch"))) {
                            fallbackCmd.add("--referer");
                            fallbackCmd.add("https://www.facebook.com/");
                        }
                        if (cookieFile != null) {
                            fallbackCmd.add("--cookies");
                            fallbackCmd.add(cookieFile.toAbsolutePath().toString());
                        }
                        fallbackCmd.add(url);
                        
                        ProcessBuilder pbCookies = new ProcessBuilder(fallbackCmd);
                        pbCookies.redirectErrorStream(true);
                        Process processCookies = pbCookies.start();
                        try (InputStream is = processCookies.getInputStream()) {
                            combinedOutput = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                        }
                        processCookies.waitFor();
                    }

                    int start = combinedOutput.indexOf('{');
                    int end = combinedOutput.lastIndexOf('}');
                    if (start >= 0 && end > start) {
                        String jsonOutput = combinedOutput.substring(start, end + 1);
                        JsonNode root = mapper.readTree(jsonOutput);
                        return parseMetadata(root, url);
                    } else if (combinedOutput != null && combinedOutput.contains("HTTP Error 429")) {
                        throw new RuntimeException("HTTP Error 429: Too Many Requests");
                    }
                } finally {
                    if (cookieFile != null) {
                        try {
                            java.nio.file.Files.deleteIfExists(cookieFile);
                        } catch (Exception e) {
                            System.err.println("Failed to delete temp cookie file: " + e.getMessage());
                        }
                    }
                }
            } catch (Exception ex) {
                if (ex instanceof RuntimeException) throw (RuntimeException) ex;
                System.err.println("YtDlpExtractor error for URL [" + url + "]: " + ex.getMessage());
            }

            return null;
        });
    }

    private MediaMetadata parseMetadata(JsonNode root, String originalUrl) {
        String id = root.path("id").asText("");
        String title = root.path("title").asText("");
        if (title.isBlank() || title.equalsIgnoreCase("Video") || title.equalsIgnoreCase("Untitled Video") || title.equalsIgnoreCase("Facebook Video")) {
            if (root.has("description") && !root.path("description").asText().isBlank()) {
                String desc = root.path("description").asText();
                String[] lines = desc.split("\n");
                if (lines.length > 0 && !lines[0].isBlank()) {
                    title = lines[0].trim();
                }
            }
            if (title.isBlank() || title.equalsIgnoreCase("Video")) {
                if (root.has("_filename")) {
                    String fn = root.path("_filename").asText();
                    fn = fn.replaceAll("\\[[A-Za-z0-9_\\-]+\\]\\.[a-zA-Z0-9]+$", "").trim();
                    if (!fn.isBlank() && !fn.equalsIgnoreCase("Video.mp4")) title = fn;
                } else if (root.has("filename")) {
                    String fn = root.path("filename").asText();
                    fn = fn.replaceAll("\\[[A-Za-z0-9_\\-]+\\]\\.[a-zA-Z0-9]+$", "").trim();
                    if (!fn.isBlank() && !fn.equalsIgnoreCase("Video.mp4")) title = fn;
                }
            }
        }
        if (title.isBlank()) {
            title = "Untitled Video";
        }
        long duration = root.path("duration").asLong(0);
        String webpageUrl = root.path("webpage_url").asText(originalUrl);
        String thumbnail = root.path("thumbnail").asText("");

        List<MediaFormat> formatsList = new ArrayList<>();

        // If root object has a direct URL (common for Instagram, Twitter, Direct Videos)
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
                if (resolution.isBlank() && !formatId.isBlank()) {
                    if ("sd".equalsIgnoreCase(formatId)) resolution = "SD Quality (480p)";
                    else if ("hd".equalsIgnoreCase(formatId)) resolution = "HD Quality (720p/1080p)";
                    else resolution = formatId.toUpperCase();
                }
                if (resolution.isBlank()) resolution = "Standard Video Stream";

                String formatNote = f.path("format_note").asText("");
                long fileSize = f.path("filesize").asLong(f.path("filesize_approx").asLong(0));
                String vcodec = f.path("vcodec").asText("none");
                String acodec = f.path("acodec").asText("none");
                double tbr = f.path("tbr").asDouble(0);
                int fps = f.path("fps").asInt(0);
                String fmtUrl = f.path("url").asText("");

                if (formatNote.toLowerCase().contains("storyboard") || "mhtml".equalsIgnoreCase(ext)) {
                    continue;
                }
                
                // Allow formats with missing codec information if they have a direct URL
                if ("none".equalsIgnoreCase(vcodec) && "none".equalsIgnoreCase(acodec)) {
                    if (fmtUrl.isBlank() && !f.has("manifest_url")) {
                        continue;
                    }
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
            if (key == null || key.isBlank()) {
                key = (fmt.formatId() != null && !fmt.formatId().isBlank()) ? fmt.formatId() : "fmt_" + cleanList.size();
            }
            if (!seenResolutions.contains(key)) {
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
