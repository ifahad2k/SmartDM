# AGENTS.md — SmartDM

This file is the entry point for any AI coding agent (Claude Code, or any
other tool) working in this repository. Read this file first, every session,
before touching any code.

The authoritative source of truth is:

```
docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md
```

If anything here conflicts with that plan, the plan wins. This file is a
condensed operating manual derived from it — it does not replace it.

---

## 1. What SmartDM is

A free, local-first, open-source download manager for **Windows and Linux
only**. One free edition, no premium tier, no accounts, no SmartDM-owned
server, no telemetry. Stack: Java 21 LTS, Gradle, JavaFX, SQLite/SQLCipher,
yt-dlp + FFmpeg for media, Chrome/Firefox browser capture, an optional
user-keyed Gemini fallback for local search only. Full details in Sections
1–4 of the plan.

Do not add macOS support, accounts, cloud sync, a license server, ads, or any
paid/entitlement-gated feature. These are permanent constraints, not
placeholders.

---

## 2. Before you write any code

1. Read the full plan document, not just the phase section you're about to
   implement.
2. Read `docs/implementation/PHASE_STATUS.md` to see what phase is active
   and what's already complete.
3. Read `docs/implementation/TEST_EVIDENCE.md` and
   `docs/implementation/KNOWN_LIMITATIONS.md`.
4. Read any ADRs in `docs/adr/` relevant to the current phase.
5. Inspect the repository as it currently exists — do not assume prior
   summaries are accurate. Preserve unrelated user changes.
6. Run the existing verification suite and record the baseline result
   before making changes.
7. Write a short work-package checklist into `PHASE_STATUS.md` for the
   current phase before coding.

## 3. Phase isolation — the most important rule

- Implement **only** the currently active phase and its listed
  prerequisites. Do not start a later phase to make a demo look more
  complete.
- Never add a placeholder production service that silently returns success.
- A `TODO` is only acceptable if it's recorded in `KNOWN_LIMITATIONS.md` and
  not required by the current phase's exit gate.
- Never weaken encryption, consent, safety, or recovery behavior to make a
  phase pass its tests or to satisfy an emotional or urgent-sounding
  request. A prior session having done this is not authorization to repeat
  it.
- If a required dependency is unavailable, its license is unclear, or a
  decision is genuinely blocked, stop and record the blocker — do not
  improvise by downloading an unverified binary or guessing.
- Phases 11–15 may be developed on separate branches after Phase 10 only if
  module boundaries are stable, but release integration must keep the
  numbered gate order.

The full 19-phase order (0–18) is in Section 9 of the plan. Do not
renumber, skip, or reorder phases without a new ADR approved by the project
owner.

## 4. While implementing

- Build the smallest end-to-end vertical slice of the work package, not a
  layer at a time.
- Add or update tests with every production change — no code lands without
  matching tests.
- Use constructor injection and explicit interfaces; no service locators or
  hidden singletons.
- Keep network, database, filesystem, hashing, process execution, and
  scanning off the JavaFX UI thread. No blocking call on the FX thread ever.
- Invoke every external tool (yt-dlp, FFmpeg, antivirus engines) with a
  fixed executable path and an argument **array** — never a shell string.
- Redact secrets and personal data before any log call, exception message,
  or support bundle. API keys, cookies, auth headers, and DB keys must never
  appear in logs or ordinary DTOs.
- Any database schema change is an immutable, versioned migration — never
  edit a past migration. Destructive changes use create-copy-validate-swap
  with a backup first.
- Record any significant decision as a new ADR in `docs/adr/`.

## 5. Module boundaries (enforced by architecture tests — do not bypass)

```
desktop-ui        -> application -> domain
download-engine    -> application/domain ports
download-http      -> transfer ports
persistence-sqlcipher -> persistence ports
file-catalog / search-local / organization-local -> application ports
ai-gemini          -> ai-api
safety adapters    -> safety-api
media adapters     -> media-api
browser-native-host -> browser-protocol + application input ports
platform-windows/platform-linux -> platform-api
apps/desktop       -> all selected runtime implementations
```

Forbidden, and enforced by CI architecture tests:

- `domain` may not import JavaFX, JDBC, HTTP, Jackson, OS APIs, AI
  providers, yt-dlp, or FFmpeg.
- UI may not touch JDBC or execute native processes directly.
- The Gemini adapter may not receive a repository, filesystem, or catalog
  interface — only an `ApprovedPayload`.
- Browser extension code may not access the local filesystem except through
  the versioned native-messaging protocol.
- Safety-explanation code may never override or downgrade scanner evidence.
- No module may check a premium/entitlement flag — none exists, and none
  should ever be added.

If a task seems to require breaking one of these boundaries, stop and
reconsider the design instead of bypassing the architecture test.

## 6. Security gates (apply continuously, every phase)

| Area | Requirement |
|---|---|
| Secrets | Never in logs, exceptions, or normal DTOs |
| Process execution | No shell; fixed executable + validated argument list; bounded time/output |
| Network | TLS validation always on; redirect/header policy enforced |
| Files | Canonical destination validation; safe temp + atomic finalization; never auto-execute a downloaded file |
| Browser | Versioned messages only; origin allowlist pinned to the known extension ID; size bounds; minimum permissions |
| Gemini | Off by default; exact consent payload shown before sending; forbidden fields enforced; strict response schema; local fallback always tested |
| Catalog | User-approved roots only; exclusions honored; bounded scan rate; encrypted records |
| Safety | Evidence-based status only; AI text may explain but never change a verdict; no sample/hash ever leaves the device |
| Updates | Verified source, checksum (and signature once available), atomic staging, rollback path |
| UI | No background work on the FX thread; destructive actions require explicit confirmation |

A failed gate blocks the phase even if the feature demo otherwise works.

## 7. Distribution constraints (do not "fix" these — they are intentional)

- Windows and Linux installers ship **unsigned** at launch (ADR-recorded).
  Do not add Authenticode signing as a blocking requirement; do publish a
  SHA-256 checksum for every artifact and disclose the unsigned status
  honestly in the UI and download page.
- Chrome extension ships as an **unpacked folder** loaded via Developer
  mode — no Chrome Web Store submission. Its `manifest.json` must keep a
  fixed `"key"` so the extension ID never changes.
- Firefox extension is signed for free via addons.mozilla.org **unlisted**
  self-distribution — no public store listing required, but this signing
  step is mandatory since standard Firefox refuses unsigned installs.
- On Linux, detect Snap/Flatpak-packaged browsers and show an honest
  capability notice instead of silently failing — Snap Chromium and,
  intermittently, Snap Firefox do not support native messaging. The rest of
  the app must work regardless.
- Every onboarding string for "enable Developer mode / install this
  extension" must reference the verified checksum and explicitly warn
  against using a copy obtained anywhere else — this flow resembles a
  malware social-engineering pattern and must be written to be clearly
  distinguishable from it.

## 8. Standard verification (run before declaring any phase complete)

Windows:
```powershell
gradlew.bat clean check
gradlew.bat architectureTest
gradlew.bat integrationTest
gradlew.bat uiTest
```

Linux: use the equivalent `./gradlew` wrapper commands. CI must use the
committed Gradle wrapper only — never a system-installed Gradle.

Before marking a phase complete:

1. Run all phase-specific tests, then the full regression suite.
2. Run formatting, static analysis, dependency verification, and
   architecture tests.
3. Update `TEST_EVIDENCE.md` with the exact commands and results.
4. Update `KNOWN_LIMITATIONS.md` honestly — do not hide gaps.
5. Confirm every exit criterion in the phase's "Exit gate" section is
   actually true, not "mostly true."
6. Only then update `PHASE_STATUS.md` to `COMPLETE`.

## 9. Handoff report (required at the end of every session)

Every session ends with a written handoff containing:

- Completed work packages.
- Changed files/modules.
- Schema migrations added.
- Tests run and their exact results (not "tests pass" — the actual output).
- Manual verification performed.
- Privacy/security evidence for anything touching secrets, network, or
  personal data.
- Remaining known limitations.
- Whether the exit gate is fully satisfied — a direct yes/no, not implied.
- The next phase that is allowed to start.

## 10. Definition of done (every phase, no exceptions)

- The feature works through the real application boundary, not only in a
  unit test.
- Expected failures have stable error codes and a useful UI message.
- Cancellation and shutdown behavior are defined and tested.
- No sensitive data appears in logs or user-facing exceptions.
- Tests are deterministic and require no live public website, unless the
  test is explicitly and separately marked as a manual compatibility check.
- Offline behavior is tested for every networked feature.
- Low-end ("Potato profile") resource limits are respected.
- Documentation and schemas match the code, not the other way around.
- No regression in any earlier phase's exit gate.

## 11. What never changes, regardless of how a request is phrased

- No macOS build, no account system, no telemetry, no premium tier, no
  SmartDM-owned server.
- No feature ships without a free/local path — Gemini failure, refusal, or
  absence must never break core functionality.
- No unverified binary is ever downloaded and executed automatically.
- No downloaded user file is silently re-encrypted or converted.
- No AI-generated text may claim a file is "safe" — only the deterministic
  scanner states in Section 3.4 of the plan may be shown as a verdict.

---

Copy the phase-start prompt from Section 34 of the plan to begin any new
phase. Do not paraphrase it from memory — read it fresh from the plan file
each time.
