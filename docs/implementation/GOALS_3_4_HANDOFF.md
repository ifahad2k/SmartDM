# Goals 3 and 4 runtime handoff — 2026-11-04

## Scope and authority

Goal 3 means Package 4, honest/recoverable media. Goal 4 means Package 5, trustworthy product behavior/release, as defined in docs/audits/2026-11-03/CSHARP_BROWSER_REVIEW.md. The owner explicitly authorized this work and subsequently **deferred setup-file/installer and release-package creation until development is finished**. No setup file, installer, release archive or published release was produced. Both product tracks remain preserved. No Java or yt-dlp runtime was added.

This is an implementation handoff, not a declaration that either complete package gate is closed. Prerequisite Package 2/3 gaps and unperformed platform/browser checks still prevent that claim.

## Implemented behavior

### Goal 3

- R04: HLS exhausted-retry failure cancels sibling workers, including a worker waiting on an empty queue. It preserves a causal failure instead of waiting indefinitely.
- R08: Media range workers now require exact Content-Range start/end/total evidence before writing, and fresh media backing files are truncated to the selected size. HLS segment checkpoint records contain representation/playlist identity fingerprints, flushed length, SHA-256, strong remote ETag and wire length. Reuse requires fresh HEAD evidence matching the strong ETag and wire length plus a matching local hash. Missing, weak, changed or unverified evidence causes a fresh transfer. Signed URL/playlist changes invalidate reuse. Old dual/audio CSV part ledgers are discarded on restart; those paths restart safely rather than trusting unverified ranges. This is intentionally not a claim of efficient dual-stream resume.
- R09: Immutable migration 7 persists original source page and exact format ID. Existing migrations 5/6 from the preceding anime repair remain intact.
- R11/R12: Removed synthetic Facebook quality ladders and selectable provisional YouTube resolution rows. Real representation IDs replace stale URLs. Equal-height codec/container choices remain distinct. Bitrate alone no longer supplies a manifest resolution.
- R13: Generic tab-wide network candidates require an actual selected HTTP source match; blob players require explicit binding/captured playlists. Result formats carry asset identity, and incoming asset identity discards another asset's cached rows. Full tab/frame/document/player provenance remains incomplete.
- R14: YouTube routing validates exact approved hosts and an 11-character video ID. Unrelated `?v=` and lookalike hosts fail.
- YouTube representation IDs now include the actual stream/container/audio identity instead of resolution alone. An expired YouTube URL with a persisted canonical source is refreshed with the cache bypassed and the same exact representation required. Missing or ambiguous representations require a new selection; the app does not silently substitute 1080p or the first row.
- Media post-processing validates required video/audio tracks with the checksum-verified FFmpeg before the safety scan and promotion. Process-output tails are bounded. Playlist bodies have a size and read-time budget.
- Manual refresh is serialized with transfer commands, requires a stopped transfer and the same resource path, rejects non-HTTP schemes/embedded credentials and requires complete recapture for paired/captured media.
- The preceding anime changes are included in this working tree: player-decoded HLS capture, selected audio capture, extensionless HLS routing, bounded clear-playlist validation, image-wrapped HLS transport decoding and paired-track muxing. That preceding session's live Reanime partial transfer is historical evidence; this session did not establish new live compatibility.

### Goal 4 runtime slice

- R18: Safety results distinguish not scanned, scanner unavailable, scan failed, no threats detected, suspicious filename and reported malware. Missing files and unavailable/failed scans never claim clean. Scanner execution uses fixed paths, argument arrays, a time budget, bounded-memory output drains and joined cancellation.
- Threat output is retained under a managed quarantine path with a `.blocked` extension. Existing destination bytes are preserved, including when the user confirms deleting a quarantined download; only its blocked payload is removed. Scanner failure retains staging for recovery. Opening through the changed main/completion actions requires completed status.
- Migration 8 persists scanner verdict/details/name and quarantine location. Completion details use recorded evidence; default/advanced UI text no longer asserts SQLCipher encryption, HTTP/3, DNS-leak prevention, sandboxing or measured upstream speed without evidence.
- R15: Move/rename runs through an engine command gate and application service. Active owners/quarantined downloads and collisions are rejected. Filesystem work runs off the UI thread, paused backing files are renamed, metadata is saved after success and persistence failures attempt rollback. This is not a crash-atomic cross-volume move protocol.
- R17: Update selection requires a newer stable `sdm2-vMAJOR.MINOR.PATCH` tag, exact runtime asset name/architecture, HTTPS release location, expected size and SHA-256 digest from GitHub release metadata. Unknown tracks, downgrades and missing digests fail closed. Downloads use unique temporary directories, bounded metadata/body handling and checksum verification. The method prepares a verified archive for review and never automatically executes it. It does not create an installer or implement unattended upgrades.
- R19: Transfer sessions have a bounded scheduler: four total downloads, two per source host, with cancellation of waiters. Settings writes are atomic and failures propagate. Saved default folder/segment count reach Add Download, probe timeout uses the saved value, Close to Tray is honored, and startup registration avoids shell argument strings. Many broader settings/scheduling requirements remain outstanding below.
- R20: The normal history list now uses an explicitly virtualized ListBox. Automatic personal-folder catalog scanning was removed from construction. This is not measured 1k/10k responsiveness proof or full UI-thread-affinity remediation.
- R22: Diagnostic entry points allocate an isolated profile/staging root. Repository/settings/catalog/startup-log defaults honor the selected profile. The staging diagnostic no longer sweeps user partials. The child-process recovery test explicitly supplies its test profile. Live engine IDs are protected from orphan cleanup across simultaneous engine instances.
- Browser fixture tests are now a Windows/Linux CI step. CI was edited, not remotely executed.

## Verification

Local Windows commands on 2026-11-04:

```powershell
$env:SMARTDM_MEDIA_TESTS='1'
dotnet test SmartDm.sln --artifacts-path "$env:TEMP\smartdm-goals34" --verbosity quiet
node --test tests/browser/*.test.cjs
dotnet build SmartDm.sln --artifacts-path "$env:TEMP\smartdm-goals34" --no-restore --verbosity quiet
git diff --check
```

Results: **156 .NET tests passed, zero failed/skipped**, including two real FFmpeg/loopback synthetic-media cases; **40 browser fixtures passed**; build **zero warnings/errors**; diff check passed. Real media tests are opt-in; ordinary CI without `SMARTDM_MEDIA_TESTS=1` does not provide that proof. Source-only fixture tests do not establish loaded extension behavior. No new dependency was required for this slice.

New regressions cover exact host routing, scanner result cases, physical quarantine/destination preservation, persistent safety/source evidence, HLS failure coordination, checkpoint identity/hash/validator rejection, scheduler bounds/cancellation, move collisions/partial backing rename, same-resource refresh, settings roundtrip and update track/version/architecture/digest/corruption handling. Browser cases cover empty provisional menus, same-height representations, stale URL replacement and unknown resolution.

## Remaining work / gate status

- Package 4 gate: **NO**. Full authenticated media re-resolution for arbitrary sites, efficient validator-backed dual/audio range recovery, full multi-frame/recycled-player provenance and live Chrome/Firefox coverage remain incomplete. Captured fMP4/map/byte-range/separate-audio combinations and DRM/live streams are not broadly proven. Do not advertise universal site support.
- Package 5 gate: **NO**. Setup/install/upgrade/uninstall work is explicitly deferred by the owner. Linux runtime/remote CI and loaded-browser proof, advanced-history virtualization, measured 1k/10k responsiveness, complete UI-thread-affinity review, full settings-to-network retry/idle/proxy policy, timed queue scheduling, automatic-update preferences/language behavior and architecture extraction remain incomplete.
- Package 3 prerequisite remains open: database encryption, secret storage, browser authentication/durable handoff and complete cookie/redirect scope. Only the unrelated-domain Netscape cookie fallback was removed here; raw cookies and the bridge are not thereby made secure. Release remains blocked.
- Package 2 remains open as previously documented. The new default concurrency cap is not a complete calendar/queue scheduler or an IDM benchmark.
- The existing legacy Java installer sources were not rebuilt or modified; they are not C# release artifacts. Do not run them to package the C# product.
- No user's running download was restarted or stopped during this session. Validation used isolated artifacts; the regular app/loaded extension are not automatically refreshed into these edits.

## Required session handoff

Branch and commit: sdm2.0 / 48ec34c; no commit, merge, push or publication.
Pre-existing dirty files: extensive desktop/models/services/views, Chrome/Firefox capture modules, docs, tests, Java, website, prototypes and launchers already dirty/untracked on entry; retained. Use Git status and the earlier audit captures before staging anything.
Package and audit IDs addressed: Goal 3/Package 4 R04, R08/R09, R11–R14; Goal 4/Package 5 R15, R17/R18 and partial R19–R22. Owner deferred installer/release work.
Files/modules changed: new MediaCheckpoint, MediaRepresentation, MediaOutputVerifier, ProcessOutput, TransferScheduler, ScannerProcessRunner, AppProfile and DownloadDestinationService; production engine/worker/resolver/repository/scanner/settings contracts; Add Download/main/settings/completion view models and relevant views; both format engines; CI; regression tests and these guides.
Schema migrations: 7 selected source/format; 8 safety evidence/quarantine. Migrations 1–6 preserved.
Exact test commands and results: above; 156 .NET / 40 browser; build zero warnings/errors.
Manual verification: source tracing and real FFmpeg/loopback test output; no fresh live-site, loaded browser, installer or Linux manual verification.
Privacy/security evidence: no real cookies in fixtures, only mock/scoped local servers; verified external binary; no TLS bypass, shell-built scanner arguments, automatic update execution or fake clean fallback. No user profile migration performed by isolated tests.
Remaining limitations: above; not a security-complete release.
Exit gate fully satisfied: NO.
Next allowed package: finish prerequisite Package 2/3 proof and the recorded Package 4/5 runtime gaps; keep installer/release creation deferred until owner resumes it.
