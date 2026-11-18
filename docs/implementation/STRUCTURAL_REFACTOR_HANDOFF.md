# Graphify-guided structural refactor — 2026-11-17

## Result

| Area | Before | Current ownership |
| --- | --- | --- |
| DownloadEngine.cs | 3,969 lines | 2,951 lines; lifecycle and transfer orchestration |
| MainViewModel.cs | 1,740 lines | 1,434 lines; presentation and UI coordination |
| Browser background | Two hand-edited 3,156-line copies | One shared implementation in seven responsibility sections; browser bundles generated |
| Human graph | Thousands of symbols, tests and browser copies mixed together | 17 production components and 19 resolved cross-component call relationships |

This changes responsibility ownership, not just filenames or partial classes.
Services no longer depend on DownloadEngine for cookie, URL or request policy.
The view model requires injected services; construction is explicit in
`Composition/DesktopComposition.cs`. No service locator or DI framework was added.

## Implemented components

- `Services/DownloadJournalStore.cs`: journal serialization, source/validator
  matching, checkpoint validation and replay decisions.
- `Services/DownloadStaging.cs`: staging paths and cleanup; live-session ownership
  remains with the engine and is passed into orphan reconciliation.
- `Services/CookieHeaderPolicy.cs` and `StreamRequestPolicy.cs`: shared request
  policies; existing DownloadEngine entry points delegate for compatibility.
- `Services/HlsPlaylistReader.cs`: injected HTTP transport, bounded playlist
  reads, variants, audio references and native/fMP4 planning metadata.
- `Services/DownloadLookup.cs`: duplicate/source/path lookup. The view model
  retains collection synchronization around these calls.
- `DesignData/DemoDownloads.cs`: preview-only samples; normal mode remains separate.
- `extensions/shared/background`: metadata, bounded manifest reader, manifest
  parsers, desktop handoff, YouTube fallback, selected-page discovery and runtime
  capture/routing. Existing classic-script bindings and loading are preserved.

Use `node tools/build-extensions.cjs` after editing shared background sources.
`--check` and the browser suite reject stale Chrome/Firefox bundles. Keep browser
manifests and browser-specific packaging separate. Generated bundles are excluded
from Graphify so symbols are not counted three times.

## Graphify usage and limits

The existing graph was queried first, vocabulary expansion and source checks were
used, and the local AST graph was refreshed with:

```powershell
graphify reflect --if-stale
graphify query 'hls playlist journal initialize manifest' --budget 1000
graphify extract . --code-only --max-workers 2
graphify cluster-only . --no-label --no-viz
python tools/architecture_graph.py
```

Use Graphify's installed Python interpreter for the last command; this machine's
path is `C:/Users/ifaha/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe`.
The compact view is `graphify-out/architecture/architecture.html`; a copy is also
available at `graphify-out/graph.html`. The detailed query graph remains
`graphify-out/graph.json`. Original graphs were backed up before replacement.
`tools/architecture_graph.py` is reproducible developer tooling, not a runtime
dependency. It groups real source paths, omits tests/generated bundles, collapses
browser package copies for navigation, and includes only resolved extracted calls.

The full refreshed graph contains 2,856 nodes and 7,623 edges. Post-build diagnostics
report zero dangling/missing endpoints, six self-loops and 225 nodes without source
files. Extraction/merging can omit or collapse relationships; `.axaml` markup is
not parsed. Component groups are curated path rules, not a claim of complete runtime
architecture. The graph's larger symbol count is not evidence of worse coupling.
Generation used no semantic LLM calls or source upload. The interactive renderer
loads Mermaid from its existing CDN when viewed; the JSON/report remain local.

## Required session handoff

**Branch and commit:** `sdm2.0`, `6c915637b1dfa2453a3842e3223f895c8925510a`.
No commit, push, installer build or product-branch deletion performed.
Java worktree `main` remains at `b705fd0`.

**Pre-existing dirty files:** 39 paths at entry: Models/AiConfigModel and
DownloadModel; Program; Services/DownloadEngine, DownloadRedirectHandler,
HlsMediaResolver, HttpProbeService, ISettingsService, LocalIpcService, SegmentWorker,
SettingsService, SqliteDatabaseRepository and YouTubeMediaResolver; SettingsViewModel,
SettingsWindow markup/code; BRANCHES, CURRENT_ARCHITECTURE, audit repro Program,
KNOWN_LIMITATIONS, PHASE_STATUS, RESUME_HERE and TEST_EVIDENCE; DownloadRedirectTests,
HlsCaptureTests, HlsStreamingEstimationTests and TestFixtures; untracked
BoundedMetadata, BrowserProtocol, MediaTransportProxy, NativeMessagingBridge,
PrivateProfileFiles and ProfileSecretProtector; BrowserBoundaryTests,
MediaTransportSecurityTests, ProtectedStorageTests, SecurityRemediationTests;
security_boundaries.test.cjs and twitter_bugs_resolution.test.cjs. Preserved.

**Package and audit IDs addressed:** Owner-authorized structural cleanup of the
existing v2 transfer, composition and browser modules. Package 2 remains active.
No new security finding closure or complete target-layer migration is claimed.

**Files/modules changed:** Components listed above; engine/service callers;
MainViewModel, App and diagnostic composition; existing construction-site tests;
new RefactoringBoundaryTests; shared browser sources/bundler and parity/parser tests;
Graphify ignore rules, overview generator/tests, AGENTS and implementation guides.

**Schema migrations:** None added. Existing migration 9/security changes preserved.

**Exact test commands and results:** Fresh pre-edit baseline: 464 C# cases pass.
Final environment uses `SMARTDM_PROFILE_DIR` set to the isolated
`.../01a178f9-dae7-7c71-87be-f0a77ae6d160/refactor-profile`,
`SMARTDM_STAGING_DIR` set to its `staging` child, and `SMARTDM_MEDIA_TESTS=1`.

```powershell
dotnet restore SmartDm.sln --verbosity minimal
dotnet build SmartDm.sln --no-restore --verbosity minimal -p:BaseOutputPath='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/refactor-bin/'
dotnet test SmartDm.sln --no-build --verbosity minimal -p:BaseOutputPath='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/refactor-bin/'
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
python -m unittest discover -s tests/tools -p 'test_*.py'
git diff --check
```

Restore/build pass with zero warnings/errors; **468 C# cases pass**, including
12 real synthetic FFmpeg controls; **335 browser cases pass**; **two graph-tool
tests pass**; bundle freshness and diff checks pass. Four new desktop controls
exercise reader independence/cookie scope, recovery compatibility, injected
composition and source identity. Two browser controls check generated parity and
standalone parsing without browser APIs. Python controls reject test/dangling/
inferred relationships and collapse repeated edges. Earlier intermediate builds
and the existing 464-case suite also passed after extraction.

**Manual verification:** No live app/UI/browser/site testing. Existing real native
host and media execution tests ran through the full suite. Real user profile and
running transfer were not replaced. No broad performance improvement is claimed.

**Privacy/security evidence:** Existing credential, TLS, IPC, persistence and
media regression tests pass. Dependency moves preserve bounds, cancellation,
validation, parser refusals and error paths. Graph processing was local/code-only.

**Remaining limitations:** DownloadEngine still owns multi-mode media-session
orchestration; MainViewModel still owns UI lifecycle/filtering and callbacks.
This reduces concentrated responsibilities without completing the planned assembly
split. Linux, installed-host, live-site and memory/performance verification remain
open, alongside earlier SQLCipher/durable-handoff/package limitations.

**Exit gate fully satisfied: NO** for package/release closure. This structural
slice's automated verification passes.

**Next allowed package:** Continue Package 2 and its existing prerequisites;
preserve the authorized security changes and new shared-source browser workflow.
