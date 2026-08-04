package io.smartdm.safety.av.windows;

import io.smartdm.safety.api.ScanResult;
import io.smartdm.safety.api.ScanStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutionException;

import static org.assertj.core.api.Assertions.assertThat;

class WindowsDefenderScannerTest {

    @Test
    void testIsAvailableWhenExecutableDoesNotExist() {
        Path missingPath = Path.of("C:", "NonExistentPath", "MpCmdRun.exe");
        WindowsDefenderScanner scanner = new WindowsDefenderScanner(missingPath);

        assertThat(scanner.isAvailable()).isFalse();
    }

    @Test
    void testIsAvailableWhenExecutableExists(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe);

        assertThat(scanner.isAvailable()).isTrue();
        assertThat(scanner.getScannerName()).isEqualTo("Windows Defender");
    }

    @Test
    void testScanUnavailableScannerReturnsFailed() throws Exception {
        Path missingPath = Path.of("C:", "NonExistentPath", "MpCmdRun.exe");
        WindowsDefenderScanner scanner = new WindowsDefenderScanner(missingPath);

        ScanResult result = scanner.scanFileAsync(Path.of("test.txt")).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("not available");
    }

    @Test
    void testScanNonExistentTargetFileReturnsFailed(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe);
        ScanResult result = scanner.scanFileAsync(tempDir.resolve("nonexistent.txt")).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("does not exist");
    }

    @Test
    void testScanCleanFileExitCode0(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("clean.txt");
        Files.writeString(testFile, "Hello World");

        WindowsDefenderScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new WindowsDefenderScanner.ProcessResult(0, "Scan finished with no threats.");

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.NO_THREATS_DETECTED);
        assertThat(result.threatName()).isNull();
        assertThat(result.details()).contains("no threats");
    }

    @Test
    void testScanMalwareFileExitCode2(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("eicar.com");
        Files.writeString(testFile, "EICAR-TEST-STRING");

        String mockOutput = """
            LISTING THREATS FOUND
            Threat          : Trojan:Win32/Eicar.N
            File            : eicar.com
            """;

        WindowsDefenderScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new WindowsDefenderScanner.ProcessResult(2, mockOutput);

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.MALWARE_DETECTED);
        assertThat(result.threatName()).isEqualTo("Trojan:Win32/Eicar.N");
    }

    @Test
    void testScanFailedExitCode1(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("file.txt");
        Files.writeString(testFile, "test");

        WindowsDefenderScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new WindowsDefenderScanner.ProcessResult(1, "CmdTool: Failed with error code 0x8050800c.");

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("exit code 1");
    }

    @Test
    void testScanRunnerExceptionReturnsFailed(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("MpCmdRun.exe");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("file.txt");
        Files.writeString(testFile, "test");

        WindowsDefenderScanner.ProcessRunner mockRunner = (cmd, timeout) -> {
            throw new RuntimeException("Process timed out");
        };

        WindowsDefenderScanner scanner = new WindowsDefenderScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("Process timed out");
    }

    @Test
    void testFindExecutablePath() {
        // Just verify that findExecutablePath does not throw exceptions
        Path path = WindowsDefenderScanner.findExecutablePath();
        if (path != null) {
            assertThat(Files.exists(path)).isTrue();
        }
    }
}
