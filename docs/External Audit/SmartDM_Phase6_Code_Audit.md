# SmartDM Codebase Audit — Through Current Phase 6 Work

**Audit date:** 2026-07-19  
**Repository snapshot:** uploaded `sdm.zip`, Git HEAD `4890ecf`, including uncommitted Phase 6 changes

## Scope and method

I reviewed all **113 first-party implementation/configuration files** under `apps/`, `modules/`, and `build-logic/`: **69 Java, 32 Gradle Kotlin scripts, 5 SQL migrations, and 7 CSS files** (about **7,359 lines**). I also reviewed the CI workflow, Gradle wrapper/configuration, dependency metadata, implementation documents, Git state, and existing test reports. Generated build/cache files were inventoried and scanned for secrets/local metadata; I did not semantically decompile every generated `.class` or opaque Gradle cache entry.

## Overall verdict

**Do not mark Phase 6 complete or release this build yet.** The current tree has multiple data-integrity blockers, a Linux encrypted-profile failure, broken queue lifecycle behavior, and a clean-build/test mismatch. The most severe issues can corrupt, truncate, overwrite, or make downloads/profile data inaccessible.

## Critical blockers

### C-01 — Linux database key is not persisted

**Files:**
- `apps/desktop/src/main/java/io/smartdm/desktop/SmartDmApp.java:51-68`
- `modules/secure-storage/src/main/java/io/smartdm/securestorage/linux/SecretServiceMasterKeyStorage.java:13-27`

On non-Windows systems, the application uses `SecretServiceMasterKeyStorage`. Its `retrieveMasterKey()` always returns empty and `storeMasterKey()` is a no-op that does not throw. The app therefore generates a new random SQLCipher key on each launch and falsely assumes it was stored. The next launch cannot open the previous encrypted database.

The log says it is “falling back to master password,” but `Argon2MasterPasswordFallback` is not referenced by production code.

**Impact:** encrypted profile/download history becomes inaccessible after restart on Linux.

**Fix:** implement Secret Service storage or a real master-password flow with persisted salt. Treat storage failure as fatal or explicitly run in a documented ephemeral mode; never silently generate a replacement key for an existing DB.

---

### C-02 — No application profile lock; the lock implementation is unsafe if wired

**Files:**
- `apps/desktop/src/main/java/io/smartdm/desktop/SmartDmApp.java` — no `ProfileLock` usage
- `modules/application/src/main/java/io/smartdm/application/ProfileLock.java:27-56`

The app never acquires `ProfileLock`, so multiple SmartDM instances can use the same DB and `.part` files concurrently.

The lock class itself also has flaws: a failed `tryLock()` leaves the channel open, `OverlappingFileLockException` is not handled, and `close()` always deletes the lock pathname even when this instance did not acquire the lock. On Unix, deleting another process’s lock pathname can allow a third process to lock a new inode while the original process still holds the old lock.

**Impact:** concurrent database/temp-file access and possible download corruption.

**Fix:** acquire one lock before DB initialization; abort startup if unavailable. Track an `acquired` flag, close the channel on failure, catch overlapping-lock errors, and only release/delete a lock owned by this instance. Prefer keeping the lock file and releasing only the OS lock.

---

### C-03 — Duplicate execution writes concurrently to the same `.part` file

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SingleDownloadCoordinator.java:70-124`
- `apps/desktop/src/main/java/io/smartdm/desktop/SmartDmApp.java:183-192,255-265`

`execute()` creates the deterministic path `<download-id>.part` and then calls `sessions.put(...)`; it has no `putIfAbsent`/single-flight guard. Repeated UI actions, queue/direct-start overlap, or a second application instance can execute the same ID concurrently. The newer session replaces the old map entry while both channels/workers keep writing to the same file.

**Impact:** overlapping writes, corrupted output, double commit/cleanup, incorrect pause/cancel routing.

**Fix:** atomically reserve a download ID before creating/opening the part file. Reject or coalesce duplicate starts. Release the reservation only after terminal cleanup. Also enforce destination-level exclusivity.

---

### C-04 — Queue lifecycle can stall and can restart completed downloads

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/queue/QueueCoordinator.java:51-99`
- `apps/desktop/src/main/java/io/smartdm/desktop/SmartDmApp.java:125-141`

Production code never calls `queueCoordinator.markDownloadFinished()`. After the initial concurrency batch completes, there is no coordination trigger to start the next item, so the queue can stall.

Queue items are also not removed on completion. On a later trigger, the coordinator removes terminal IDs from its “active” set, sees their queue item again, and invokes `startDownload()`. The app unconditionally changes that download to `PROBING` before calling `execute()`, bypassing the coordinator’s terminal-state early return. A completed file can therefore be downloaded and replaced again.

Even `markDownloadFinished()` only clears the active set; it does not remove/complete the queue item, so calling it without updating the item list can immediately restart the same item.

**Impact:** Phase 6 queue stops after its first batch or repeatedly re-downloads completed files.

**Fix:** model queue-item lifecycle (`WAITING/RUNNING/COMPLETED/FAILED`), remove or terminally mark finished items, trigger coordination from completion/failure/cancel callbacks, and refuse to start terminal `Download` records unless the user explicitly requests retry.

---

### C-05 — Crash after atomic move can later overwrite a valid file with zero bytes

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SingleDownloadCoordinator.java:179-191`
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SegmentedFileChannel.java:19-25,37-43`
- `modules/desktop-ui/src/main/java/io/smartdm/desktop/shell/DownloadListCell.java:100-109,336-346`

The DB is saved as `VERIFYING`, then the part file is moved to the final destination, then the DB is saved as `COMPLETED`. A crash between the move and final DB save leaves a valid destination, no part file, and all persisted segments complete.

`VERIFYING` is rendered by the UI’s generic/queued branch, and its play button calls resume. A new empty `.part` file is created, all already-complete segments are skipped, byte-count verification passes from persisted segment counters, and `commit()` moves the empty part over the valid destination using `REPLACE_EXISTING`.

**Impact:** a successfully downloaded file can become a zero-byte file after crash + resume.

**Fix:** use a durable commit protocol. Before transfer, record a unique part path and generation. At recovery, if state is `VERIFYING`, inspect final/part file sizes and hashes; never create a new empty part and trust persisted counters. Commit state should be idempotent and transactionally reconcilable.

---

### C-06 — Truncated unknown-length downloads can be marked `COMPLETED`

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SingleDownloadCoordinator.java:110-112,143-177,262-273`
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SegmentWorker.java:58-83`

Unknown-length responses use an open-ended segment. Exceptions whose messages contain `closed`, `Connection reset`, or EOF are treated as acceptable. The final size check is skipped when expected size is unknown. A chunked response that disconnects mid-stream can therefore be committed and marked complete.

**Impact:** silent file truncation from ordinary network failure or a malicious server.

**Fix:** do not suppress transport exceptions based on message strings. For unknown-length HTTP bodies, only a clean body completion should count as success. Track whether the body handler reached normal EOF without an exception, and add integrity metadata/hash support when available.

---

### C-07 — Remote identity change does not truncate/delete the old partial file

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SingleDownloadCoordinator.java:85-114`
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SegmentedFileChannel.java:19-25`

When ETag/Last-Modified changes, segment metadata is reset, but the old `.part` file remains. The file channel is opened without `TRUNCATE_EXISTING`. If the replacement resource is shorter, new bytes overwrite the beginning while stale trailing bytes remain. Verification checks segment counters, not actual temp-file size, and the stale tail is committed.

**Impact:** silent corruption after a changed remote resource.

**Fix:** on identity mismatch, delete/recreate or explicitly truncate the part file before rebuilding segments. Verify the actual file length before commit.

---

### C-08 — Current source and tests are not clean-buildable

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/SingleDownloadCoordinator.java:54-67`
- `modules/download-engine/src/test/java/io/smartdm/download/engine/SingleDownloadCoordinatorTest.java:71-73,177-179`
- `modules/desktop-ui/src/main/java/io/smartdm/desktop/shell/MainShell.java:25-29,105-108`
- `modules/desktop-ui/src/main/java/io/smartdm/desktop/shell/QueueWorkspace.java:39-50`
- `modules/desktop-ui/src/main/java/io/smartdm/desktop/shell/SchedulerWorkspace.java:34-36`
- `modules/desktop-ui/src/uiTest/java/io/smartdm/desktop/shell/MainShellTest.java:21-24`

The coordinator now has only a six-argument constructor, while tests call a five-argument constructor. The compiled main class is newer than the compiled test class and existing XML results.

The UI test constructs `new MainShell()`. That constructor supplies null queue-item and schedule-manager dependencies, which are immediately dereferenced in `QueueWorkspace` and `SchedulerWorkspace`.

Existing reports show 35 passing tests, but they predate the current source changes and are stale evidence.

**Impact:** a clean `test/check` cannot represent the current tree; release evidence is invalid.

**Fix:** update tests/constructors, provide safe non-null defaults or remove the no-arg shell constructor, then require a clean checkout `./gradlew clean check` on Windows and Linux.

## High-severity findings

### H-01 — Cross-filesystem commit loses a fully downloaded part

**Files:**
- `SmartDmApp.java:118-121`
- `SegmentedFileChannel.java:37-52`
- `SingleDownloadCoordinator.java:193-209`

Parts are stored in the app cache, while the destination may be another drive/filesystem. `Files.move(..., ATOMIC_MOVE, REPLACE_EXISTING)` commonly cannot cross filesystems. The exception marks the download failed, and cleanup deletes the complete part.

**Fix:** place the part in the destination directory/filesystem, or fall back to verified copy + fsync + atomic rename within the destination filesystem. Preserve completed temp data on commit failure.

---

### H-02 — HTTP range responses are not validated or bounded

**Files:** `modules/download-engine/src/main/java/io/smartdm/download/engine/SegmentWorker.java:40-75`

A range worker accepts any status below 300, including `200 OK`, and does not validate `Content-Range`. It also does not stop after the requested segment length. A server that ignores or lies about ranges can cause overlapping writes, mixed content, or an oversized temp file.

**Fix:** for range requests require `206`, parse and validate `Content-Range`, verify start/end/total, cap bytes to the exact remaining segment length, and fail on extra/short data.

---

### H-03 — Resume requests are not bound to the probed validator

**Files:**
- `SingleDownloadCoordinator.java:83-96,126-140`
- `SegmentWorker.java:40-54`

The app probes ETag/Last-Modified but segment GETs send only `Range`, not `If-Range` or another strong conditional. The resource can change between HEAD/probe and segment GETs, or during a multi-segment transfer, producing a file assembled from different versions.

**Fix:** use a strong ETag with `If-Range` for every resumed/ranged request and verify consistent validators in each response. Restart safely when identity is uncertain.

---

### H-04 — Queue/scheduler limits are bypassed; paused downloads auto-resume

**File:** `SmartDmApp.java:183-192,225-234,255-265`

Resume and “Download now” submit directly to the coordinator, bypassing queue concurrency and schedule state. Startup adds both `QUEUED` and `PAUSED` downloads to the active queue, so user-paused downloads can resume after restart.

**Fix:** route all starts through one scheduler/queue admission path. Persist a distinct user-paused flag and never auto-start it.

---

### H-05 — Download progress is not durably persisted during transfer

**File:** `SingleDownloadCoordinator.java:131-153`

Progress callbacks only publish UI events. Segment offsets are persisted before workers and at later state transitions, not periodically during transfer. A process crash can lose substantial resume progress even though bytes exist in the part file.

**Fix:** checkpoint segment offsets at bounded byte/time intervals, flush the file before recording the checkpoint, and reconcile DB offsets with actual part length during startup.

---

### H-06 — Scheduler behavior is nondeterministic and non-durable

**Files:**
- `modules/download-engine/src/main/java/io/smartdm/download/engine/schedule/ScheduleRunner.java:28-98`
- `SmartDmApp.java:148-158,240-253`
- `V5__create_queue_and_schedule_tables.sql:19-35`

Schedules live only in memory despite DB tables. Multiple schedules each write one queue status, so the last ConcurrentHashMap iteration wins nondeterministically. One-time events fire every second for an entire matching minute. `schedule_execution` and `MissedTriggerPolicy` are unused. There is no persisted timezone, DST strategy, or idempotency. Cross-midnight day filtering is incorrect for the after-midnight portion.

**Fix:** persist schedules and executions, assign schedules to queues, define combination precedence, evaluate with an IANA zone, claim each trigger once transactionally, and test DST/cross-midnight/missed triggers.

---

### H-07 — Token bucket can block forever

**File:** `modules/download-engine/src/main/java/io/smartdm/download/engine/limit/TokenBucketRateLimiter.java:12-67`

The bucket capacity equals the per-second limit, while workers request up to 8,192 permits at once. A configured limit below 8,192 B/s can never satisfy an 8,192-byte request. At very low rates, refill rounding can repeatedly add zero tokens. Zero/negative limits are not rejected. Parent tokens are consumed before a child limiter succeeds, causing unfair over-throttling.

**Fix:** acquire in chunks no larger than capacity, retain fractional refill credit, validate positive limits, use condition/park scheduling rather than 10 ms polling, and make hierarchical acquisition atomic/fair.

---

### H-08 — Cancel/delete race can resurrect deleted downloads

**File:** `SmartDmApp.java:195-220`

Cancel returns before worker/coordinator teardown completes. The UI then deletes the DB row immediately. The still-running coordinator can later call `repository.save()` and recreate the record. Permanent file deletion runs asynchronously and suppresses all errors, so UI state may claim deletion when files remain.

**Fix:** make cancel return a completion future, wait for session termination/closed file handles, then delete within a coordinated operation. Report file deletion failures and remove the UI item only after success.

---

### H-09 — Executors are not shut down

**Files:**
- `SingleDownloadCoordinator.java:67`
- `ScheduleRunner.java:28-36`
- `ResourceMonitor.java:24-32`
- `SmartDmApp.java:283-293`

The coordinator’s cached pool and Phase 6 scheduled executors are non-daemon by default and are not stopped in `Application.stop()`. The process can remain alive after the window closes and tasks can continue operating.

**Fix:** make lifecycle ownership explicit, add `close()/shutdown()` to coordinator, retain monitor/runner fields, stop them in reverse order, await termination, and persist final checkpoints.

---

### H-10 — Resource monitor observes the wrong path and can throttle immediately

**Files:**
- `ResourceMonitor.java:13-57`
- `SmartDmApp.java:160-170`

Only the cache temp directory is registered, not actual destination filesystems. If the temp directory does not yet exist, `File.getUsableSpace()` may return zero, causing immediate throttling. A fixed 500 MB threshold ignores the remaining download size. Exceptions from the scheduled task/notifier are not contained.

**Fix:** register each active destination filesystem, ensure paths exist/use the nearest existing parent, compare free space against remaining bytes plus reserve, and isolate scheduled exceptions.

---

### H-11 — Persistence can retain stale segments; foreign-key cascades may be disabled

**Files:**
- `SqlCipherDownloadRepository.java:39-80`
- `SqlCipherDatabase.java:23-30`
- SQL migrations with `ON DELETE CASCADE`

`save()` deletes old segments only when the new segment list is non-empty; saving an intentionally empty list leaves old rows. SQLite foreign keys are not explicitly enabled, so migration cascades may not run depending on driver defaults.

**Fix:** always delete existing segments inside the transaction, then conditionally insert replacements. Enable and verify `PRAGMA foreign_keys=ON` on every connection.

---

### H-12 — “Secure” logging is not wired and sensitive values can bypass redaction

**Files:**
- `modules/application/src/main/java/io/smartdm/application/diagnostics/SecureLogAppender.java:19-26`
- `SingleDownloadCoordinator.java:193-195`
- multiple direct `System.out/err` calls

No Logback configuration wires `SecureLogAppender`. The coordinator prints raw exception messages and stack traces directly. URLs, destination paths, query tokens, and local usernames can therefore enter console logs unredacted.

**Fix:** install one structured logging pipeline, redact fields before formatting, avoid logging complete URLs/headers/paths, and prohibit direct stdout/stderr outside a small bootstrap boundary.

## Dependency/security posture

### S-01 — Logback 1.5.18 is behind multiple security fixes

**File:** `gradle/libs.versions.toml:7`

The project ships Logback 1.5.18. Official Logback release notes show later fixes for configuration ACE and deserialization-hardening issues, with 1.5.37 described as the definitive fix for CVE-2026-13006 and 1.5.38 released on 2026-07-09. Exploitability is conditional on an attacker influencing Logback configuration or affected appenders, but the dependency should still be upgraded.

**Fix:** upgrade `logback-classic/core` to at least 1.5.38 and retest configuration behavior.

### S-02 — Bouncy Castle 1.78.1 falls in affected CVE ranges

**File:** `gradle/libs.versions.toml:10,25`

NVD records list `bcprov` versions including 1.78.1 in affected ranges for CVE-2025-14813 and CVE-2026-5598, with fixed branches beginning at 1.80.2/1.81.1/1.84 depending on the line. Current production code only uses Argon2 and does not directly invoke the affected GOST/Frodo components, so practical reachability appears low, but vulnerable code is still shipped on the classpath.

**Fix:** upgrade to Bouncy Castle 1.84 or newer compatible release and run a full transitive dependency scan in CI.

### S-03 — CI/supply-chain hardening is incomplete

**Files:**
- `.github/workflows/ci.yml:17-35`
- `gradle/wrapper/gradle-wrapper.properties:1-7`
- `gradle/verification-metadata.xml:3-6`

GitHub Actions are referenced by mutable major-version tags rather than commit SHAs. The wrapper has no `distributionSha256Sum`. Dependency metadata hashes are enabled, but signatures are disabled. The Unix wrapper has CRLF line endings and is not executable in this archive, which breaks Linux execution before CI can validate the build.

**Fix:** normalize `gradlew` to LF and executable mode via `.gitattributes`, add the wrapper distribution checksum, pin Actions to reviewed commit SHAs, and keep dependency verification metadata current.

## Additional correctness/quality findings

1. `.gitignore` is UTF-16LE and contains only two Gradle-distribution entries. About **1,812 tracked files** are under `build/` or `.gradle/`; Gradle caches expose local metadata such as `C:\Users\ifaha\...`. Remove generated artifacts from Git and consider history cleanup if sensitive data was ever cached.
2. `StatusBar` opens a TCP connection to Cloudflare `1.1.1.1:53` every five seconds (`StatusBar.java:79-110`). This is unexpected outbound traffic and an unreliable definition of internet availability.
3. Mutable `Download`/`DownloadSegment` instances are shared across JavaFX, engine workers, and persistence without synchronization/volatile fields. Live state can race or be stale.
4. Domain validation is weak: `DownloadSegment` accepts invalid offsets/indexes; schedule day values are unchecked; direct limiter construction accepts non-positive limits.
5. The stronger `FilenameSanitizer` is unused by the add-download flow; the local sanitizer lacks length/reserved-name handling.
6. Test coverage does not exercise duplicate execution, crash-after-commit, unknown-length disconnect, changed-to-shorter resource, ignored/wrong ranges, cross-filesystem commits, second Linux launch, lock contention, low rate limits, terminal queue items, scheduler conflicts/DST, or graceful shutdown.

## What was not found

- No obvious hardcoded API key, password, private-key block, bearer token, or client secret was found in the current first-party text files or the nine-commit Git history using signature-based scans.
- SQL statements in the reviewed repository use prepared parameters for user-controlled IDs/values; I did not find a concrete SQL-injection path in the current implemented features.
- I did not find code that executes downloaded files automatically in the Phase 0–6 path.

## Build/test verification limits

The included XML reports contain **35 passing tests**, but they are stale relative to current source/class timestamps. I could not run a clean Gradle build in the sandbox because the supplied `gradlew` is non-executable and CRLF-encoded; a normalized copy then needed to download Gradle 8.14.1, while this environment has no external network access. The constructor mismatch and null UI dependencies are directly verifiable from current source/bytecode and are sufficient to establish that the current test evidence does not match the tree.

## Recommended repair order

### P0 — before any more Phase 6 feature work

1. Fix Linux key persistence and wire a correct profile lock.
2. Add per-download/destination single-flight execution.
3. Redesign part-file generation and crash-safe, idempotent commit recovery.
4. Fix unknown-length and ranged-response validation; add `If-Range`.
5. Correct queue terminal lifecycle and completion callbacks.
6. Restore a clean, reproducible `clean check` on Windows and Linux.

### P1 — before release candidate

1. Put part files on the destination filesystem or implement safe copy fallback.
2. Persist/resume checkpoints durably.
3. Replace the scheduler demo with persisted, idempotent, timezone-aware scheduling.
4. Repair the rate limiter and resource monitor.
5. Make cancel/delete/shutdown coordinated and observable.
6. Upgrade vulnerable dependencies and harden logging/CI/repository hygiene.

## Required regression tests

- Simultaneous `execute()` calls for the same ID and same destination
- Process termination immediately before and after final move/state save
- Unknown-length mid-stream disconnect/reset
- ETag/Last-Modified change to a shorter resource
- Server returns 200 to Range, wrong `Content-Range`, too many/few bytes
- Cache and destination on different filesystems/drives
- Two Linux launches against the same encrypted profile
- Two application instances contending for the profile lock
- Queue completion/failure/cancel with more items than concurrency
- Multiple conflicting schedules, cross-midnight windows, DST, missed triggers
- Rate limits below buffer size and below 10 B/s
- Cancel + immediate delete while workers are active
- Full startup/shutdown with thread-leak assertion
- Clean checkout `./gradlew clean check` on Ubuntu and Windows
