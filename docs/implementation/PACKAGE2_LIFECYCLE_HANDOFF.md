# Package 2 lifecycle handoff — 2026-11-03

## Branch and commit

`sdm2.0`, HEAD `48ec34c`, with extensive uncommitted work. No commit/push or branch
switch was performed. The preserved Java `main` worktree was not modified.

## Pre-existing dirty files

Desktop UI/engine/persistence, browser, website, Java adapters, docs, launchers,
prototypes and tests were already dirty/untracked. The previous reliability slice
was also uncommitted. Exact entry snapshot:
[LIFECYCLE_PRE_EXISTING_STATUS.txt](../audits/2026-11-03/LIFECYCLE_PRE_EXISTING_STATUS.txt).
The engine was copied before editing and the incremental diff reviewed against
that copy. No pre-existing changes were reset, stashed, staged or overwritten.

## Package and audit IDs addressed

**Package 2, R07** in the 2026-11-03 C#/browser review: session ownership, stop,
resume and finalization coordination. The scope is engine commands, not all file
management views or a new scheduler.

Implemented behavior:

- A per-download asynchronous command gate serializes Start/Pause/Resume/Cancel.
  Its semaphore entries are reference counted and removed after the last command,
  avoiding one retained semaphore for every historical download.
- Start reserves its owner before asynchronous setup. One background runner owns
  preparation, workers/media strategies and cleanup. Duplicate active starts and
  resumes are idempotent. Different IDs have independent command gates.
- Every new session clears mutable cached progress and revalidates durable journal
  evidence. Monitor/UI readers receive published list snapshots rather than
  enumerating workers while setup modifies the list.
- Pause/cancel await the actual runner, workers, monitor and scanner. The old
  800 ms timeout is removed. Resume cannot acquire that ID until stop finishes.
  Cancellation callback exceptions are handled without skipping the join.
- Only the owning runner removes its exact session instance. Nested media/fallback
  methods no longer remove sessions independently. Cancellation sources are
  disposed after the owned work finishes.
- Scanner cancellation is propagated. Under a short lock, stop and finalization
  arbitrate which wins. Stop before commit prevents clean output promotion; once
  commit begins, stop waits for its terminal outcome. Observed threat evidence
  still proceeds to quarantine and cannot be overwritten with Paused/Cancelled.
- Child-process starts check the stop flag under the same arbitration lock.
  Async process lifetime cleanup kills an unfinished child and awaits actual exit
  before returning from its scope. Existing executable pins and argument arrays
  remain in place. Direct FFmpeg error paths join the process before cleanup.
- Cancel removes cached progress and staging only after shutdown. Pause writes an
  ordinary segment journal only for sessions using that journal format. Completed
  and quarantined output states are preserved. Resume rejects a model with a
  different ID from the command.

## Files/modules changed

- `apps/desktop-avalonia/Services/DownloadEngine.cs`
- New `apps/desktop-avalonia/Services/DownloadCommandGate.cs`
- New `tests/SmartDm.Architecture.Tests/DownloadLifecycleTests.cs`
- CURRENT_ARCHITECTURE, RESUME_HERE, PHASE_STATUS, KNOWN_LIMITATIONS, TEST_EVIDENCE,
  historical reliability/audit follow-up notes, this handoff and status snapshot.

No extension, Java, website, settings, schema or UI layout changes in this slice.

## Schema migrations

None. Migration 4 from the previous slice remains unchanged.

## Exact test commands and results

Windows, from `E:/skill/projects/smartdm`:

| Command | Final result |
| --- | --- |
| `dotnet restore SmartDm.sln` | Success; projects up-to-date |
| `dotnet build SmartDm.sln --no-restore --verbosity quiet` | Success; 0 warnings/errors |
| `dotnet test SmartDm.sln --no-build --verbosity quiet` | 93 passed, 0 failed/skipped |
| `node --test tests/browser/*.test.cjs` | 8 passed, 0 failed |
| `.\gradlew.bat check architectureTest integrationTest --console=plain` | BUILD SUCCESSFUL in 1s; 88 tasks up-to-date, configuration cache reused |
| `git diff --check` | Passed after final documentation edits |

The 12 new lifecycle cases cover:

1. Twenty-four duplicate starts while initial persistence is blocked: one owner,
   one request, correct final bytes.
2. Slow read shutdown past the former 800 ms timeout: pause and queued resume stay
   pending, then complete with at most one open stream for that ID.
3. Cancel cannot delete an open writer's staging; subsequent resume starts fresh.
4. Twenty-four resumes of an active owner do not restart it.
5. Scanner deliberately ignores cancellation: stop waits and does not promote its
   late clean result; a later resume completes once with correct output.
6–7. Pause and cancel after commit begins wait and preserve Completed in history
   and on disk; subsequent start/resume does not redownload the completed model.
8. A late threat result during stop remains Quarantined.
9. A blocked stop for one ID does not prevent a different ID from completing.
10. Resume rejects an unrelated model ID.
11. Eight successive pause/cancel/resume sessions never overlap open streams.
12. A throwing cancellation callback does not cause stop to skip joining work.

Read/scanner tests wait 950 ms after an explicit cancellation-observed signal, so
they exercise the former timeout failure. Test gates are released in finally
blocks. Final data is compared with known payloads/expected hashes. Existing
loopback, child-process recovery, validator, integrity and architecture tests also
pass in the full suite.

## Manual verification

Code/diff review and automated mocked/loopback engine tests only. No GUI exercise,
live media, actual FFmpeg lifecycle/process-tree test, Linux runner, installer or
IDM throughput benchmark was performed. Gradle results are cached in this C#
checkout and do not establish fresh execution on the separate Java branch.

## Privacy/security evidence

New tests use dummy URLs and isolated temporary database/output paths, without
real credentials or remote requests. New setup/cancellation diagnostics omit raw
exceptions, URLs, validators and credentials. The finalization boundary prevents
late clean scans from promoting after stop, while preserving observed threat
evidence. TLS, range/hash validation, executable verification and process argument
arrays were not weakened. Existing browser/cookie/encryption findings remain.

## Remaining limitations

- A noncooperative worker/scanner/process can keep stop pending. The engine
  deliberately retains ownership instead of starting another writer after an
  arbitrary timeout. Bounded connect/header/read-idle/retry policy is next; do
  not implement it with a detached task that continues writing after timeout.
- Real FFmpeg/process-tree and Linux lifecycle behavior require further proof.
  These tests establish ordinary HTTP coordination; they do not close media
  recovery, HLS terminal failure, or broad site-compatibility findings.
- Move/rename/delete operations outside engine commands still need coordination
  review. This gate is per download ID, not a global destination-path lock.
- Queue scheduling, proxy/auth policy, zero-byte downloads, long-run rate/fairness,
  the full fault matrix and UI responsiveness verification remain open.
- Browser handoff/authentication, credential isolation/encryption, scanner-state
  honesty and updater trust still block release in their assigned packages.

## Exit gate fully satisfied

**NO** for Package 2. The tested lifecycle slice is implemented; full product
reliability, media/platform coverage and later security gates remain unfinished.

## Next allowed package

**Package 2:** bounded ordinary-transfer failure policy (R06): injectable timeout/
retry policy wired from settings, connect/header/read-idle budgets, transient vs
permanent error classification, bounded backoff, sibling cancellation and joined
shutdown, validator-aware retry, and deterministic local fault tests. Preserve
the new ownership/commit rules and the previous integrity tests. Then address
queue concurrency/scheduling and the remaining fault matrix before opening
Package 3. Both product branches and all unrelated dirty work must remain intact.
