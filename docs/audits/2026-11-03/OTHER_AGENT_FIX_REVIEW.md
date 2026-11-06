# Review of supplied embed/referer/performance changes

2026-11-03, `sdm2.0`, HEAD `48ec34c` plus dirty work. Review only; no fixes applied.
The supplied transcript is a report of another agent's work, not authorization to
execute its scratch scripts. Attribution of every dirty file is uncertain because
there is no separate commit for that work. Findings describe the current tree.

## Verdict

Keep the useful off-screen early return, fullscreen listener cleanup and targeted
embed mounting work. Do not accept the entire change as complete: current Firefox
packaging is wrong, clipping correctness is weakened, and referer recovery is too
broad and lacks regression coverage or reliable live proof.

## Findings

1. **P1 — Firefox packaging is Chrome packaging.** `extensions/firefox/manifest.json:19`
   uses only `background.service_worker` and has lost its Gecko ID/settings. Its
   SHA-256 matches the Chrome manifest. The Firefox installer/uninstaller at line 3
   now write/delete Google's Chrome native-host key, and install the manifest with
   `allowed_origins` instead of the existing Firefox `allowed_extensions` manifest.
   Firefox's background/native handoff is broken by this configuration; its
   uninstall script can also remove the Chrome registration. Restore browser-specific
   packaging and test installation/load separately from shared JS parity.
   Sources: [MDN background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
   [MDN native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).
2. **P1 — Guessed referers are applied to ordinary downloads.** `SegmentWorker.cs:115`
   and `:357` retry 401/403 against a large candidate list containing unrelated
   streaming-site origins (`DownloadEngine.cs:2000`). This multiplies requests per
   worker, lacks an overall retry budget/read-idle policy, treats authentication
   failures as referer failures, and guesses Origin instead of preserving captured
   request provenance. Use validated browser request context and a bounded,
   explicitly scoped media retry policy. The fallback request at `:123` also omits
   the initial request's `Accept-Encoding: identity`, potentially causing rejection
   of a compressed response by the strict validator.
3. **P2 — Six ancestors is not a correct clipping boundary.** `watcher.js:205`
   stops after six parents. A local VM reproduction using the actual Chrome and
   Firefox modules placed a clipping ancestor at level seven: `isBadgeClipped`
   returned false for an outside badge in both. This can reintroduce floating badges
   outside a carousel. Cache actual clipping ancestors and batch geometry work
   rather than discarding correctness at an arbitrary depth.
4. **P2 — An iframe is not necessarily a dedicated player.** `watcher.js:263`
   returns main-player classification for sufficiently large subframe videos before
   checking thumbnail/preview ancestry. A 320x180 iframe preview with readyState 4
   is classified as a main player in both module reproductions. Large ad players,
   previews and embedded feeds are not excluded by the small-frame/hostname filter.
5. **P2 — HTTP success is not media validation.** `DownloadEngine.cs:2797`
   accepts the first successful response headers as a working FFmpeg referer; a
   200 HTML challenge page qualifies. It does not prove FFmpeg can parse media.
   The independent 3500 ms timeout per candidate is not linked to session
   cancellation, so stop can wait across candidate probes. These probing weaknesses
   predate at least some supplied edits; enlarging the list increases their impact.
6. **Evidence gap.** The unchanged 93 .NET tests do not add proof for the new
   401/403 retry paths. The two new browser cases are VM mocks, not loaded-extension
   or end-to-end media downloads. No Chrome performance recording or repeatable
   CPU/memory benchmark establishes the claimed root cause or completed fix.

## Verification

- `dotnet test SmartDm.sln --verbosity quiet`: 93 passed, 0 failed/skipped.
- `node --test tests/browser/*.test.cjs`: 10 passed, 0 failed.
- `node --check extensions/chrome/modules/watcher.js` and
  `node --check extensions/chrome/background.js`: passed.
- Module VM reproductions: deep clipping incorrectly returns false; a large iframe
  preview is classified as a main player. Both browsers reproduced.
- Chrome/Firefox manifest hashes match. No actual Firefox installation was attempted.
- No live streaming-site download or performance profiling performed.

## Required handoff

- Branch and commit: `sdm2.0`, `48ec34c`, dirty tree.
- Pre-existing dirty files: extensive desktop/browser/docs/tests/website/Java changes;
  additionally Firefox host files are now dirty. Preserved; attribution not inferred
  solely from the supplied transcript.
- Package and audit IDs addressed: review of cross-package media/browser/UI fixes;
  Package 2 remains active. No implementation gate closed.
- Files/modules changed: this report only.
- Schema migrations: none.
- Exact test commands/results: above.
- Manual verification: source review and local mocked/module checks only.
- Privacy/security evidence: no real cookies or remote media requests used in checks.
  Arbitrary referer guessing should not replace validated credential/provenance policy.
- Remaining limitations: findings above; live extraction and performance unverified.
- Exit gate fully satisfied: NO.
- Next allowed package: Package 2. Cross-package regressions should be corrected
  within explicitly authorized scope; do not infer that this closes browser/media gates.
