# Testing desk handoff — 2026-11-08

## Scope and branch

- Branch / starting commit: `sdm2.0`, `f4e6dae936e8750df8ff0f2e694f7318ccb3a1df`.
- Pre-existing dirty files: none. The other agents' intervening app/media/torrent
  commits were already committed and have not been altered by this task.
- Concurrent changes appeared during the task in `DownloadModel.cs`,
  `DownloadEngine.cs`, `ILocalIpcService.cs`, `LocalIpcService.cs`,
  `TransferScheduler.cs`, `MainViewModel.cs`, and new `IQueueManager.cs` /
  `QueueManager.cs`. Those are another writer's work, not Testing desk changes;
  they were left untouched. Do not include them as verification of this tool.
- Owner request: replace the simple `smartdm_testing_checklist.html` with a usable
  local testing workspace: per-site pass/fail, multiple bugs, screenshot evidence,
  bulk site import and AI-friendly single/all-site exports.
- Package/audit: owner-requested manual testing support for Package 4/5. This is
  tooling, not a fix to extraction, transfer, scanner or release behavior.

## Implemented files

- `tools/testing-desk/smartdm_testing_checklist.html`: portable, self-contained
  HTML/CSS/JavaScript. The original 49 sites and 102 checks are preserved.
- `tools/testing-desk/README.md`: tester workflow, storage, import/export schemas,
  limits and development verification.
- `tests/testing-desk/testing-desk.test.cjs`: import, identity, result state,
  report, backup/image validation and independent ZIP integrity regressions.
- The user's actual file at
  `E:/skill/projects/smartdm_testing_checklist.html` is updated from the canonical
  repository file. Its original is preserved beside it as
  `smartdm_testing_checklist.original-20261108-091509.html`.
- Branch/architecture/resume/status/evidence/limitations guides point here.

The UI uses a site list and an evidence-first work area. A site can hold many
independent bugs. Each bug has its own title, actual/expected behavior,
reproduction steps, exact URL, server/quality, severity, frequency, state and
screenshots. Successful/failed checks and result history also export. A `fixed`
bug still needs retesting; only `verified` clears it from unresolved bugs.

## Persistence and format changes

No application SQLite migration. This independent tool creates IndexedDB version
1 with workspace and evidence stores; record/backup/report schema version is 2.
Screenshots are original local Blobs, not local-storage base64 strings.
Workspace writes and asset removals are transactional; another tab's newer
revision blocks an overwrite. Restores validate records and the full screenshot
inventory before confirmation and transactional replacement.

The old `smartdm-checklist` checkbox array is migrated only when its length
matches the preserved checks; checked items become passed checks, never inferred
whole-site passes. The legacy storage entry is retained. Missing storage, quota
failures and missing screenshot files are reported explicitly.

AI ZIP export contains `report.md`, `report.json`, `README.md` and referenced
`screenshots/` files. Its ZIP writer uses stored entries and CRC32, with no CDN,
package runtime or network dependency. Text-only Markdown and a restorable JSON
backup with embedded images are separate choices. Exports support current/all,
failed/passed and all tested scopes.

## Actual test evidence

- `node --test tests/testing-desk/*.test.cjs`: **9 passed, 0 failed/skipped**.
  Both inline JavaScript scripts also parse in Node during these tests.
- Tests preserve the original 49 sites/102 checks; exercise CSV/TSV/pipe/Markdown/
  name-and-URL imports, invalid rows and duplicate/query/fragment identities;
  cover multiple bugs and failed/fixed/verified/pass states; check single/all
  report content; round-trip Unicode/draft URLs and original image bytes;
  reject corrupt/executable image types, unsafe site links and duplicate IDs.
- Python standard-library `zipfile` independently reads the generated ZIP, checks
  CRCs and exact image bytes. No downloaded test libraries are required.
- Chrome, isolated `?sandbox=1`: a failure was recorded and edited; title/actual
  error survived reload. The site contained two independent bugs. A screenshot
  was attached in the browser and displayed in the correct bug's evidence tray.
- Chrome bulk import preview showed **2 new, 1 duplicate skipped, 0 invalid**;
  import increased the list from 49 to 51 without removing the existing failure.
  One imported QA site was explicitly marked Passed.
- Actual Chrome single-site ZIP in Downloads was inspected: **1 site, 2 bugs,
  1 screenshot**, complete `report.md`/`report.json`/README/image inventory and
  `zipfile.testzip() == None`.
- Actual all-site Chrome ZIP was inspected: **51 sites, 1 passed, 1 failed,
  49 not tested, 2 bugs, 1 screenshot**; CRC check passed and the successful QA
  site was included. These are sandbox observations, not product/site verdicts.
- Desktop screenshot review confirmed the clean rectangular layout, visible
  result controls, site navigation, screenshot tray and multi-bug editor.
- The final original-path HTML was opened in Chrome outside the sandbox: 49
  sites, no demonstration bugs, and `Saved locally`. SHA-256 verification confirms
  the repository and user-file copies match. Final targeted run again passed all
  9 tests; `git diff --check` passed (an unrelated concurrent C# file emitted only
  a line-ending warning).

## Privacy and security evidence

No desktop/extension/network/security configuration was changed. No installers,
account services, cloud storage or telemetry were created. CSP blocks external
connections and script dependencies. User text is escaped in UI HTML; navigation
links accept HTTP(S) only, without embedded credentials. Screenshot inputs are
limited to PNG/JPEG/WebP/GIF with type signatures and bounded sizes. Import and
ZIP entry paths cannot execute scripts or escape the archive directory. Nothing
is automatically sent to another AI or website. The user controls what they export.

## Remaining limits and gate

- Browser storage is profile/origin/path-specific and can be cleared; export JSON
  backups for portable persistence. Screenshot data is in memory only if IndexedDB
  is unavailable, and the UI discloses that fallback.
- The browser clipboard-paste/drop routes are implemented; screenshot attachment
  was exercised live. End-to-end restore UI confirmation, mobile viewport behavior
  and Firefox/Linux runtime were not exercised. Restore/image fidelity is covered
  by data tests, not presented as browser runtime proof.
- No .NET, Java or browser-extension behavior changed, so their broad suites were
  not rerun for this standalone tool. Product media failures and package gates
  remain open; this task certifies no site's download reliability.
- Exit gate fully satisfied: **NO for product Package 4/5 closure**. The requested
  testing tool and its scoped checks are implemented; use it to collect real defects.
- Next allowed package: resume the existing package prerequisites / shared media
  remediation with actual exported evidence. Installer/release remains deferred.
