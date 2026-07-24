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

## Batch 4 (Phases 8–10 Remediation - Native Messaging, yt-dlp Subsystem, and Media Site Adapters)
- **SDM-P8-01 & SDM-P8-03 (Hardened Native Protocol Envelope)**: Introduced `NativeMessageEnvelope` with protocol version, request ID, pairing token, and max message payload size limit (1MB).
- **SDM-P8-02 (Linux Sandbox Browser Detection)**: Implemented `BrowserEnvironmentDetector` identifying Snap/Flatpak sandboxes vs Native packages to present structured capability notices.
- **SDM-P9-01 (Media Tool Provenance & SHA-256 Integrity)**: Created `MediaToolManifest` for verifying executable identity and SHA-256 digest integrity for yt-dlp/FFmpeg tools.
- **SDM-P9-02 (Explicit Cookie Consent Boundary)**: Created `CookieConsentPolicy` to enforce explicit per-site consent before reading or attaching browser cookies, with automatic session material purging.
- **SDM-P10-01 & SDM-P10-02 (Media Site Adapter & YouTube Overlay Accessibility)**: Defined `MediaSiteAdapter` and `YouTubeMediaSiteAdapter` for URL canonicalization, zero pre-click network extraction, and accessibility label compliance.
