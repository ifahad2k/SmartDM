# Package 2 reliability implementation handoff — 2026-11-03

Historical slice record. The subsequent [lifecycle handoff](PACKAGE2_LIFECYCLE_HANDOFF.md)
supersedes the session-coordination limitations and next task below; it records
93 passing .NET tests. Other unimplemented audit findings remain open.

## Branch and commit

`sdm2.0`, HEAD `48ec34c`, with substantial pre-existing and current uncommitted
changes. No commit, push, branch switch, or Java-track modification was performed.
The separate `main` worktree remains preserved.

## Pre-existing dirty files

The checkout was already extensively dirty across desktop UI, engine, workers,
repository, browser extensions, Java media adapters, website, docs and tests, with
untracked prototypes, launchers and extension modules. The captured list is in
[the review snapshot](../audits/2026-11-03/PRE_EXISTING_STATUS.txt); the review folder
itself also existed before this implementation. Do not reset or bulk-stage the tree.
Production files touched below were copied to a temporary baseline before editing
and the incremental changes were compared against those copies.

## Package and audit IDs addressed

Package 2 only; findings refer to `CSHARP_BROWSER_REVIEW.md` dated 2026-11-03:

- **R03:** oversized speed-limiter charges now consume available tokens
  incrementally. Fractional refill credit is retained. Reapplying the same limit
  does not grant a fresh burst. Disabling a limit releases blocked readers within
  the existing bounded polling interval. The initial one-second burst remains.
- **R05:** actual one-byte GET checks advertised range capability. A 200 response
  to that request means sequential support, not segmentation support. Creation
  and persistence retain that result. An explicit non-range plan starts from zero,
  discards old range progress, truncates only its staged file, and validates exact
  expected length. Range workers still require a valid matching 206 response.
- **R09, ordinary files:** probe ETags preserve `W/`; ETag, Last-Modified and range
  capability flow through creation and restart. URL edits invalidate probe data;
  late results cannot restore an old resource's evidence. Only matching strong
  validators allow completed checkpoint reuse. When a fresh resume probe finds a
  different strong ETag at the same length, all old checkpoints replay under the
  new validator. An explicitly conflicting response ETag fails before writing.
  Media source-page/representation persistence is still open.
- **R16:** overwrite maps to Replace only after the existing confirmation dialog;
  other choices retain never-overwrite behavior. A path used by another transfer
  cannot be replaced through this callback. Cancellation creates no download.

Additional ordinary-worker guards reject unexpected non-identity encoding,
non-200 full-body responses, and short/oversized sequential bodies. No header
relaxation, TLS bypass, shell process invocation, or media strategy was added.

## Files/modules changed

Production:

- `apps/desktop-avalonia/Services/ISpeedLimiter.cs`
- `apps/desktop-avalonia/Services/HttpProbeService.cs`
- `apps/desktop-avalonia/Models/ProbeResult.cs`
- `apps/desktop-avalonia/Models/DownloadModel.cs`
- `apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs`
- `apps/desktop-avalonia/Services/DownloadEngine.cs`
- `apps/desktop-avalonia/Services/SegmentWorker.cs`
- `apps/desktop-avalonia/Services/SqliteDatabaseRepository.cs`

Tests: new `tests/SmartDm.Architecture.Tests/Package2RegressionTests.cs` (27 cases);
`TestFixtures.cs` now supports advertised/non-advertised ranges and ETags on HEAD.
Existing assertions were not weakened to accommodate these changes.

Docs: CURRENT_ARCHITECTURE, RESUME_HERE, PHASE_STATUS, TEST_EVIDENCE,
KNOWN_LIMITATIONS, this handoff, and a follow-up note on the original audit.
No extension, website, Java, or UI layout code changed in this implementation.

## Schema migrations

Immutable migration **4** adds nullable `downloads.supports_ranges` with a 0/1
constraint. Null means unknown capability for legacy records. Existing migration
SQL 1–3 was not rewritten. DDL and each migration's ledger insertion now run in
one transaction; failure rolls both back. Initialization rechecks its completed
flag after taking the repository semaphore.

Tested rollback: inject a failing version-4 ledger insertion, verify the new
column was rolled back, remove the injected failure, retry migration, and verify
existing history/validators remain. No personal database was opened for this test.

For an application downgrade, the added nullable column is normally harmless to
the older application and can remain. If an explicit schema downgrade is needed,
stop SmartDM, back up the database, and execute the following on an isolated copy
first using a transaction-capable SQLite client. Roll back on any error; do not
run concurrent application writers. This removes only capability metadata, not
download rows or files:

```sql
BEGIN IMMEDIATE;
ALTER TABLE downloads DROP COLUMN supports_ranges;
DELETE FROM schema_migrations WHERE version = 4;
COMMIT;
```

The current application will reapply migration 4 on the next initialization.

## Exact test commands and results

From `E:/skill/projects/smartdm` on Windows:

| Command | Final result |
| --- | --- |
| `dotnet restore SmartDm.sln` | Success; projects up-to-date |
| `dotnet build SmartDm.sln --no-restore --verbosity quiet` | Success; 0 warnings, 0 errors |
| `dotnet test SmartDm.sln --no-build --verbosity quiet` | 81 passed, 0 failed, 0 skipped |
| `node --test tests/browser/*.test.cjs` | 8 passed, 0 failed |
| `.\gradlew.bat check architectureTest integrationTest --console=plain` | BUILD SUCCESSFUL in 2s; 88 tasks up-to-date, configuration cache reused |
| `git diff --check` | Passed; Git emitted line-ending conversion notices |

27 new cases cover helper behavior and real engine boundaries, including local
probe → creation → SQLite restart → transfer, actual low-rate worker output,
strong/weak recovery, changed response validators, collision decisions through
final output, stale asynchronous probe results, exact sequential lengths with and
without Content-Length, and transactional migration failure/retry.

Two development failures were investigated rather than hidden: cleanup raced an
already-removed staging directory, and stronger validator checks exposed the old
ETag passed to fresh replay workers. Both were corrected before the final suite.

## Manual verification

Code/diff review and automated loopback/mocked HTTP checks only. No GUI smoke
check, live Facebook/YouTube download, Linux run, installer run, or IDM benchmark.
The Gradle result is cached regression evidence in the C# checkout; it is not a
fresh execution of the separate Java branch's tests.

## Privacy/security evidence

New tests use dummy URLs and isolated temporary database/output paths. No real
cookies, keys or browser sessions are used. New rejection messages omit URLs,
ETag values and credentials. Downloads still stage before destination promotion;
only the explicit confirmed overwrite policy permits replacement. Strong/weak
validator distinctions and strict range bounds remain enforced. SQLite remains
unencrypted; this slice does not resolve the previously reported credential or
loopback authorization issues. No external binaries/dependencies were installed.

## Remaining limitations

- Start/pause/resume/cancel still need serialized ownership and complete old-runner
  shutdown. The existing 800 ms handoff and ID-based cleanup risks remain.
- Ordinary connect/read-idle timeouts, bounded retries, scheduler/global/per-host
  policy, and the complete fault-injection matrix remain open.
- Long-duration aggregate bandwidth tolerance, network buffering and fairness
  are not established by short token-bucket tests. FFmpeg-direct traffic remains
  outside the HTTP limiter.
- Legacy/unprobed known-size records retain strict range attempts until reprobed;
  unknown is not silently changed into false or true persisted evidence.
- Zero-byte downloads and servers changing range support after a probe are not
  newly supported here; such mismatches fail rather than weakening validation.
- A response that omits an ETag still relies on HTTP If-Range semantics. This is
  not protection against an arbitrary malicious server lying about its bytes;
  an independently supplied expected SHA-256 remains the strongest output check.
- Browser ownership/authentication, cookie isolation/encryption, HLS terminal
  failure/media recovery, format honesty, move/rename safety, updater trust, and
  scanner evidence findings remain as recorded in the review.

## Exit gate fully satisfied

**NO.** This completes the agreed bounded reliability slice, not Package 2 or the
full audit. It does not establish a bug-free or release-ready product.

## Next allowed package

**Package 2.** First implement per-download command serialization, instance-owned
cleanup and complete shutdown before replacement. Test simultaneous start,
repeated pause/resume/cancel, delayed workers/scanners, and cancellation at
finalization. Then implement bounded network failure policy and queue fault tests.
Do not begin Package 3 as if Package 2's gate were closed. Security/safety/update
findings continue to block release while prerequisite transfer work proceeds.
