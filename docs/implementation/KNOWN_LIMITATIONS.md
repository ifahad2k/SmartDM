# SmartDM Known Limitations

This document records the explicitly accepted, temporary limitations for each implementation phase. These are not bugs, but intentional scoping decisions that will be resolved in later phases.

## Phase 0 - Product, legal, privacy, and supply-chain lock

Project license and full supply-chain distribution decisions remain unverified by external legal counsel. SmartScreen 'unrecognized publisher' warnings will appear until Authenticode signing is acquired.

---

## Phase 1 - Repository and engineering foundation

CI pipelines currently only test Windows and Ubuntu due to macOS runner cost constraints. Local environment setup relies on manual developer installation of JDK/Gradle rather than fully containerized DevContainers.

---

## Phase 2 - Secure local profile and encrypted persistence

Local profile encryption is implemented, but the master password prompt is not yet integrated into the GUI startup flow. Keys are stored in plaintext during testing.

---

## Phase 3 - Minimal JavaFX shell and theme system

JavaFX shell theme system lacks automatic OS-level dark mode synchronization. Users must manually toggle themes in settings.

---

## Phase 4 - Single-download vertical slice

Single-download slice lacks pause/resume and multi-threading capabilities. Large file downloads must finish in a single session.

---

## Phase 5 - Segmentation, pause/resume, verification, and recovery

Verification failure logs a warning but does not yet present an interactive UI prompt to the user to choose to keep or hard-delete the corrupted file.

---

## Phase 6 - Queues, scheduler, bandwidth, and resource control

Queues and bandwidth control do not yet support complex time-of-day scheduling rules.

---

## Phase 7 - Categories, batch, clipboard, authentication, and proxy

Proxy support requires manual configuration; system proxy auto-detection is not yet implemented.

---

## Phase 8 - Chrome and Firefox native browser integration

Browser extension integration requires manual installation of unpacked extensions in developer mode.

---

## Phase 9 - yt-dlp and FFmpeg media subsystem

yt-dlp integration currently bundles the executable directly rather than downloading it dynamically, increasing installer size.

---

## Phase 10 - YouTube thumbnail SmartDM panel

YouTube thumbnail panel only extracts a single resolution thumbnail and does not yet allow user selection of custom frames.

---

## Phase 11 - Local file catalog and duplicate detection

Local file catalog duplicate detection relies on filename matching; deep hash-based duplicate detection is deferred.

---

## Phase 12 - Local smart folder selection

Local smart folder selection uses naive regex heuristics and does not yet support complex user-defined rules.

---

## Phase 13 - Local natural-language search

Natural language search requires exact keyword matches and lacks semantic search capabilities.

---

## Phase 14 - Optional Gemini consented fallback

Gemini fallback is completely disabled pending further privacy reviews.

---

## Phase 15 - Local safety scanner and risk center

Local safety scanner relies on basic ClamAV definitions and does not yet integrate advanced heuristics.

---

## Phase 16 - Remaining IDM-parity workflows

IDM-parity workflows are functional but lack the deep contextual OS integrations present in legacy tools.

---

## Phase 17 - UX, accessibility, localization, and performance hardening

Accessibility screen-reader support is limited in some custom JavaFX components.

---

## Phase 18 - Packaging, browser-extension bundling, update, and release hardening

Automated MSI packaging pipeline is experimental and sometimes fails on strict environments.

---

