package io.smartdm.platform.api.process;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// NOTE: Protected stdin must be implemented separately for future secret-bearing commands.
// Do not put secrets into the arguments or environment map.
public record NativeProcessRequest(
        Path executable,
        List<String> arguments,
        Optional<Path> workingDirectory,
        Map<String, String> environment,
        Duration timeout,
        OutputLimits outputLimits) {

    public NativeProcessRequest {
        if (executable == null) {
            throw new IllegalArgumentException("executable is required");
        }
        arguments = arguments == null ? List.of() : List.copyOf(arguments);
        workingDirectory = workingDirectory == null
                ? Optional.empty()
                : workingDirectory;
        environment = environment == null ? Map.of() : Map.copyOf(environment);

        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("timeout must be positive");
        }
        if (outputLimits == null) {
            throw new IllegalArgumentException("outputLimits is required");
        }
    }
}
