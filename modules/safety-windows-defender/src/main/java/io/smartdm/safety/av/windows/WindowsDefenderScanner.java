package io.smartdm.safety.av.windows;

import io.smartdm.safety.api.FileScanner;
import io.smartdm.safety.api.ScanResult;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class WindowsDefenderScanner implements FileScanner {

    private static final String SCANNER_NAME = "Windows Defender";
    private static final Pattern THREAT_PATTERN = Pattern.compile("Threat\\s*:\\s*(.+)", Pattern.CASE_INSENSITIVE);

    @FunctionalInterface
    public interface ProcessRunner {
        ProcessResult run(List<String> command, long timeoutSeconds) throws Exception;
    }

    public record ProcessResult(int exitCode, String output) {}

    private final Path executablePath;
    private final ProcessRunner processRunner;
    private final long timeoutSeconds;

    public WindowsDefenderScanner() {
        this(findExecutablePath(), defaultProcessRunner(), 120);
    }

    public WindowsDefenderScanner(Path executablePath) {
        this(executablePath, defaultProcessRunner(), 120);
    }

    public WindowsDefenderScanner(Path executablePath, ProcessRunner processRunner, long timeoutSeconds) {
        this.executablePath = executablePath;
        this.processRunner = processRunner != null ? processRunner : defaultProcessRunner();
        this.timeoutSeconds = timeoutSeconds > 0 ? timeoutSeconds : 120;
    }

    public Path getExecutablePath() {
        return executablePath;
    }

    @Override
    public String getScannerName() {
        return SCANNER_NAME;
    }

    @Override
    public boolean isAvailable() {
        if (executablePath == null) {
            return false;
        }
        return Files.exists(executablePath);
    }

    @Override
    public CompletableFuture<ScanResult> scanFileAsync(Path file) {
        return CompletableFuture.supplyAsync(() -> {
            if (!isAvailable()) {
                return ScanResult.failed(SCANNER_NAME, "MpCmdRun.exe executable is not available.");
            }

            if (file == null || !Files.exists(file)) {
                return ScanResult.failed(SCANNER_NAME, "Target file does not exist: " + file);
            }

            List<String> command = List.of(
                executablePath.toAbsolutePath().toString(),
                "-Scan",
                "-ScanType", "3",
                "-File", file.toAbsolutePath().toString(),
                "-DisableRemediation"
            );

            try {
                ProcessResult result = processRunner.run(command, timeoutSeconds);
                return parseResult(result.exitCode(), result.output());
            } catch (Exception e) {
                return ScanResult.failed(SCANNER_NAME, "Execution error: " + e.getMessage());
            }
        });
    }

    private ScanResult parseResult(int exitCode, String output) {
        if (exitCode == 0) {
            return ScanResult.clean(SCANNER_NAME, output);
        } else if (exitCode == 2) {
            String threatName = parseThreatName(output);
            return ScanResult.threat(SCANNER_NAME, threatName, output);
        } else {
            return ScanResult.failed(SCANNER_NAME, "Scan returned exit code " + exitCode + ". Output: " + output);
        }
    }

    private String parseThreatName(String output) {
        if (output == null || output.isBlank()) {
            return "Unknown Threat";
        }
        String[] lines = output.split("\\r?\\n");
        for (String line : lines) {
            Matcher matcher = THREAT_PATTERN.matcher(line);
            if (matcher.find()) {
                return matcher.group(1).trim();
            }
        }
        for (String line : lines) {
            if (line.toLowerCase().contains("threat") && line.contains(":")) {
                String[] parts = line.split(":", 2);
                if (parts.length > 1 && !parts[1].isBlank()) {
                    return parts[1].trim();
                }
            }
        }
        return "Detected Threat";
    }

    public static Path findExecutablePath() {
        String programFiles = System.getenv("ProgramFiles");
        if (programFiles != null && !programFiles.isBlank()) {
            Path path = Path.of(programFiles, "Windows Defender", "MpCmdRun.exe");
            if (Files.exists(path)) {
                return path;
            }
        }

        String programFiles86 = System.getenv("ProgramFiles(x86)");
        if (programFiles86 != null && !programFiles86.isBlank()) {
            Path path = Path.of(programFiles86, "Windows Defender", "MpCmdRun.exe");
            if (Files.exists(path)) {
                return path;
            }
        }

        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String dir : pathEnv.split(File.pathSeparator)) {
                if (dir.isBlank()) continue;
                Path path = Path.of(dir, "MpCmdRun.exe");
                if (Files.exists(path)) {
                    return path;
                }
            }
        }

        return null;
    }

    private static ProcessRunner defaultProcessRunner() {
        return (command, timeoutSeconds) -> {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            StringBuilder outputBuilder = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    outputBuilder.append(line).append(System.lineSeparator());
                }
            }

            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new IllegalStateException("Process timed out after " + timeoutSeconds + " seconds.");
            }

            return new ProcessResult(process.exitValue(), outputBuilder.toString().trim());
        };
    }
}
