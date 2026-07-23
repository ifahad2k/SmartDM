# Test Evidence

## CI #142 (Commit 3e535a7) Failures
The CI build failed on both Ubuntu and Windows due to the following issues:

1. **Compilation Errors**:
   - `LinuxNativeProcessController.java` and `WindowsNativeProcessController.java`: `ProcessBuilder.directory` was passed a `Path` instead of a `File`.
   - `YtDlpMediaDownloadRunner.java`: Missing import/dependency for `DownloadState` and `DownloadEvent.StateChanged` because `domain` was not explicitly available to the `media-ytdlp` module.

2. **Flaky Tests**:
   - `SingleDownloadCoordinatorTest.testPauseStopsTransferAndLeavesPartFile` in `download-engine` failed intermittently due to relying on `Thread.sleep` instead of deterministic state observation.

3. **Architecture Violations & Dummy Classes**:
   - `GeminiDummy` and `SafetyDummy` were used improperly to satisfy ArchUnit tests.
   - `desktop-ui` architecture tests were not strict enough, allowing `Runtime.exec` and `ProcessBuilder`.

## Resolution
- **Compilation Fixed**: Updated `NativeProcessController` implementations to use `.toFile()` for directories. Added `domain` dependency to `media-ytdlp`.
- **Test Synchronization**: Refactored `SingleDownloadCoordinatorTest` to use `CountDownLatch` and listen for `DownloadState.PAUSED` and `DownloadState.DOWNLOADING` events instead of `Thread.sleep`. Handled HTTP client request timeout (10s) by increasing the latch await to 15s.
- **Architecture & Dummies Fixed**: Deleted `GeminiDummy` and `SafetyDummy`. Moved their respective architecture tests to the `ai-gemini` and `safety-api` modules under `src/architectureTest`. Updated `ModuleBoundaryTest` to strictly forbid `Runtime` and `ProcessBuilder` dependencies in `desktop-ui`.

All tests now pass locally on `gradlew check`.
