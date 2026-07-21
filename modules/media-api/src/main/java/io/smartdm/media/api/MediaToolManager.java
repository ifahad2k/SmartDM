package io.smartdm.media.api;

import java.nio.file.Path;
import java.util.Optional;

public interface MediaToolManager {
    Optional<Path> getYtDlpPath();
    Optional<Path> getFfmpegPath();
    Optional<Path> getFfprobePath();
    boolean isAvailable();
}
