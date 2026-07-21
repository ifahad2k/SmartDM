package io.smartdm.media.api;

import java.util.List;

public record MediaMetadata(
    String id,
    String title,
    long durationSeconds,
    String webpageUrl,
    String thumbnailUrl,
    List<MediaFormat> formats,
    List<String> subtitles
) {
    public String getFormattedDuration() {
        if (durationSeconds <= 0) return "Unknown duration";
        long hours = durationSeconds / 3600;
        long minutes = (durationSeconds % 3600) / 60;
        long seconds = durationSeconds % 60;
        if (hours > 0) {
            return String.format("%d:%02d:%02d", hours, minutes, seconds);
        } else {
            return String.format("%d:%02d", minutes, seconds);
        }
    }
}
