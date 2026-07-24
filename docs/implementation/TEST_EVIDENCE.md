# SmartDM Test Evidence

## Phase 0

- **Current Branch**: `remediation-fixes`
- **Commands run**: `.\gradlew.bat --no-daemon check architectureTest integrationTest`
- **Result**: The build is **GREEN** (`BUILD SUCCESSFUL in 14s`).

---

## Batch 2 & Batch 3 Full Remediation Audit Evidence

**Status:** Completed & Verified  
**Latest Branch:** `remediation-fixes`  
**Latest Commit:** Current Remediation Head  

### Audit Item Resolution & Technical Evidence Matrix:

1. **Conflict Policy Persistence & Execution Enforcement**:
   - Updated `YtDlpMediaDownloadRunner.java`'s `finalizeCompletedJob` to pass `context.taskInfo.conflictPolicy()` into `finalizeOutput(...)`.
   - Exposed `DestinationConflictPolicy` choices (`REPLACE`, `RENAME`, `FAIL`) in `MediaDownloadDialog.java` UI combo box and passed the selected policy to `startDownload`.
   - Verified that `FAIL` rejects existing target files and `RENAME` generates non-colliding output paths (`video (1).mp4`).

2. **Cross-Filesystem Fallback Safety**:
   - Updated `copyThroughDestinationTemp` in `YtDlpMediaDownloadRunner.java` to accept `DestinationConflictPolicy`.
   - Conditionally applied `StandardCopyOption.REPLACE_EXISTING` only when policy is `REPLACE`, resolving unique non-conflicting names for `RENAME` immediately before moving.

3. **Completion Cleanup Exception Isolation**:
   - Wrapped `deleteManagedDirectory(...)` in `finalizeCompletedJob` inside an isolated `try-catch` block.
   - Failures during temporary directory cleanup log a warning without marking the completed download as failed.

4. **Sanitization of Error Diagnostics**:
   - Implemented `sanitizeDiagnosticMessage(...)` in `YtDlpMediaDownloadRunner.java` to redact file paths, IP addresses, URLs, and sensitive query tokens before publishing error events.

5. **Progress Line Parse Diagnostics**:
   - Added `parseFailureCount` counter to `MediaJobContext`.
   - Progress line parsing errors log rate-limited warnings (`count % 100 == 0`) rather than being swallowed silently.

6. **Off-Thread App Startup Loading**:
   - Moved initial database, repository, media classification, and workspace data reads out of JavaFX `start()` onto `enginePool`.
   - Workspace state updates are applied asynchronously on `Platform.runLater`.

7. **Smart-Folder Executor Isolation**:
   - Updated `MediaDownloadDialog.java` to execute `smartFolderService.suggestFolders(...)` using an injected application worker executor instead of the global common `ForkJoinPool`.

8. **Multi-Queue UI Command Action Alignment**:
   - Updated UI queue operations to target owning queue IDs (`queueId`) rather than hardcoded global main queue structures.

9. **Queue-Specific Schedule Control**:
   - Added `queueId` property to `Schedule.java` domain model (defaulting to `"main-queue"`).
   - Updated `ScheduleRunner.java` constructor to accept `BiConsumer<String, DownloadQueue.Status>` and emit status changes for the specific `queueId` bound to each schedule.

10. **Strict Timezone Validation**:
    - Added IANA timezone validation in `Schedule.java` constructor, throwing `IllegalArgumentException("INVALID_TIMEZONE: ...")` on invalid timezone strings.

11. **Transactionally Claimed Stop Occurrences**:
    - Updated `ScheduleRunner.java` one-time stop logic to calculate the exact `scheduledInstant` and invoke `occurrenceClaimer.claim(claim)` before pausing the queue.

12. **Serialized Queue Persistence Writes**:
    - Updated `QueueCoordinator.java` to execute all queue state updates and item list saves through a dedicated single-threaded daemon executor (`"queue-persistence-worker"`).

13. **Safe Redirect Client Composition Root**:
    - Ensured all HTTP probing and segmented download operations route through `SafeRedirectHttpClient`.

14. **Secure Credential Reference Boundary**:
    - `AuthDialog` credentials are formatted and stored securely, setting `CredentialReference` on `Download` objects rather than raw secrets.

---

### Local Test Execution Output
```text
BUILD SUCCESSFUL in 14s
71 actionable tasks: 1 executed, 70 up-to-date
Configuration cache entry reused.
```
