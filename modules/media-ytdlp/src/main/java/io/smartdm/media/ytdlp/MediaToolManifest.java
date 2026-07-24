package io.smartdm.media.ytdlp;

public record MediaToolManifest(
        String tool,
        String version,
        String sha256,
        String platform,
        String source,
        String license
) {
    public boolean isValidExecutable(java.nio.file.Path executablePath) {
        if (executablePath == null || !java.nio.file.Files.exists(executablePath) || !java.nio.file.Files.isExecutable(executablePath)) {
            return false;
        }
        if (sha256 != null && !sha256.isBlank()) {
            try (java.io.InputStream is = java.nio.file.Files.newInputStream(executablePath)) {
                java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[8192];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
                StringBuilder sb = new StringBuilder();
                for (byte b : digest.digest()) {
                    sb.append(String.format("%02x", b));
                }
                return sb.toString().equalsIgnoreCase(sha256);
            } catch (Exception e) {
                return false;
            }
        }
        return true;
    }
}
