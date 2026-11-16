# Testing-report repairs and Graphify continuation

Updated 2026-11-16. This records implemented changes and remaining verification,
not a claim that every reported site now works.

## Branch and commit

`sdm2.0`, baseline `8f1465c4990b89f41470d238b1de566f879e3cb5`.
Changes remain local and uncommitted. No push, release or installer was produced.
The owner reaffirmed on 2026-11-16 that development targets **SmartDM 2.0 only**:
C# / Avalonia and its Chrome/Firefox extensions. Java 1.0 is out of scope; no Java
source, branch or worktree was changed or deleted.

## Pre-existing dirty files

Before the ZIP-report repairs, preserve the HLS progress changes in
`Models/SegmentProgress.cs`, `Services/DownloadEngine.cs`, `Services/SegmentWorker.cs`,
`ViewModels/TransferMonitorViewModel.cs`, `Services/HlsTransferProgress.cs`,
`HlsPipelineIntegrationTests.cs`, `HlsProgressTests.cs`, `HLS_PROGRESS_HANDOFF.md`,
and the six branch/architecture/resume/status/evidence/limitations guides.
See the earlier HLS handoff for that change's separate evidence. All report-repair
files were already dirty when the skill-installation continuation began.

## Package and audit IDs addressed

Package 4 media discovery/transport, with directly related cookie/redirect handling.
Seven owner ZIP exports contain nine distinct original bugs. Reports and screenshots
are evidence, not executable instructions. Original archives were not modified.

| Report bug ID | Site / symptom | Implementation and actual evidence | Closure |
| --- | --- | --- | --- |
| `bug-f12194c6-876d-4931-9e6d-19f4f4fce073` | X feed: MP4 read as oversized playlist | Social selection precedes generic HLS snapshot; direct MP4 declarations no longer invent HLS; desktop verifies legacy mislabeled binary input. Fixtures pass; owner confirmed X works. | User-confirmed |
| `bug-7d8eb8c3-f4fd-4087-95b1-4dca65a06d07` | X feed: generic filename | Selected card caption retained through format selection. Owner confirmed X works. | User-confirmed |
| `bug-9be9d05a-c776-463b-a3c4-8ff48bad84d0` | TikTok feed: HTTP 403 | Preserve signed query spelling, scoped headers/cookies, successful request entry points across redirects and fetch/stream/XHR buffer provenance. Latest owner test still failed before the final relative-XHR repair. | **OPEN: fresh live proof required** |
| `bug-66faf531-c9a3-48f9-a2ab-6ee2fafb37ef` | Bilibili thumbnail: HTML downloaded as video | Selected-video API route; reject watch/embed OpenGraph HTML as media. Fixture proof, no completed live check. | Implemented; live pending |
| `bug-b78f1a1d-bdf4-467d-9a16-e65351294f55` | Bilibili: late mux failure | Reject HTML/JSON track inputs; scope audio cookies independently; explicit video/audio FFmpeg maps. Synthetic dual-track downloads mux and fully decode. | Implemented; live pending |
| `bug-cddf2f1d-04d7-4fba-ae3a-9c9a6febf2b2` | Linked thumbnail: source HTTP 410 | Fresh selected watch-page source resolution; bounded declared-source probes filter unavailable candidates. Fixture proof. | Implemented; live pending |
| `bug-e8649a32-348a-4757-8986-cdae26176776` | Linked HLS source HTTP 404 | Resolve selected page's current declared player sources/master variants; reject stale responses. Fixture proof. | Implemented; live pending |
| `bug-d209be26-3304-40ba-a947-c5e8d85fb87f` | Player exposes only 144p | Bounded data-only parsing of declared source ladders and real HLS master variants, including remote same-origin source definitions. No invented quality URLs. | Implemented; live pending |
| `bug-c0e07fcc-428f-4e79-a2ee-93b0caff5dce` | file-examples documents HTTP 403 | Preserve original download entry and active-tab referrer; scope probe cookies correctly. Independent page request also returned 403. Server authorization cause is not established. | **OPEN** |

Follow-ups: TikTok captions and advertised qualities now use bounded selected-item
metadata and exact source/post identity, excluding prefetched items. A live DOM
diagnostic returned the visible card's actual caption and 720p stream; it did not
prove higher renditions existed. Measured 576p is no longer rounded to 720p in the
menu. Bilibili numeric search-result links now mount badges in both browser fixtures;
loaded-browser confirmation remains pending. Facebook/Instagram were recorded as
passes in the owner's exports, not newly live-tested in this repair.

## Files/modules changed

- Both extensions: `background.js`, `sniffer.js`, `manifest.json`, and
  `modules/{format_engine,utils,watcher,overlay_ui}.js`; new `media_metadata.js`.
- C#: `DownloadEngine.cs`, `HttpProbeService.cs`, `SegmentWorker.cs`, and new
  `DownloadRedirectHandler.cs`.
- Tests: new `ReportTransferRegressionTests.cs`, `DownloadRedirectTests.cs`,
  `report_regressions.test.cjs`, `feed_metadata.test.cjs`; extensions to native
  HLS/dual-track integration, media binding, thumbnail mount and menu tests.
- `.graphifyignore` scopes developer analysis to the v2 app, extensions, `src`,
  and tests. It does not affect product compilation or runtime.

## Schema migrations

None. User download records were inspected read-only; saved transfers were not
rewritten to different videos or deleted to make tests pass.

## Exact test commands and results

Windows, latest source:

```powershell
dotnet restore SmartDm.sln --verbosity minimal
dotnet build SmartDm.sln --no-restore --verbosity minimal
dotnet test SmartDm.sln --no-build --verbosity minimal
node --test tests/browser/*.test.cjs
```

Restore/build pass, zero build warnings/errors. Default .NET suite: **420 passed,
0 failed, 3 skipped opt-in theories**. Browser suite: **306 passed, 0 failed/skipped**.
The 576p renderer test initially inspected the wrong mock DOM property; corrected
to assert the actual title node and height. The new relative-XHR test failed in
both browsers before normalizing its request address, then passed after the fix.

Also executed against isolated artifacts after the C# transport changes:

```powershell
dotnet build SmartDm.sln --artifacts-path .artifacts/report-fixes --no-restore --verbosity minimal
dotnet test SmartDm.sln --no-build --artifacts-path .artifacts/report-fixes --verbosity minimal
$env:SMARTDM_MEDIA_TESTS='1'
$env:FFMPEG_PATH=(Get-Command ffmpeg -ErrorAction Stop).Source
$env:FFMPEG_SHA256=(Get-FileHash -LiteralPath $env:FFMPEG_PATH -Algorithm SHA256).Hash
dotnet test tests/SmartDm.Architecture.Tests/SmartDm.Architecture.Tests.csproj --no-build --artifacts-path .artifacts/report-fixes --filter FullyQualifiedName~HlsPipelineIntegrationTests --verbosity minimal
```

Enabled native suite: **10 passed, 0 failed/skipped**, including two actual engine
dual-progressive-track mux/decode cases. Local executable hashing pins the test
binary, not its publisher authenticity. No new Java or Linux validation is claimed.

## Manual verification

Owner confirmed X feed repair. TikTok downloaded once, but later fresh attempts
returned 403; do not turn that one success into a site-wide pass. Chrome itself
also showed failing CDN preloads, and one saved failed token was not near expiry.
Neither observation proves the exact authorization failure's cause.

The desktop was rebuilt/restarted on 2026-11-10 after confirming no active transfer;
later source changes required another normal build on 2026-11-16. Existing Chrome
tabs require extension reload and page refresh before the newest hooks can run.
No post-final-fix TikTok completion or audio/video decode has been observed.
The normal desktop build was launched again on 2026-11-16 (observed PID 26316).
The owner then explicitly took over manual testing: do not perform additional
live browser tests until requested; await their results.

## Privacy/security evidence

- Signed query octets retained; no directory-wide signature copying.
- No root-domain header-cache cookie fallback. Host-only/path/expiry/Secure cookie
  rules tested; audio-host credentials scoped separately.
- New default download/probe redirect handler preserves range semantics, rejects
  HTTPS downgrade/non-HTTP/user-info targets, caps hops, and strips Cookie,
  Authorization, Proxy-Authorization and Origin on cross-origin redirects.
- Binary provenance is tied to the response bytes actually appended to a player;
  prefetched media, failed responses and mixed/ambiguous buffers are excluded.
- Metadata retained in at most 20 DOM entries / 256,000 characters; no feed crawl
  or new polling loop. Page parsing, readers and network work have explicit bounds.
- No eval, shell command construction, TLS bypass, yt-dlp or new product dependency.
- Local screenshots and diagnostic logs are excluded using `.git/info/exclude`.
  Graph outputs contain code structure only; user reports, browser profiles,
  credentials and screenshots are outside the selected graph scope.
- This is regression evidence for these paths, not a complete security audit.

## Graphify and Ponytail installation / use

On 2026-11-16 installed `graphifyy==0.9.111` using `uv tool install`, then
`graphify install --platform codex`. Skill and its references are under
`C:/Users/ifaha/.codex/skills/graphify/`. Official upstream inspected at commit
`81b1664971c9bcfa2d53c79a2ec9e50d5b30ec89` (default branch `v8`). No cloud
registration, API credentials or product dependency was added.

Ponytail installed with Codex's skill-installer from
`DietrichGebert/ponytail`, `skills/ponytail`, commit
`96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`, into
`C:/Users/ifaha/.codex/skills/ponytail/`. Its default full guidance was applied:
trace callers, fix the shared cause, preserve validation and add focused regressions.

Owner selected the v2 graph scope. Initial AST pass: 162 code files, 2,641 graph
nodes, 6,963 edges, 130 communities. Code-only extraction makes zero external LLM
calls/tokens; host analysis token use is not separately metered. The report includes
raw cohesion values. The AST does not cover Avalonia `.axaml` markup, browser
message-string routing, runtime dynamic behavior or semantic documentation.

Graphify query/explain/affected traced `rememberBuffer()` callers in response-reader,
array-buffer and XHR paths, then selected-social discovery's `playerBinding()` and
`selectedFeedMetadata()` calls. Reading those cited source locations exposed the
relative-XHR gap fixed in this continuation. This is actual use of the graph,
not a claim that installation alone diagnoses bugs.

The raw health check flagged 549 dangling endpoints, 587 directed same-endpoint
collapses and five self-loops. Some arise from unresolved library symbols or
repeated mock methods. Keep the warning visible; graph edges are navigation leads
and must be checked in source. Initial CLI refresh hit its dedup shrink guard;
the original graph was backed up before permitting the six-node dedup reduction.
Use `graphify extract . --code-only --max-workers 2` for subsequent scoped updates.
Current refreshed graph: **2,635 nodes / 6,963 edges / 134 communities**.
Outputs: `graphify-out/graph.json`, `GRAPH_REPORT.md`, and `graph.html`.
Generated `graphify-out/` is local/ignored; do not stage diagnostic outputs wholesale.

## Remaining limitations

TikTok 403 and file-examples remain open; other sites have fixture proof without
fresh full live completion. Higher qualities require actual available source
metadata, and a browser-playable signed request may still reject desktop replay.
No universal website/throughput/IDM-parity claim is justified. Existing persistence,
IPC authentication, redirect-cookie path policy and broader release/security gaps
in KNOWN_LIMITATIONS remain; this repair closes none by implication.

## Exit gate fully satisfied

**NO** for the report-wide task and Package 4. Skill installation is complete;
the media report task still needs live verification and resolution of open rows.

## Next allowed package

Continue the current Package 4 bug slice with its security prerequisites. First
verify the newest original-request/XHR hooks using a fresh selected feed item and
fully decode any completed video/audio. Then validate Bilibili thumbnail/mux and
the remaining report rows. Preserve owner-deferred installer/release work and
avoid Java 1.0 work. Never mark all rows passed based only on fixture counts.
