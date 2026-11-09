# Thumbnail button styling — 2026-11-08

Branch and commit: `sdm2.0`, starting at `711ef3c8b26be521ed5c7256f22752764f5c7ee7`.

Pre-existing dirty files: none.

Package and audit IDs addressed: owner-reported thumbnail-button CSS regression;
Package 4 browser presentation support. No broader package gate is closed.

Files/modules changed: `extensions/{chrome,firefox}/modules/watcher.js` and
`tests/browser/thumbnail_styles.test.cjs`, plus the required handoff guides.

The mounted thumbnail button had only `thumb-btn`, with no matching CSS rule.
It now also uses `banner-btn`, the existing shared dark button style, including
the font, border, spacing and hover/icon rules. Its original `thumb-btn` selector
and click handling remain. Explicit `type="button"` avoids form submission when
a host page places a thumbnail inside a form; a title explains the action.
No duplicate stylesheet or site-specific selector was introduced.

Schema migrations: none.

Exact test commands and results:

- Before the repair, `node --test tests/browser/thumbnail_styles.test.cjs`:
  all four new cases failed because the mounted button received no base style.
- After the repair, `node --test tests/browser/*.test.cjs`: **203 passed,
  zero failed/skipped**. Both extension copies, shared/adopted stylesheet and
  inline fallback styling, and existing thumbnail mount/click tests are covered.
- `git diff --check`: passed.

Manual verification: diagnosed from the user's screenshot and the actual badge
markup/stylesheet. No live browser or screen-capture tools were used in this
repair; loaded-extension appearance remains for the user's check. Reload SmartDM
Integration and refresh the affected page to activate the changed content script.

Privacy/security evidence: presentation markup only; extraction, transport,
permissions, network policy, authentication and persistence code are untouched.
Constructed stylesheet reuse and existing lifecycle bounds remain unchanged.

Remaining limitations: no live Chrome/Firefox visual confirmation in this turn;
desktop/Java suites were not rerun for a two-line browser markup change.

Exit gate fully satisfied: NO for full Package 4/5; the reported source regression
is fixed and its automated checks pass.

Next allowed package: continue the existing package prerequisites and shared media
remediation. Java `main` is preserved; installer/release creation stays deferred.
