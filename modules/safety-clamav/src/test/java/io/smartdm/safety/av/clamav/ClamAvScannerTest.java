package io.smartdm.safety.av.clamav;

import io.smartdm.safety.api.ScanResult;
import io.smartdm.safety.api.ScanStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ClamAvScannerTest {

    @Test
    void testIsAvailableWhenExecutableDoesNotExist() {
        Path missingPath = Path.of("/usr/bin/nonexistent_clamscan");
        ClamAvScanner scanner = new ClamAvScanner(missingPath);

        assertThat(scanner.isAvailable()).isFalse();
    }

    @Test
    void testIsAvailableWhenExecutableExists(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        ClamAvScanner scanner = new ClamAvScanner(dummyExe);

        assertThat(scanner.isAvailable()).isTrue();
        assertThat(scanner.getScannerName()).isEqualTo("ClamAV");
    }

    @Test
    void testScanUnavailableScannerReturnsFailed() throws Exception {
        Path missingPath = Path.of("/usr/bin/nonexistent_clamscan");
        ClamAvScanner scanner = new ClamAvScanner(missingPath);

        ScanResult result = scanner.scanFileAsync(Path.of("test.txt")).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("not available");
    }

    @Test
    void testScanNonExistentTargetFileReturnsFailed(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        ClamAvScanner scanner = new ClamAvScanner(dummyExe);
        ScanResult result = scanner.scanFileAsync(tempDir.resolve("nonexistent.txt")).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("does not exist");
    }

    @Test
    void testScanCleanFileExitCode0(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("clean.txt");
        Files.writeString(testFile, "Hello World");

        ClamAvScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new ClamAvScanner.ProcessResult(0, "/path/to/clean.txt: OK");

        ClamAvScanner scanner = new ClamAvScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.NO_THREATS_DETECTED);
        assertThat(result.threatName()).isNull();
        assertThat(result.details()).contains("OK");
    }

    @Test
    void testScanInfectedFileExitCode1(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("eicar.com");
        Files.writeString(testFile, "EICAR-TEST-STRING");

        String mockOutput = "/path/to/eicar.com: Win.Test.EICAR-1 FOUND";

        ClamAvScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new ClamAvScanner.ProcessResult(1, mockOutput);

        ClamAvScanner scanner = new ClamAvScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.MALWARE_DETECTED);
        assertThat(result.threatName()).isEqualTo("Win.Test.EICAR-1");
    }

    @Test
    void testScanFailedExitCode2(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("file.txt");
        Files.writeString(testFile, "test");

        ClamAvScanner.ProcessRunner mockRunner = (cmd, timeout) ->
            new ClamAvScanner.ProcessResult(2, "ERROR: Can't open file or directory");

        ClamAvScanner scanner = new ClamAvScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("exit code 2");
    }

    @Test
    void testScanRunnerExceptionReturnsFailed(@TempDir Path tempDir) throws Exception {
        Path dummyExe = tempDir.resolve("clamscan");
        Files.createFile(dummyExe);

        Path testFile = tempDir.resolve("file.txt");
        Files.writeString(testFile, "test");

        ClamAvScanner.ProcessRunner mockRunner = (cmd, timeout) -> {
            throw new RuntimeException("Execution failed");
        };

        ClamAvScanner scanner = new ClamAvScanner(dummyExe, mockRunner, 10);
        ScanResult result = scanner.scanFileAsync(testFile).get();

        assertThat(result.status()).isEqualTo(ScanStatus.SCAN_FAILED);
        assertThat(result.details()).contains("Execution failed");
    }

    @Test
    void testFindExecutablePath() {
        Path path = ClamAvScanner.findExecutablePath();
        if (path != null) {
            assertThat(Files.exists(path)).isTrue();
        }
    }
}
