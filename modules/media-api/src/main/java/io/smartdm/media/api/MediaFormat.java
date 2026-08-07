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
    public String getFormattedSize() {
        if (fileSize > 0) {
            if (fileSize < 1024) return fileSize + " B";
            int exp = (int) (Math.log(fileSize) / Math.log(1024));
            if (exp < 1) exp = 1;
            if (exp > 6) exp = 6;
            char pre = "KMGTPE".charAt(exp - 1);
            return String.format("%.1f %sB", fileSize / Math.pow(1024, exp), pre);
        }
        if (tbr > 0) {
            return String.format("~%.0f kbps", tbr);
        }
        return "Unknown size";
    }

    public String getDisplayName() {
        String safeExt = (ext != null && !ext.isBlank()) ? ext.toUpperCase() : "MP4";
        StringBuilder sb = new StringBuilder();
        if (isAudioOnly) {
            sb.append("Audio Only (").append(safeExt).append(")");
            if (tbr > 0) sb.append(String.format(" ~%.0fk", tbr));
        } else {
            if (resolution != null && !resolution.isBlank()) {
                sb.append(resolution);
            } else {
                sb.append(safeExt);
            }
            if (fps > 30) sb.append(" ").append(fps).append("fps");
            if (formatNote != null && !formatNote.isBlank()) {
                sb.append(" (").append(formatNote).append(")");
            }
        }
        if (fileSize > 0) {
            sb.append(" - ").append(getFormattedSize());
        }
        return sb.toString();
    }
}
