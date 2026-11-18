# Direct menu and toolbar appearance controls — 2026-11-17

**Branch and commit:** `sdm2.0` / `6c915637b1dfa2453a3842e3223f895c8925510a`
plus working changes. No commit, push, installer, desktop restart or Java edits.

**Pre-existing dirty files:** Preserved prior C# security/structural/staging work,
shared generated backgrounds and browser drag/ownership work, tests, tooling and
guides. Renderer/watcher files were already dirty; those behaviors remain covered.
No reset, stash or bulk staging.

**Package and audit IDs addressed:** Owner-authorized Package 4/5 presentation
slice. Selected Direct menu, Graphite, light/dark themes, 12px corners, compact
rows; user-controlled opacity. No security audit closure or broad package gate.

**Files/modules changed:** Both browser manifests; both `modules/overlay_ui.js`,
`modules/watcher.js`; new mirrored `modules/appearance.js`, `popup.html`,
`popup.css`, `popup.js`; shared `background/runtime.js` and generated bundles;
`overlay_appearance.test.cjs`, `thumbnail_styles.test.cjs`,
`format_menu_updates.test.cjs`; implementation/architecture/branch guides.

The approved menu uses native clickable format buttons, compact quality labels,
separate format text and fixed local line icons. Discovery, URLs, filenames,
snapshots, delivery acknowledgement, drag and frame ownership paths remain intact.
The long format detail and known size remain in tooltips; 576p stays 576p.
No remote fonts/icons or added runtime dependency.

The browser action now opens a **336px toolbar popup**, rather than a settings
tab. There is no options page or menu settings shortcut. Its Appearance section
contains system/light/dark choice, independent 0–100% menu/button sliders and
Reset. Additional sections can be added to this popup without a new application.
The former one-click browser action is retained as **Send this page to SmartDM**
inside the popup, using the existing active-tab permission and ADD_DOWNLOAD path.

Opacity applies to background fills, not the entire element: text/icons remain
opaque and blur is retained. Defaults reflect the owner's latest choices:
menu 100%, button 0%, Graphite, compact rows, 12px menu corners. At low button
opacity the foreground uses the selected theme's text color. Users can choose any
percentage; readability over arbitrary video imagery is their preference.

`OverlayAppearance` stores only sanitized `theme`, `menuOpacity`, `buttonOpacity`
under `smartdmAppearance` in browser local storage. Values are clamped to 0–100;
invalid values fall back to defaults. Storage-change events update mounted
controls in open pages/frames; newly mounted controls receive current values.
An older initial read cannot replace a newer change. Popup writes are serialized
and coalesced so the last slider setting is saved; persistence failures are shown.

**Schema migrations:** No database migration. New local presentation preference
key only. The manifests add the `storage` permission and declare `action.default_popup`.
The briefly implemented separate options page was removed before delivery, per
the owner's correction. No new native protocol, endpoint or credential field.

**Exact test commands and results:**

```powershell
node --check extensions/chrome/modules/appearance.js
node --check extensions/chrome/modules/overlay_ui.js
node --check extensions/chrome/modules/watcher.js
node --check extensions/chrome/popup.js
node tools/build-extensions.cjs
node tools/build-extensions.cjs --check
node --test tests/browser/*.test.cjs
node 'C:/Users/ifaha/.codex/visualizations/2026/10/26/01a178f9-dae7-7c71-87be-f0a77ae6d160/appearance-popup-smoke.cjs'
git -c core.safecrlf=false diff --check
```

Full browser suite: **376 passed, 0 failed/skipped**. Nineteen new cases cover
both packages' settings validation, storage, startup race, save failure, shared
assets, popup packaging, last-write/reset behavior, active website handoff and
error states. Existing filename/snapshot/drag/frame/security cases pass; the
576p display and old cyan styling assertions were updated for the approved UI.
JS syntax and generated bundles pass. C# was unchanged and was not retested.

**Manual verification:** Isolated headless Chrome rendered the actual popup
files: 336px wide, below the 600px popup height limit. Light/dark screenshots were
inspected. Verified opacity endpoints, labels/reset, persistence after reloading,
page handoff, real menu mounting and trusted Enter-key selection retaining
`Selected movie.mp4`. Browser storage and native handoff were mocked in that
synthetic smoke; installed-extension APIs/live sites were not claimed as tested.
Screenshots/script are in the task artifact directory. The user's browser profile
and running desktop app were not replaced.

**Privacy/security evidence:** Preferences contain no browsing URLs or secrets;
no network sync/server or telemetry. Asset and parity tests cover both packages.
Page sending still uses the existing native-message validation/cookie boundary.
Dynamic titles remain textContent, and icon markup is fixed local data. Local
Graphify query/AST refresh was used without external LLM extraction/source upload.
Storage API implementation follows [Chrome's storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage).

**Remaining limitations:** The owner must reload SmartDM Integration and refresh
open websites to activate changed manifests/content scripts. Installed Firefox
and live-browser UI checks remain unverified. Save completion is indicated by
Saved; no crash-proof pending-write guarantee is claimed. Very low opacity may
reduce contrast on some imagery. Full SQLCipher, release and prior package gates
remain open; this change does not address them.

**Exit gate fully satisfied:** YES for this bounded source/UI slice and synthetic
Chrome behavior; NO for installed-browser, wider package or release gates.

**Next allowed package:** Continue Package 2/prior owner-authorized prerequisites;
the requested UI work does not change the sequence.
