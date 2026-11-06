# SmartDM Implementation Phase Status (`sdm2.0`)

Branch: `sdm2.0` at `48ec34c` plus pre-existing and current uncommitted changes
Primary Target Product: C# / .NET 9 Avalonia Desktop (`apps/desktop-avalonia`) + Chrome/Firefox Browser Extensions  
Active Remediation Package: **Package 2 — Repair transfer integrity and recovery** (IN PROGRESS)  
Package 0 Exit Gate: **YES** (Locally satisfied & committed; remote CI gates final release)  
Package 1 Exit Gate: **YES** (Locally satisfied & committed)  
Next Permitted Package: **Package 2**

---

## Master Phase Status Table (0–18 Gates)

| Phase | Description | C# Equivalent / Scope | Status | Audit Findings Addressed / Blocking |
|---|---|---|---|---|
| **Phase 0** | Product, Legal, Privacy & Scope Lock | `ADR-009` (Accepted), Product Scope, Architecture Lock, Security Baseline | ✅ Completed | ADR-009 approved and accepted by maintainer; C-06 resolved; L-01, L-02, L-03 addressed |
| **Phase 1** | Solution, CI & Architecture Governance | `SmartDm.sln`, CI workflow, Architecture positive/negative tests, TLS tests | ✅ Completed | H-14, H-15, M-06, M-07 resolved locally (remote CI matrix gates release) |
| **Phase 2** | Secure Local Profile & Encrypted Persistence | SQLCipher-AES256 provider, `ISecretStore`, schema migrations | 🔄 Reopened | Blocked by C-01, H-12, H-13, L-04 (Target: Package 3) |
| **Phase 3** | Desktop UI Shell & Theme System | Avalonia MVVM views, no "Pro" tier, truthful completion inspector | 🔄 In Remediation | L-01 resolved; M-04, M-05 open (Target: Package 5) |
| **Phase 4** | Single-Download Vertical Slice | C# `DownloadEngine` ordinary HTTP transfers, replace Java daemon | ✅ Completed | Package 1 verified; C# DownloadEngine is sole transfer engine; parity proven; Java daemon decoupled |
| **Phase 5** | Segmentation, Recovery & Verification | Exact range checks, chunked EOF, journaled recovery, expected SHA-256 | 🔄 In Remediation | H-07, C-04 reopened: versioned migration for expected hash, destination preservation, durable segment journal |
| **Phase 6** | Queues, Scheduler, Bandwidth Control | Aggregated token bucket limiter, Add to Queue command | 🔄 In Remediation | M-02 marked partial: native segmented token bucket rate limiter verified; FFmpeg direct stream unthrottled and labeled |
| **Phase 7** | Categories, Batch, Clipboard, Auth & Proxy | Category rules, clipboard watcher, proxy and credential handling | 🔄 In Remediation | M-01 resolved (URL/MIME filename inference); credential handling & proxy open for Package 3 |
| **Phase 8** | Chrome & Firefox Browser Integration | Authenticated local IPC, token enforcement, acknowledged handoff | 🔄 Reopened | Blocked by C-02, C-03, H-10, M-09 (Target: Package 3) |
| **Phase 9** | Video/Audio Metadata & Resolvers | Extension `format_engine.js`, C# `YouTubeMediaResolver`, C# `HlsMediaResolver` | 🔄 Reopened | Blocked by M-10 (Target: Package 4) |
| **Phase 10** | YouTube Panel & Format Extractor UX | Multi-stream resolution, codec/container badges, provisional labels | 🔄 Reopened | Blocked by M-04, M-05, M-10 (Target: Package 4) |
| **Phase 11** | Local File Catalog & Duplicate Detection | User-approved catalog roots only, cryptographic duplicate detection, 3-tier matching | 🔄 In Remediation | H-08, H-09 resolved (candidate vs verified duplicate labeling, CDN videoplayback collision prevention); H-11 open for Package 3 |
| **Phase 12** | Local Smart Folder Selection | Destination folder affinities and learned preferences | ⏸️ Pending | To follow core engine parity |
| **Phase 13** | Local Natural-Language Search | FTS5 encrypted catalog queries | ⏸️ Pending | To follow encrypted persistence |
| **Phase 14** | Optional Gemini Consented Fallback | User-keyed consented AI fallback with exact payload preview | ⏸️ Pending | To follow encrypted secret store |
| **Phase 15** | Local Safety Scanner & Risk Center | Evidence-based states (`NoThreatsDetected`, `Suspicious`, `MalwareDetected`), staging quarantine | 🔄 Reopened | Blocked by H-03, H-04, H-05, H-06 (Target: Package 5) |
| **Phase 16** | Remaining IDM-Parity Workflows | Batch download, site collector, drop box, verified external tool paths (`ArgumentList`) | 🔄 Reopened | Blocked by M-08 (Target: Package 4) |
| **Phase 17** | UX, Accessibility & Low-End Hardening | Potato profile budgets, non-blocking UI verification | ⏸️ Pending | Target: Package 5 |
| **Phase 18** | Packaging, Installer & Release Hardening | Single-EXE verification, binary checksum validation before extraction | 🔄 Reopened | Blocked by C-05 (Target: Package 5) |

---

## Remediation Packages Plan

```text
Package 0: Architecture, phase reconciliation, CI foundation, TLS fix (Phases 0–1) -> ✅ COMPLETE (Exit Gate: YES)
Package 1: Make C# engine the only transfer engine (Phase 4/5 parity, remove Java daemon) -> ✅ COMPLETE (Exit Gate: YES)
Package 2: Transfer integrity, recovery, queue, duplicates, file catalog (Phases 5–7, 11) -> 🔄 IN REMEDIATION (Exit Gate: NO)
Package 3: Secure persistence, secrets, browser handoff (Phases 2, 8) -> ⏸️ BLOCKED (Package 2 Gate is NO)
Package 4: Preserve and test SmartDM's media extractor (Phases 9–10, 16)
Package 5: Safety states, UI claims, installer, release validation (Phases 3, 15, 17–18)
```

---

## Work Package 0 Status Record

- **Status**: COMPLETE
- **Exit Gate Satisfied**: **YES** (Locally satisfied and verified; remote Windows/Linux CI push verification required before overall remediation completion)
- **Pending CI Gate for Release**:
  - Execution and verification of CI workflow on remote Windows and Linux runner environments before declaring overall remediation complete or releasing SmartDM.
- **Completed Work Items**:
  - **ADR-009**: Reviewed and accepted by maintainer (C#/.NET 9 and Avalonia approved as supported desktop architecture; Java daemon to be phased out following C# transfer parity in Package 1).
  - **C-06 (NEW CRITICAL)**: Removed unsafe wildcard `RemoteCertificateValidationCallback` in `HlsMediaResolver.cs`. Replaced with standard platform TLS validation. Verified fail-closed behavior on untrusted certificates via unit test.
  - **H-14**: Java `ModuleBoundaryTest` updated with ArchUnit assertions and negative tests (verified: 2/2 tests pass in 18s).
  - **H-15**: C# .NET 9 solution (`SmartDm.sln`), unit/architecture tests (`SmartDm.Architecture.Tests` expanded to 11 tests covering production Avalonia ViewModels, Services, Models, and Views), and CI workflow configured.
  - **L-01**: Removed "2.0 PRO" and "Pro" labels from `MainWindow.axaml` and `SettingsWindow.axaml`. Aligned with ADR-001 (one free edition).
  - **L-02**: Updated `README.md` and `AGENTS.md` to document the C#/.NET 9 Avalonia client as the primary product.
  - **L-03**: Reconciled `PHASE_STATUS.md` and phase plan; reopened gates lacking C# proof.
  - **M-06**: Updated `smartdm.javaVersion=21` in `gradle.properties`.
  - **M-07**: Replaced live 512MB external URL and personal paths in `BenchmarkRunnerTest` and `EngineDaemonIpcTest` with bounded loopback `LocalTestHttpServer` and `@TempDir`.
- **Local Verification Evidence**:
  - `dotnet restore SmartDm.sln`: 0 errors
  - `dotnet build SmartDm.sln --no-restore`: 0 warnings, 0 errors
  - `dotnet test SmartDm.sln --no-build`: 11 passed, 0 failed (8 architecture boundary tests + 3 TLS validation tests)
  - `.\gradlew.bat :modules:domain:architectureTest`: 2 passed, 0 failed (positive domain boundary test + negative violation detection test)
  - `.\gradlew.bat :modules:download-engine:test`: 3 passed, 0 failed (BenchmarkRunnerTest & EngineDaemonIpcTest run offline with bounded loopback server)

---

## Work Package 1 Status Record

- **Status**: COMPLETE
- **Exit Gate Satisfied**: **YES** (All ordinary and media downloads routed through C# DownloadEngine; Java daemon decoupled; 0 startup references; 15/15 tests pass)
- **Completed Work Items**:
  - **Engine Parity Matrix**: Documented full 14-workflow parity analysis in `docs/implementation/ENGINE_PARITY.md`.
  - **Single Transfer Engine Composition**: `MainViewModel` constructor defaulted to `new DownloadEngine(_repository, _safetyScanner)`.
  - **Decommissioned Java IPC Adapters**: Marked `IpcDownloadEngine` and `EngineDaemonLauncher` as `[Obsolete]`; removed all calls to them from production, diagnostics, and test CLI paths (`Program.cs`).
  - **Automated Parity & Decoupling Tests**: Added `EngineParityTests.cs` (4 tests) verifying `DownloadEngine` transfers ordinary HTTP content without Java daemon, operates identically when daemon port is occupied or absent, and that production entry points contain zero fields of type `SmartDmIpcClient` or `EngineDaemonLauncher`.
  - **Published Binary Standalone Run**: Confirmed `dotnet publish` Release executable executes and passes all backend diagnostics without Java or Gradle installed.
- **Local Verification Evidence**:
  - `dotnet test SmartDm.sln`: 15 passed, 0 failed (11 Package 0 tests + 4 Package 1 parity tests)
  - `dotnet publish apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj -c Release`: 0 warnings, 0 errors
  - `SmartDm.Desktop.Avalonia.exe --test-backend`: `[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]` with C# DownloadEngine initialized

---

## Work Package 2 Status Record

- **Status**: IN REMEDIATION
- **2026-11-03 lifecycle follow-up (R07)**: Commands serialize per download; ownership is reserved before asynchronous setup and released by the owning runner only after shutdown. Pause/cancel no longer use the 800 ms timeout; resume of an active owner is idempotent. Monitor tasks are joined, scan cancellation reaches finalization arbitration, and observed threat/completed results are preserved. Shared process paths guard start/stop and await exit. 12 new ordinary lifecycle cases pass; total 93 .NET / 8 browser tests. Real media-process/Linux lifecycle checks and R06 network failure policy remain open; Package 2 gate remains NO. See [handoff](PACKAGE2_LIFECYCLE_HANDOFF.md).
- **2026-11-03 ordinary reliability follow-up**: R03 fixed (oversized limiter charges); R05 fixed for probed downloads (real range capability and full-body fallback plan); R09 ordinary metadata path fixed (strong/weak ETag, Last-Modified, range capability through creation and restart; media representation persistence remains open); R16 fixed (collision policy mapping). Added migration 4 with transactional rollback and 27 regression cases. Latest suite: 81 .NET / 8 browser tests pass; build 0 warnings/errors. R06/R07 network and lifecycle work remains open; gate remains NO. See [handoff](PACKAGE2_RELIABILITY_HANDOFF.md).
- **2026-10-29 Facebook follow-up (three user-reported defects, cross-package)**: [x] Hide badges whose Reel anchors are clipped by the carousel and bind one badge to one anchor; [x] remove thumbnail page-wide media lookup and provide an Open Reel action; [x] require exact Reel ID or active player's direct stream for Facebook download options; [x] remove cross-tab media fallback and page-wide Facebook extraction; [x] add Chrome/Firefox regression tests; [ ] user live-check on Facebook. Package 2 exit gate remains NO; this does not open Package 4.
- **2026-10-29 Facebook defect follow-up checklist (user-reported, cross-package repair)**: [x] Reproduce FFmpeg configuration failure from transfer screenshot; [x] verify installed WinGet FFmpeg Essentials 8.1.1 executable and pin its SHA-256 in user environment; [x] require the checksum in C# resolver and test mismatch rejection; [x] move Chrome/Firefox Reel badge host outside the clickable card and test click handling; [x] make extension handoff show acknowledgement or failure rather than an indefinite loading message; [x] run desktop and browser tests; [x] reload Chrome extension and confirm Reel badge opens a visible popover while Facebook remains on the home feed; [ ] confirm fresh Facebook media formats and complete a live download. This does not complete Package 2 or open Package 4.
- **Exit Gate Satisfied**: **NO** (C-04 and M-02 remain partial. Completed ranges have flushed SHA-256 checkpoints and are reused only after a fresh strong ETag/length probe; incomplete or unverified ranges replay. Workers send `If-Range` for strong ETags. Saved HTTP speed limits now reach the transfer engine and UI wording names their scope. Package 2 still needs a full fault-injection matrix and verified bandwidth tolerance. Current local suite: 47/47.)
- **Work Items Completed & In Progress**:
  - **C-04 (Staging Directory Reconciliation & Checkpointed Crash Recovery)**: Added `segments.journal` in each staging directory. The previous physical-length clamp was unsafe with preallocated files. Completed bounded ranges are flushed and SHA-256 hashed; recovery reuses only matching checkpoints after a fresh `206` probe confirms the same strong ETag and total length. Resume drops in-memory progress and checks the disk journal. The child process termination test verifies final bytes and SHA-256. Changed-resource races between probe and workers and a complete fault-injection matrix remain open.
  - **H-01 (Malformed Range & Content-Range Validation)**: `SegmentWorker.ExecuteAsync` and `ExecuteChunkQueueAsync` enforce HTTP 206 Partial Content for range requests and strictly validate `Content-Range` bounds (`From == requestedStart`, `To == requestedEnd`, valid unit and total length). Premature stream disconnects fail closed instead of silently completing.
  - **H-02 (Unknown-Length EOF Validation)**: Propagated clean stream termination checks; truncated unknown-length stream transfers transition to `DownloadStatus.Failed` instead of marking completed.
  - **H-07 (Expected SHA-256 Persistence, Restart Survival & Destination Protection)**: Created versioned migration (`version = 2`) in `schema_migrations` adding `expected_sha256 TEXT` to `downloads`. Verified hash survives application/database restart. Enforced staging-first verification: SHA-256 and safety scanning run on `session.StagingFilePath` in `.temp` *before* touching destination. On hash mismatch, only the staged file is purged; pre-existing user files at destination are NEVER touched, overwritten, or deleted. Destination conflict resolution added: default (`DefaultNeverOverwrite`) and `Rename` create unique filenames via `FileCatalogService.GenerateUniquePath` without touching pre-existing user files; `Replace` explicitly overwrites; `Skip` preserves destination and purges staging. Migration 3 persists `conflict_action`, `etag`, and `last_modified`.
  - **H-08 (File Catalog Duplicate Classification)**: `FileCatalogService.FindDuplicateAsync` labels filename-only matches as `Candidate Duplicate File with Same Name (Content Unverified)`. Confirmed "Identical File" label strictly requires cryptographic SHA-256 hash match.
  - **H-09 (Signed Media CDN Collision Prevention)**: `MainViewModel.FindActiveDownloadByUrl` forbids query-stripped base URL matching on CDN stream endpoints (`videoplayback`, `/seg-`, `stream`, `manifest`). Compares resource identifiers (`id=` query token) and stable `SourcePageUrl` / `PageUrl`.
  - **M-01 (Direct URL Filename Inference)**: `HttpProbeService.ProbeUrlAsync` extracts filename from unescaped URL path basename and Content-Disposition; maps MIME types (`application/pdf` -> `.pdf`, `application/zip` -> `.zip`) to correct file extensions; removes hardcoded `.mp4` fallback.
  - **M-02 (Aggregate Speed Limiter, FFmpeg Policy Labeling & Unverified PATH Removal - PARTIAL)**: Implemented `ISpeedLimiter` and `AggregateSpeedLimiter` token-bucket rate limiter shared across active `SegmentWorker` instances in `DownloadEngine`. Direct external FFmpeg processes communicate directly with media servers over unthrottled sockets; honestly labeled in status details (`Direct FFmpeg stream (global speed limiter applies to segmented HTTP transfers)`). Removed unverified FFmpeg PATH fallback in C# `DownloadEngine.ResolveFfmpegPath` and Java `LocalMediaToolManager`; only explicit verified `FFMPEG_PATH` is accepted; otherwise fails closed with actionable error.
  - **M-03 (Add to Queue Command Binding)**: Implemented `AddToQueueCommand` in `AddDownloadViewModel`; bound button in `AddDownloadDialog.axaml`. `AddNewDownload` in `MainViewModel` persists queued download without auto-starting transfer engine.
- **Local Verification Evidence**:
  - `dotnet test SmartDm.sln`: 40 passed, 0 failed (11 Package 0 + 4 Package 1 + 25 Package 2 tests)
  - `TransferIntegrityTests.SqliteDatabaseRepository_ExpectedSha256_SurvivesRestartAndMigration`: Passed (H-07)
  - `TransferIntegrityTests.DownloadEngine_ExpectedSha256_Mismatch_NeverOverwritesOrDeletesPreExistingDestination`: Passed (H-07)
  - `TransferIntegrityTests.DownloadEngine_DestinationConflict_DefaultNeverOverwrites_HonorsExplicitActions`: Passed (H-07)
  - `TransferIntegrityTests.DownloadEngine_ForcedTermination_ResumesFromDurableJournalWithoutByteLoss`: Passed (C-04)
  - `TransferIntegrityTests.DownloadEngine_JournalValidation_EnforcesPhysicalLength_SourceIdentity_AndValidators`: Passed (C-04)
  - `TransferIntegrityTests.DownloadEngine_ChildProcessTermination_ResumesFromDatabaseAndJournal`: Passed (C-04)
  - `TransferIntegrityTests.DownloadEngine_FfmpegSpeedLimit_HonestlyLabeled`: Passed (M-02)
  - `apps/desktop-avalonia --test-backend`: `[ALL_BACKEND_DIAGNOSTICS_PASSED_SUCCESSFULLY]`
  - `apps/desktop-avalonia --test-staging`: `[PASS] Orphan staging directory cleanup verified!`
  - `apps/desktop-avalonia --test-pause-stop`: `[PASS] Staging file successfully preserved after PauseDownloadAsync.`
  - `apps/desktop-avalonia --test-duplicates`: `[PASS] Active download matched by direct URL; collision safely auto-numbered.`
  - `.\gradlew.bat :modules:domain:architectureTest`: 2 passed, 0 failed
  - `.\gradlew.bat :modules:download-engine:test`: 3 passed, 0 failed offline




## 2026-11-03 selected-social and filename follow-up

See [SOCIAL_MEDIA_FOLLOWUP.md](SOCIAL_MEDIA_FOLLOWUP.md): partial defect repairs; 97 .NET / 22 browser tests pass. Gotaku/Reanime failures, opaque X source binding and live overlay verification remain open. Gate NO.


## 2026-11-04 owner-authorized Goals 3/4 runtime slice

[Implementation/evidence](GOALS_3_4_HANDOFF.md): 156 .NET / 40 browser tests; isolated build zero warnings/errors. Package 4 and Package 5 remain IN REMEDIATION, exit gates NO. Package 2/3 prerequisites remain open. The owner deferred installer/setup/release-package creation until development is finished; no such artifact was created. Runtime safety/media/update checks are implemented as listed in the handoff, without asserting complete package closure.


## 2026-11-04 browser memory repair (owner request)

Local resource lifecycle/caching/probe fixes are implemented in both extension
copies with 66 passing browser fixtures. See [handoff](EXTENSION_MEMORY_HANDOFF.md).
Live-browser memory and compatibility validation remain open. Package 4/5 exit
gates stay **NO**; no installer or release package was built.


## 2026-11-06 branch synchronization

The owner authorized the current development snapshot on both sdm2.0 and sdm-v2.
See [handoff](BRANCH_SYNC_HANDOFF.md). Local checks pass (177 .NET / 77 browser /
13 auth), including corrected AES-128 test setup and browser packaging fixtures.
This synchronization closes no product/package gate; installer/release stays deferred.
