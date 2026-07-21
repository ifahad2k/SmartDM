package io.smartdm.media.api;

public record MediaFormat(
    String formatId,
    String ext,
    String resolution,
    String formatNote,
    long fileSize,
    String vcodec,
    String acodec,
    double tbr,
    int fps,
    boolean isAudioOnly,
    boolean isVideoOnly
) {
    public String getDisplayName() {
        StringBuilder sb = new StringBuilder();
        if (isAudioOnly) {
            sb.append("Audio Only (").append(ext.toUpperCase()).append(")");
            if (tbr > 0) sb.append(String.format(" ~%.0fk", tbr));
        } else {
            if (resolution != null && !resolution.isBlank()) {
                sb.append(resolution);
            } else {
                sb.append(ext.toUpperCase());
            }
            if (fps > 30) sb.append(" ").append(fps).append("fps");
            if (formatNote != null && !formatNote.isBlank()) {
                sb.append(" (").append(formatNote).append(")");
            }
        }
        if (fileSize > 0) {
            sb.append(" - ").append(formatSize(fileSize));
        }
        return sb.toString();
    }

    private static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        char pre = "KMGTPE".charAt(exp - 1);
        return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
    }
}
