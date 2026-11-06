# Resume here â€” C# version

Updated 2026-11-03. Branch `sdm2.0`, HEAD `48ec34c`; this working tree contains
substantial uncommitted transfer, UI, browser and cleanup changes. HEAD alone does
not reproduce this working tree. No changes from these sessions have been pushed.

## First five minutes

1. Check branch/commit/status/worktrees. Stay on C# unless the task explicitly targets Java.
2. Read AGENTS, docs/BRANCHES, docs/CURRENT_ARCHITECTURE and the phase/limitations files.
3. Inspect dirty diffs before editing. Do not reset, stash or bulk-stage existing work.
4. Re-run the narrow test relevant to your task; previous evidence is dated, not a guarantee.
5. Work on one package/task; update this file and append evidence before handing off.

## Current work to preserve

- C# transfer integrity, checkpoint hashing, durable recovery, expected SHA-256 and
  destination conflict handling in engine/repository/workers and integrity tests.
- New compact UI, simple/advanced queue views, two monitor progress bars, live segment
  snapshot binding, completion/duplicate/collision windows and theme changes.
- Browser source-to-selected-video protection, overlay modularization and browser tests.
- Cleanup: real monitor history, portable snapshots and website fake-auth removal.
- Launchers, design prototypes and new tests/services are still partly untracked.

Use `git status --short` for the authoritative file list. Do not treat untracked
files as disposable scratch. Reports: REPOSITORY_CLEANUP.md and TEST_EVIDENCE.md.

## Next work

2026-11-03 reliability implementation: see
[Package 2 handoff](PACKAGE2_RELIABILITY_HANDOFF.md). The low-limit stall,
probed non-range transfer plan, ordinary validator propagation and collision
policy mapping have fixes with 27 new regression cases (81 total .NET tests).
Migration 4 persists nullable `supports_ranges` with transactional failure rollback.
Do not remove strong/weak ETag distinctions, allow 200 inside a range worker, or
reuse partial bytes for non-range transfers. No browser/media/security gate closed.
The following [lifecycle slice](PACKAGE2_LIFECYCLE_HANDOFF.md) now serializes those
commands, reserves a single owning runner, joins shutdown and arbitrates commit.
It adds 12 cases (93 total .NET tests). Next focus: bounded ordinary connect/header/
read-idle timeouts, failure classification and retries; then queue fault injection.
Keep ownership until actual shutdown even when a timeout is reported. Preserve
the current source tree and both branches; do not mix this with Package 3 work.

Package 2 is still active and its exit gate remains NO. Highest priority is real-app
verification of resume after validator changes and concurrent aggregate speed limits.
Then follow Packages 3, 4, 5 in PHASE_STATUS. UI work was explicitly requested early;
it does not close the broader safety/release gate. Do not infer completion from the
HEAD commit message, which describes more closure than the current limitations permit.

Manual user checks remain needed for UI ergonomics, live segment progress, Facebook
Reel identity and FFmpeg handling. Live Firebase/backend rules were not tested.
Do not add yt-dlp or Java delegation to make media failures disappear.

## Last verified baseline

Latest follow-up: `dotnet restore SmartDm.sln`,
`dotnet build SmartDm.sln --no-restore --verbosity quiet` (0 warnings/errors),
`dotnet test SmartDm.sln --no-build --verbosity quiet` (93 passed),
`node --test tests/browser/*.test.cjs` (8 passed). Legacy Gradle checks succeeded
with all 88 actionable tasks up-to-date; this is cached proof in the C# checkout.
Package 2 gate remains NO. Full details and remaining limits are in the handoff.

2026-11-03 cleanup: desktop build 0 warnings/errors; 54 .NET tests, 8 browser tests,
13 mocked website auth tests pass; website build passes with a large-bundle warning.
Gradle checks in this C# checkout used cached results. No Linux CI or release proof.

## Handoff template

Record branch and commit; dirty files present before work; package/audit IDs; paths
changed; schema migrations; exact verification/results; manual checks; privacy/security
evidence; remaining limitations; gate YES/NO; next allowed package. Never erase earlier
evidence or claim a future plan as current implementation.


## 2026-11-03 selected-social and filename follow-up

See [SOCIAL_MEDIA_FOLLOWUP.md](SOCIAL_MEDIA_FOLLOWUP.md) for partial user defect repairs: 97 .NET and 22 browser tests passed. Encoded filenames, selected-source isolation and bounded overlay positioning have regression checks. Gotaku/Reanime live failures, opaque X source binding, complete quality discovery and loaded-browser verification remain open. Package gate remains NO; running app has not been restarted into the new build.


## 2026-11-04 current handoff

Read [GOALS_3_4_HANDOFF.md](GOALS_3_4_HANDOFF.md) before continuing. It supersedes older test counts and records migrations 7/8, runtime changes, remaining gaps and verification. Package 4/5 gates are NO. The owner explicitly deferred setup-file/installer and release-package creation; do not build or publish those as the next step. Tests used isolated artifacts; the running app/extensions have not been automatically updated. Preserve the earlier media capture/audio changes and both branches.


## 2026-11-04 extension memory follow-up

Read [EXTENSION_MEMORY_HANDOFF.md](EXTENSION_MEMORY_HANDOFF.md). Browser fixtures now
pass 66 cases. Preserve shared styles with inline positioning overrides, detached
player cleanup/reattachment, pending lookup ownership, bounded readers, snapshot
retention and selected audio pairing. Reload the extension and refresh pages before
live testing; no Chrome RAM benchmark has been performed. Earlier runtime/package
limitations and the owner's installer/release deferral remain in effect.


## 2026-11-06 latest publication handoff

Read [BRANCH_SYNC_HANDOFF.md](BRANCH_SYNC_HANDOFF.md) first. It records all previously
uncommitted UI/runtime/browser work now selected for both C# branch names, the
AES-128 fixture correction and Firefox packaging repairs. Latest local evidence:
177 .NET tests (four real FFmpeg cases), 77 browser and 13 auth tests pass; builds
pass. Reanime partial transfer was user-confirmed; Animepahe HTTP/2 probes worked
but complete live verification and the other media failures remain open. No
installer/release was built. Follow the explicit Linux C# entry point in README.
