# AGENTS.md — SmartDM

## Version selection and session entry

This checkout is the **C# / Avalonia version** on `sdm2.0`.
The owner explicitly requires both versions to remain; see [ADR-010](docs/adr/ADR-010-preserve-product-tracks.md). Preserve the other product
branch and its history. Do not delete Java as C# migration cleanup or copy the C#
architecture wholesale onto `main`.

Before any edits, read [branch map](docs/BRANCHES.md),
[current implemented architecture](docs/CURRENT_ARCHITECTURE.md), and
[resume guide](docs/implementation/RESUME_HERE.md). Check Git branch, HEAD, dirty state
and worktree list. The architecture map records implementation; plans/ADRs define
requirements and target state. Keep that distinction explicit in reports.

After each meaningful change, refresh these guides and append actual test evidence.
Do not claim runtime safety, encryption or feature completeness from a plan alone.


This file is the entry point for any AI coding agent working on branch `sdm2.0` in this repository. Read this file first, every session, before touching any code.

The authoritative source of truth for branch `sdm2.0` is:

```
docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md
docs/adr/ADR-009-sdm2-csharp-avalonia-architecture.md
```

If anything conflicts, ADR-009 and the updated implementation plan win.

---

## 1. What SmartDM is

A free, local-first, open-source download manager for **Windows and Linux only**. One free edition (SmartDM 2.0), no premium tier, no accounts, no SmartDM-owned server, no telemetry.

**Architecture on branch `sdm2.0`:**
- **Desktop Application**: C# / .NET 9 with Avalonia UI located in `apps/desktop-avalonia`, launched via `run-app.bat` and `run-app.ps1`.
- **Browser Discovery**: Chrome and Firefox extensions using SmartDM's native format engine (`extensions/{chrome,firefox}/modules/format_engine.js`) to parse HLS playlists and Facebook DASH manifests.
- **Desktop Media Discovery**:
  - YouTube: Handled by `YouTubeMediaResolver.cs` via **YoutubeExplode**. It does **not** call `yt-dlp`.
  - HLS: Handled natively in C# via `HlsMediaResolver.cs` with enforced platform TLS validation (no accept-all bypass).
  - Stream Post-Processing: Handled by `FFmpeg` with explicit argument arrays for audio/video muxing and container conversion. No hardcoded WinGet or `yt-dlp.FFmpeg` paths.
- **Transfer engine**: `MainViewModel` now creates the C# `DownloadEngine` directly. Legacy Java IPC helpers remain outside production composition. The Java product remains preserved on `main`; it is not a runtime dependency of this C# product.

Do not add macOS support, accounts, cloud sync, a license server, ads, or any paid/entitlement-gated feature. These are permanent constraints, not placeholders.

---

## 2. Before you write any code

1. Read `AGENTS.md`, `docs/implementation/PHASE_STATUS.md`, `docs/implementation/TEST_EVIDENCE.md`, and `docs/implementation/KNOWN_LIMITATIONS.md`.
2. Read ADR-001 through ADR-009.
3. The working tree has extensive pre-existing user changes. Run `git status --short` and inspect diffs before editing. Never reset or overwrite another change.
4. Work on one package and its listed prerequisites at a time.
5. End every session with the required handoff report.

---

## 3. Package and Phase Isolation

Work proceeds strictly in the following sequence:

```text
Package 0: Architecture, phase reconciliation, CI foundation, TLS fix (Phases 0–1)
Package 1: Make C# engine the only transfer engine (Phase 4/5 parity, remove Java daemon)
Package 2: Transfer integrity, recovery, queue, duplicates (Phases 5–7)
Package 3: Secure persistence, secrets, browser handoff (Phases 2, 8)
Package 4: Preserve and test SmartDM's media extractor (Phases 9–10)
Package 5: Safety states, UI claims, installer, release validation (Phases 3, 11, 15–18)
```

- Reopen any gate whose C# implementation lacks verified proof.
- Never add a placeholder service that silently returns success.
- Never weaken encryption, TLS validation, consent, or safety to make tests pass.
- No new features in Java. Do not introduce yt-dlp.

---

## 4. While implementing

- Build end-to-end vertical slices.
- Add or update tests with every change; no code lands without tests.
- Use constructor injection; no service locators or hidden singletons.
- Keep network, database, filesystem, hashing, scanning, and process work off the Avalonia UI thread.
- Invoke external processes (FFmpeg, Windows Defender, ClamAV) with fixed paths and `ProcessStartInfo.ArgumentList` — never a shell string.
- Redact secrets before any log call or exception. API keys, cookies, and auth tokens must never appear in logs or ordinary DTOs.
- Schema changes must use immutable versioned migrations with rollback.

---

## 5. Architectural Boundaries

Target C# Boundaries (planned; most implementation still resides in the desktop project):
```text
SmartDm.Domain          Models, states, rules; no Avalonia, HTTP, SQLite, OS APIs
SmartDm.Application     Use cases and ports/interfaces
SmartDm.Download        HTTP probe, segments, journal, finalization
SmartDm.Persistence     SQLCipher and versioned migrations
SmartDm.Browser         Native messaging and validated capture protocol
SmartDm.Safety          Risk evidence, scanner adapters, quarantine
SmartDm.Media           Metadata, YouTube/HLS resolvers, FFmpeg adapter
SmartDm.Desktop         Avalonia view models and views; composition root
```

Forbidden, and enforced by CI architecture tests:
- `SmartDm.Domain` may not import UI frameworks (Avalonia), databases (SQLite), HTTP libraries, or OS APIs.
- UI may not touch databases directly or execute native processes directly.
- Safety code may never override or downgrade scanner evidence.
- No module may check a premium/entitlement flag — none exists.

---

## 6. Security Gates

| Area | Requirement |
|---|---|
| Secrets | Never in logs, exceptions, normal DTOs, or Avalonia bindings |
| TLS | Platform TLS validation strictly enforced; untrusted certs fail closed; no accept-all callbacks |
| Process execution | No shell; fixed executable + `ProcessStartInfo.ArgumentList`; bounded time/output |
| Network | TLS validation always on; redirect/header policy enforced; loopback authenticated |
| Files | Canonical destination validation; safe temp + atomic finalization; never auto-execute downloaded files |
| Browser | Versioned messages only; origin allowlist pinned to extension ID; durable acknowledgement before cancel |
| Gemini | Off by default; user-keyed; exact preview consent before sending; local fallback always present |
| Safety | Evidence-based status only; AI text never changes a verdict; no sample/hash leaves device |
| UI | No blocking work on Avalonia UI thread; destructive actions require confirmation |

---

## 7. Standard Verification

```powershell
dotnet restore SmartDm.sln
dotnet build SmartDm.sln --no-restore
dotnet test SmartDm.sln --no-build
```

Legacy Java validation (for regression checks while Java remains in tree):
```powershell
.\gradlew.bat check architectureTest integrationTest
```

---

## 8. Required Per-Session Handoff

Every session must end with:

```text
Branch and commit:
Pre-existing dirty files:
Package and audit IDs addressed:
Files/modules changed:
Schema migrations:
Exact test commands and results:
Manual verification:
Privacy/security evidence:
Remaining limitations:
Exit gate fully satisfied: YES or NO
Next allowed package:
```
