# Extension memory lifecycle handoff - 2026-11-04

## Branch and commit

`sdm2.0` at `48ec34c`, plus existing uncommitted work. Java `main` remains at
`E:/skill/projects/smartdm-java`; no branch/history changes, commits or pushes.

## Pre-existing dirty files

The checkout was extensively dirty before this task, including both extension
backgrounds/manifests/coordinators, untracked extension modules/sniffers, desktop,
tests, documentation and website changes. Exact entry status is preserved below.
Only the files in the changed-modules section were edited for this task.
Local before-copies of the three main edited source files per browser are at
`C:/Users/ifaha/AppData/Local/Temp/smartdm-extension-memory-20261104-215810`.

## Package and audit IDs addressed

Owner-requested browser resource repair within Package 4, with Package 5 product
behavior implications. Session finding IDs (not claims that broader audit gates closed):

- EXT-MEM-01: Per-card copies of the entire overlay stylesheet. Both player and
  thumbnail hosts adopt one constructed stylesheet per document when supported.
  Unsupported environments retain inline CSS. The source CSS is 3,816 characters;
  a 1,000-host fixture now shares one sheet instead of 1,000 copies. This is a
  structural allocation comparison, not a Chrome RAM benchmark.
- EXT-MEM-02: Nested removals retained player/thumbnail maps until later scrolling
  or media insertion. Removal-only mutations now prune disconnected mounts,
  remove player handlers/fullscreen subscriptions/observer targets, stop polling
  and release the player cache. Readiness listeners use a WeakMap to prevent
  repeated listener sets during scans. Reattached players can mount again.
  Removal cleanup avoids layout reads for connected thumbnail cards.
- EXT-MEM-03: Discovery insertion paths bypassed cache pruning; Facebook's
  15-second cache entries were never removed. Format/height caches now prune on
  discovery insertion (30 asset keys/50 heights); Facebook cache is capped at 20
  keys and expired entries are removed on subsequent cache activity. Completed
  result cache retains 30 keys; pending requests are allowed to finish.
- EXT-MEM-04: Every poll could overwrite an outstanding lookup and start more
  work. Background polls now reuse the pending lookup without adding callbacks.
  Lookup responses complete only their own entry, including after invalidation.
  Probe deduplication covers the full desktop fallback; fallback waits expire
  after 20 seconds. Player/thumbnail callbacks verify their exact host ownership
  and active popover before updating UI. Opening another popover stops prior polls.
- EXT-MEM-05: XHR reuse accumulated load handlers, including for ordinary APIs.
  Manifest XHRs now get one handler per XHR object; ordinary API requests get none.
  Fetch sniffing reads at most 500,000 bytes per response, with four concurrent
  readers and a five-second deadline. Only the extension's cloned response branch
  is cancelled; the original response is returned to the player. In-page variant
  probes are also limited to 500,000 bytes with their 3.5-second timeout covering
  the body, and clear timeout handles on failure as well as success.
- EXT-MEM-06: Decoded HLS captures were copied into generic manifest discovery,
  triggering needless reprobes. Player-bound events carry an ID and refresh
  existing popovers; their bounded DOM snapshot remains available for repeated
  downloads and selected audio pairing. Identical player snapshots emit once.
  Generic manifest discovery is preserved. Duplicate SPA navigation scan timers
  are coalesced to the latest two scheduled scans.

## Files/modules changed

Mirrored source changes in `extensions/chrome` and `extensions/firefox`:
`modules/watcher.js`, `modules/format_engine.js`, `sniffer.js`, `smartdm_overlay.js`.
No manifests, permissions, background scripts, host installers or C# files edited.

Tests: new `tests/browser/memory_lifecycle.test.cjs`; additional HLS capture test
in `hls_capture.test.cjs`. Existing anime fixture now supplies the real DOM
`removeEventListener` API. Thumbnail/YouTube positioning assertions inspect the
resulting inline position instead of assuming a particular CSS serialization.
Inline thumbnail positioning deliberately overrides adopted stylesheet source order.
Guides/evidence: BRANCHES, CURRENT_ARCHITECTURE, RESUME_HERE, PHASE_STATUS,
TEST_EVIDENCE, KNOWN_LIMITATIONS and this report.

## Schema migrations

None.

## Exact test commands and results

- `node --test tests/browser/*.test.cjs`: **66 passed, 0 failed, 0 skipped**;
  exit code 0. Original suite was 40; 26 additional cases cover both browser copies.
- `node --check` for each of the four changed JavaScript sources under each
  browser: **8 syntax checks passed**.
- Byte comparison of those Chrome/Firefox source pairs: **4 pairs match**.
- `git diff --check`: passed (Git reports existing CRLF conversion warnings).
- Structural stress cases: 500 replacements of the same player leave zero player
  handlers, retained hosts or intersection targets after every removal; 1,000
  readiness scans retain four listeners; 1,000 discoveries respect cache caps;
  100 polls issue one pending lookup; oversized chunked streams stop after the
  sixth 100,000-byte read without copying the full response; 1,000 unchanged HLS
  events emit one notification while retaining the downloadable snapshot.
- No C# source changed; .NET/Gradle tests were not rerun for this browser-only task.
  Prior .NET evidence remains in GOALS_3_4_HANDOFF.md and is not new evidence here.
- Test TAP output: `%TEMP%/smartdm-extension-memory-tests.tap` (local diagnostic).

## Manual verification

No live browser reload, Chrome heap snapshot, UI download or before/after RAM
measurement performed in this task. The running extension does not automatically
reread changed files. Reload SmartDM Integration in `chrome://extensions`, then
refresh open media pages to replace both content-script worlds.

For a comparable memory check, use Chrome Task Manager (Shift+Esc), record the
SmartDM extension and the same media tab(s), browse/scroll the same feed, remove
or navigate away from posts, then allow idle time and compare over repeated runs.
Content-script allocations reside with page renderer processes as well as the
extension's own process, so the extension row alone is incomplete. Verify one
selected-video download with audio and repeated clicks on the same anime player.
Reloading clears existing stale allocations; steady-state comparison must follow
similar browsing time and page content. A RAM percentage is not established.

## Privacy/security evidence

No new permissions, external service, telemetry, logs, persistent media cache or
machine setting. No cookie/header policy, TLS bypass, executable invocation,
automatic downloaded-file opening, Java runtime or yt-dlp added. Selected-video
identity, container/codec distinctions, HLS snapshot/audio pairing and handoff
acknowledgement regression tests pass. These tests do not close pre-existing
Package 3 encryption/authenticated durable handoff gaps.

## Remaining limitations

The generic fetch sniffer skips new clone reads while four are in flight and
rejects over-budget/slow responses; player-bound HLS and background network
observation remain independent paths. The existing three-stash limit remains.
Bounded clone text does not bound Chrome's own player buffers or a site's JS heap.
Background discovery still has separate response-fetch paths not changed by this
slice. Existing background count caps do not constitute a complete memory audit.
Open popovers continue polling for newly discovered real formats, and connected
feed cards retain their small badge DOM. No live Firefox/Linux or complete site
compatibility proof. Installed extension version/manifest is unchanged.
No setup, installer or release package created; the owner's deferral still applies.

## Exit gate fully satisfied

**NO**. The bounded lifecycle fixes and local tests are complete; real-browser
memory and compatibility validation plus broader Package 4/5 prerequisites remain.

## Next allowed package

Validate this browser repair in the loaded extension, then follow the prior
handoff's open Package 2/3 prerequisites before declaring Package 4/5 closure.
Do not produce an installer or release artifact as the next step.

## Entry working-tree status

```text
 M .github/workflows/ci.yml
 M .gitignore
 M AGENTS.md
 M README.md
 M apps/desktop-avalonia/App.axaml
 M apps/desktop-avalonia/App.axaml.cs
 M apps/desktop-avalonia/Controls/MiniProgressBar.cs
 M apps/desktop-avalonia/Controls/SegmentVisualizerControl.cs
 M apps/desktop-avalonia/Controls/SparklineControl.cs
 M apps/desktop-avalonia/Models/DownloadModel.cs
 M apps/desktop-avalonia/Models/MediaFormatItem.cs
 M apps/desktop-avalonia/Models/ProbeResult.cs
 M apps/desktop-avalonia/Models/SegmentProgress.cs
 M apps/desktop-avalonia/Program.cs
 M apps/desktop-avalonia/Services/DownloadEngine.cs
 M apps/desktop-avalonia/Services/FileCatalogService.cs
 M apps/desktop-avalonia/Services/HttpProbeService.cs
 M apps/desktop-avalonia/Services/IDatabaseRepository.cs
 M apps/desktop-avalonia/Services/IDownloadEngine.cs
 M apps/desktop-avalonia/Services/ILocalIpcService.cs
 M apps/desktop-avalonia/Services/ISafetyScanner.cs
 M apps/desktop-avalonia/Services/ISpeedLimiter.cs
 M apps/desktop-avalonia/Services/LocalIpcService.cs
 M apps/desktop-avalonia/Services/SafetyScannerService.cs
 M apps/desktop-avalonia/Services/SegmentWorker.cs
 M apps/desktop-avalonia/Services/SettingsService.cs
 M apps/desktop-avalonia/Services/SqliteDatabaseRepository.cs
 M apps/desktop-avalonia/Services/UpdateCheckerService.cs
 M apps/desktop-avalonia/Services/YouTubeMediaResolver.cs
 M apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs
 M apps/desktop-avalonia/ViewModels/CompletionInspectorViewModel.cs
 M apps/desktop-avalonia/ViewModels/MainViewModel.cs
 M apps/desktop-avalonia/ViewModels/SettingsViewModel.cs
 M apps/desktop-avalonia/ViewModels/TransferMonitorViewModel.cs
 M apps/desktop-avalonia/Views/AddDownloadDialog.axaml.cs
 M apps/desktop-avalonia/Views/CompletionInspectorWindow.axaml
 M apps/desktop-avalonia/Views/CompletionInspectorWindow.axaml.cs
 M apps/desktop-avalonia/Views/DuplicateFoundDialog.axaml
 M apps/desktop-avalonia/Views/DuplicateFoundDialog.axaml.cs
 M apps/desktop-avalonia/Views/FileCollisionDialog.axaml
 M apps/desktop-avalonia/Views/FileCollisionDialog.axaml.cs
 M apps/desktop-avalonia/Views/MainWindow.axaml
 M apps/desktop-avalonia/Views/MainWindow.axaml.cs
 M apps/desktop-avalonia/Views/MoveRenameDialog.axaml.cs
 M apps/desktop-avalonia/Views/RefreshLinkDialog.axaml.cs
 M apps/desktop-avalonia/Views/SettingsWindow.axaml
 M apps/desktop-avalonia/Views/TransferMonitorWindow.axaml
 M apps/desktop-avalonia/Views/TransferMonitorWindow.axaml.cs
 M docs/audits/2026-10-26/SMARTDM_FULL_BUG_AUDIT.md
 M docs/implementation/KNOWN_LIMITATIONS.md
 M docs/implementation/PHASE_STATUS.md
 M docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md
 M docs/implementation/TEST_EVIDENCE.md
 M extensions/chrome/background.js
 M extensions/chrome/manifest.json
 M extensions/chrome/smartdm_overlay.js
 M extensions/firefox/background.js
 M extensions/firefox/host/host.bat
 M extensions/firefox/host/install.bat
 M extensions/firefox/host/uninstall.bat
 M extensions/firefox/manifest.json
 M extensions/firefox/smartdm_overlay.js
 M modules/media-ytdlp/src/main/java/io/smartdm/media/ytdlp/LocalMediaToolManager.java
 M modules/media-ytdlp/src/test/java/io/smartdm/media/ytdlp/NativeDirectExtractorTest.java
 M smartdm-website/src/context/AuthContext.tsx
 M tests/SmartDm.Architecture.Tests/TestFixtures.cs
 M tests/SmartDm.Architecture.Tests/TransferIntegrityTests.cs
?? apps/desktop-avalonia/Models/CrashReport.cs
?? apps/desktop-avalonia/Services/AppProfile.cs
?? apps/desktop-avalonia/Services/DownloadCommandGate.cs
?? apps/desktop-avalonia/Services/DownloadDestinationService.cs
?? apps/desktop-avalonia/Services/HlsManifestSnapshot.cs
?? apps/desktop-avalonia/Services/HlsSegmentTransport.cs
?? apps/desktop-avalonia/Services/MediaCheckpoint.cs
?? apps/desktop-avalonia/Services/MediaOutputVerifier.cs
?? apps/desktop-avalonia/Services/MediaRepresentation.cs
?? apps/desktop-avalonia/Services/ProcessOutput.cs
?? apps/desktop-avalonia/Services/ScannerProcessRunner.cs
?? apps/desktop-avalonia/Services/SegmentCheckpointHash.cs
?? apps/desktop-avalonia/Services/TransferScheduler.cs
?? design-prototypes/
?? docs/BRANCHES.md
?? docs/CURRENT_ARCHITECTURE.md
?? docs/README.md
?? docs/adr/ADR-010-preserve-product-tracks.md
?? docs/audits/2026-11-03/
?? docs/implementation/BRANCH_DOCUMENTATION_HANDOFF.md
?? docs/implementation/GOALS_3_4_HANDOFF.md
?? docs/implementation/PACKAGE2_LIFECYCLE_HANDOFF.md
?? docs/implementation/PACKAGE2_RELIABILITY_HANDOFF.md
?? docs/implementation/REPOSITORY_CLEANUP.md
?? docs/implementation/REPOSITORY_CLEANUP_INVENTORY.json
?? docs/implementation/RESUME_HERE.md
?? docs/implementation/SOCIAL_MEDIA_FOLLOWUP.md
?? extensions/chrome/modules/
?? extensions/chrome/sniffer.js
?? extensions/firefox/host/io.smartdm.host.json
?? extensions/firefox/modules/
?? extensions/firefox/sniffer.js
?? run-app.bat
?? run-app.ps1
?? smartdm-website/tests/auth-cleanup.cjs
?? tests/SmartDm.Architecture.Tests/DownloadLifecycleTests.cs
?? tests/SmartDm.Architecture.Tests/FileNameDecodingTests.cs
?? tests/SmartDm.Architecture.Tests/Goals34RegressionTests.cs
?? tests/SmartDm.Architecture.Tests/HlsCaptureTests.cs
?? tests/SmartDm.Architecture.Tests/HlsPipelineIntegrationTests.cs
?? tests/SmartDm.Architecture.Tests/MonitorEvidenceTests.cs
?? tests/SmartDm.Architecture.Tests/Package2RegressionTests.cs
?? tests/SmartDm.Architecture.Tests/QueuePresentationTests.cs
?? tests/browser/
```
