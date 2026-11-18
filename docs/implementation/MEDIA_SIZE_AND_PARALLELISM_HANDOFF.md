# Visible media size and progressive metadata — 2026-11-17

**Branch and commit:** `sdm2.0` / `6c915637b1dfa2453a3842e3223f895c8925510a`
plus working changes. No commit/push, installer or Java edits.

**Pre-existing dirty files:** Preserved prior C# security/structural/staging work,
browser drag/ownership/appearance changes, shared sources/bundles, tests/tooling
and guides. Edited existing dirty files in place; no reset/stash or bulk staging.

**Package and audit IDs addressed:** Owner-reported size/speed defect, bounded
Package 2/4 slice. No security audit finding closure or broad gate completion.

**Observed cause:** The menu redesign kept known sizes only in tooltips. The saved
reported transfer had unknown size/range support and 16 configured threads, but
the engine created one worker. The profile speed limiter was disabled. Live HEAD
and one-byte GET to the saved CDN source confirmed **686,329,621 bytes** and valid
206 ranges. This repair introduces no site-specific production rule.

**Files/modules changed:** DownloadEngine, HttpProbeService, SegmentWorker,
DesktopComposition; both overlay_ui.js copies; shared manifest_reader.js/runtime.js
and generated backgrounds; ProgressiveMetadataTests, Package2RegressionTests,
format_menu_updates/youtube_prefetch tests and new media_size_probe.test.cjs;
branch/architecture/resume/status/evidence/limitations guides.

## Implemented behavior

- File sizes are visible below qualities, with format text separate. Small known
  files are supported. Stream/paired estimates are marked `≈`. Converted MP3 and
  synthetic cover entries never inherit video byte counts. Unknown sizes remain
  explicit rather than fabricated.
- Missing progressive sizes resolve asynchronously without blocking choices.
  Replies must still match both selected video/audio URLs; size display does not
  change source snapshots, filenames or selection.
- Header probes use a one-byte GET, validate its Content-Range total (or an
  unencoded full-response length), and always cancel the body/abort afterward.
  They never read bodies. This replaces an old fetch that could keep receiving
  a full file when Range was ignored. Admission is four probes; cache is bounded
  at 64 identities/15 seconds; each referrer attempt has a 3.5-second budget.
  Documents, manifests/fragments and invalid/encoded totals are not file sizes.
- The engine receives an injected HTTP probe. Before progressive transfer with
  missing length or unverified range capability, a cancellable 15-second probe
  selects verified parallel ranges or sequential fallback. Accept-Ranges is
  optional; non-HTML HEAD responses get a one-byte GET verification. Existing
  HTML export handling remains intact.
- Unknown-length checkpoints cannot define newly known partitions and restart
  conservatively. Normal journal identity/hash validation remains. The model
  reports actual workers instead of an unused configured count.
- Sequential workers expose received Content-Length for progress and reject
  truncation against it. Successful genuinely unknown-length files acquire their
  measured final byte count. No eager allocation/integrity relaxation was added.

**Schema migrations:** None. New GET_MEDIA_SIZE is extension-internal, checked
against the sending extension identity, and returns only success/numeric size.
Existing browser/native download payloads remain unchanged.

**Exact test commands and results:** From repository root:

```powershell
$env:SMARTDM_PROFILE_DIR='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/media-size-profile'
$env:SMARTDM_STAGING_DIR=Join-Path $env:SMARTDM_PROFILE_DIR 'staging'
$env:SMARTDM_MEDIA_TESTS='1'
dotnet test SmartDm.sln --no-restore --verbosity minimal -p:BaseOutputPath='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/media-size-bin/'
node tools/build-extensions.cjs
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
node --check extensions/chrome/modules/overlay_ui.js
node --check extensions/shared/background/manifest_reader.js
node 'C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/media-size-browser-smoke.cjs'
git -c core.safecrlf=false diff --check
```

Final: **483 C# / 391 browser tests pass, zero failed/skipped**. Five new C# cases
verify actual concurrent range requests and byte-identical output, omitted length/
range advertisements, non-range fallback and learned-length truncation refusal.
Fifteen new browser cases verify visible sizes, late-reply identity, estimates/
conversion and bounded/coalesced body-cancelled probes. Existing HTML export,
recovery, sparse allocation, real media and security cases pass. The non-range
restart test distinguishes capability probes from transfer requests. Zero build
warnings/errors; bundles/syntax checks pass.

**Manual verification:** Synthetic Chrome renders the real menu with `654.5 MB`
and trusted Enter-key selection retains `Selected movie.mp4`. Toolbar/theme/
opacity and mocked-storage reload checks still pass; screenshot was inspected.
No real video was displayed or auto-executed.

Live header metadata was verified. Short range checks were discarded in memory,
with combined request ceilings of 34 MiB. One Python 8 MiB request measured about
2.3 MiB/s. Multi-connection Python and .NET HTTP/2-policy checks had timeouts/partial
successful workers, so they are **not a sustained before/after benchmark** and do
not establish IDM's reported 5 MB/s. No further bulk benchmarking was attempted.

After rechecking zero active/queued transfers, rebuilt the normal Debug app with
`dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore
--verbosity minimal` and restarted it. PID 25300 was responding; no active transfer
was interrupted. Installed extension still needs reload/page refresh.

**Privacy/security evidence:** Profile reads selected the reported capture and
printed only host/numeric/capability fields. No cookies or signed URLs were logged
or written into diagnostic input files. Live benchmark URLs traveled through stdin.
TLS validation, cookie scope, speed limiter, strict ranges, sparse staging and
destination safety remain. Probes cancel bodies; cache is memory-only. Local
Graphify query/AST refresh used no external semantic extraction/source upload.
Real history/staging were not bulk deleted.

**Remaining limitations:** Installed Firefox/live extension and sustained same-file
IDM comparison remain unverified. Protected/expired media can still have unknown
size. HLS/mux/conversion totals may be estimates; final MP3/cover bytes are not
inferred from other media. Probing adds setup latency; failure keeps sequential
fallback. Old unknown-length partials may restart when reliable metadata arrives.
Linux and prior package/release gates remain open.

**Exit gate fully satisfied:** YES for this Windows source defect slice; NO for
sustained CDN/IDM speed parity, installed-browser, broader package/release gates.

**Next allowed package:** Continue Package 2 and previously authorized prerequisites.
