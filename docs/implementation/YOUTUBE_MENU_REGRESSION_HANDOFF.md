# YouTube menu regression correction — 2026-11-08

## Branch and commit

`sdm2.0`, HEAD `711ef3c8b26be521ed5c7256f22752764f5c7ee7`. Changes remain local,
uncommitted. No remote update or Java/main modification.

## Pre-existing dirty files

The six branch/architecture/resume/status/evidence/limitations guides, both
browser copies of `modules/format_engine.js` and `modules/watcher.js`, and
`tests/browser/memory_lifecycle.test.cjs` were modified before this correction.
Untracked files were `THUMBNAIL_STYLE_HANDOFF.md`,
`YOUTUBE_MENU_PREFETCH_HANDOFF.md`, `thumbnail_styles.test.cjs` and
`youtube_prefetch.test.cjs` in their existing docs/tests directories. These were
all preserved. No reset, checkout, stash, bulk staging or branch switch occurred.

## Package and audit IDs addressed

Owner-reported regression in the preceding Package 4 YouTube menu latency slice.
No new numbered audit ID. This reopens the initial fixture-only verification.

## What was wrong

The preceding change made the full resolver mandatory and used a nine-second
terminal deadline. The background's existing desktop HTTP attempt permits
15 seconds and can then run its browser fallback. A response after nine seconds
was ignored and a failure cached. Available captured formats were no longer
shown. The resulting fixed error incorrectly suggested SmartDM might not be
running; a direct probe established that the running app could return formats.
Earlier fixtures responded immediately with simplified objects and missed this.

## Files/modules changed

- Both `extensions/{chrome,firefox}/modules/format_engine.js`: deadline is now
  30 seconds; success responses are normalized; error wording no longer assumes
  the desktop is unavailable. Selected-player HTTP captures may display while
  full resolution continues and survive full-resolver failure. Their URLs must
  match the selected source/paired audio; unrelated tab streams are excluded.
- Both watchers pass the thumbnail's actual preview video element, when one
  exists, into YouTube lookup so a source-bound fallback can be used.
- `tests/browser/youtube_prefetch.test.cjs`: six new regressions across both
  browser copies; existing timeout test now exercises the 30-second deadline.
- Six guides, preceding handoff's supersession notice, and this report.

The shared thumbnail button CSS, cache/queue limits, video-ID isolation and
single-flight behavior remain. No arbitrary tab-wide fallback was restored.

## Schema migrations

None.

## Exact test commands and results

- `node --test tests/browser/youtube_prefetch.test.cjs`: 30 passed, 0 failed.
- `node --test tests/browser/*.test.cjs`: 233 passed, 0 failed, 0 skipped.
- `node --check extensions/chrome/modules/format_engine.js`
- `node --check extensions/firefox/modules/format_engine.js`
- `node --check extensions/chrome/modules/watcher.js`
- `node --check extensions/firefox/modules/watcher.js`
  — all passed.
- `git diff --check`: passed. Corresponding Chrome/Firefox modules match.
- .NET/Java suites not rerun: no runtime C#/Java, dependency, schema or composition
  changes in this correction.

## Manual verification

1. Running SmartDM process and active IPC port were checked. A direct metadata
   request for `Pc1JzImPw_M` returned 24 format entries in 5.33 seconds. Secret
   token and signed media URLs were not printed.
2. A temporary extension-origin diagnostic page loaded the production utilities,
   format engine and menu renderer. It used the actual installed Chrome
   `chrome.runtime.sendMessage` route and running desktop, rather than a mocked
   format response. Accessibility observations confirmed rendered quality rows.
3. Matching Casetoo title/channel `UGrn-X7krkQ`: 20 formats, 1080p60 and 720p60
   plus lower qualities/audio/thumbnail; observed 0.1 seconds (may be cached).
4. Second same-title search result `FJqSrQIRM88`: 9 entries, up to 720p60; observed
   6.4 seconds. Current browser video `9Gx6BkqobkQ`: 20 entries up to 1080p;
   observed cached 0.0 seconds. No claim that every video offers 1080p or higher.
5. The Casetoo 1080p60 MP4 URL and paired audio URL each returned HTTP 206,
   `video/mp4`/`audio/mp4`, and 1024 sampled bytes in bounded range probes.
   Bodies were discarded; no full movie file or download-history entry created.
6. Temporary diagnostic files/tab were removed and computer-use runtime reset.
   Only text accessibility was requested; no screenshots/screen capture occurred.

These checks validate the real extension message/desktop/menu route. They do not
establish that already-open YouTube content scripts have been reloaded, simulate
every timing/network condition, or prove full download completion.

## Privacy/security evidence

No new browser permissions, shell invocation, TLS override, telemetry or backend.
Selected-source matching prevents fallback from choosing another tab video.
Only public video metadata/IDs, counts, timing, MIME/status and bounded samples
were inspected; signed media URLs and browser cookies were not printed or added
to reports. Existing IPC/cookie security limitations remain open.

## Remaining limitations

Cold metadata queries require network time; prefetch cannot guarantee every
thumbnail opens instantly. Thirty seconds bounds UI waiting but does not cancel
the unchanged desktop resolver. No new full-download, Linux, Firefox-runtime,
memory benchmarking or universal-site guarantee. Native-source fallback requires
a capture bound to the selected player; no guessed resolution/video is added.

Activation: reload SmartDM Integration and refresh YouTube. Existing page scripts
do not update merely because their files changed. The browser extension settings
reload control was not automated. No installer/release was produced.

## Exit gate fully satisfied: NO

Scoped source regressions and live format/menu/range checks pass. Existing-tab
activation and package-wide media/security/release gates remain open.

## Next allowed package

Verify the reloaded YouTube thumbnail/player menus in the user's normal page,
then continue according to `PHASE_STATUS.md`. Do not treat this as authorization
for an installer, branch publication or closing the remaining security findings.
