# HLS progress and finite-playlist recovery — 2026-11-10

## Branch and commit

`sdm2.0`, baseline `8f1465c4990b89f41470d238b1de566f879e3cb5`.
Changes remain local and uncommitted. No push was performed in this task.
Java `main` remains at `b705fd0` in the separate Java worktree.

## Pre-existing dirty files

None at session entry. The changes listed here belong to this repair.

## Package and audit IDs addressed

Owner-requested Package 4 defect repair, related to Package 2 transfer accounting.
No new numbered audit IDs or package-wide closure is claimed.

The anisuge report showed downloaded bytes and percentage repeatedly decreasing,
network use without saved chunks, and misleading full worker bars. The old HLS
monitor summed completed bytes with mutable per-attempt bytes. Retrying a failed
attempt reset those bytes, and changing estimated total size could reverse percent.

## Files/modules changed

- `apps/desktop-avalonia/Services/HlsTransferProgress.cs`: thread-safe accounting
  separates received payload traffic (including retries) from verified saved chunks;
  duplicate completion callbacks are ignored. Resumed saved totals are retained.
- `Services/DownloadEngine.cs`: HLS speed uses received-byte deltas, while saved
  bytes use verified chunks only. Percentage uses known completed chunk count,
  capped at 99 until finalization. Estimated total size never clips saved bytes.
  Status exposes bounded retries. A session flag identifies parsed finite HLS.
- `Services/SegmentWorker.cs` and `Models/SegmentProgress.cs`: record reads,
  distinguish active/retrying workers, clear attempt bars after an attempt, use
  actual Content-Length or an unknown-length marker, dispose rejected responses,
  and avoid raw exception text in the modified HLS worker's errors/log messages.
- `ViewModels/TransferMonitorViewModel.cs`: show an amber retry state even when
  the server is still supplying bytes. Existing controls remain available.
- `tests/SmartDm.Architecture.Tests/HlsProgressTests.cs`: seven cases for concurrent
  and resumed accounting, retry traffic, response disposal, secret-safe worker
  errors, monitor state, and a real engine with an interrupted HTTP response.
- `HlsPipelineIntegrationTests.cs`: short finite uncaptured HLS coverage and
  retained long/captured/separate-audio coverage using real FFmpeg.
- Branch/architecture/resume/phase/evidence/limitations guides refreshed.

Paths under Services/Models/ViewModels above are relative to the desktop project.

The native integration checks initially exposed a second defect: captured fMP4
playlists stalled until the 25-second test deadline. FFmpeg was being told to
reconnect at normal EOF. That option is now omitted for captured playlists and
sessions already verified as finite HLS, including paired audio; existing reconnect
options for premature transport failures remain. Unknown/live inputs retain their
prior EOF policy. This matches the documented purpose of
[FFmpeg's HTTP reconnect_at_eof option](https://ffmpeg.org/ffmpeg-protocols.html#http).
The correction covers a shared transport path; it adds no site-name condition.

## Schema migrations

None. Browser protocol, extensions, database schema and Java product are unchanged.

## Exact test commands and results

Windows / .NET 9. Initial restore/build used isolated artifacts so the running
desktop executable was not replaced during the transfer:

```powershell
dotnet build SmartDm.sln --artifacts-path 'E:\skill\projects\smartdm\.artifacts\hls-progress' --no-incremental --verbosity minimal
dotnet build SmartDm.sln --artifacts-path 'E:\skill\projects\smartdm\.artifacts\hls-progress' --no-restore --verbosity minimal
dotnet test SmartDm.sln --no-build --artifacts-path 'E:\skill\projects\smartdm\.artifacts\hls-progress' --verbosity minimal
```

Final build: **0 warnings, 0 errors**. Default suite: **406 passed, 0 failed,
2 skipped opt-in media theories** (408 reported tests). The two skipped theories
expand into eight data cases when enabled:

```powershell
$env:SMARTDM_MEDIA_TESTS='1'
$env:FFMPEG_PATH=(Get-Command ffmpeg -ErrorAction Stop).Source
$env:FFMPEG_SHA256=(Get-FileHash -LiteralPath $env:FFMPEG_PATH -Algorithm SHA256).Hash
dotnet test tests/SmartDm.Architecture.Tests/SmartDm.Architecture.Tests.csproj --no-build --artifacts-path 'E:\skill\projects\smartdm\.artifacts\hls-progress' --filter FullyQualifiedName~HlsPipelineIntegrationTests --verbosity minimal
```

**8 passed, 0 failed/skipped** after the EOF correction. Fixtures generate synthetic
media and exercise actual engine/HTTP/referrer handling and audio/video decoding
after finalization, including TS, AES-128, wrappers and fMP4. The existing local
FFmpeg executable was pinned to its locally measured SHA for this test process;
this is not a claim of publisher authenticity. No FFmpeg was installed.

After the owner approved restart, normal launch output was rebuilt:

```powershell
dotnet restore SmartDm.sln
dotnet build SmartDm.sln --no-restore --verbosity minimal
git diff --check
```

Restore/build passed, **0 warnings/errors**; diff check passed. The already-passing
test suite was not repeated merely to relocate identical build output. Browser and
Java suites were not rerun: neither source set changed.

## Manual verification

- The old live attempt had **310 checkpointed TS chunks, 209,121,424 saved bytes**;
  a sampled chunk had a valid MPEG-TS signature. This was not a completed download.
- Native UI Pause All changed the active row to **Paused / 0 active**. The old
  FFmpeg child exited before the verified old desktop process was stopped.
- Rebuilt normal Debug output and started SmartDM at **2026-11-10 00:21:38 +06:00**,
  PID **8152**, from `apps/desktop-avalonia/bin/Debug/net9.0`.
- Observed the restarted Downloads window, preserved history and paused episode;
  all **310 .ts files and 310 .checkpoint files** remained. No transfer was resumed
  automatically, and no child FFmpeg remained at verification.
- Computer-use session was reset after verification. No browser interaction or
  extension reload was necessary for this C# repair.

## Privacy/security evidence

No credentials, cookies, tokens or signed media URLs are included here. The changed
HLS worker reports bounded error categories instead of raw exception text; a test
asserts a signed source token does not reach LastError. No TLS bypass, new network
service, telemetry, shell-based FFmpeg invocation or retry-limit removal was added.
This limited evidence does not close the repo's existing secrets/security gaps.

## Remaining limitations

- Full live completion and throughput of this anisuge episode on the new build
  remain unverified. Old attempts failed with HTTP 403. Later read-only probes
  also saw 403 but did not reproduce every browser header/cookie, so the exact
  cause (authorization, expiry or otherwise) is not established by those probes.
- Speed is actual received payload throughput and can fluctuate with the source.
  Saved progress intentionally advances only on verified chunk commits; retries
  can use bandwidth while saved progress stays unchanged. Percentage represents
  chunk completion, not a precise byte fraction; total bytes and ETA are estimates.
- No universal-site fix or guaranteed speed improvement is claimed. Retry limits,
  validation and existing HLS checkpoint recovery remain in place. FFmpeg fallback
  and multi-track aggregation still have their existing progress semantics.
- New Windows fixtures do not provide Linux/runtime/browser release certification.
  Existing Package 2/3/4/5 limitations remain; installer/release is owner-deferred.

## Exit gate fully satisfied

**NO** for the full package/live-site gate. Automated accounting/EOF regressions pass
and the tested build is running. Fresh live completion remains the next check.

## Next allowed package

Continue this Package 4 defect verification under the owner's explicit scope;
preserve Package 2/3 prerequisites and open gates. Resume the paused episode or
capture it afresh if its source rejects access. Check saved-chunk growth, final
output decoding and correct audio/video before claiming the live issue resolved.
Do not create an installer or publish branches without a separate task.
