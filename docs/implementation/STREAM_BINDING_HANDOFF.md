# Streamed player binding repair — 2026-11-06 UTC

## Branch and commit

Entry: `sdm2.0` at `902bda50cf3203c7480e45d35ba0838fc9ebc9ab`, clean working
tree. Obtain the resulting fix commit with `git log -1`. Both C# branch names
remain publication targets; Java `main` and its separate worktree are unchanged.

## Pre-existing dirty files

None at entry. Only the two extension sniffers, browser fixtures and the guides
listed below were changed for this repair. No app history, cookies, media bytes,
temporary diagnostics or downloaded third-party player code are publication inputs.

## Package and audit IDs addressed

Package 4, owner's reported TikTok “No verified stream for this selected video”
failure and earlier wrong-feed-video concern. This is a shared browser capture
repair, not a new TikTok extractor or closure of the entire media package.

## Files/modules changed

- `extensions/{chrome,firefox}/sniffer.js`: follows the player's own
  `Response.body.getReader().read()` calls, including BYOB readers. It does not
  perform additional reads, clone media responses or fetch another candidate.
- Byte-span provenance follows ordinary byte-array copies and slices. Overwrites,
  pool clearing, mixed resources, subviews and span overflow cannot preserve an
  unrelated old source. Weak maps hold buffer/reader/player associations; spans
  are capped at 32 per backing buffer.
- A bounded fallback compares at least two distinct exact 32-byte samples of
  compressed MP4 `mdat` payload against consumed network media. This covers copies
  across worker/remux boundaries and headers hidden by the browser/platform. Codec
  initialization headers, short matches, ambiguous sources, known isolated
  fragments and non-media responses cannot establish this association.
- Sample storage is capped at 16 resources × 128 samples, with a 120-second idle
  expiry checked during capture. Initial samples survive full-file prefetch;
  only the tail rotates. The append matcher scans at most 65,536 payload offsets
  per call. This is bounded local evidence, not a RAM or CPU benchmark.
- A proven MediaSource identity survives ordinary later appends from outside the
  sample window. A changed element source, new MP4 initialization or contradictory
  evidence invalidates it. Separate audio remains required when observed; new
  video initialization cannot retain old audio. No tab-wide “latest URL” fallback
  was restored. Existing selected-social filtering remains enforced.
- `tests/browser/media_binding.test.cjs`: added streamed reads, remux/copy identity,
  prefetch retention, wrong-player isolation, overwrite/subview/overflow handling,
  late audio, initialization invalidation, sample ambiguity/eviction and native
  copy-error regressions. Both extension copies run the same fixtures.
- Updated BRANCHES, CURRENT_ARCHITECTURE, RESUME_HERE, TEST_EVIDENCE,
  KNOWN_LIMITATIONS and PHASE_STATUS with observed implementation/evidence.

## Schema migrations

None. Desktop engine, database schema, native-host protocol and extension
permissions are unchanged. No installer or release package was created.

## Exact test commands and results

- Before implementation, `node --test tests/browser/media_binding.test.cjs`
  reproduced the new streamed-copy failure in both Chrome and Firefox fixtures.
- Final `node --test tests/browser/*.test.cjs`: **95 passed, 0 failed/skipped**.
- `node --check extensions/chrome/sniffer.js` and
  `node --check extensions/firefox/sniffer.js`: passed.
- `git diff --check`: passed, apart from Git's normal LF/CRLF conversion notice.
- SHA-256 comparison: both final sniffer copies are byte-identical.
- No .NET/Gradle rebuild was required for this JavaScript-only runtime change.

## Manual verification

Reloaded the installed SmartDM Integration through Chrome's native extension
control; refreshed pages so hooks ran before playback. Initially, the live
request stack used `__splitFetch` → `response.body.getReader()`; the former sniffer
only followed `arrayBuffer()`. The first correction alone still failed live.
Temporary local counters then showed missing Content-Range in JavaScript and
lost copied-buffer identity. Those counters were removed from both source copies
before the final clean-code feed test; a fresh DOM showed no diagnostic attribute.

1. Original reported clip:
   `https://www.tiktok.com/@thedreadfulstudio/video/7692921300985122079`.
   The native completion window confirmed the caption filename and 16.45 MB.
   FFprobe: 17,248,469 bytes, H.264 720×1280 + AAC, both 218.8 seconds.
   Extracted frame at 10 seconds visually matched the user's screenshot.
2. Fresh `https://www.tiktok.com/` feed, selected “MKBHD AGAIN IN CONTROVERSY”
   post, using final code without temporary diagnostics. Menu discovery,
   native task handoff and completion succeeded. FFprobe: 8,012,300 bytes,
   HEVC 720×1280 + AAC, 83.3 seconds. Extracted frame matched the selected post.

For both local output paths, invoked the PATH-resolved ffprobe executable with
`-v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,duration -of json <file>`.
Invoked the PATH-resolved FFmpeg executable with
`-hide_banner -loglevel error -i <file> -map 0:v:0 -map 0:a:0 -f null -`:
both complete audio/video decodes exited 0 with no errors. Frame inspection used
`-ss 10 -i <file> -frames:v 1 -update 1 -y <temporary-png>`.
Downloaded media stays in the user's Downloads folder, outside Git.

## Privacy/security evidence

No new permissions, servers, TLS exceptions, extractor dependencies or key access.
No full response-body retention or diagnostic URL/cookie logging was added. Samples
are bounded, local compressed-media bytes; they are never sent elsewhere. Existing
browser handoff/persistence security limitations remain as previously documented;
this repair does not certify the complete product's security.

## Remaining limitations

Two real Chrome downloads establish this reported path, not universal website or
format coverage. Loaded Firefox/Linux verification and a controlled memory/CPU
benchmark remain open. Matching unsupported/transformed/encrypted payloads can
still fail closed. The menu offers observed streams, not every quality a platform
could serve. During intermediate instrumented DevTools testing, Chrome had one
STATUS_BREAKPOINT renderer crash; reload recovered it. Its cause was not established,
and the final clean-code feed test and both complete downloads succeeded. Do not
claim that crash is diagnosed, or that unrelated anime-site failures are fixed.

## Exit gate fully satisfied

**NO** for the complete Package 4 gate. The reported TikTok path has implementation,
regression and real-download evidence. Next allowed work is continued Package 4
cross-site/browser validation within the owner's existing scope; Package 3 security
gaps and installer/release deferral remain in force.
