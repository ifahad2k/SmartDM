# User-reported social/media follow-up — 2026-11-03

Branch and commit: sdm2.0, 48ec34c, extensive pre-existing dirty tree preserved.
Pre-existing dirty files: desktop engine/UI/persistence, extensions including browser-specific packaging regressions, website, Java, docs and tests. No reset/stage/push.
Package and audit IDs addressed: explicit user cross-package repair of filename, social identity/quality and overlay defects. Does not open/close media package gates.
Files/modules changed: HttpProbeService.cs, AddDownloadViewModel.cs; shared Chrome/Firefox modules format_engine.js, watcher.js, overlay_ui.js, utils.js; new FileNameDecodingTests.cs and selected_social_media.test.cjs; documentation. No installer/manifest repair in this slice.
Schema migrations: none.

Implemented: decode a URL-encoded initial filename once before basename sanitization; prevent encoded traversal; social resolution bypasses tab-wide ranked fallback and stale format caches, accepts exact live URL or matched X poster asset; known video-only sources require paired audio; use scoped caption when available; real captured dimensions or explicitly unknown quality, no synthetic 720p fallback for social streams; replace social format lists on polling rather than accumulating other assets; clamp player popovers to iframe viewport; observe nested scroll; choose one visible Instagram/TikTok reel overlay.

Exact test commands and results:
- node --test tests/browser/*.test.cjs: 22 passed (12 new selected-social/positioning cases).
- dotnet test SmartDm.sln --artifacts-path <TEMP>/smartdm-social-validation --verbosity quiet: 97 passed (4 new filename cases).
- Initial ordinary build was blocked by the running app locking its DLL; isolated artifacts output was used without interrupting user downloads. Running app still uses the prior build.
- node --check extensions/chrome/modules/watcher.js: passed.
- git diff --check: passed.

Manual verification: supplied screenshots examined; page HTML fetched for both specified anime URLs (HTTP 200), but player URLs are dynamically loaded and absent from static iframe tags. Web inspection tool could not open either page. No live authenticated media download or loaded-extension positioning check completed. No LAN movie download attempted.
Privacy/security evidence: no cookies/keys logged or sent in tests. Encoded slash/backslash traversal checks pass. Ambiguous social blob sources fail closed rather than borrowing another feed video. Existing TLS/hash/range checks retained.
Remaining limitations: gotaku.to failed transfer and reanime.to missing stream are NOT resolved or claimed fixed; require live iframe/network trace. X opaque MSE sources and audio pairing remain unsupported when exact provenance is unavailable. Caption extraction depends on a scoped accessible card, otherwise title is Selected video. Available qualities are only captured sources, not a complete server ladder. Recycled-DOM/source-binding and loaded-browser verification remain needed. Prior Firefox packaging defects and broad referer retry/security issues remain.
Exit gate fully satisfied: NO.
Next allowed package: Package 2 normally; explicit user media defect repairs remain incomplete. Next follow-up is live player/source association for the two anime sites and X MSE, with captured-content-type routing and regression fixtures, without guessing unrelated sources or bypassing access controls.
