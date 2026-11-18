# Known Limitations

This file tracks significant technical limitations, pending architectural work, and missing features across remediation packages on branch `sdm2.0`.

## Architecture Status (Branch `sdm2.0`)
- **Package 0 (Complete - Exit Gate: YES)**: ADR-009 accepted by maintainer (C#/.NET 9 and Avalonia approved as desktop architecture; Java daemon decommissioning path established; no yt-dlp; browser format engine preserved), product identity cleaned (no "Pro" tier), and critical TLS bypass in `HlsMediaResolver` (C-06) is resolved and tested. Platform TLS validation is now enforced. Remote CI execution across Windows/Linux runners gates final release.
- **Package 1 (Complete - Exit Gate: YES)**: C# `DownloadEngine` is the sole transfer engine in production composition. `IpcDownloadEngine` and `EngineDaemonLauncher` are marked obsolete and removed from application startup and diagnostics. Parity matrix established and automated tests verify complete decoupling from the Java daemon.
- **Package 2 (In Remediation - Exit Gate: NO)**: Expected SHA-256 and destination conflict actions persist in SQLite; staged files are checked before destination promotion. Range responses and truncated transfers have automated tests. Crash recovery retains the journal's segment layout and reuses only completed ranges with a matching flushed SHA-256 checkpoint; incomplete and tampered ranges replay. A child process termination test confirms final byte integrity. Queue binding, duplicate labeling, filename inference, and native HTTP speed limiting have tests. The full Package 2 gate remains open.

## Remaining Limitations (Tracked by Remediation Packages)

### Package 2 (Active Remediation Items)
- **2026-11-03 progress**: The limiter no longer waits for a charge larger than its maximum bucket. Probed non-range downloads now persist capability and use a fresh full-body GET, preserving exact expected length checks. ETag (including `W/`) and Last-Modified reach ordinary creation/history; changed strong validators force fresh ranges. Collision dialog choices reach engine policy, and explicit replacement of an in-use destination is rejected. These have 27 new regression cases; they do not close the complete recovery/performance gate.
- **Lifecycle follow-up (R07)**: Per-download command serialization, instance-owned runner cleanup and joined shutdown now have 12 new ordinary-transfer regression cases. Stop before commit prevents output promotion; a commit already underway finishes and keeps its terminal result. Observed threats cannot be downgraded by stop. Real FFmpeg process-tree behavior and Linux lifecycle behavior are not established by those tests. Noncooperative operations can keep a stop pending indefinitely; no replacement writer is allowed while they remain active.
- **Still open after these slices**: Bounded ordinary connect/header/read-idle/retry handling, scheduler/global concurrency, long-running bandwidth tolerance/fairness, and the full fault matrix. Legacy/unprobed records have unknown range capability and retain strict range attempts for known-size downloads; reprobe them to obtain the explicit sequential plan. Zero-byte downloads remain outside these slices. Browser credential isolation/authentication, media recovery and safety/update findings from the 2026-11-03 review remain unresolved. Filesystem move/delete operations outside engine commands also need their own coordination review.
- **Crash Resume (C-04 Partial)**: Completed bounded ranges have a flushed SHA-256 checkpoint. Reuse requires a fresh `206` range probe with the same strong ETag and total length, followed by a matching disk digest. Workers send `If-Range` for strong ETags and reject an ignored range. Missing or weak validators, failed probes, incomplete ranges, and tampered bytes replay from zero. The remote validator path still needs end-to-end fault-injection tests, including content changing between probe and worker requests.
- **Speed Limit Scope (M-02 Partial)**: Saved speed limit settings now reach the C# engine and the settings UI identifies the limit as applying to HTTP workers. Direct FFmpeg stream muxing sessions communicate directly with remote media endpoints and are not throttled by the C# token bucket. Transfer monitor controls currently share that same aggregate limiter; their interaction with the saved setting and measured tolerance under concurrent transfers still need verification.
- **Exit Gate Constraint**: Package 2 exit gate is held at NO until all tests pass through the real app boundary.

### Package 3 (Encrypted Storage & Browser IPC Security) -> BLOCKED (Package 2 Gate is NO)
- Local SQLite database uses unencrypted `Microsoft.Data.Sqlite` (C-01).
- `LocalIpcService` permits unauthenticated loopback POST requests with wildcard CORS (C-02).
- Browser cookies are collected broadly and persisted in plaintext (C-03).
- Gemini API key is persisted in plaintext `ai_config.json` (H-12).
- Automatic file catalog scans common user folders without explicit root consent (H-11).

### Package 4 (Media Extractor Preservation & Format Engine)
- Facebook identity protection (2026-10-29): When Facebook exposes no direct source on the active player and no detected stream with the selected video's explicit ID, SmartDM now shows a useful no-verified-stream message instead of downloading a potentially unrelated recommendation. A played Reel may therefore still have no download option; live compatibility needs user verification and a future source-to-player binding implementation. Feed Reel badges now offer an Open Reel action, not an unverified feed-page format list.
- Facebook compatibility follow-up (2026-10-29): Reel badge placement and desktop handoff feedback have automated Chrome/Firefox tests. The existing Chrome extension was reloaded and the badge opened its popover on the Facebook home feed, but the popover was still loading media options during observation; a fresh completed Facebook UI download is still needed to establish live compatibility. The desktop FFmpeg path is pinned to the installed WinGet FFmpeg Essentials 8.1.1 executable; a package update changes its hash and requires verification and a new `FFMPEG_SHA256` value.
- Format deduplication in `FormatRegistryEngine` merges formats by height, discarding container/codec variants.
- FFmpeg resolution includes a legacy hard-coded path under `yt-dlp.FFmpeg`.
- Format choices in UI lack container, codec, and audio presence indicators.

### Package 5 (Safety States, Quarantine & Release Validation)
- Safety scanner reports missing files as clean (H-03).
- Quarantined files are flagged without physical isolation or relocation to a secure store (H-04).
- Scanner defaults to clean when Defender/ClamAV are unavailable (H-05).
- Single-EXE installer does not verify runtime package checksums before extraction (C-05).
- Completion Inspector contains static ZIP and security text not bound to transfer evidence (M-04, M-05).


## 2026-11-03 selected-social and filename follow-up

See [SOCIAL_MEDIA_FOLLOWUP.md](SOCIAL_MEDIA_FOLLOWUP.md) for partial user defect repairs: 97 .NET and 22 browser tests passed. Encoded filenames, selected-source isolation and bounded overlay positioning have regression checks. Gotaku/Reanime live failures, opaque X source binding, complete quality discovery and loaded-browser verification remain open. Package gate remains NO; running app has not been restarted into the new build.


## 2026-11-04 reconciled runtime status

The [Goals 3/4 handoff](GOALS_3_4_HANDOFF.md) supersedes older implementation claims above: missing/unavailable/failed scanners no longer return clean; blocked staging is physically retained with persisted evidence; updates require explicit C# track/architecture/version/digest and do not auto-run; actual defaults no longer claim SQLCipher encryption or measured HTTP/3. Those are implemented fixes, not complete release proof. Media re-resolution/dual-range recovery, full provenance, loaded Firefox/Chrome, Linux, large-history measurement and complete settings/network policy remain open. Encryption/authenticated durable browser handoff remain Package 3 gaps. Installer/release creation is explicitly deferred by the owner. Gates remain NO.


## 2026-11-04 extension memory limits

Resource retention fixes pass 66 browser fixtures; actual Chrome before/after RAM
and loaded-site compatibility remain unverified. Four generic sniff readers,
500,000-byte text budgets, response deadlines and bounded caches intentionally
limit resource use; over-budget sniff captures are skipped, independent player
capture/background observation remain. Connected feed-card badge DOM and separate
background response paths still consume memory. See [handoff](EXTENSION_MEMORY_HANDOFF.md).
Do not attribute a page's entire renderer memory to SmartDM or claim a RAM percentage.


## 2026-11-06 publication status

[BRANCH_SYNC_HANDOFF.md](BRANCH_SYNC_HANDOFF.md) supersedes older test counts. The
current snapshot passes local checks, but Gotaku/Anikoto encoded manifests, complete
Animepahe live verification, other live-site/browser behavior, Linux execution,
secure persistence and authenticated durable handoff remain open. Firefox manifest
and registration metadata is corrected; loaded Firefox/Linux proof remains absent.
Both synchronized C# branches are development snapshots, not a release certification.

2026-11-06 streamed capture: [specific TikTok evidence](STREAM_BINDING_HANDOFF.md)
now includes two complete, correctly identified Chrome downloads with audio/video
decode verification. This supersedes the blanket unverified statement for those
two cases only. Other sites, all qualities, Firefox/Linux runtime, controlled memory
measurements and the intermediate Chrome renderer crash's cause remain unverified.

2026-11-08 Testing desk: browser-local storage is profile/origin/path-specific;
portable preservation requires JSON backup. IndexedDB failure leaves screenshots
in memory with an explicit warning. Live Chrome attachment/export/import/reload
was checked; clipboard/drop, restore confirmation, mobile and Firefox/Linux UI
were not separately exercised. This tool does not verify downloads or change any
open media/security/package gate. See [handoff](TESTING_DESK_HANDOFF.md).

2026-11-08 thumbnail style: source repair and 203 browser fixtures pass, but the
loaded extension must be reloaded and its page refreshed for visual confirmation.
This presentation-only repair changes none of the open media/security gates.
See [handoff](THUMBNAIL_STYLE_HANDOFF.md).

2026-11-08 YouTube menus: prepared cached lists open synchronously; a newly visible
video clicked before resolution, an evicted/expired entry, or an unavailable
resolver still needs a network lookup or displays an error. Prefetch is limited
to visible/intent targets, two awaiting requests and eight queued targets per
document; it does not crawl the entire feed. The corrected 30-second UI deadline does not
cancel an already executing desktop/service-worker request. This change does
not establish live YouTube latency, universal quality availability, native cache
memory bounds or new Firefox/Linux runtime evidence. See
[handoff](YOUTUBE_MENU_PREFETCH_HANDOFF.md).

The first implementation removed the prior fallback and timed out sooner than
the existing desktop route, causing a user-reported regression despite passing
fixtures. Corrected behavior retains selected-player captures while the full
lookup continues/fails. Three live extension/runtime/menu checks and bounded
video/audio range probes now pass; this does not prove every YouTube video,
uncached lookup timing, loaded-page activation or full-download completion.
See [correction handoff](YOUTUBE_MENU_REGRESSION_HANDOFF.md).

2026-11-08 linked thumbnails: source tests exclude listing previews, but the
selected watch page still needs a supported stream that the existing background
parser can read. Authentication/dynamic setup/network errors can prevent this.
The 20-second UI deadline does not cancel that existing background fetch.
Live verification stopped when computer-use denied the current URL. See
[handoff](LINKED_THUMBNAIL_HANDOFF.md).


2026-11-10 HLS progress: received traffic now includes retry bytes while saved
progress counts verified chunk commits. Chunk-count percent is monotonic within
the native HLS session; estimated size/ETA and actual network rate may vary.
Finite-input FFmpeg EOF stalls have real regression proof, but full live anisuge
completion/throughput on the restarted build remains unverified. Previous app
failures included HTTP 403; exact authorization/expiry cause is not established.
Existing fallback/multi-track progress semantics and package security/release gaps
remain. See [handoff](HLS_PROGRESS_HANDOFF.md); no universal speed/site claim.


## 2026-11-16 report repair limits

TikTok 403 is still an open live defect after an earlier successful download.
The latest fetch/reader/XHR original-entry repair has fixture proof, not a fresh
completed live download. Higher renditions require metadata for the selected
item; 720p alone does not prove a bug, and measured 576p is now labeled honestly.
Bilibili search badges and actual-media API routing pass fixtures; full live
thumbnail/mux confirmation is pending. Other linked-source repairs likewise do
not guarantee authorization or source availability. File-examples HTTP 403 is
not established as resolved. Prior storage/IPC/security/release limitations stand.

Graphify's v2-only AST map omits `.axaml`, docs and dynamic message routing.
Its health diagnostics include unresolved endpoints, repeated-edge collapse and
self-loops; verify source rather than treating graph absence as proof of no call.
No Java, Linux, installer, memory benchmark or universal compatibility proof.
See [handoff](REPORT_REPAIR_HANDOFF.md).


## 2026-11-17 current security limits (supersedes older implementation notes)

The eight scanned paths now have repairs with 464 passing C# and 333 passing
browser tests on Windows. Cookies/API keys are protected fields; ordinary SQLite
history and signed media URLs are not full-database encrypted. Earlier plaintext
cookie/key and unauthenticated-loopback descriptions are historical.

Linux Secret Service/current-user pipe/shell-host integration is implemented but
not runtime-verified here; Linux requires `secret-tool` and an unlocked Secret
Service and fails explicitly without protected storage. Installed Chrome/Firefox
host registration/reload and real sites were not exercised. The running app and
real profile were not changed. Historical backups are not rewritten by migration.

FFmpeg network traffic now uses the .NET media proxy, but still does not use the
worker speed limiter. Native replies have a 1 MiB cap; large resolved snapshots
stay in an eight-entry, 15-minute, credential-keyed desktop cache. Full SQLCipher,
durable browser acknowledgement and wider package/release gates remain open.
See TEST_EVIDENCE.md for the exact scope and commands.


## 2026-11-17 structural refactor limits

Recovery, staging, policy, playlist reading, composition and preview/lookup logic
have separate components with passing checks. DownloadEngine still owns multi-mode
media-session orchestration (2,951 lines); MainViewModel still coordinates UI lifecycle
and callbacks (1,434 lines). Shared browser runtime/capture routing is 1,868 lines;
other responsibilities are in six separate sections. This is not complete layered
assembly migration, a performance proof or universal site verification.

The compact Graphify map hides tests and package copies. The detailed post-build
graph still has six self-loops and 225 nodes without source files; `.axaml` markup
is not parsed. Read source to confirm relationships; absent edges are not proof.
Prior Linux, installed-host, SQLCipher, durable handoff and release limits remain.
See STRUCTURAL_REFACTOR_HANDOFF.md for exact evidence.

## 2026-11-17 staging repair limits

New files grow with received data; Windows sparse physical allocation is measured.
Linux physical allocation is not runtime-verified, and unsupported Windows sparse
capability was fault-injected rather than tested on a live unsupported volume.
Existing valid partials remain allocated and may resume from legacy roots; they
are not bulk deleted, copied or retroactively compacted. Real downloaded bytes
still consume disk space. There is no disk quota or automatic deletion of real
paused transfers. Normal orphan reconciliation remains enabled. Only known exact
historical mock signatures are classified as legacy previews. See
STAGING_DISK_USAGE_HANDOFF.md; wider security/release gates remain open.

2026-11-17 draggable controls: placement resets on refresh/remount and remains
within the originating document/iframe viewport. Visibility still follows the
original media/card. Chrome has synthetic trusted-input smoke coverage; installed
Firefox/live-site dragging was not exercised. Extension reload plus page refresh
is required. See DRAGGABLE_OVERLAY_HANDOFF.md.

2026-11-17 ownership repair: live Dailymotion/installed Firefox remains unverified.
Frame loading may briefly show a fallback until the child announces availability;
frames without an installed child content script keep the fallback. Status messages
are source-matched and do not authorize downloads. See PLAYER_OWNERSHIP_HANDOFF.md.

2026-11-17 appearance UI: toolbar popup source/native DOM is verified synthetically;
installed extension/Firefox/live sites still require checks after reload. Values
save locally; Saved indicates completion, without a crash guarantee for pending
writes. Very low opacity can reduce contrast over arbitrary video content. No
separate settings tab remains. See OVERLAY_APPEARANCE_HANDOFF.md.


## 2026-11-17 visible media size and progressive metadata

Installed Firefox/live extension and sustained same-file IDM comparison remain unverified. Protected media can retain unknown size; HLS/mux/conversion may be estimated. New probing adds setup latency and safely falls back if unavailable. Existing unknown-length checkpoints may restart after metadata discovery. Short live CDN checks hit timeouts; no 5 MB/s guarantee. See MEDIA_SIZE_AND_PARALLELISM_HANDOFF.md.

## 2026-11-18 HLS stream reliability

Whole-file clear fMP4 now uses parallel workers. Byte-range HLS and encrypted fMP4 still use the existing FFmpeg path. Live CDN compatibility and sustained IDM comparisons remain unverified. [HLS handoff](HLS_STREAM_RELIABILITY_HANDOFF.md).

## 2026-11-18 worker count and media discovery

Host throughput remains unmeasured against IDM. The reported HydraHD page required a verification challenge in Chrome before playback, so live validation remains open. Existing queued items retain their saved worker count. [Handoff](WORKERS_AND_MEDIA_DISCOVERY_HANDOFF.md)

## 2026-11-18 HLS startup and selected audio

Origin refusals remain terminal. The reported sites were not verified live with the new capture hooks. [Handoff](HLS_START_AND_AUDIO_HANDOFF.md)
