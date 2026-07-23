package io.smartdm.platform.api.process;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

public record NativeProcessRequest(
    Path executable,
    List<String> arguments,
    Optional<Path> workingDirectory,
    Duration timeout,
    OutputLimits outputLimits
) {
}
