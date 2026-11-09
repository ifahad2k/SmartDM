# Linked-thumbnail source repair — 2026-11-08

Branch and commit: `sdm2.0`, `711ef3c8b26be521ed5c7256f22752764f5c7ee7`;
local/uncommitted, no Java/main or remote update.

Pre-existing dirty files: six branch/architecture/resume/phase/evidence/limitations
guides; both browser watcher/format-engine copies; `memory_lifecycle.test.cjs`;
untracked thumbnail-style/YouTube-prefetch/YouTube-regression handoffs and
`thumbnail_styles.test.cjs`/`youtube_prefetch.test.cjs`. All preserved.

Package and audit IDs addressed: owner-requested Package 4 linked-thumbnail bug;
no new numbered ID or full package closure.

Files/modules changed: both `extensions/{chrome,firefox}/modules/watcher.js` and
`modules/format_engine.js`; new `tests/browser/linked_thumbnail.test.cjs`; six
entry guides and this report. Watchers explicitly mark thumbnail intent. For
non-social/non-YouTube cards, selected-page discovery now runs before listing
capture/preview fallback. Existing background HTML parsing is reused; no new
domain scraper. Requests coalesce by selected URL, successful entries expire
after one minute within the 30-result cache cap, failures retry on reopen, and
a 20-second UI deadline releases waiters. It does not abort the background fetch.

Schema migrations: none.

Exact test commands and results:

- `node --test tests/browser/linked_thumbnail.test.cjs`: initial 10 cases failed
  before implementation, showing listing-preview delivery before selected-page
  resolution. Two mounted-button integration cases were subsequently added.
- `node --test tests/browser/*.test.cjs`: 245 passed, 0 failed, 0 skipped.
- `git diff --check`: passed before the later handoff edits.
- Final shell syntax/hash/cleanup checks were rejected and did not run. C#/Java
  suites were not run; no runtime code/dependencies changed in those tracks.

Manual verification: initial platform HTTP metadata requests to the supplied
search page and one selected watch link returned 200. Search contained 36 watch
links; the selected document contained player definitions/HLS references. The
page body and search terms are not included in fixtures/reports. A later Node
transport attempt failed and a platform HTTP retry timed out; production parser
completion was not verified. Computer-use then reported the current browser URL
was not allowed and browser work stopped. No full download or live menu success
is claimed. No browser action/network retry followed that denial.

Privacy/security evidence: listing previews are excluded from selected-card
results; failures do not silently return another stream. No new permissions,
TLS bypass, telemetry, backend, executable or cookie handling. Actual media was
not downloaded. Neutral fixtures use invented catalog/CDN URLs.

Remaining limitations: loaded-extension verification of the exact live case is
pending. The existing watch parser can still fail for authentication, dynamic
player setup or network errors. Automatic approval review rejected the final
shell command with "blocked by policy"; workspace diagnostics were subsequently
removed using fixed-path edits. `.tmp-linked-qa-path.txt` retains the location of
the external temporary QA directory because its shell cleanup was blocked; do
not publish this pointer or temporary data. No installer was produced.

Exit gate fully satisfied: NO — source tests pass; live verification and broader
media/security gates remain open.

Next allowed package: validate this Package 4 slice on an allowed test surface,
then follow `PHASE_STATUS.md`. Do not work around the denied browser URL or infer
permission for release, branch publication or Java changes. Activation requires
reloading SmartDM Integration and refreshing the listing page.
