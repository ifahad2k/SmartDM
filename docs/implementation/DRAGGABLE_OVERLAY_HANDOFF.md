# Draggable browser download controls — 2026-11-17

**Branch and commit:** `sdm2.0`, `6c915637b1dfa2453a3842e3223f895c8925510a` plus
working changes. No commit, push, installer or Java work.

**Pre-existing dirty files:** Preserved the full entry `git status --short` set:
prior C# security, structural refactor and staging repairs; generated browser
backgrounds/shared sources; existing tests/tooling and guides. The four authored
overlay/watcher files edited here were clean on entry. No reset or bulk staging.

**Package and audit IDs addressed:** Owner-requested Package 4/5 browser UI
interaction slice. No security audit finding or broader package gate is closed.

**Files/modules changed:** `extensions/{chrome,firefox}/modules/overlay_ui.js`
and `watcher.js`; `tests/browser/draggable_overlay.test.cjs`;
`thumbnail_styles.test.cjs`; branch/architecture/resume/status/evidence/limits guides.

The shared renderer behavior (mirrored in both packaged modules) now supports
primary-pointer dragging for player banners and thumbnail badges. A five-pixel
threshold preserves ordinary clicks. Dragging closes the open menu and suppresses
only its trailing pointer click; subsequent clicks and keyboard activation work.
Buttons leave clipping/transformed cards on first movement, retain their original
media binding, remain within the document viewport, and keep their position through
watcher scroll/resize synchronization. Focused controls also move with Alt + arrow
keys. Touch scrolling is disabled only on the button itself. Pointer/cancel/blur
and removal cleanup release transient document listeners. Card/source lifecycle
visibility still applies so a moved badge does not remain attached to an old feed item.

**Schema migrations:** None. No new permission, storage, network or dependency.

**Exact test commands and results:**

```powershell
node --check extensions/chrome/modules/overlay_ui.js
node --check extensions/chrome/modules/watcher.js
node --test tests/browser/draggable_overlay.test.cjs
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
node 'C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/drag-browser-smoke.cjs'
git -c core.safecrlf=false diff --check
```

12 focused cases pass across Chrome/Firefox. Full browser suite: **347 passed,
0 failed/skipped**, including the four existing real-stylesheet controls updated
for grab/touch behavior. Syntax and bundle checks pass. C# is unchanged by this
slice; its earlier 478-pass result was not rerun or claimed as fresh evidence.

**Manual verification:** An isolated headless Chrome profile with synthetic content
was driven with trusted CDP mouse input. Verified drag outside a transformed,
overflow-hidden card; no unintended menu opening after drag; deliberate click
opening; selected media URL retained; scroll/resize bounds; source removal; and
player synchronization. Screenshot `drag-smoke.png` in the same artifacts directory
was visually inspected. This did not reload the user's installed extension.

**Privacy/security evidence:** Smoke tests used a separate browser profile, local
synthetic content and stubbed discovery; no real browsing profile, cookies or
download was read. The change does not touch discovery/authentication or handoff
validation. Graphify query/local AST refresh was used; no source upload or external
LLM extraction. Detailed graph: 2,926 nodes/7,848 edges/154 communities; compact
production overview retained separately.

**Remaining limitations:** Positions last for the mounted control and reset on
refresh/remount. Buttons inside cross-origin iframe players move within that
frame's viewport, not across its security boundary. Firefox has module regression
coverage; no installed Firefox or real-site manual drag was performed. Reload
SmartDM Integration and refresh open pages to activate the new content scripts.

**Exit gate fully satisfied:** YES for this bounded source/UI slice and Chrome
synthetic interaction; NO for installed-browser, broad package or release gates.

**Next allowed package:** Continue Package 2/prior authorized prerequisites; this
owner-requested UI slice does not change the package sequence.
