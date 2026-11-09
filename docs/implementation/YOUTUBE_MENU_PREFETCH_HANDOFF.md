# YouTube menu preparation — 2026-11-08

> Superseded in part by [same-day regression correction](YOUTUBE_MENU_REGRESSION_HANDOFF.md).
> The owner reported live failures after this fixture-only implementation. In
> particular, the nine-second deadline and removed fallback below were incorrect;
> do not restore them. Current behavior and live evidence are in the correction.

## Branch and commit

`sdm2.0`, HEAD `711ef3c8b26be521ed5c7256f22752764f5c7ee7` at session entry.
Changes are local and uncommitted. No push or modification to Java `main`.

## Pre-existing dirty files

- `docs/BRANCHES.md`
- `docs/CURRENT_ARCHITECTURE.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/implementation/PHASE_STATUS.md`
- `docs/implementation/RESUME_HERE.md`
- `docs/implementation/TEST_EVIDENCE.md`
- `extensions/chrome/modules/watcher.js`
- `extensions/firefox/modules/watcher.js`
- Untracked `docs/implementation/THUMBNAIL_STYLE_HANDOFF.md`
- Untracked `tests/browser/thumbnail_styles.test.cjs`

All were preserved. The existing shared thumbnail CSS fix remains intact.

## Package and audit IDs addressed

Owner-requested Package 4 YouTube discovery/menu latency and terminal-state slice.
No new numbered audit ID; this does not close the full media or security backlog.

## Files/modules changed

- Both extensions' `modules/format_engine.js`: exact video-ID normalization,
  single-flight resolution, completed-list cache, expiry/deadline/cooldown and
  terminal callback cleanup. A YouTube lookup is routed before unrelated captured
  player fallbacks, so a thumbnail does not borrow another player's formats.
- Both extensions' `modules/watcher.js`: visible-card/player prefetch, pointer and
  keyboard focus priority, bounded queue/workers, observer/listener cleanup,
  ready-menu rendering and pending-notice completion. YouTube's ID-keyed cache
  survives player dimension/unload events; TTL handles its validity.
- `tests/browser/youtube_prefetch.test.cjs`: 24 behavior cases across both copies.
- `tests/browser/memory_lifecycle.test.cjs`: expose `URL` to two existing VM fixtures
  now exercising the dedicated YouTube path; retain their original assertions.
- Six entry/architecture/status/evidence/limitations guides and this handoff.

## Implemented behavior and implementation cautions

Visible targets are prepared after a 150 ms scheduling delay. Per-document limits
are two awaiting background lookups and eight queued DOM targets. Pointer/focus
intent moves a target to the front. A click joins an already running lookup.
Successful completed results render synchronously, with no intermediate
"Checking for higher qualities" notice. Do not reintroduce guessed quality rows.
All selectable qualities still come from the existing resolver response.

Cache identity uses the case-sensitive 11-character YouTube video ID across watch,
shorts, embed, live and short-link URLs. Spoofed hostname/credential URLs are
rejected. Completed entries share the existing 30-result bound; success lifetime
is at most two minutes and at most the earliest signed video/audio expiry minus
30 seconds. A failure is retryable after a five-second cooldown. The nine-second
UI deadline settles waiters exactly once and ignores late replies; it does not
abort the underlying desktop task. No UI/DOM callback is retained in completed
entries. Disconnect cleanup removes observation targets and intent listeners.

The desktop YoutubeExplode resolver and background service-worker fallback are
unchanged. The YouTube menu now waits for their completed response instead of
merging a potentially unrelated captured 720p stream into a partial thumbnail menu.
Other websites retain their existing discovery path. Their thumbnail pending
notice is also removed if partial discovery ends with no additional formats.

## Schema migrations

None.

## Exact test commands and results

- `node --test tests/browser/youtube_prefetch.test.cjs tests/browser/memory_lifecycle.test.cjs`:
  initial implementation stage: 44 passed, 0 failed. More cases were added later.
- `node --test tests/browser/*.test.cjs`: final suite **227 passed, 0 failed,
  0 skipped** (includes 24 new cases and the earlier thumbnail CSS cases).
- `node --check extensions/chrome/modules/format_engine.js`
- `node --check extensions/firefox/modules/format_engine.js`
- `node --check extensions/chrome/modules/watcher.js`
- `node --check extensions/firefox/modules/watcher.js`
  — all passed.
- `git diff --check`: passed. Matching SHA-256 hashes verified for each pair of
  Chrome/Firefox watcher and format-engine files.
- .NET and Java suites were not run: their code, dependencies and composition
  were not modified by this browser-only task.

## Manual verification

Source/diff review and deterministic DOM fixtures only. The new mount test loads
the actual watcher, format engine, utilities and menu renderer, prepares a result,
opens the thumbnail menu and invokes a quality row. It verifies 1080p/720p plus
audio/thumbnail options, no spinner flash, and preservation of the selected audio
URL and filename. This is not a live YouTube or download-completion claim.

Activation: keep SmartDM running, reload SmartDM Integration, refresh YouTube,
allow visible cards to prepare, then open a thumbnail menu. Also try a newly
visible card immediately, app unavailable, rapid scrolling, and keyboard focus.
Confirm completed menus show actual qualities and failures stop loading.
Screen capture was deliberately not started for this task.

## Privacy/security evidence

No new permissions, telemetry, storage schema, executable, shell execution, TLS
override, third-party backend or download initiation. Prefetch uses the existing
YouTube/desktop discovery route for visible or intentionally focused targets;
it causes metadata network requests before click. Existing IPC/cookie security
limitations are unchanged and remain open. Tests cover host/ID isolation,
malformed replies, expired links and bounded extension state; they are not a
complete security assessment of the existing resolver/IPC pipeline.

## Remaining limitations

Cold/expired/evicted videos cannot be guaranteed instant before YouTube responds.
The UI reports terminal failure rather than promising unavailable qualities.
Background work is bounded per document, not globally across tabs or inside the
unchanged desktop cache. Network restriction/authentication can limit the list.
No live-site timing, Firefox/Linux runtime or full download verification was done.
No installer was produced; release work remains owner-deferred.

## Exit gate fully satisfied: NO

The scoped source change and browser fixtures pass. The complete Package 4/media
and product security/release exit gates remain open; live timing remains unverified.

## Next allowed package

Validate this owner-requested Package 4 slice in the loaded extension, then follow
the active package gates in `PHASE_STATUS.md`. Do not infer permission to ship an
installer, close security findings, or change Java `main` from this handoff.
