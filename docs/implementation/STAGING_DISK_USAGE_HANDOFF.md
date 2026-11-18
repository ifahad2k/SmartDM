# Preview isolation and staging disk usage — 2026-11-17

## Problem and verified cause

The owner reports that another agent removed approximately 94 GB of Debug/Release
staging data. That deletion and exact historical physical usage were not repeated
or independently measured in this session. The source defects are confirmed:
preview items had real engine callbacks and could enter SQLite history; staging
defaulted to binary-local `.temp`; ordinary and paired media eagerly called
`SetLength(remoteSize)`. Starting preview mode alone does not establish that a
download ran—monitor/resume and persisted queue paths were the dangerous boundary.

The current real profile contains **132 rows** matching the two large legacy mock
sources, sizes and mock hash/ETag signatures. These counts were obtained read-only;
no credentials, private URLs or history contents were exported.

## Fix

- All design samples carry `IsPreview` and `preview-` IDs. The default preview
  engine refuses real transfer/file operations, even for an unmarked item.
  Explicitly injected engines also reject preview models. Preview callbacks,
  add-download and monitor actions do not persist or start samples.
- `PreviewTransfers` recognizes all five historical mock signatures using source
  plus size plus mock hash/ETag, never filenames alone. Loaded legacy rows are
  marked preview and nonterminal ones show a disabled failure state, preventing
  automatic queue/resume. Existing terminal scanner states are retained. Saving a
  preview directly through SQLite is rejected before initialization or writes.
  The rows are not silently deleted and no schema migration was added. Users can
  remove them from history; permanent file deletion is hidden for previews and
  rejected by the destination helper even if called directly. A real file at a
  sample save path is preserved.
- `--demo`, snapshots and diagnostics use isolated profiles. The preview window
  title explicitly says downloads are disabled.
- New staging uses `<AppProfile.DirectoryPath>/staging`, normally
  `C:/Users/ifaha/.smartdm/staging` here. Debug and Release share it. The explicit
  `SMARTDM_STAGING_DIR` override remains supported for isolated execution.
- Existing partials in the known binary-local or LocalApplicationData legacy
  roots resume in place, including the sibling Debug/Release root. They are not
  copied across drives. Existing orphan age/ownership preservation remains;
  cleanup skips unrelated folder names and reparse-point directories.
- All four eager `SetLength` sites are removed. `StagingFile` starts files empty,
  marks Windows files sparse before out-of-order writes, and only truncates when
  an existing stale tail is longer than the expected resource. It never extends
  a file to the advertised remote size. Errors are not swallowed.
- If Windows sparse marking fails, transfers fall back to one worker per file.
  The chunk writer refuses to skip an unreceived prefix in this mode, so a failed
  leading chunk followed by a successful tail cannot allocate a huge dense hole.
- Chunk-range validation now uses the explicit known resource length, not the
  current staging-file length. Missing/mismatched Content-Range is still rejected.
  This keeps lazy allocation compatible with progressive video/audio muxing.

Sparse files can have a large **logical** length once a high-offset range is
written; that is different from physical disk allocation. Real downloaded bytes
still consume disk space. Old already allocated valid partials are preserved, not
automatically compacted or deleted.

## Evidence

Ten new `StagingDiskUsageTests` pass. They cover blocked preview callbacks/direct
engine/repository paths, legacy history, legitimate same-name controls, shared
roots, no-copy recovery, retained partial bytes, shrinking-only preparation,
non-sparse retry holes, a no-data **41,768,878,080-byte** advertised transfer and
an actual one-worker completion with byte-for-byte verification.
Preview history-removal and direct file-helper controls also verify that an
existing real fixture at a sample save path remains byte-for-byte intact.

The huge-advertised-size transfer creates a staging file of **zero length** while
its bodies are stalled. A Windows probe wrote three bytes after a 1 GiB offset:

```text
Logical file length: 1073741827; physical bytes allocated: 65536
```

The probe uses the Windows allocated-size API rather than summing logical lengths.
It creates a small physical fixture and deletes only its own test directory.
Windows implementation references: [FSCTL_SET_SPARSE](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_set_sparse)
and [obtaining allocated size](https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-the-size-of-a-sparse-file).

An intermediate full run exposed two paired-media failures because the old range
checks expected a preallocated file length. They were repaired using the actual
resource length; no response-integrity check was disabled. Final verification:
**478 C# tests, 0 failed/skipped**, including 12 real synthetic FFmpeg controls;
**335 browser tests pass**; solution restore/build have zero warnings/errors.
The existing missing-Content-Range test now supplies its known expected total so
it continues testing that protocol refusal, rather than failing for absent metadata.

## Required session handoff

**Branch and commit:** `sdm2.0` / `6c915637b1dfa2453a3842e3223f895c8925510a`.
Java `main` remains preserved at `b705fd0`; no commit, push or installer was made.

**Pre-existing dirty files:** All prior security and structural-refactor changes
listed in STRUCTURAL_REFACTOR_HANDOFF.md, plus its new composition/design-data,
journal/staging/policy/reader/lookup components, shared browser sources/bundler,
Graphify tooling, tests and guide updates. Preserved; no reset/stash/rollback.

**Package and audit IDs addressed:** Package 2 disk-use/preview/partial-recovery
defect reported by the owner; no new security-scan finding closure claimed.

**Files/modules changed:** DownloadModel preview marker; DemoDownloads samples;
DesktopComposition preview mode; PreviewTransfers; StagingFile; DownloadStaging;
DownloadEngine; SegmentWorker; SQLite repository; MainViewModel;
TransferMonitorViewModel; DownloadDestinationService; DeleteConfirmDialog;
App preview title; Program demo profile isolation;
StagingDiskUsageTests; Goals34RegressionTests metadata; implementation guides.

**Schema migrations:** None. Existing migrations remain unchanged.

**Exact test commands and results:** From repository root, using isolated output:

```powershell
$env:SMARTDM_PROFILE_DIR='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/disk-fix-profile'
$env:SMARTDM_STAGING_DIR=Join-Path $env:SMARTDM_PROFILE_DIR 'staging'
$env:SMARTDM_MEDIA_TESTS='1'
dotnet restore SmartDm.sln --verbosity minimal
dotnet build SmartDm.sln --no-restore --verbosity minimal -p:BaseOutputPath='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/disk-fix-bin/'
dotnet test SmartDm.sln --no-build --verbosity minimal -p:BaseOutputPath='C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/disk-fix-bin/'
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
git diff --check
```

Results: 478 C# / 335 browser pass, no failures/skips; build 0 warnings/errors;
bundle and diff checks pass. Physical-size output was separately captured with
the focused sparse test and `--logger 'console;verbosity=detailed'`.

**Manual verification:** Rechecked the live profile had no active or queued
transfers before restarting PID 28688. Rebuilt the normal Debug app with
`dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore
--verbosity minimal` (pass, zero warnings/errors). Restarted current build; PID
27916 has a responding `SmartDM — Downloads` window after the final preview-delete
guard rebuild. Startup initialization completed
without a fatal marker. No real download, site or full UI interaction was performed.

Graphify's local code graph was refreshed after the final source edits: 2,910
nodes, 7,827 edges, 157 communities. The compact overview remains 17 production
components/19 resolved relationships. No external LLM extraction or source upload
was used. Markup is not parsed by the graph; source/tests remain the authority.

**Privacy/security evidence:** Read-only profile queries emitted counts only.
No bulk user staging deletion/compaction command was run; normal startup orphan
reconciliation remains enabled. Preview transfer/file operations are rejected
before network, staging or history writes; range/cookie/TLS/security regression
checks remain enabled and pass. Explicit test cleanup deletes only owned fixtures;
user-confirmed legacy preview removal deletes only its history row.

**Remaining limitations:** Linux physical allocation and live sparse-unsupported
hardware were not exercised; Windows unsupported capability was fault-injected.
Linux keeps its normal filesystem hole semantics. Existing partials can continue
under legacy roots until completion. No disk quota, automatic deletion of real
paused downloads, or retroactive compaction of old allocations was introduced.

**Exit gate fully satisfied:** YES for this Windows disk/preview regression slice;
NO for broader package, Linux, installed-browser and release gates.

**Next allowed package:** Continue Package 2 and existing authorized prerequisites.
