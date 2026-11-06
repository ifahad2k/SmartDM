# Current development snapshot synchronization - 2026-11-06

## Branch and commit

Owner authorized committing the current Windows workspace and fast-forwarding both
`sdm2.0` and `sdm-v2` to the same C# development snapshot. This file is part of that
snapshot; obtain its hash with `git rev-parse HEAD`. Before synchronization both
remote heads were `ecbafc7f417d2086f3a32f4a848f165f0b074075`; local HEAD was
`48ec34c`, with three local commits and extensive uncommitted work.
Remote/local Java `main` was `b705fd0806bcfdd2a3935a23d54335789d1d6edf` and is outside
this publication. The initial push was rejected because the unpublished history contained a 171 MB
`docs/audits/2026-10-26/youtube-test.mp4` download. The complete original history
is preserved locally on `codex/local-before-source-sync-20261106`. The video
remains on disk and is now ignored; it has no source/test references. Publication
uses a new source snapshot commit whose parent is the unchanged remote `ecbafc7`
tip, consolidating the unpublished development content without sending the video.
No remote history is rewritten and no force push is used.

### Publication and CI follow-up

Both remote branches were verified at `fb945a79837a6c4ffd3b40f4aa75561dbf31919a`
after a successful atomic push. Java `main` remained `b705fd0`. The working tree
was clean. GitHub run 42263706241 failed during runner setup, before any source
tests: two existing workflow action hashes did not exist. This follow-up replaces
them with verified immutable v4 commits for `actions/upload-artifact` and the
official `gradle/actions/wrapper-validation` action. The setup-gradle reference was
also verified to exist. No application code or schema changed in this follow-up.
Action paths were checked against their official repository files and tag refs;
`git diff --check` passed. Remote execution results must be checked separately.

## Pre-existing dirty files

This snapshot intentionally includes the prior UI, engine, browser, cleanup,
website and documentation work that had never reached GitHub. Source files that
were untracked locally are included so a clean clone receives the complete app.
The entry status is listed below. Existing prototype images are retained. Build
outputs, installed dependencies, application history/cookies and local logs are
not publication inputs. The oversized local audit video is specifically excluded
from the publication tree while retained in the local backup history and on disk.
An accidental Chrome native-host JSON copy under the
Firefox folder was backed up to `%TEMP%/smartdm-publish-prep-20261106-172846` and
removed; Firefox uses its existing `io.smartdm.host.firefox.json`.

## Package and audit IDs addressed

Publication of prior Package 2/4/5 development work and the earlier cleanup/UI
changes; this does not close their package gates. Current preparation resolves
the HTTP negotiation test fixture and browser-specific packaging metadata.
See GOALS_3_4_HANDOFF.md, EXTENSION_MEMORY_HANDOFF.md and the earlier package
handoffs for detailed preceding implementation evidence.

## Files/modules changed

The snapshot contains the current Avalonia views/themes/view models, C# transfer
engine/recovery/safety/media/settings work, complete Chrome/Firefox discovery
modules, browser fixtures, earlier website auth cleanup and preserved prototypes.
The earlier Java FFmpeg path safety edits remain in this C# checkout; the Java
product worktree and branch are unchanged.

Latest media implementation, previously not recorded in a committed handoff:
- `HlsAes128.cs` validates identity AES-128 directives, rotating keys, explicit IVs
  and media-sequence IVs; bounded key fetches/caching and streaming CBC decryption
  run through native workers. Unsupported SAMPLE-AES/DRM and unsafe key URIs are
  rejected. Key bytes stay in memory and are erased on cache eviction/disposal.
- Playlist normalization accepts safe AES-128 and nonessential VOD metadata.
  Worker decryption precedes the existing image-wrapper normalization. Encrypted
  checkpoints are replayed because a stable key URI does not prove stable key bytes.
- `HttpTransferRequest.cs` applies HTTP/2 with HTTP/1.1 fallback to explicit probe,
  playlist, key and segment requests. Previous code forced HTTP/1.1, which the
  observed Animepahe CDN rejected. Platform TLS validation remains enabled.
- Browser MSE binding associates consumed network buffers with their actual
  SourceBuffer/player using weak maps; uncertain fragments stay excluded. The
  selected player's video/audio URLs replace unrelated tab-wide guesses.
- Dispatch preserves direct URLs and transport metadata, rejects an ordinary
  watch-page URL as a media fallback, and normalizes unknown filename extensions.
  The add dialog accepts a verified single format without requiring a guessed
  resolution or several menu rows.
- Existing menu rows now send the latest format collection/title after refresh.
  A regression test reproduced the previous stale closure that dropped a newly
  captured audio playlist while retaining its updated audio URL.

Preparation changes:
- The HTTP negotiation fixture explicitly creates a 128-bit key; .NET's AES
  default had produced 256 bits, correctly rejected by the production AES-128 gate.
- Firefox again uses background scripts, its Gecko ID and a minimum version 128
  for MAIN-world content scripts. Windows host registration targets Mozilla and
  the Firefox host manifest. Legacy Linux Firefox registration/unregistration now
  targets `.mozilla/native-messaging-hosts` and `allowed_extensions`, rather than
  Chrome paths/origins. Manifest asset/registration fixtures cover these fields.
  These are source/configuration repairs, not creation or execution of an installer.
- README gives the exact Linux C# launch command and Git branch update commands.

Browser packaging references: [Mozilla background documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
[Mozilla content-script compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/content_scripts.json).

## Schema migrations

No new migration in this preparation. The published snapshot includes prior
additive migrations through version 8, as recorded in GOALS_3_4_HANDOFF.md.

## Exact test commands and results

All new results below are local Windows observations on 2026-11-06:

- `dotnet restore SmartDm.sln --artifacts-path "$env:TEMP/smartdm-sync-validation" --verbosity quiet`: passed.
- `dotnet build SmartDm.sln --artifacts-path "$env:TEMP/smartdm-sync-validation" --no-restore --verbosity quiet`: passed, zero warnings/errors.
- With `SMARTDM_MEDIA_TESTS=1`, `dotnet test SmartDm.sln --artifacts-path "$env:TEMP/smartdm-sync-validation" --no-build --verbosity quiet`: **177 passed, 0 failed/skipped**, including four real checksum-verified FFmpeg/loopback media cases.
- `node --test tests/browser/*.test.cjs`: **77 passed, 0 failed/skipped** after packaging fixtures were added.
- `node --test smartdm-website/tests/auth-cleanup.cjs`: **13 passed, 0 failed**.
- In `smartdm-website`, `npm run build`: passed; Vite retains a large-bundle warning.
- `.\gradlew.bat check architectureTest integrationTest --console=plain`: passed;
  88 tasks were up-to-date and the configuration cache was reused. This is cached
  regression evidence in the C# checkout, not new proof of the separate Java branch.
- `git diff --check`: passed, with existing line-ending conversion warnings.
- Candidate publication file review found no private-key/common credential-token
  patterns, app databases/logs or new staged files over 5 MB. A subsequent full unpublished-history object audit
found the older 171 MB video described above; it is excluded from the new source
snapshot. This is a bounded credential
  check, not a complete security audit or proof of the older repository history.

## Manual verification

Earlier live checks: the owner confirmed Reanime began transferring after the
menu snapshot repair; the observed transfer was paused after roughly 43 MB and
had both video/audio snapshots. This is partial-transfer proof, not full episode
completion or audio playback proof.

For the observed Animepahe segment, a native .NET probe with the same URL and
captured Referer/User-Agent returned HTTP 200 over negotiated HTTP/2, while an
HTTP/1.1 request returned 403. The shared request policy was updated accordingly.
The updated engine has not yet completed a live Animepahe download. No fresh live
browser interaction was performed during this publication preparation.

## Privacy/security evidence

No user database, cookies, live key bytes, logs, private-key file or local diagnostic
output is intentionally included. Existing security gaps remain explicitly open.
No TLS acceptance bypass, yt-dlp, Java engine delegation, account/cloud feature,
telemetry or automatic execution of downloaded files was added. Both product
histories are preserved. No setup binary, release package or published release was
created; the owner's release deferral remains in force.

## Remaining limitations

This is a development snapshot, not a claim of IDM parity or universal extraction.
Gotaku/Anikoto encoded-playlist failures and live Bilibili/ani.pm behavior remain
unresolved/unverified. Live completion of Animepahe after HTTP negotiation repair
remains unverified. Captured fMP4/byte-range/complex encryption paths still need
coverage. Complete provenance, authenticated durable handoff and at-rest encryption
remain open. Linux runtime/browser/scanner/settings behavior needs Linux execution;
local Windows tests do not establish those results. Legacy native-host scripts
still contain Java compatibility launchers; C# transfers use the native C# engine
and browser loopback handoff. Do not treat all native-host migration work as closed.

## Exit gate fully satisfied

Product/package exit gates: **NO**. Source synchronization is a separate operation;
verify publication with `git ls-remote --heads origin sdm2.0 sdm-v2` and the final
commit hash. Do not infer release readiness from successful Git synchronization.

## Next allowed package

Continue the open transfer/security prerequisites and live media validation from
RESUME_HERE.md. Test the current source on Linux using:

```bash
dotnet run --project apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj
```

Do not create an installer/release artifact until the owner lifts that deferral.

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
 M apps/desktop-avalonia/Services/HlsMediaResolver.cs
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
?? apps/desktop-avalonia/Services/HlsAes128.cs
?? apps/desktop-avalonia/Services/HlsManifestSnapshot.cs
?? apps/desktop-avalonia/Services/HlsSegmentTransport.cs
?? apps/desktop-avalonia/Services/HttpTransferRequest.cs
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
?? docs/implementation/EXTENSION_MEMORY_HANDOFF.md
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
?? tests/SmartDm.Architecture.Tests/HlsAes128Tests.cs
?? tests/SmartDm.Architecture.Tests/HlsCaptureTests.cs
?? tests/SmartDm.Architecture.Tests/HlsPipelineIntegrationTests.cs
?? tests/SmartDm.Architecture.Tests/HttpNegotiationTests.cs
?? tests/SmartDm.Architecture.Tests/MonitorEvidenceTests.cs
?? tests/SmartDm.Architecture.Tests/Package2RegressionTests.cs
?? tests/SmartDm.Architecture.Tests/QueuePresentationTests.cs
?? tests/browser/
```
