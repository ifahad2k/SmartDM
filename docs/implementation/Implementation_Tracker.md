# SmartDM Implementation Tracker

This document tracks the high-level progress of the SmartDM phases based on the latest verified repository state.

| Phase | Name | Status | Start Date | End Date | Notes |
|-------|------|--------|------------|----------|-------|
| Phase 0 | Product, legal, privacy, and supply-chain lock | COMPLETE | 2026-07-17 | 2026-07-17 | ADRs and policies defined |
| Phase 1 | Repository and engineering foundation | COMPLETE | 2026-07-17 | 2026-07-17 | Gradle multi-module build structure is present |
| Phase 2 | Secure local profile and encrypted persistence | COMPLETE | 2026-07-17 | 2026-07-17 | Persistence, redaction, and profile-locking primitives are implemented |
| Phase 3 | Minimal JavaFX shell and theme system | COMPLETE | 2026-07-17 | 2026-07-19 | Shell, theming, and UI test contract implemented and verified |
| Phase 4 | Single-download vertical slice | COMPLETE | 2026-07-18 | 2026-07-19 | Core transfer flow, atomic temp-to-dest, and tests passing |
| Phase 5 | Segmentation, pause/resume, verification, recovery | COMPLETE | 2026-07-19 | 2026-07-19 | Property-based tests, pause/resume, and crash recovery implemented |
| Phase 6 | Queues, scheduler, bandwidth, and resource control | COMPLETE | 2026-07-20 | 2026-07-20 | Queue execution engine, database-backed scheduling timers, SetTimerDialog UI |
| Phase 7 | Categories, batch, clipboard, authentication, proxy | NOT STARTED | | | |
| Phase 8 | Chrome/Firefox native browser integration | NOT STARTED | | | |
| Phase 9 | yt-dlp and FFmpeg media subsystem | NOT STARTED | | | |
| Phase 10 | YouTube thumbnail SmartDM panel | NOT STARTED | | | |
| Phase 11 | Local file catalog and duplicate detection | NOT STARTED | | | |
| Phase 12 | Local smart folder selection | NOT STARTED | | | |
| Phase 13 | Local natural-language search | NOT STARTED | | | |
| Phase 14 | Optional Gemini consented fallback | NOT STARTED | | | |
| Phase 15 | Local safety scanner and risk center | NOT STARTED | | | |
| Phase 16 | Remaining IDM-parity workflows | IN PROGRESS | 2026-07-20 | | IDM dark context menu, action handlers (Open, Open Folder, Resume, Stop, Remove), left/right click behavior |
| Phase 17 | UX, accessibility, localization, performance hardening | IN PROGRESS | 2026-07-20 | | Non-flickering progress bar layout fixes, dark glassmorphic dialog background consistency |
| Phase 18 | Packaging, browser-extension bundling, release hardening | NOT STARTED | | | |

*Status options: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE*

---

## Agentic Local AI QA Testing Prompt & System Instructions

Use the following detailed prompt when delegating end-to-end quality assurance and verification testing to an autonomous local AI QA agent:

```markdown
### SYSTEM PROMPT FOR LOCAL AI QA TESTING AGENT

**Role**: Senior Automated QA & Usability Verification Subagent for SmartDM (Internet Download Manager Parity Desktop Application).

**Goal**: Thoroughly test and verify all newly implemented features, engine functionality, UI interactions, database persistence, and stability in the SmartDM JavaFX application up to the current build.

---

### TEST SUITE VERIFICATION CHECKLIST

#### 1. Core Download Engine & Progress Bar Stability
- [ ] **Test Download**: Initiate a live test download using a standard target URL (e.g., `http://ipv4.download.thinkbroadband.com/512MB.zip` or local mock server).
- [ ] **Flicker & Animation Check**: Observe the download progress cell during active data transfer and mouse hover. Verify that the progress bar does NOT flicker, loop layout recalculations, or cause high CPU layout recalculation.
- [ ] **Atomic File Finalization**: Let a test download reach 100% completion and verify that the temp file in `.smartdm/temp` is atomically moved to the destination folder.

#### 2. Queue & Timer Scheduling System
- [ ] **Queue Addition**: Right-click or select "Add to Queue" for a pending download. Confirm it enters the QUEUED state and appears in the Queue Workspace.
- [ ] **Timer Configuration**: Right-click a download -> select "Add to queue" -> "Set Timer...". Set a short timer (e.g., 5 seconds or 1 minute).
- [ ] **Database Persistence**: Verify that `scheduled_start_time` is correctly written to the SQLite database schema (`downloads` / `schedules` tables).
- [ ] **Automatic Engine Pick-up**: Verify that when the timer expires, the background engine automatically transitions the download from `QUEUED` / `SCHEDULED` to `DOWNLOADING` without requiring app restart or manual intervention.

#### 3. Dark Theme & Dialog Aesthetic Consistency
- [ ] **SetTimerDialog Background**: Open the Set Timer window and confirm the background is fully opaque with the signature dark gradient background (`.dialog-root`), NOT transparent or showing underlying text overlap.
- [ ] **Text Contrast**: Check all labels and input fields ("Start immediately", time spinners, action buttons) to ensure high contrast against the dark background.

#### 4. Context Menu & IDM Parity Actions
- [ ] **Visual Parity**: Right-click a download cell. Verify that the context menu renders using the dark glassmorphic theme (`main.css`) rather than default OS white popups.
- [ ] **Item Structure**: Confirm the presence of IDM parity items: `Open`, `Open with...`, `Open folder`, `Move/Rename (Ctrl-M)`, `Redownload`, `Resume Download`, `Stop Download`, `Refresh download address`, `Remove`, `Add to queue`, `Delete from queue`, `On Double click`, `Properties`.
- [ ] **Functional Execution**:
  - `Open`: Triggers OS default application for completed file.
  - `Open folder`: Opens the containing directory in system file explorer.
  - `Stop Download` / `Resume Download`: Pauses/Resumes active network transfer streams.
  - `Remove` / `Delete from queue`: Successfully cancels and removes item from workspace.

#### 5. Mouse Interaction Differentiation
- [ ] **Left-Click Behavior**: Click a download item with Primary Mouse Button (Left Click). Verify it opens/expands the Details Side Panel.
- [ ] **Right-Click Behavior**: Click a download item with Secondary Mouse Button (Right Click). Verify it opens the Context Menu WITHOUT expanding or toggling the Details Side Panel.

---

### REPORTING INSTRUCTIONS
- Run test scenarios sequentially.
- Record any unexpected GUI freezes, exceptions, layout loops, or unhandled errors.
- **If zero defects/issues are found**: Issue a clean QA status report confirming ready-for-release status.
```

