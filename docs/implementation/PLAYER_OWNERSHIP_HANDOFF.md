# One control per nested player — 2026-11-17

**Branch and commit:** `sdm2.0` / `6c915637b1dfa2453a3842e3223f895c8925510a`,
plus preserved working changes. No commit/push or Java edits.

**Pre-existing dirty files:** Preserved the entry status set from the security,
structural, staging and draggable-control work. Both watcher modules were already
dirty from dragging; this change builds on that work without replacing it.

**Package and audit IDs addressed:** Owner-reported Dailymotion duplicate-control
bug, bounded Package 4/5 browser presentation slice; no audit finding closure.

**Files/modules changed:** `extensions/{chrome,firefox}/modules/watcher.js`;
`tests/browser/player_ownership.test.cjs`; branch/architecture/resume/status/
evidence/limitations guides. Renderer and background logic are unchanged.

The old attachment marker deduplicated individual DOM elements, but a wrapper and
its descendant video could each receive a banner. Extension content scripts also
run in every iframe: the parent iframe fallback and inner player could both mount.
Local mounting now prefers the innermost accepted player without collapsing
independent players. Rejected/unready preview media does not remove the fallback.

Mounted frames query their child for control ownership. An available child reports
status to its direct parent, which hides only the matching iframe fallback and
closes its menu/polling. The parent retains the fallback when no child control is
available. Child cleanup/pagehide releases ownership; pageshow answers again;
iframe load clears stale state and queries anew. Normal position synchronization
respects this ownership, including manually dragged controls.

**Schema migrations:** None. No new extension permission, persistent state,
dependency, network request or desktop change.

**Exact test commands and results:**

```powershell
node --test tests/browser/player_ownership.test.cjs
node --check extensions/chrome/modules/watcher.js
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
node 'C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/ownership-browser-smoke.cjs'
git -c core.safecrlf=false diff --check
```

Ten new controls pass across both browsers: both local mounting orders, independent
players, preview preservation, exact-source/boolean message checks, scroll-sync
suppression, iframe reload, child query/cleanup and page lifecycle. Full suite:
**357 passed, 0 failed/skipped**. JS syntax and generated-background checks pass.
C# was not changed or retested in this slice.

**Manual verification:** Isolated headless Chrome with real sandboxed cross-origin
`srcdoc` verified the status handshake, fallback suppression through synchronization,
restoration after inner-media removal, rejection of unrelated-window status and
same-document wrapper/video deduplication. Synthetic scripts/profile only; no real
media request. The smoke runner and screenshot remain in the artifacts directory.
An attempted public Dailymotion page read was unavailable via the web tool; the
reported live page itself was not inspected or claimed as verified.

**Privacy/security evidence:** Page messages contain only fixed type and boolean
availability. The parent matches `event.source` to the exact mounted iframe's
`contentWindow`; queries are answered only to the direct parent. These messages
cannot dispatch downloads or supply formats, credentials, destinations or native
IPC data. `'*'` permits opaque/cross-origin embed documents and carries no secrets.
Local Graphify query/AST refresh was used without source upload or external LLM.

**Remaining limitations:** Installed-extension/live Dailymotion and Firefox runtime
verification remain for the owner after extension reload plus page refresh. A
short fallback interval during frame loading is intentional. A child without the
extension keeps the parent fallback. No universal site-completeness claim.

**Exit gate fully satisfied:** YES for this bounded source regression and synthetic
Chrome frame behavior; NO for installed-browser, wider package and release gates.

**Next allowed package:** Package 2 and prior owner-authorized prerequisites; this
UI defect repair does not change the package sequence.
