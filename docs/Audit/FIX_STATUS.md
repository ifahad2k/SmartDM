# Fix Status Summary

## Batch 1
- Reverted invalid SHA for github actions to reviewed immutable commits.
- Restored correct Logback SHA-256 checksum.
- Updated PHASE_STATUS.md and KNOWN_LIMITATIONS.md with accurate statuses.
- Corrected BATCH_1_RESULTS.md to remove false claims.

## Batch 2
- Hardened SecretServiceMasterKeyStorage (removed plaintext fallback, used stdin, added timeouts).
- Added xvfb-run for Linux uiTests in ci.yml.
- Moved PrivacyVerificationTest to architectureTest suite.
- Mapped ModuleBoundaryTest to ArchUnit.
- Fixed AccessibilityTest compilation by adding hamcrest dependency to desktop-ui.
- Fixed SqlCipherDatabase encryption configuration to actually encrypt the DB, satisfying DatabaseLeakageTest.
- CI suite is now 100% green.

## Batch 3 (Release Blocker Remediation - 10 Issues Resolved on `remediation-fixes`)
- **SDM-RB-01 (Conflict Policy Enforcement)**: Passed `DestinationConflictPolicy` to `finalizeOutput` & `copyThroughDestinationTemp` in `YtDlpMediaDownloadRunner.java` honoring RENAME_NEW, FAIL, & OVERWRITE.
- **SDM-RB-02 (Isolated Cache Cleanup)**: Wrapped temp cache cleanup in separate try-catch so warnings to stderr never reverse a completed download.
- **SDM-RB-03 (Dynamic Queue Resolution)**: Added `findQueueIdForDownload(DownloadId)` to `QueueRepository` and dynamic target queue resolution in `SmartDmApp.java`.
- **SDM-RB-04 (Serialized Queue Persistence)**: Wired single-threaded daemon executor (`queueCommandExecutor`) in `QueueCoordinator` so queue updates and DB writes run in strict FIFO order.
- **SDM-RB-05 (Queue-Specific Scheduling)**: Updated `ScheduleRunner` & `SmartDmApp` to activate/pause `schedule.getQueueId()`.
- **SDM-RB-06 (Transactional Stop Occurrence Claims)**: Computed exact epoch-millisecond end times and claimed stop occurrences via `occurrenceClaimer.claim(...)` prior to pausing queues.
- **SDM-RB-07 (Explicit Timezone Validation)**: `Schedule.java` validates `timezoneId` via `ZoneId.of(...)` and rejects invalid IANA timezones.
- **SDM-RB-08 (Unsafe/Hidden Media Diagnostics)**: Rate-limited progress parse error warnings (`count % 100 == 1`) and added `sanitizeDiagnosticMessage(...)` to redact sensitive URLs, file paths, IP addresses, and truncate > 500 chars.
- **SDM-RB-09 (Async Startup DB Loading)**: Offloaded startup DB queries (`repository.findAll()`, `mediaJobStore.exists()`, `scheduleRepo.findAll()`) to `enginePool.submit(...)` and populated UI via `Platform.runLater(...)`.
- **SDM-RB-10 (Secure Credential Reference Boundary)**: Removed raw `AuthCredential credential` field from `Download.java` (retained only `CredentialReference credentialReference`); HTTP infrastructure resolves auth header dynamically via `secretResolver` from `KeyManager`.
