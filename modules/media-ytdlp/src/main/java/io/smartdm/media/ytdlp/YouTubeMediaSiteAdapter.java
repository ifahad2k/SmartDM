package io.smartdm.media.ytdlp;

import io.smartdm.media.api.MediaSiteAdapter;
import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class YouTubeMediaSiteAdapter implements MediaSiteAdapter {

    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("(?:v=|/shorts/|/embed/|youtu\\.be/)([a-zA-Z0-9_-]{11})");

    @Override
    public boolean canHandle(String url) {
        if (url == null || url.isBlank()) return false;
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.endsWith("youtube.com") || host.endsWith("youtu.be");
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public String canonicalize(String url) {
        if (!canHandle(url)) return url;
        Matcher matcher = VIDEO_ID_PATTERN.matcher(url);
        if (matcher.find()) {
            String videoId = matcher.group(1);
            return "https://www.youtube.com/watch?v=" + videoId;
        }
        return url;
    }

    @Override
    public String getSiteName() {
        return "YouTube";
    }

    @Override
    public String getAccessibilityLabel() {
        return "Download video with SmartDM";
    }
}
