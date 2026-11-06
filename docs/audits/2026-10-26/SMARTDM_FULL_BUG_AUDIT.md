# SmartDM full bug audit

Audit performed 2026-10-26 through 2026-10-29 against the working tree in
`E:\skill\projects\smartdm`. This was a diagnostic audit, not a phase-completion
review. The repository was already dirty; no existing product changes were
reverted or treated as audit changes.

## Executive result

**Release recommendation: BLOCK.** The Java regression suite passes, and an
authorized public YouTube video completed successfully, but the currently
launched Avalonia application has critical privacy, integrity, safety, and
recovery defects. Its visible security claims do not match its implementation.
It is also outside the documented Java 21/JavaFX architecture and is not built
or tested by CI.

Confirmed count: **6 critical, 15 high, 10 medium, and 4 low/documentation
findings**. “Confirmed” means reproduced with a bounded fixture, observed in the
UI/browser, or directly demonstrated by a reachable code path. Site behavior
that could not be completed is listed separately and is not counted as a
confirmed defect.

## Test scope and evidence

- Java baseline: `gradlew.bat clean check architectureTest integrationTest uiTest`
  completed with `BUILD SUCCESSFUL in 9m 9s`; 127 actionable tasks (118
  executed, 9 up-to-date). Parsed JUnit XML: 35 suites, 127 tests, 0 failures,
  0 errors, 0 skipped. See `test-summary.csv`.
- Avalonia build: `dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore`
  succeeded with 0 warnings and 0 errors in 3.49 seconds.
- Extension syntax: Node syntax checks passed for Chrome and Firefox
  `background.js`, `smartdm_overlay.js`, and `sniffer.js`; both manifests parse
  as JSON.
- Synthetic fixtures: `dotnet run --project docs/audits/2026-10-26/repro/Repro.csproj`
  reproduced plaintext storage, false safety/quarantine states, duplicate false
  positives, malformed range acceptance, bad filename inference, and truncated
  unknown-length completion. See `repro-results.txt`.
- Human UI/browser check: the public Blender Foundation Big Buck Bunny YouTube
  video resolved 18 formats and downloaded a valid 1920x1080 VP9/AAC file
  (634.62458 seconds, 179,700,154 bytes). The completion UI then mislabeled it
  as a ZIP archive and made unsupported security claims. See
  `completion-inspector.png`.
- Browser compatibility check: the unpacked Chrome extension injected on the
  public YouTube page and NASA Facebook video listing. An individual Facebook
  reel was inconsistent, and no SmartDM control appeared on the public NASA
  Instagram reel tested. No private page content was recorded.
- Local IPC check: an unauthenticated cross-origin POST from
  `https://audit.invalid` to `/api/browser` returned HTTP 200 with wildcard
  CORS while the app was running.

## Critical findings

### C-01 — Avalonia database is plaintext while the UI claims SQLCipher-AES256

`SqliteDatabaseRepository` uses ordinary `Microsoft.Data.Sqlite` without a key.
The real database begins with the plaintext `SQLite format 3` header. A clean
fixture recovered canary title, URL, and cookie values directly from the file.
The main window nevertheless displays “Local Database: SQLCipher-AES256”. This
exposes URLs, paths, cookies, user agents, catalog data, and crash-report data.

**Fix:** stop shipping/launching the Avalonia persistence path until it uses the
approved encrypted persistence port, has a safe migration, and passes a raw-file
plaintext test. Remove the claim until that is true.

### C-02 — Browser IPC authentication is bypassed for every loopback caller

`LocalIpcService` authorizes a request when the bearer token matches **or** the
caller is local. It also sends `Access-Control-Allow-Origin: *` and approves
private-network requests. Any website able to reach loopback, or any untrusted
local process, can invoke privileged browser commands without the token. The
audit reproduced an unauthenticated cross-origin POST returning 200.

**Fix:** require the token for every mutating request, pin the extension origin
or use authenticated native messaging, reject browser CORS by default, and add
negative integration tests.

### C-03 — Browser cookies are captured broadly and persisted unencrypted

The extensions request cookie and `<all_urls>` permissions, collect cookies for
the target, referer, page, origin, parent domains, and captured request headers,
serialize them in Netscape format, and send them to the desktop. The Avalonia
DTO and plaintext database store the resulting cookie string. There is no
per-download consent screen showing the exact credential payload.

**Fix:** remove broad cookie collection, request the narrowest host access only
after explicit consent, keep credentials in an ephemeral secret channel, and
never persist them in normal DTOs or plaintext storage.

### C-04 — Crash recovery deletes all partial download data at startup

`App.axaml.cs` calls `CleanupOrphanStagingDirectories()` on startup. That method
recursively deletes every child of both staging roots while the database merely
changes active jobs to Paused. A crash therefore destroys the bytes required to
resume, contradicting the durable recovery gate.

**Fix:** reconcile journaled sessions to owned staging directories; preserve
valid partials, validate ranges and hashes, and delete only provably abandoned
data after a recovery-safe retention period.

**Status (Package 2 Reopened):** Staging reconciliation preserves active/paused data; durable on-disk segment journal (`segments.journal`) in each staging directory retains valid partial byte offsets across abrupt process kills/restarts without byte loss. Journal ranges are strictly validated against physical file length on disk, source identity, and remote HTTP validators (never trusting recorded byte counts alone). Validated through real child process mid-transfer termination (`proc.Kill(entireProcessTree: true)`) and recovery.

### C-05 — Unverified Java runtime is downloaded and installed

The installer downloads a pinned-looking JRE ZIP from GitHub and immediately
extracts/copies it. It performs no checksum or signature verification before
installation. Generating a checksum for the SmartDM installer later does not
authenticate this runtime dependency.

**Fix:** ship a verified runtime or enforce an independently pinned SHA-256 and
signature/provenance check before extraction, with atomic staging and cleanup.

### C-06 — HlsMediaResolver disables TLS certificate validation with wildcard accept-all callback

`HlsMediaResolver.cs` configured its `SocketsHttpHandler` with `RemoteCertificateValidationCallback = (_, _, _, _) => true`. This completely disables TLS certificate validation for all HLS playlist and manifest requests, permitting Man-in-the-Middle (MitM) attacks, credential leakage, and malicious stream injection.

**Fix:** Remove the accept-all callback. Enforce standard platform TLS validation so invalid and untrusted certificates fail closed. Test with both valid and untrusted certificate fixtures.

## High findings

### H-01 — Malformed range responses can silently corrupt output

A worker requesting bytes 4–7 accepted `206 Content-Range: bytes 0-3/8`, wrote
the body at offset 4, and reported completion. The resulting fixture was
`0000000000010203`. The worker does not require the returned start/end to equal
the requested interval.

**Fix:** validate status, exact range bounds, total length consistency, body
length, validator stability, and overlap before committing a segment.

### H-02 — Truncated unknown-length response is marked Completed

A chunked fixture sent four bytes and aborted the connection. The engine marked
the job Completed and finalized the four-byte file because any positive byte
count is considered sufficient when total length is unknown.

**Fix:** require a clean end-of-message, propagate stream exceptions, and keep
unknown-length transfers incomplete unless protocol completion is proven.

### H-03 — Safety scanner reports a missing file as clean

`ScanFileAsync` returns `IsClean=true` with “File does not exist.” This converts
an I/O failure into a safety verdict.

**Fix:** use explicit `UNSCANNED`/`SCAN_FAILED` states and block completion/open.

### H-04 — “Quarantined” files are not quarantined

A harmless `audit.pdf.exe` fixture set `IsQuarantined=true`, but the original
file remained in its final destination. No move, ACL isolation, or quarantine
store exists.

**Fix:** scan the staging file before finalization and atomically move threats to
an access-controlled quarantine, recording evidence and recovery policy.

### H-05 — Scanner invents a clean verdict when no scanner is available

If Defender/ClamAV cannot run, heuristics default to `IsClean=true`, scanner name
“SmartDM Safe Sandbox”, and “Verified clean”. No sandbox or ZIP-slip inspection
is performed. Scanner errors/timeouts are swallowed.

**Fix:** represent unavailable/error states honestly; heuristics may flag risk
but must not claim a malware verdict.

### H-06 — File is finalized and overwritten before safety scan

The engine calls `File.Move(..., overwrite: true)` into the user destination,
cleans staging, marks Completed, and only then scans. A malicious file can
replace an existing file and remain accessible even when the later state says
Quarantined.

**Fix:** scan an owned temporary file, require explicit conflict resolution,
then atomically finalize only an allowed result.

### H-07 — Expected SHA-256 field is nonfunctional

The Add Download dialog binds `ExpectedHash`, but no production path passes or
compares it. The completion view can say “Match with clipboard Verified” even
though no expected hash was supplied or verified.

**Fix:** validate and persist expected algorithm/value through the domain model,
compare in constant time after download, fail on mismatch, and test the UI path.

**Status (Package 2 Reopened):** Versioned migration 2 adds `expected_sha256` to SQLite schema; hash persistence verified across process restarts. Staged file is compared and scanned in staging before destination promotion; pre-existing user files are never deleted or overwritten on mismatch. Destination conflict handling defaults to never overwriting existing user files (renaming uniquely) and honors explicit replace, rename, and skip actions. Migration 3 persists `conflict_action`, `etag`, and `last_modified`.

### H-08 — Filename-only match is labeled “Identical File”

`FindDuplicateAsync` treats an existing filename as an identical file without
comparing size or hash. The fixture reproduced the false claim using different
content and URL.

**Fix:** label filename-only matches as weak candidates; reserve identical for a
full cryptographic hash match.

### H-09 — Signed media URLs collapse to false active duplicates

`FindActiveDownloadByUrl` strips the query and compares only
scheme/authority/path. Distinct Googlevideo `videoplayback` resources therefore
collide. The public Big Buck Bunny video was initially identified as an
unrelated active download.

**Fix:** retain the stable page/media identity or compare signed media URLs with
their resource identifiers; never use base path alone for CDN endpoints.

### H-10 — Browser interception cancels and erases before handoff succeeds

The extension immediately cancels and erases every eligible Chrome download,
then sends it to SmartDM. Restoration happens only after an asynchronous failure
response and opens a new Save As flow. A crash, lost response, or service-worker
suspension can lose the original browser transfer/history.

**Fix:** confirm authenticated desktop acceptance before cancellation, use a
durable acknowledgement protocol, and preserve browser history/recovery state.

### H-11 — Automatic catalog scanning violates approved-root consent

`MainViewModel` starts `ScanCommonFoldersAsync()` during construction. That
scans the user Downloads/Desktop and every ready drive’s `Downloads` folder
without approved roots or onboarding consent, and stores results in the
plaintext Avalonia database.

**Fix:** require explicit root selection, enforce exclusions/rate limits, and
store catalog records only in encrypted persistence.

### H-12 — Gemini API key is stored in plaintext JSON

`SaveAiConfigAsync` serializes the complete AI config to `~/.smartdm/ai_config.json`.
The synthetic key was recoverable verbatim.

**Fix:** use OS credential storage/approved secure-storage port, redact errors,
and migrate/delete legacy plaintext safely.

### H-13 — Schema changes are unversioned and errors are swallowed

The Avalonia repository creates tables inline, retries `ALTER TABLE ADD COLUMN`
on every start, and catches every migration error. There is no immutable version
ledger, backup, validation, or create-copy-validate-swap workflow.

**Fix:** use the approved versioned migration system and fail safely on an
unexpected schema.

### H-14 — Architecture enforcement test always passes

`ModuleBoundaryTest` contains only `assertTrue(true)`. It cannot detect any of
the forbidden dependencies described as CI-enforced in AGENTS.md.

**Fix:** implement real classpath/dependency rules (for example ArchUnit plus
Gradle graph assertions) and seed negative fixtures.

### H-15 — Active Avalonia product is absent from CI and automated tests

The launcher targets a .NET 9/Avalonia app, while CI only provisions Java and
runs Gradle. The project has no separate test project; diagnostic/self-test code
inside `Program.cs` is not a CI boundary. Release-breaking bugs above therefore
coexist with a green build.

**Fix:** decide the supported architecture through an ADR. Until then, prevent
the ungoverned app from being the default launcher. If retained, add Linux and
Windows build/test/security jobs and architecture tests.

## Medium findings

### M-01 — Direct URL filename inference ignores a usable path extension

A local `/actual-document.pdf` response with generic content type was named
`download_<timestamp>.mp4`. `HttpProbeService` applies an MP4 fallback instead
of using the safe URL basename/extension.

### M-02 — Speed limiter is a dead setting

`SetSpeedLimitBytesPerSec` assigns a field that is never read. The UI can claim
a limit while transfers remain unrestricted.

**Fix:** wire the limit to an aggregate token-bucket limiter shared by workers,
enforce it on chunk reads, and support dynamic runtime changes.

**Status (Package 2 Partial):** Token-bucket rate limiter enforced across all native segmented HTTP and HLS worker transfers. External FFmpeg CLI processes communicate over external direct sockets and are not throttled by the C# bucket; this behavior is labeled honestly in status details (`Direct FFmpeg stream (global speed limiter applies to segmented HTTP transfers)`) and documented.

### M-03 — Add to Queue button has no command

The dialog’s “Add to Queue” button has no binding or click handler, so the
visible workflow is inert.

### M-04 — Completion Inspector is hard-coded for ZIP archives

After the valid YouTube media download, the UI displayed
“application/x-zip-compressed • Solid Multi-Volume” and “Extract to /Archives/”.
The XAML contains those values statically.

### M-05 — Completion Inspector displays unproven integrity/security claims

The same screen claimed 16/16 segments merged, Defender clean, heuristic ZIP
safety, clipboard hash verification, and “reconstructed flawlessly”. These are
not all derived from the completed job’s evidence.

### M-06 — Java compatibility setting conflicts with the required toolchain

`gradle.properties` says `smartdm.javaVersion=17` while the plan, README, and CI
require Java 21. This invites local/CI behavior divergence.

### M-07 — Full test suite depends on a live 512 MB public download

`BenchmarkRunnerTest` and `EngineDaemonIpcTest` use an HTTP 512 MB public URL.
The benchmark writes artifacts to a hard-coded personal `.gemini\antigravity`
path. This caused a large part of the 9m 9s baseline and violates deterministic,
offline, portable test requirements.

### M-08 — External process calls still use concatenated argument strings

Defender, ClamAV, Gradle daemon launch, update chmod, registry commands, and the
Java launcher include `ProcessStartInfo.Arguments` strings instead of validated
argument arrays. The scanner paths are user-file influenced.

### M-09 — Extension permissions and injection scope are excessive

Both manifests request `<all_urls>` and inject multiple scripts at
`document_start`/all frames, alongside cookies, downloads, webRequest, and native
messaging permissions. This exceeds the minimum-permission gate and expands the
impact of any extension defect.

### M-10 — Site integration is inconsistent and format labels are ambiguous

YouTube displayed duplicate resolution-only labels without codec/container/audio
distinction. Facebook controls appeared on the listing but not reliably on the
individual reel. No control appeared on the tested Instagram reel. The product
needs a declared, tested compatibility matrix and honest per-site fallback UI.

## Low and documentation findings

### L-01 — Product identity conflicts with the permanent one-edition rule

The active UI repeatedly says “2.0 PRO”/“Pro”, while the project permanently has
one free edition and no premium tier. Even without a gate, this is misleading.

### L-02 — README/launcher/implementation describe different products

README documents Java 21/JavaFX and SQLCipher; the default launcher starts
.NET 9/Avalonia with plaintext SQLite. Version strings also disagree.

### L-03 — Phase and evidence documents contradict one another

The status table, detailed phase sections, test evidence, and “next phase” text
give different current phases and completion claims. No new implementation phase
can safely start from this state.

### L-04 — Startup diagnostics may expose launch arguments

The Avalonia startup log is plaintext and records startup messages/exceptions;
argument logging can expose URLs or local paths. Diagnostics need structured
redaction and bounded retention.

## Manual compatibility observations (not counted as confirmed bugs)

| Surface | Result |
|---|---|
| Desktop YouTube | Authorized public video resolved and downloaded successfully; output media was valid. Security/metadata UI was wrong. |
| Chrome YouTube overlay | Button and generic format panel appeared. Full browser-to-desktop handoff was not completed in this run. |
| Facebook public video listing | SmartDM buttons and generic 720p/480p/360p panel appeared. Individual reel behavior was inconsistent. |
| Instagram public reel | No SmartDM overlay observed. |
| Direct HTTP fixtures | Probe and engine paths exercised locally; integrity and naming defects reproduced. |
| Firefox | Manifest/JavaScript parse only; no installed-browser end-to-end run. |
| Linux/Snap/Flatpak | Not available on this Windows machine; not manually verified. |

## Prioritized remediation order

1. Stop release/default launch of the Avalonia build; resolve the architecture
   decision and add it to CI.
2. Close IPC/auth/CORS and cookie-secret exposure; rotate/delete persisted test
   credentials after migration support exists.
3. Replace plaintext persistence and API-key storage with approved encrypted and
   OS-backed storage.
4. Repair transfer correctness: exact range validation, unknown-length EOF,
   conflict handling, expected-hash enforcement, and durable recovery.
5. Redesign safety states and quarantine; scan before finalization and remove all
   unsupported “clean/safe/verified” claims.
6. Fix installer supply-chain verification and real architecture enforcement.
7. Add deterministic fixtures and a site compatibility matrix before further UI
   or marketing work.

## Remediation Closure Table

| Audit ID | Severity | Status | Remediation Package | Fix Description | Test / Proof | Remaining Risk |
|---|---|---|---|---|---|---|
| **C-01** | Critical | OPEN | Package 3 | Replace plaintext SQLite with SQLCipher provider & migrations | Pending Package 3 | Plaintext metadata on disk |
| **C-02** | Critical | OPEN | Package 3 | Require bearer token for all mutating IPC, reject wildcard CORS | Pending Package 3 | Loopback IPC vulnerability |
| **C-03** | Critical | OPEN | Package 3 | Narrow cookie permissions, per-download consent, ephemeral transfer creds | Pending Package 3 | Cookie credential exposure |
| **C-04** | Critical | **REOPENED** | Package 2 | Reconciled staging directories; durable segment journal (`segments.journal`) persisted across child process kill/restart; validated against physical file length, source identity, and HTTP validators; resumes without byte loss | `CleanupOrphanStagingDirectories_PreservesActiveAndPausedDownloads`, `DownloadEngine_ForcedTermination_ResumesFromDurableJournalWithoutByteLoss`, `DownloadEngine_JournalValidation_EnforcesPhysicalLength_SourceIdentity_AndValidators`, `DownloadEngine_ChildProcessTermination_ResumesFromDatabaseAndJournal` | None; partial data retained |
| **C-05** | Critical | OPEN | Package 5 | Pinned checksum verification before runtime extraction; atomic staging | Pending Package 5 | Supply chain vulnerability |
| **C-06** | Critical | **CLOSED** | Package 0 | Removed accept-all TLS callback in `HlsMediaResolver.cs`; enforced platform TLS | `HlsMediaResolver_MustFailClosed_OnUntrustedCertificate` | None; fails closed on bad certs |
| **H-01** | High | **CLOSED** | Package 2 | Validated 206 status, exact Content-Range bounds, body length | `SegmentWorker_RejectsMalformedContentRangeBounds`, `SegmentWorker_Rejects200OkOnSubrangeRequest` | None; rejects corrupt ranges |
| **H-02** | High | **CLOSED** | Package 2 | Required clean protocol EOF; stream truncation treated as failure | `DownloadEngine_UnknownLengthStream_FailsWhenConnectionAborts` | None; truncation fails closed |
| **H-03** | High | OPEN | Package 5 | Missing file returns `ScanFailed` instead of clean | Pending Package 5 | I/O failure reported clean |
| **H-04** | High | OPEN | Package 5 | Physically move detected threats to restricted quarantine folder | Pending Package 5 | "Quarantined" file remains accessible |
| **H-05** | High | OPEN | Package 5 | Report `Unscanned`/`ScanFailed` when Defender/ClamAV unavailable | Pending Package 5 | Invented clean verdict |
| **H-06** | High | OPEN | Package 5 | Scan staged file before destination move; atomic finalization | Pending Package 5 | Overwriting destination before scan |
| **H-07** | High | **REOPENED** | Package 2 | Versioned migration adds `expected_sha256` to SQLite; survives restart; staging-first verification; pre-existing user files never deleted or overwritten; destination conflict defaults to never overwrite; honors replace/rename/skip | `DownloadEngine_ExpectedSha256_FailsOnMismatchAndPurgesOutput`, `DownloadEngine_ExpectedSha256_SucceedsOnMatch`, `SqliteDatabaseRepository_ExpectedSha256_SurvivesRestartAndMigration`, `DownloadEngine_ExpectedSha256_Mismatch_NeverOverwritesOrDeletesPreExistingDestination`, `DownloadEngine_DestinationConflict_DefaultNeverOverwrites_HonorsExplicitActions` | None; fails closed, protects destination |
| **H-08** | High | **CLOSED** | Package 2 | Filename-only match classified as candidate; full hash required for identical | `FileCatalogService_FilenameOnlyMatch_IsCandidateNotIdentical` | None; honest duplicate claim |
| **H-09** | High | **CLOSED** | Package 2 | Disallowed query-stripped base URL matching on CDN stream endpoints | `MainViewModel_FindActiveDownloadByUrl_PreventsCdnVideoplaybackCollisions` | None; CDN collisions prevented |
| **H-10** | High | OPEN | Package 3 | Authenticated desktop acknowledgement before cancelling browser transfer | Pending Package 3 | Lost browser transfer on handoff |
| **H-11** | High | OPEN | Package 3 | Require explicit approved roots for catalog scanning; no auto-scans | Pending Package 3 | Unconsented drive scanning |
| **H-12** | High | OPEN | Package 3 | Store Gemini API key in OS credential store via `ISecretStore` | Pending Package 3 | Plaintext API key on disk |
| **H-13** | High | OPEN | Package 3 | Immutable versioned SQLite schema migrations with ledger | Pending Package 3 | Swallowed schema errors |
| **H-14** | High | **CLOSED** | Package 0 | Replaced `assertTrue(true)` in `ModuleBoundaryTest.java` with ArchUnit rules | `./gradlew :modules:domain:architectureTest` (positive & negative tests pass) | None |
| **H-15** | High | **IN PROGRESS** | Package 0 | Created `SmartDm.sln`, `SmartDm.Architecture.Tests` (11 tests), CI workflow | Local Windows test passed (11/11); remote Windows/Linux CI execution pending | Remote CI runs pending push |
| **M-01** | Medium | **CLOSED** | Package 2 | Inferred filename from validated Content-Disposition / path basename / MIME type | `HttpProbeService_InfersFilenameFromUrlPathAndMimeType` | None; PDF saved as PDF |
| **M-02** | Medium | **PARTIAL** | Package 2 | `AggregateSpeedLimiter` token-bucket rate limiter throttles native segmented HTTP transfers; direct FFmpeg external stream transfers unthrottled and labeled honestly; unverified FFmpeg PATH fallback removed | `AggregateSpeedLimiter_ThrottlesBandwidth`, `DownloadEngine_FfmpegSpeedLimit_HonestlyLabeled` | Direct FFmpeg socket unthrottled |
| **M-03** | Medium | **CLOSED** | Package 2 | Bound Add to Queue button to `AddToQueueCommand`; persisted queued state | `AddDownloadViewModel_AddToQueueCommand_CreatesQueuedDownloadWithoutStarting` | None; queue button functional |
| **M-04** | Medium | OPEN | Package 5 | Dynamically bind Completion Inspector container and action buttons | Pending Package 5 | Mislabeled as ZIP archive |
| **M-05** | Medium | OPEN | Package 5 | Bind Completion Inspector claims strictly to actual job evidence | Pending Package 5 | Unproven security/integrity claims |
| **M-06** | Medium | **CLOSED** | Package 0 | Updated `smartdm.javaVersion=21` in `gradle.properties` | Verified Gradle toolchain build | None |
| **M-07** | Medium | **CLOSED** | Package 0 | Replaced live 512MB download & hardcoded paths with bounded loopback `LocalTestHttpServer` and `@TempDir` | `BenchmarkRunnerTest` & `EngineDaemonIpcTest` (passed offline in 20s) | None |
| **M-08** | Medium | OPEN | Package 4 | Replace concatenated arguments with `ProcessStartInfo.ArgumentList` | Pending Package 4 | Command injection / space hazards |
| **M-09** | Medium | OPEN | Package 3 | Restrict extension manifest permissions and injection scope | Pending Package 3 | Excessive extension permissions |
| **M-10** | Medium | OPEN | Package 4 | Distinct format labels (container, codec, audio presence, bitrate) | Pending Package 4 | Ambiguous format labels |
| **L-01** | Low | **CLOSED** | Package 0 | Removed "2.0 PRO" / "Pro" text in `MainWindow.axaml` & `SettingsWindow.axaml` | Verified UI XAML | None; one free edition enforced |
| **L-02** | Low | **CLOSED** | Package 0 | Aligned README.md, AGENTS.md, launchers, and implementation plan to C# product | Verified documentation consistency | None |
| **L-03** | Low | **CLOSED** | Package 0 | Reconciled phase status and implementation plan; reopened unverified gates | Verified `PHASE_STATUS.md` | None |
| **L-04** | Low | OPEN | Package 3 | Structured redaction of launch arguments and diagnostics | Pending Package 3 | Potential sensitive URL logging |

## Exit-gate decision

**No.** No phase exit gate is approved by this audit. The next phase allowed to
start cannot be determined until `PHASE_STATUS.md` is reconciled with the plan
and the release-blocking regressions in already-claimed phases are resolved.

