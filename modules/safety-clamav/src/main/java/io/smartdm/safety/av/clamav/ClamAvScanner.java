package io.smartdm.safety.av.clamav;

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

public class ClamAvScanner implements FileScanner {

    private static final String SCANNER_NAME = "ClamAV";
    private static final Pattern INFECTED_PATTERN = Pattern.compile("([^:\\r\\n]+):\\s*(.+)\\s+FOUND", Pattern.CASE_INSENSITIVE);

    @FunctionalInterface
    public interface ProcessRunner {
        ProcessResult run(List<String> command, long timeoutSeconds) throws Exception;
    }

    public record ProcessResult(int exitCode, String output) {}

    private final Path executablePath;
    private final ProcessRunner processRunner;
    private final long timeoutSeconds;

    public ClamAvScanner() {
        this(findExecutablePath(), defaultProcessRunner(), 120);
    }

    public ClamAvScanner(Path executablePath) {
        this(executablePath, defaultProcessRunner(), 120);
    }

    public ClamAvScanner(Path executablePath, ProcessRunner processRunner, long timeoutSeconds) {
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
                return ScanResult.failed(SCANNER_NAME, "ClamAV executable (clamdscan/clamscan) is not available.");
            }

            if (file == null || !Files.exists(file)) {
                return ScanResult.failed(SCANNER_NAME, "Target file does not exist: " + file);
            }

            List<String> command = List.of(
                executablePath.toAbsolutePath().toString(),
                file.toAbsolutePath().toString()
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
        } else if (exitCode == 1) {
            String threatName = parseThreatName(output);
            return ScanResult.threat(SCANNER_NAME, threatName, output);
        } else {
            return ScanResult.failed(SCANNER_NAME, "Scan returned exit code " + exitCode + ". Output: " + output);
        }
    }

    private String parseThreatName(String output) {
        if (output == null || output.isBlank()) {
            return "Unknown ClamAV Threat";
        }
        String[] lines = output.split("\\r?\\n");
        for (String line : lines) {
            Matcher matcher = INFECTED_PATTERN.matcher(line);
            if (matcher.find()) {
                return matcher.group(2).trim();
            }
        }
        for (String line : lines) {
            if (line.contains("FOUND")) {
                int foundIndex = line.indexOf("FOUND");
                String prefix = line.substring(0, foundIndex).trim();
                int colonIndex = prefix.lastIndexOf(':');
                if (colonIndex >= 0 && colonIndex < prefix.length() - 1) {
                    return prefix.substring(colonIndex + 1).trim();
                }
                return prefix;
            }
        }
        return "ClamAV Malware Detected";
    }

    public static Path findExecutablePath() {
        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");
        List<String> exeNames = isWin
            ? List.of("clamdscan.exe", "clamscan.exe", "clamdscan", "clamscan")
            : List.of("clamdscan", "clamscan");

        String programFiles = System.getenv("ProgramFiles");
        if (programFiles != null && !programFiles.isBlank()) {
            for (String exe : exeNames) {
                Path p = Path.of(programFiles, "ClamAV", exe);
                if (Files.exists(p)) return p;
            }
        }

        String programFiles86 = System.getenv("ProgramFiles(x86)");
        if (programFiles86 != null && !programFiles86.isBlank()) {
            for (String exe : exeNames) {
                Path p = Path.of(programFiles86, "ClamAV", exe);
                if (Files.exists(p)) return p;
            }
        }

        if (!isWin) {
            List<String> unixDirs = List.of("/usr/bin", "/usr/local/bin", "/opt/local/bin");
            for (String dir : unixDirs) {
                for (String exe : exeNames) {
                    Path p = Path.of(dir, exe);
                    if (Files.exists(p)) return p;
                }
            }
        }

        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String dir : pathEnv.split(File.pathSeparator)) {
                if (dir.isBlank()) continue;
                for (String exe : exeNames) {
                    Path p = Path.of(dir, exe);
                    if (Files.exists(p)) return p;
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

            CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> {
                StringBuilder outputBuilder = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        outputBuilder.append(line).append(System.lineSeparator());
                    }
                } catch (Exception ignored) {
                }
                return outputBuilder.toString().trim();
            });

            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                outputFuture.cancel(true);
                throw new IllegalStateException("Process timed out after " + timeoutSeconds + " seconds.");
            }

            String output;
            try {
                output = outputFuture.get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                output = "";
            }

            return new ProcessResult(process.exitValue(), output);
        };
    }
}
