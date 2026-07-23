# AI Memory Log

This file is used by the AI agent to continuously document all actions taken, files modified, and progress made during each implementation phase.

## Current Phase: Phase 0-5 Audit Remediation (Batch 1)

- **Date:** 2026-07-23
- **Status:** Remediation Fixes Pending CI Validation.

### Action Log
* Set up the base directory structure according to the implementation plan.
* Initialized Git repository and pushed to GitHub.
* Created `memory.md`.
* Updated the master `SmartDM-Phase-by-Phase-Implementation-Plan.md`.
* Created ADR-001 through ADR-008.
* Created `docs/architecture/product-scope.md`.
* Created `docs/privacy/data-inventory.md`, `docs/security/threat-model.md`, and `docs/security/supply-chain-policy.md`.
* Created `docs/architecture/THIRD_PARTY_LICENSES.md` and `LICENSE` (GPL-3.0).
* Created root Gradle files (`build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `gradle/libs.versions.toml`).
* Created `build-logic` convention plugins (`smartdm.java-library`, `smartdm.javafx-app`, `smartdm.testing`).
* Created `build.gradle.kts` files and directory structures for all 25+ modules.
* Created `ModuleBoundaryTest.java` architecture test in `domain` module.
* Created GitHub Actions CI workflow.
* Initialized Gradle Wrapper.
* Added SQLCipher via Willena JDBC driver.
* Implemented `PlatformDirectories` and `ProfileLock`.
* Implemented `KeyManager` with `DpapiMasterKeyStorage`, Linux stub, and `Argon2MasterPasswordFallback`.
* Added `SecureLogAppender` for diagnostic redaction.
* Wrote integration tests to prove database files do not leak plaintext.
* Fixed final Java Regex path redaction bug in `SecureLogAppenderTest`.
* **Phase 3:** Minimal JavaFX shell established, theming system created (CSS and ThemeManager), test infrastructure expanded to include TestFX and UI thread frame time measurement testing. No infrastructure imports leaked into UI module.
* **Phase 4:** Single-download vertical slice implemented. SQLite DB, Java HttpClient download engine, and custom Glassmorphic JavaFX dialogs built based on HTML designs.
* **Phase 5:** Segmentation and multi-threaded downloading engine (`SegmentWorker`, `SegmentedFileChannel`) implemented. Dynamic pause/resume verification and SQLite database commits (V3, V4 migrations) integrated to recover from process crashes and ensure file integrity.

### Audit Remediation (Batch 1)
* **SDM-001 (CI/CD Pipeline Trust):** Pinned GitHub actions to immutable SHAs (`actions/upload-artifact@65462800fd760344b1a7b4382951275a0abb4808`). Ensured CI pipeline fails on strict checks.
* **SDM-002 (Gradle Supply-Chain Metadata):** Generated authentic SHA-256 dependency verification metadata (`gradle/verification-metadata.xml`) via `--write-verification-metadata sha256`. Restored true Logback SHA and successfully ran local strict build.
* **SDM-003 (Accurate Project Documentation):** Demoted Phase 0-5 completion claims to `IN_PROGRESS` and `NOT_STARTED` for future phases pending checklist satisfaction. Dynamically generated `PHASE_STATUS.md` with true exit-gate checklists and `KNOWN_LIMITATIONS.md` with real limitations extracted from the plan.
* **SDM-004 (Erroneous Repository Hygiene):** Purged obsolete `scratch/` files and tracked Gradle caches. Upgraded `.class` checking in CI to use `git ls-files` recursively.
* **SDM-005 (Readme Accuracy):** Removed misleading features (e.g., Natural Language Search) and honestly separated existing Phase 0-5 functionality from Phase 6-12 planned work in `README.md`.

## Batch 2 — Media process remediation

- Baseline commit: a895a0af16b006500b155dd3b17c832ff8e821f9
- Branch: remediation-fixes
- Status: IN_PROGRESS
- Started: 2026-07-24
- Scope:
  - bounded native process execution
  - platform-correct media temp directories
  - async media control
  - removal of static tracker
  - architecture and CI verification

### Remaining Batch 2 Remediation Inventory

| Concern | Current files | Planned replacement |
|---|---|---|
| Media identity | SmartDmApp.java, YtDlpMediaDownloadRunner.java, MediaDownloadIntegrationTest.java, MediaDownloadRunner.java | MediaJobStore |
| Start operation | EnterUrlDialog.java, MainShell.java, MediaBatchAddDialog.java, MediaDownloadDialog.java, TopBar.java, SmartDmApp.java | CompletionStage chain |
| Delete operation | SmartDmApp.java, MediaDownloadDialog.java, SqlCipherDownloadRepository.java | Await runner then remove record |
| Shutdown | SmartDmApp.java | App-owned resources |
| Output discovery | YtDlpMediaDownloadRunner.java | yt-dlp final-output manifest |
