# Repository cleanup — 2026-11-03

## Plan and behavior contract

Use the explicitly requested `ai-slop-cleaner` skill. Inventory the entire repository,
then apply bounded changes with regression evidence. Preserve all existing user edits,
download behavior, extractor identity checks, recovery formats, and source history.
Do not delete legacy modules, packaging, binaries, prototypes, or tests just because
they look old. The starting tree contains 1,063 tracked files and extensive dirty work.

Baseline: `dotnet test SmartDm.sln -v:q` passes 50 tests.

Order:
1. Classify fallback paths and lock selected behavior with tests.
2. Remove fabricated website authentication and monitor telemetry.
3. Remove proven unused monitor presentation code; keep diagnostic consumers.
4. Make snapshot output portable and reinforce tests.
5. Run desktop/browser/website checks and record remaining findings.

Independent read-only review approved these bounded monitor/snapshot edits. It
explicitly cautioned against deleting scanner, journal, anti-hotlink, or legacy
compatibility paths without dedicated contract tests.

## Fallback classifications

| Area | Classification | Resolution |
| --- | --- | --- |
| Website authentication substitutes demo users on invalid Firebase keys | Masking fallback; fabricates authentication and local admin state | Remove fake-success paths; preserve Firebase errors and popup-close feedback |
| Monitor seeded speed wave and inferred active segments | Masking fallback; fabricates measurements | Keep only observed current speed and actual engine segment state |
| Personal snapshot directory | Environment coupling | Portable temp default, optional `SMARTDM_SNAPSHOT_DIR`, create destination |
| Scanner-unavailable verdicts | Security contract requiring dedicated remediation | Preserve and track under Package 5 |
| Journal format compatibility | Grounded compatibility; preserves interrupted downloads | Preserve with existing recovery tests |
| CDN/Referer retries and selected-player checks | External compatibility and identity boundary | Preserve; browser identity regression tests gate changes |
| Legacy Java modules and launch helpers | Historical compatibility; not the production engine | Preserve until removal is independently proven safe |
| Chrome/Firefox copies | Packaging duplication | Preserve; manifests load browser-local assets |
| Website profile-owner overrides and Firestore fallbacks | Authorization architecture requires separate review | Record; client role labels must never authorize server writes |

## Scope limits

Repository-wide inventory is not proof that every file is free of defects. Auth backend
rules, persistence encryption, native IPC authentication, scanner evidence, and release
packaging remain separate remediation work. This pass does not close package gates.
Third-party runtimes and generated outputs are inventory items, not cleanup targets.

## AI SLOP CLEANUP REPORT

Scope: Repository-wide inventory of 1,112 tracked/untracked nonignored files at scan
time, including desktop, Java modules, extensions, website, tools, packaging, docs,
prototypes and bundled runtime. See `REPOSITORY_CLEANUP_INVENTORY.json` for area
counts and 11 groups of identical source/text files. Duplicate bytes alone did not
justify deletion. This is a bounded verified cleanup pass, not a line-by-line audit
or a claim that the entire repository is clean.

Behavior Lock: baseline 50 desktop tests; final 54 desktop, 13 auth and 8 browser
tests pass. New auth tests initially reproduced four fake sign-in successes and the
exposed debug identities. Added password-reset error propagation coverage after the
independent review identified the same masking pattern there. Success-path tests
assert the expected Firebase call occurs. These use mocked hooks/services and do
not constitute live Firebase or backend authorization verification.

Passes Completed:
- Resolution gate: classified selected fallbacks above; fixed fabricated auth and
  telemetry. Broader architectural findings remain in the remediation backlog.
- Dead code: removed unused debug login helpers, their context API entries, and the
  unconsumed monitor badge-background property/notifications. Kept badge color and
  pause icon because Program diagnostics consume them.
- Duplication: removed pass-through auth catch blocks after deleting mock branches.
  Browser copies and runtime copies remain intentional packaging boundaries.
- Naming/evidence: renamed snapshot output variable, replaced the personal output
  path with a portable directory and `SMARTDM_SNAPSHOT_DIR` override, removed the
  misleading Java FileChannel diagnostic, and stopped inventing segment activity.
- Tests: regression coverage added for observed telemetry, compact engine snapshot,
  auth errors/success calls, popup-close messages, and absent debug identities.

UI/Design Findings: Synthetic speed graph and active-socket display corrected. No
  visual redesign or feature removal was attempted. Existing small text and advanced
  diagnostics need a dedicated accessibility/evidence review; defaults in the model
  are not automatically treated as measured evidence.

Quality Gates:
- `dotnet test SmartDm.sln -v:q`: baseline PASS, 50 tests (includes restore).
- `dotnet build SmartDm.sln --no-restore -v:q`: PASS, 0 warnings/errors.
- `dotnet test SmartDm.sln --no-build -v:q`: PASS, 54 tests.
- `node --test smartdm-website/tests/auth-cleanup.cjs`: PASS, 13 tests.
- `node --test tests/browser/*.test.cjs`: PASS, 8 tests.
- `npm run build` in smartdm-website: PASS, TypeScript and Vite; existing large
  bundle warning remains (approximately 875 kB minified).
- `.\gradlew.bat check architectureTest integrationTest --console=plain`: PASS;
  88 tasks up-to-date, so this was cached validation rather than fresh execution.
- Standalone lint: N/A, no website lint script configured. Static/security scan:
  targeted source inventory and independent review only, not a full security audit.

Changed Files:
- `apps/desktop-avalonia/ViewModels/TransferMonitorViewModel.cs`: measured history,
  inactive unknown segments, remove unbound badge background and stale diagnostic.
- `apps/desktop-avalonia/App.axaml.cs`: portable snapshot output; create directory.
- `smartdm-website/src/context/AuthContext.tsx`: remove fake auth/reset success and
  unused debug identities; keep real Firebase paths and actionable errors.
- `tests/SmartDm.Architecture.Tests/MonitorEvidenceTests.cs`: telemetry regression tests.
- `smartdm-website/tests/auth-cleanup.cjs`: authentication regression tests.
- This report and inventory: cleanup plan, evidence, classifications and backlog.

Remaining Risks: encrypted storage, IPC/cookie handling, scanner evidence, role-owner
overrides, real Firebase authorization rules, CDN retry contracts, accessibility,
large website bundle and historical documentation drift require separate changes.
Legacy modules, generated/vendor files, build scripts, licenses, user downloads,
prototypes and existing uncommitted work were preserved. No repository files deleted.
No production app or live account was exercised during this pass.

## Required session handoff

Branch and commit: sdm2.0 at 48ec34c; no commit created.

Pre-existing dirty files: 43 modified tracked files plus existing untracked desktop
models/services, browser modules, launch scripts, prototypes and tests. Their work
was retained. Changes above layer onto the existing monitor and snapshot edits.

Package and audit IDs addressed: user-authorized repository cleanup; evidence/UI and
website authentication subset. No package exit gate or prior audit ID closed.

Files/modules changed: seven paths listed above (including report and inventory as
two paths gives seven total).

Schema migrations: none.

Exact test commands and results: recorded under Quality Gates above.

Manual verification: source review, usage searches, duplicate inventory and independent
review; no live UI, website login or download verification performed this session.

Privacy/security evidence: removed client-side fabricated auth and password-reset
success; preserved real Firebase failures. No new endpoints, secrets, dependencies,
TLS exceptions, scanner verdict changes or schema changes introduced.

Remaining limitations: see Remaining Risks; full repository cleanliness is unproven.

Exit gate fully satisfied: NO (broader remediation remains open).

Next allowed package: Package 2, per existing PHASE_STATUS; cleanup does not advance it.
