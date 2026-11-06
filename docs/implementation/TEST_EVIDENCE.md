# SmartDM Test Evidence

This file records verified build and test evidence across implementation packages.

## 2026-11-03 â€” Package 2 lifecycle slice

- Baseline after ownership refactor: `dotnet test SmartDm.sln --verbosity quiet` â€” 81 passed, before adding lifecycle cases.
- Focused lifecycle checks: `dotnet test tests/SmartDm.Architecture.Tests/SmartDm.Architecture.Tests.csproj --filter FullyQualifiedName~DownloadLifecycleTests --verbosity quiet` â€” 11 passed before the cancellation-callback case was added.
- `dotnet restore SmartDm.sln` â€” success, projects up-to-date.
- `dotnet build SmartDm.sln --no-restore --verbosity quiet` â€” success, 0 warnings/errors.
- `dotnet test SmartDm.sln --no-build --verbosity quiet` â€” **93 passed, 0 failed/skipped** (81 previous + 12 lifecycle cases).
- `node --test tests/browser/*.test.cjs` â€” 8 passed, 0 failed.
- `.\gradlew.bat check architectureTest integrationTest --console=plain` â€” BUILD SUCCESSFUL in 1s; all 88 actionable tasks up-to-date, cached evidence only.

Lifecycle cases block real engine dependencies with test gates rather than assuming
fast shutdown. Reads/scanners remain blocked for 950 ms after cancellation (beyond
the removed 800 ms timeout). Tests cover single reservation during blocked setup,
pause/resume serialization, cancellation before staging deletion, idempotent active
resume, eight successive sessions without overlapping open streams, scanner result
arbitration, stop after commit, threat evidence retention, independent IDs, ID/model
mismatch rejection, and a throwing cancellation callback. All use isolated outputs,
dummy URLs and mocked HTTP; no real credentials, remote sites or FFmpeg are used.
Manual GUI, Linux, live media/process-tree and installer checks were not performed.
Package 2 gate remains NO. See [handoff](PACKAGE2_LIFECYCLE_HANDOFF.md).

## 2026-11-03 â€” Package 2 ordinary-download reliability slice

- `dotnet restore SmartDm.sln` â€” success, projects up-to-date.
- `dotnet build SmartDm.sln --no-restore --verbosity quiet` â€” success, 0 warnings/errors.
- `dotnet test SmartDm.sln --no-build --verbosity quiet` â€” 81 passed, 0 failed/skipped (54 existing + 27 new cases).
- `node --test tests/browser/*.test.cjs` â€” 8 passed, 0 failed. No extension code changed in this slice.
- `.\gradlew.bat check architectureTest integrationTest --console=plain` â€” BUILD SUCCESSFUL in 2s; all 88 actionable tasks up-to-date. Cached regression evidence in this checkout only.
- `git diff --check` â€” passed (line-ending conversion notices only).

New cases use isolated test output/database paths, local loopback fixtures or mocked
HTTP. They verify oversized limiter charges, aggregate charging/cancellation,
actual low-limit engine output, range advertisement verification, non-range
probe/creation/database restart/engine output, strong versus weak checkpoint reuse,
stale asynchronous probe rejection, collision actions through the engine, in-use
destination replacement rejection, response length with/without Content-Length,
validator/encoding rejection, and transactional migration failure/retry.

During development the new cleanup helper raced the engine's removal of staging;
a reproduced DirectoryNotFoundException was fixed by accepting only the expected
already-removed state. The full suite also caught stale expected ETags after a
changed-resource resume probe; fresh workers now adopt the new strong validator
only after invalidating the old checkpoints. Final tests above include these fixes.

Manual verification: no GUI/live-site/Linux/installer checks in this slice. No
personal database migration was invoked. Package 2 gate remains **NO**. See
[handoff](PACKAGE2_RELIABILITY_HANDOFF.md) for exact scope, migration and limits.

---

## Package 0 Verification Run (2026-10-29)

Branch: `sdm2.0` at `ecbafc7`  
Scope: Package 0 â€” Record real architecture, CI foundation, and stop TLS bypass.

### 1. .NET 9 Solution Restore & Build
Commands executed:
```powershell
Set-Location 'E:\skill\projects\smartdm'
dotnet restore SmartDm.sln
dotnet build SmartDm.sln --no-restore
```
Result:
- Restore: 5 projects restored successfully.
- Build: `SmartDm.Desktop.Avalonia`, `SmartDm.Domain`, `SmartDm.Application`, `SmartDm.Architecture.Tests`, `Repro` built successfully.
- Warnings: 0
- Errors: 0
- Build time: 1.08s

### 2. .NET Automated Test Execution
Command executed:
```powershell
dotnet test SmartDm.sln --logger "console;verbosity=detailed"
```
Result:
- Passed: 11
- Failed: 0
- Skipped: 0
- Duration: 0.95s
- Suites executed:
  * SmartDm.Domain Isolation:
    1. `Domain_MustNotReferenceForbiddenAssemblies` -> PASSED
    2. `Domain_TypesMustNotReferenceForbiddenNamespaces` -> PASSED
    3. `ArchitectureEnforcement_MustFailWhenForbiddenDependencyExists` (Negative test) -> PASSED
  * Production Avalonia Project Isolation:
    4. `ProductionAvalonia_ViewModels_MustNotDependOnRawSqlite` -> PASSED
    5. `ProductionAvalonia_Views_MustNotDependOnRawSqlite` -> PASSED
    6. `ProductionAvalonia_Services_MustNotDependOnUIControls` -> PASSED
    7. `ProductionAvalonia_Models_MustNotDependOnUIControls` -> PASSED
    8. `ProductionAvalonia_ArchitectureEnforcement_MustFailWhenViewModelDirectlyReferencesSqlite` (Negative test) -> PASSED
  * TLS Validation & Fail-Closed Enforcement:
    9. `HlsMediaResolver_DefaultHandler_HasNoWildcardBypass` -> PASSED
    10. `HlsMediaResolver_MustFailClosed_OnUntrustedCertificate` (TLS Fail-Closed validation) -> PASSED
    11. `HlsMediaResolver_Succeeds_WhenCertificateIsExplicitlyTrusted` -> PASSED

### 3. Java Legacy Architecture Verification
Command executed:
```powershell
.\gradlew.bat :modules:domain:architectureTest
```
Result:
- `ModuleBoundaryTest > domainModuleShouldNotDependOnInfrastructureOrExternalFrameworks()` -> PASSED
- `ModuleBoundaryTest > architectureEnforcementMustFailWhenForbiddenDependencyExists()` (Negative test) -> PASSED
- Total: 2 passed, 0 failed (16s duration).

### 4. Java Bounded Local Fixture & Offline Verification (M-07)
Command executed:
```powershell
.\gradlew.bat :modules:download-engine:test --tests "io.smartdm.download.engine.BenchmarkRunnerTest" --tests "io.smartdm.download.engine.ipc.EngineDaemonIpcTest"
```
Result:
- Replaced live 512MB external URL (`thinkbroadband.com`) and hardcoded user paths (`C:\Users\ifaha\...`) with `LocalTestHttpServer` (loopback 127.0.0.1 range-supporting HTTP server) and JUnit 5 `@TempDir`.
- `BenchmarkRunnerTest > runBenchmarkDownload(Path)` -> PASSED (8 MB synthetic payload transferred in 0.40s with 6 dynamic parallel segments, CSV/JSON written to `@TempDir`).
- `EngineDaemonIpcTest > testPingPongFraming()` -> PASSED
- `EngineDaemonIpcTest > testDownloadViaIpc(Path)` -> PASSED (loopback daemon transfer and progress telemetry verified completely offline).
- Total: 3 passed, 0 failed (20s duration).

### 5. CI Workflow & Platform Execution Status
- **Local Host Execution (Windows 11 x64):**
  - .NET 9: All 11 architecture and security tests PASSED.
  - Java 21 / Gradle: Architecture tests and engine tests PASSED.
- **Remote GitHub Actions CI (Windows & Linux matrix):**
  - Updated `.github/workflows/ci.yml` contains both Gradle and .NET 9 (`windows-latest`, `ubuntu-latest`) test matrices.
  - **Status:** PENDING / NOT RUN. Per plan, remote CI execution across Windows and Linux runners is a mandatory gate before declaring overall remediation complete or releasing SmartDM.

---

## Package 1 Verification Run (2026-10-29)

Scope: Package 1 â€” Make C# engine the only transfer engine (Phase 4/5 parity, remove Java daemon).

### 1. Engine Parity Analysis
- Complete feature parity matrix recorded in `docs/implementation/ENGINE_PARITY.md`.
- Analyzed 14 core transfer engine workflows between Java `SingleDownloadCoordinator` and C# `DownloadEngine` & `SegmentWorker`. All 14 verified at parity.

### 2. Production Composition & Decoupling
- `MainViewModel` constructor defaulted to `new DownloadEngine(_repository, _safetyScanner)`.
- `IpcDownloadEngine` and `EngineDaemonLauncher` marked `[Obsolete]` and removed from all production and diagnostic startup paths.
- `Program.cs` diagnostics and end-to-end tests updated to invoke `DownloadEngine` directly without Java daemon launcher.

### 3. Automated Engine Parity & Decoupling Test Suite
Command executed:
```powershell
dotnet test SmartDm.sln --logger "console;verbosity=detailed"
```
Result:
- Total Passed: 15 (0 failed, 0 skipped, duration: ~3.8s)
- New Package 1 Tests:
  1. `EngineParityTests.MainViewModel_DefaultEngine_IsPureDownloadEngine_WithoutJavaDaemonAdapter` -> PASSED
  2. `EngineParityTests.ProductionStartup_DoesNotReferenceSmartDmIpcClientOrEngineDaemonLauncher` -> PASSED
  3. `EngineParityTests.DownloadEngine_DownloadsOrdinaryHttpContent_WithoutJavaDaemon` -> PASSED (64 KB transferred, verified exact byte match)
  4. `EngineParityTests.DownloadEngine_OperatesIdentically_WhenDaemonPortOccupiedOrAbsent` -> PASSED (proves 0 connections to daemon port, identical transfer)

### 4. Standalone Executable Verification (No Java/Gradle Runtime Prerequisite)
Command executed:
```powershell
dotnet publish apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -c Release --no-self-contained -o publish_test
.\publish_test\SmartDm.Desktop.Avalonia.exe --test-backend
```
Result:
- Build: 0 warnings, 0 errors.
- Execution: `[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]` including C# DownloadEngine initialization. Runs completely without Java or Gradle installed.




---

## Package 2 Verification Record (2026-10-29)

### 1. Scope & Audit Findings Tracked (C-04 and M-02 remain partial)
- **C-04**: Crash recovery deletes all partial download data at startup
- **H-01**: Malformed range responses silently corrupt output
- **H-02**: Truncated unknown-length response is marked Completed
- **H-07**: Expected SHA-256 field is nonfunctional
- **H-08**: Filename-only match is labeled "Identical File"
- **H-09**: Signed media URLs collapse to false active duplicates
- **M-01**: Direct URL filename inference ignores a usable path extension
- **M-02**: Speed limiter is a dead setting
- **M-03**: Add to Queue button has no command

### 2. Automated Deterministic Test Suite (`TransferIntegrityTests.cs`)
Command executed:
```powershell
dotnet test SmartDm.sln --logger "console;verbosity=detailed"
```
Result:
- Total Passed: **40** (0 failed, 0 skipped, duration: ~1.0 s)
- Package 2 Test Evidence Breakdown:
  1. `TransferIntegrityTests.CleanupOrphanStagingDirectories_PreservesActiveAndPausedDownloads`: Verified active/paused staging files retained, unjournaled orphan folder purged (C-04).
  2. `TransferIntegrityTests.SegmentWorker_RejectsMalformedContentRangeBounds`: Verified server returning wrong Content-Range bounds is rejected with `HttpRequestException` (H-01).
  3. `TransferIntegrityTests.SegmentWorker_Rejects200OkOnSubrangeRequest`: Verified server returning 200 OK on bounded range is rejected with `HttpRequestException` (H-01).
  4. `TransferIntegrityTests.SegmentWorker_RejectsPrematurelyTruncatedStream`: Verified stream terminating before expected bounds throws exception and leaves worker uncompleted (H-01, H-02).
  5. `TransferIntegrityTests.DownloadEngine_UnknownLengthStream_FailsWhenConnectionAborts`: Verified truncated chunked stream transitions to `DownloadStatus.Failed` (H-02).
  6. `TransferIntegrityTests.VerifyHashConstantTime_ValidatesCorrectly`: Verified constant-time SHA-256 string comparisons across casings and mismatches (H-07).
  7. `TransferIntegrityTests.DownloadEngine_ExpectedSha256_FailsOnMismatchAndPurgesOutput`: Verified expected hash mismatch transitions to `Failed`, updates subline, and deletes unverified destination file (H-07).
  8. `TransferIntegrityTests.DownloadEngine_ExpectedSha256_SucceedsOnMatch`: Verified expected hash match marks `Completed` with "SHA-256 Verified" and preserves file (H-07).
  9. `TransferIntegrityTests.SqliteDatabaseRepository_ExpectedSha256_SurvivesRestartAndMigration`: Verified versioned migration 2 adds `expected_sha256` and survives process/database restart without data loss (H-07).
  10. `TransferIntegrityTests.DownloadEngine_ExpectedSha256_Mismatch_NeverOverwritesOrDeletesPreExistingDestination`: Verified staging-first integrity scan never overwrites or deletes pre-existing user files on hash mismatch (H-07, H-06).
  11. `TransferIntegrityTests.DownloadEngine_DestinationConflict_DefaultNeverOverwrites_HonorsExplicitActions`: Verified destination conflict handling against pre-existing user files across all actions: DefaultNeverOverwrite creates unique path without touching original file; Replace overwrites; Rename generates unique filename; Skip purges staging and preserves original file (H-07).
  12. `TransferIntegrityTests.DownloadEngine_ForcedTermination_ResumesFromDurableJournalWithoutByteLoss`: Verified journal survives restart and transfer completes with correct bytes. Recovery currently re-downloads every recorded range; this test does not prove reuse of completed chunks (C-04 partial).
  13. `TransferIntegrityTests.DownloadEngine_JournalValidation_EnforcesPhysicalLength_SourceIdentity_AndValidators`: Verified local identity mismatch and overlapping ranges reject the journal. Preallocated and truncated staging files both reset all recovered byte counts to zero; local ETag comparison is not a fresh remote validator check (C-04 partial).
  14. `TransferIntegrityTests.DownloadEngine_ChildProcessTermination_ResumesFromDatabaseAndJournal`: Spawns real child application process (`SmartDm.Desktop.Avalonia.dll --child-transfer-worker`), paces transfer, terminates child mid-transfer with `proc.Kill(entireProcessTree: true)`, recovers with persisted SQLite database and staging journal, and completes transfer with 100% byte integrity and verified SHA-256 match (C-04).
  15. `TransferIntegrityTests.DownloadEngine_FfmpegSpeedLimit_HonestlyLabeled`: Verified status details honestly disclose speed limit scope for direct FFmpeg stream muxing and fails closed when `FFMPEG_PATH` is not configured (M-02).
  16. `TransferIntegrityTests.FileCatalogService_FilenameOnlyMatch_IsCandidateNotIdentical`: Verified filename match is labeled "Candidate Duplicate (Content Unverified)" and strictly reserves "Identical File" for SHA-256 confirmation (H-08).
  17. `TransferIntegrityTests.MainViewModel_FindActiveDownloadByUrl_PreventsCdnVideoplaybackCollisions`: Verified Googlevideo `videoplayback` URLs with different `id=` query params do NOT collide as active duplicates (H-09).
  18. `TransferIntegrityTests.HttpProbeService_InfersFilenameFromUrlPathAndMimeType`: Verified `/reports/quarterly_financials.pdf` infers `quarterly_financials.pdf` and category `Documents` without hardcoded `.mp4` (M-01).
  19. `TransferIntegrityTests.HttpProbeService_GetExtensionFromMimeType_MapsCorrectly`: Verified MIME type extension mapping table (M-01).
  20. `TransferIntegrityTests.AggregateSpeedLimiter_ThrottlesBandwidth`: Verified `AggregateSpeedLimiter` throttles token bucket consumption cooperatively across workers (M-02).
  21. `TransferIntegrityTests.AddDownloadViewModel_AddToQueueCommand_CreatesQueuedDownloadWithoutStarting`: Verified "Add to Queue" command binds to ViewModel, sets `Status = DownloadStatus.Queued`, and adds to repository without starting engine (M-03).

### 2026-10-29 follow-up integrity correction
- Baseline command: `dotnet test SmartDm.sln --no-build --verbosity quiet` â€” 40 passed, 0 failed, 0 skipped.
- Changed code: journal replay resets unverified range progress on disk recovery and on pause/resume; `SegmentWorker` treats `EndByte == 0` as a valid bounded range.
- Privacy check: journal rejection diagnostics now omit download IDs, source URLs, and HTTP validator values. The journal file still stores a source URL in plaintext; encrypted persistence is tracked for Package 3.
- Verification command: `dotnet test SmartDm.sln --verbosity quiet` â€” 47 passed, 0 failed, 0 skipped. The new one-byte range, changed resource length, checkpoint tamper, `If-Range`, real `DownloadEngine` matching/changed strong ETag checkpoint, and saved speed limit wiring tests, plus revised preallocation recovery assertions, passed.
- Build command: `dotnet build SmartDm.sln --no-restore --verbosity quiet` â€” succeeded, 0 warnings, 0 errors.
- Legacy regression command: `.\gradlew.bat check architectureTest integrationTest --console=plain` â€” `BUILD SUCCESSFUL in 24s`; 97 actionable tasks, 1 executed, 96 up-to-date. JavaFX emitted a non-fatal module configuration warning.
- Manual verification: none in this follow-up. Package 2 exit gate: NO.

### 2026-10-29 Facebook download and Reel badge follow-up

- Baseline: `dotnet test SmartDm.sln --no-build --verbosity quiet` â€” 47 passed, 0 failed, 0 skipped.
- Final desktop check: `dotnet test SmartDm.sln --verbosity quiet` â€” 48 passed, 0 failed, 0 skipped. New checksum test rejects missing, mismatched, and modified FFmpeg executables.
- Browser check: `node --test tests/browser/*.test.cjs` â€” 4 passed, 0 failed (Chrome and Firefox badge clickability and handoff feedback). `node --check` of the six changed extension JavaScript files â€” all exited 0. `git diff --check` â€” no whitespace errors (Git reported only CRLF conversion warnings).
- Local tool check: the existing WinGet `Gyan.FFmpeg.Essentials` 8.1.1 executable reported its version; a synthetic video/audio mux with the production argument shape completed and produced a 21,055-byte MP4. User environment now pins that executable with `FFMPEG_PATH` and `FFMPEG_SHA256`; no binary was downloaded during this repair.
- Manual browser check: Facebook home feed opened in Chrome. Reloaded the existing SmartDM Integration extension, refreshed Facebook, and clicked a Reel badge; its popover appeared beside the card without navigating away from the feed. The popover still showed `Loading video options...` during observation, so media format resolution and a complete live Facebook download remain unverified. Desktop application was relaunched and its process was responding after test/build.
- Privacy/security: FFmpeg path is absolute and executable basename checked, contents must match the pinned SHA-256 before process launch; process arguments remain an array. Extension error text is generic and does not print media URLs, cookies, or IPC exceptions. No schema migration was added.
- Package 2 exit gate: **NO**. Next permitted package remains **Package 2**.

### 2026-10-29 three Facebook UI/identity defects

- Baseline before edits: `node --test tests/browser/*.test.cjs` â€” 4 passed, 0 failed; `dotnet test SmartDm.sln --no-build --verbosity quiet` â€” 48 passed, 0 failed, 0 skipped.
- Browser regression after edits: `node --test tests/browser/*.test.cjs` â€” 6 passed, 0 failed (Chrome and Firefox). The new identity test rejects a detected stream from Reel 111 when Reel 222 is selected, and accepts an exact Reel 222 match. Badge test checks clipping and that its menu does not fetch formats from the feed.
- Syntax checks: `node --check` on Chrome/Firefox `background.js`, `modules/format_engine.js`, and `modules/watcher.js` â€” all exited 0.
- Manual verification: deferred to the user as requested. No live Facebook download is claimed. No schema migration or desktop production change in this follow-up.
- Privacy/security: background media lookup no longer borrows another tab's detected media; Facebook page-wide HTML extraction is disabled for the live format path. Unmatched media is rejected instead of given the current video's caption.
- Package 2 exit gate: **NO**. Next permitted package remains **Package 2**.

### 3. Desktop Application Self-Test Verification
Commands executed:
```powershell
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -- --test-backend
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -- --test-staging
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -- --test-pause-stop
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -- --test-duplicates
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -- --test-ipc-download
```
Results:
- `--test-backend`: `[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]`
- `--test-staging`: `[PASS] Orphan staging directory cleanup verified!`
- `--test-pause-stop`: `[PASS] Staging file successfully preserved after PauseDownloadAsync.`
- `--test-duplicates`: `[PASS] Active download matched by direct URL; collision safely auto-numbered.`
- `--test-ipc-download`: `[PASS] Multi-stream live telemetry received; pause and cancel verified.`

---

## Historical Diagnostic Audit Baseline (2026-10-26)

Full details preserved in `docs/audits/2026-10-26/SMARTDM_FULL_BUG_AUDIT.md`.


## Branch documentation verification â€” 2026-11-03

Documentation-only session: preserved both product versions, added branch ownership,
implemented architecture, resume guide and ADR-010. Local links in the four new entry
pages pass existence checks; `git diff --check` passes for session-edited docs.
No production code, schema, media engine or application behavior changed.

C# code was not changed in this documentation session. The prior cleanup baseline
(54 .NET, 13 website auth, 8 browser tests) was not rerun for markdown-only changes.
Verification on the separate Java branch is recorded in that checkout's evidence;
it does not change the C# package status.


## 2026-11-03 selected-social and filename follow-up

See [SOCIAL_MEDIA_FOLLOWUP.md](SOCIAL_MEDIA_FOLLOWUP.md) for partial user defect repairs: 97 .NET and 22 browser tests passed. Encoded filenames, selected-source isolation and bounded overlay positioning have regression checks. Gotaku/Reanime live failures, opaque X source binding, complete quality discovery and loaded-browser verification remain open. Package gate remains NO; running app has not been restarted into the new build.


## 2026-11-04 Goals 3/4 runtime evidence

[Full handoff and exact commands](GOALS_3_4_HANDOFF.md): 156 .NET tests passed with SMARTDM_MEDIA_TESTS=1 (including two real FFmpeg/loopback media cases), 40 browser fixtures passed, isolated build zero warnings/errors, git diff --check passed. No Linux, remote CI, loaded-browser or installer verification claimed. Installer/release creation explicitly deferred.


## 2026-11-04 extension memory lifecycle evidence

`node --test tests/browser/*.test.cjs`: **66 passed, 0 failed/skipped**, exit 0.
Eight changed-source `node --check` checks pass; four Chrome/Firefox source pairs
match byte-for-byte. `git diff --check` passes with existing line-ending warnings.
The [handoff](EXTENSION_MEMORY_HANDOFF.md) records stress scenarios, actual bounds
and manual procedure. No browser RAM benchmark or new .NET/Linux/installer proof.


## 2026-11-06 development snapshot validation

See [exact commands/results](BRANCH_SYNC_HANDOFF.md): restore/build pass with zero
.NET warnings/errors; SMARTDM_MEDIA_TESTS=1 yields 177 passing .NET tests with no
skips, including four real FFmpeg fixtures; 77 browser and 13 auth tests pass.
Website build passes with its existing bundle warning. Gradle checks pass with
88 tasks up-to-date. No new Linux/live-site completion proof is claimed.

## 2026-11-06 publication CI setup repair

Both remote C# branches were verified at `fb945a7` after atomic publication.
GitHub run 42263706241 failed before checkout because the existing upload-artifact
and wrapper-validation hashes were unavailable. Replacements were checked against
official Git tag refs and action files; `git diff --check` passed. No application
code changed in this follow-up. This setup failure provides no Linux/Windows test
result; inspect the subsequent run separately.

Run 42264399155 (`e9d03e4`): Ubuntu restore/build passed, .NET 173 passed/one skipped,
77 browser fixtures passed. Windows build passed with zero warnings/errors; its
tests were cancelled by matrix fail-fast. Ubuntu's legacy Gradle cold build failed
strict dependency verification on the `kotlinx-coroutines-bom:1.6.4` POM. No trust
check is bypassed. Matrix fail-fast is disabled for independent platform evidence.

Run 42264918250: Ubuntu C# tests/browser fixtures passed; Windows found a fixture
staging-delete race after terminal notification. The fixture now awaits engine
session shutdown before cleanup. Focused rebuilt Package2RegressionTests: 27
passed, zero failed/skipped; exact command is in BRANCH_SYNC_HANDOFF.md. Production
code is unchanged; legacy Gradle dependency verification still fails independently.

## 2026-11-06 shared streamed-player binding

`node --test tests/browser/*.test.cjs`: **95 passed, zero failed/skipped**. Both
sniffer `node --check` commands and `git diff --check` pass; sniffer SHA-256 hashes
match. The new streamed-copy regression failed in both browsers before the repair.
Two real Chrome TikTok downloads completed: original screenshot clip H.264/AAC,
720×1280, 218.8 s, 17,248,469 bytes; clean-code feed clip HEVC/AAC, 720×1280,
83.3 s, 8,012,300 bytes. Both full FFmpeg decodes exited 0; extracted frames matched
their selected videos. See [exact evidence/limits](STREAM_BINDING_HANDOFF.md).
