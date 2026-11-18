# Resume here â€” C# version

Updated 2026-11-06. The current C# source snapshot was committed and pushed to both
`sdm2.0` and `sdm-v2` at `fb945a7`; subsequent CI-only repairs are recorded below.
Read [BRANCH_SYNC_HANDOFF.md](BRANCH_SYNC_HANDOFF.md) first for current evidence.
Older dated entries below describe earlier sessions, not the present Git state.

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

The source push to both branches succeeded at `fb945a7`. The first CI run failed
before checkout because two existing action hashes were invalid; the follow-up
uses verified immutable references. Check the latest remote run for execution
results. No package exit gate is closed by source synchronization.

CI run 42264399155 passed Ubuntu C# build/tests (173 passed, one skipped) and 77
browser fixtures. Windows built successfully but was cancelled during testing
after legacy Gradle checksum verification failed on Ubuntu. Matrix fail-fast is
disabled in the follow-up. Investigate the missing coroutines BOM POM checksum
using verified upstream bytes; never disable dependency verification to pass CI.

The independent Windows run found a test cleanup race: terminal notification did
not imply staging cleanup had finished. The Package2RegressionTests helper now
joins the runner before deleting staging; 27 focused cases pass after rebuild.
This fixture correction changes no transfer-engine behavior.

## 2026-11-06 streamed capture follow-up — read first for TikTok

See [STREAM_BINDING_HANDOFF.md](STREAM_BINDING_HANDOFF.md). The first streamed-read
fix alone failed live; final shared provenance/sample matching and session identity
handling passed 95 browser fixtures and completed the original TikTok clip plus a
fresh feed clip, with correct frames and fully decodable audio/video. Temporary
capture counters are removed. Reload the extension and refresh pages after edits;
restarting C# alone cannot update content scripts. Preserve byte-range subview and
overwrite isolation, bounded sample retention, MP4 initialization invalidation and
separate audio handling. No package-wide or universal-site completeness is claimed.

## 2026-11-08 tester evidence collection

The owner now uses the standalone [Testing desk](../../tools/testing-desk/README.md).
Read [TESTING_DESK_HANDOFF.md](TESTING_DESK_HANDOFF.md) for source location, schemas,
verification and limits. Reports carry multiple bugs per site plus screenshots and
passed checks. Inspect ZIP image files and recorded build context before fixing
shared mechanisms. Sandbox QA data must not be confused with actual site verdicts.

2026-11-08: [Thumbnail style repair](THUMBNAIL_STYLE_HANDOFF.md) fixes the unstyled
thumbnail button in both extensions; 203 browser tests pass. Reload the extension
and refresh affected pages for activation. No screen capture was used this turn.

2026-11-08: [YouTube menu prefetch](YOUTUBE_MENU_PREFETCH_HANDOFF.md) moves full-list
resolution ahead of clicks for visible cards/players. Preserve ID isolation,
single-flight requests, expiry, queue/cache bounds and observer cleanup. Ready
menus must not display a pending indicator. Source tests cover the mounted menu
and audio handoff; live YouTube timing remains unverified. Reload the extension
and refresh YouTube; a cold lookup can still wait for the network. No installer,
branch publication or product-wide package closure was performed.

Same-day regression correction: the above initial fixture-only report is
superseded by [live regression evidence](YOUTUBE_MENU_REGRESSION_HANDOFF.md).
Keep the 30-second discovery deadline above the background's 15-second desktop
attempt, preserve selected-player fallback when full resolution fails, and do
not blame an unavailable app without evidence. Three real Chrome menu checks
passed; the matching Casetoo video's 1080p60/audio URLs returned 206 to bounded
range requests. Loaded YouTube content scripts still require reload/refresh.

2026-11-08: [Linked-thumbnail repair](LINKED_THUMBNAIL_HANDOFF.md) adds explicit
thumbnail intent and selected-page-first discovery. 245 browser tests pass; live
menu verification remains pending after the computer-use URL restriction.
Do not work around that restriction or claim a completed live download.


## 2026-11-10 HLS progress repair — current task

Read [HLS_PROGRESS_HANDOFF.md](HLS_PROGRESS_HANDOFF.md) for the local, uncommitted
repair on baseline `8f1465c`. Preserve separate received/saved accounting, bounded
retry state, response disposal and finite-playlist EOF handling. Default tests:
406 passed, two opt-in theories skipped; enabled real FFmpeg cases: eight passed.
Normal output was rebuilt and SmartDM restarted with owner approval; current
episode remains paused and 310 chunk/checkpoint pairs are preserved. Next check:
fresh live chunk growth and completed audio/video decoding, with source access
recaptured if needed. No installer/publication or full package closure.


## 2026-11-16 current continuation

Start with [REPORT_REPAIR_HANDOFF.md](REPORT_REPAIR_HANDOFF.md). Work only on v2
C# / Avalonia and extensions. Preserve the HLS dirty work and report fixes.
X is owner-confirmed working; TikTok 403 and file-examples remain open. Other
report rows need fresh live confirmation. Latest fixtures: 306 browser passes;
.NET 420 passes / three opt-in skips; ten enabled native FFmpeg cases passed
separately. Normal solution rebuilt. The final relative-XHR entry-point repair
has not been live-verified; loaded extensions require reload/page refresh.

Graphify 0.9.111 and Ponytail are installed globally as Codex skills. Local
`graphify-out/` is ignored. Query it for structure, then check cited source.
Refresh with `graphify extract . --code-only --max-workers 2`; `.graphifyignore`
excludes Java, website, docs and user evidence. Do not upload sources or claim
that a graph proves correctness. No installer, push or package closure.


## 2026-11-17 security remediation handoff

Current HEAD is `6c91563` after a concurrent browser commit; preserve all dirty
C# security changes and pre-existing media tests. No security-session commit or
push occurred. Java is untouched. Read the latest TEST_EVIDENCE.md entry first.

Eight reported paths have code repairs and Windows verification: 464 C# tests,
333 browser tests, zero build warnings/errors. The owner authorized this bounded
Package 2-4 security slice; it does not close those package gates.

Next: validate Linux Secret Service/current-user native IPC and shell registration,
then rebuild/start the C# app, register its updated native host, reload extensions
and refresh tabs. The real app/profile was not replaced or migrated. Keep full
SQLCipher, durable browser acknowledgement and remaining Package 2 gates open.


## 2026-11-17 structural refactor — latest source navigation

Read [STRUCTURAL_REFACTOR_HANDOFF.md](STRUCTURAL_REFACTOR_HANDOFF.md). Engine recovery,
policy and playlist reading have dedicated components; view-model construction is
explicit in DesktopComposition. Edit background logic in `extensions/shared/background`
and rebuild/check both generated bundles. Preserve all earlier dirty security/media work.
Graphify's production overview is `graphify-out/architecture/architecture.html`;
its detailed query graph remains graph.json. Final checks: 468 C#, 335 browser,
two tool tests; zero build warnings/errors. No real app restart or publication.
Package 2 and prior Linux/live-site/security/release limitations remain open.

## 2026-11-17 staging repair — latest handoff

Read [STAGING_DISK_USAGE_HANDOFF.md](STAGING_DISK_USAGE_HANDOFF.md). Keep preview
rows out of transfers/persistence and permit only history removal for old samples.
New staging is profile-local, without eager size allocation; preserve in-place
legacy recovery and strict range validation. Windows checks: 478 C# / 335 browser
pass. The normal Debug app was rebuilt/restarted after verifying no active/queued
transfers. Existing partials were not bulk deleted or compacted. Linux physical
allocation and live sparse-unsupported hardware remain unverified. Next: Package 2;
broader package/security/release gates remain open.

2026-11-17 UI follow-up: player and thumbnail download controls can be dragged or
moved with focused Alt + arrows. Reload the extension and refresh pages to load it.
347 browser cases pass; isolated Chrome trusted-input smoke passes. Read
[DRAGGABLE_OVERLAY_HANDOFF.md](DRAGGABLE_OVERLAY_HANDOFF.md) for scope and limits.

2026-11-17 duplicate-button follow-up: nested players elect the inner control and
keep an iframe fallback when no child is available. Both watcher modules updated;
357 browser tests and synthetic cross-origin Chrome checks pass. Reload extension
and refresh pages. Read [PLAYER_OWNERSHIP_HANDOFF.md](PLAYER_OWNERSHIP_HANDOFF.md).

2026-11-17 latest UI: approved Direct menu plus 336px native toolbar popup.
Do not restore the discarded separate options page. Theme and independent opacity
sliders save locally and update mounted controls. Defaults: Graphite, compact,
12px menu corners, menu 100%/button 0%. 376 browser tests and synthetic Chrome
popup/menu checks pass. Reload the extension/refresh websites. Read
[OVERLAY_APPEARANCE_HANDOFF.md](OVERLAY_APPEARANCE_HANDOFF.md).


## 2026-11-17 visible media size and progressive metadata

Read [MEDIA_SIZE_AND_PARALLELISM_HANDOFF.md](MEDIA_SIZE_AND_PARALLELISM_HANDOFF.md). Menu sizes are visible; unknown progressive captures obtain metadata before partitioning. Preserve body cancellation, bounds and identity checks. 483 C# / 391 browser tests pass; Debug app rebuilt/restarted after zero-active check. Reload extension/refresh sites. Sustained CDN/IDM speed parity remains unverified; live concurrent probes timed out. Package 2 remains open.

## 2026-11-18 HLS stream reliability

The HLS repair is built and the desktop is running. Installed extension reload and live CDN runs remain open. [HLS handoff](HLS_STREAM_RELIABILITY_HANDOFF.md).

## 2026-11-18 worker count and media discovery

SmartDM was rebuilt and restarted with the worker-count repair. Installed Chrome displayed 1080p60 on both the reported YouTube watch page and its home thumbnail. [Handoff](WORKERS_AND_MEDIA_DISCOVERY_HANDOFF.md)

## 2026-11-18 HLS startup and selected audio

The startup and selected-audio repair is built. Chrome showed SmartDM Integration switched off during verification. [Handoff](HLS_START_AND_AUDIO_HANDOFF.md)
