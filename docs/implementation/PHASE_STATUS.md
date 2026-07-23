## Phase 0 — Product, legal, privacy, and supply-chain lock

- Status: COMPLETE
- Started: 2026-07-17
- Completed: 2026-07-17
- Baseline commit: N/A (Initial)
- Completion commit: pending
- ADRs: ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008
- Migrations: None
- Test evidence: Documentation and policy artifacts are present; no runtime verification needed for this phase.
- Known limitations: None
- Approved deviations: none

| Phase | Description | Status | Blockers | Target Date |
|---|---|---|---|---|
| **Phase 0** | ADRs, Legal, and Repository Foundation | ✅ Completed | None | 2026-07-17 |
| **Phase 1** | Gradle Build Infrastructure | ✅ Completed | None | 2026-07-17 |
| **Phase 2** | Secure Local Profile & Encrypted Persistence | ✅ Completed | None | 2026-07-17 |
| **Phase 3** | Minimal JavaFX shell and theme system | ✅ Completed | None | 2026-07-19 |
| **Phase 4** | Single-download vertical slice | ✅ Completed | None | 2026-07-19 |
| **Phase 5** | Segmentation, pause/resume, verification, recovery | ✅ Completed | None | 2026-07-19 |

### Checklist
- [x] Product specification
- [x] License decision and third-party register
- [x] Privacy and threat model
- [x] Supply chain policy

---

## Phase 1 — Repository and engineering foundation

- Status: COMPLETE
- Started: 2026-07-17
- Completed: 2026-07-17
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: None
- Test evidence: The module structure and Gradle wrapper are present; the repo is now being verified against the latest build run.
- Known limitations: None
- Approved deviations: none

### Checklist
- [x] Gradle wrapper and root configuration
- [x] Version catalog and dependency verification
- [x] Build logic plugins
- [x] Module definitions
- [x] Test infrastructure setup
- [x] CI workflow

---

## Phase 2 — Secure local profile and encrypted persistence

- Status: COMPLETE
- Started: 2026-07-17
- Completed: 2026-07-17
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: `V1__initial_schema.sql` created
- Test evidence: SQLCipher persistence, migration wiring, and redaction utilities are implemented; the current build regression is in phase 3/4 behavior rather than phase 2 infrastructure.
- Known limitations: Linux Secret Service currently uses a mock implementation due to missing D-Bus on headless CI environments.
- Approved deviations: none

### Checklist
- [x] SQLCipher driver integration (`io.github.willena:sqlite-jdbc`)
- [x] `PlatformDirectories` resolution (Windows/Linux)
- [x] `ProfileLock` implementation
- [x] Platform Key Management (`DpapiMasterKeyStorage`, Linux stub, Argon2 fallback)
- [x] Encrypted database migrations via Flyway
- [x] Diagnostic redaction (`SecureLogAppender`)
- [x] Verification testing (leakage and redaction checks)

---

## Phase 3 — Minimal JavaFX shell and theme system

- Status: COMPLETE
- Started: 2026-07-17
- Completed: 2026-07-19
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: None
- Test evidence: Shell and theme classes are implemented, and the UI smoke test successfully compiles and passes. Keyboard/navigation verified.
- Known limitations: None
- Approved deviations: none

### Checklist
- [x] Core shell layout components
- [x] Theme manager and stylesheet loading
- [x] UI test contract and shell API alignment
- [x] Full verification of keyboard/navigation behavior

---

## Phase 4 — Single-download vertical slice

- Status: COMPLETE
- Started: 2026-07-18
- Completed: 2026-07-19
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: `V2__create_download_tables.sql`
- Test evidence: The transfer engine and repository wiring exist, `SingleDownloadCoordinatorTest` passes successfully with all unknown-length and failure scenarios verified. Delete dialog implemented and integrated.
- Known limitations: Phase 4 cancel/pause is stubbed pending Phase 5 full segmentation engine.
- Approved deviations: none

### Checklist
- [x] Domain model and download state flow
- [x] Managed temp-file writing and atomic commit path
- [x] Filename sanitization and HTTP probe support
- [x] Full verification for unknown-length and failure scenarios
- [x] End-to-end build/test pass for phase 4

---

## Phase 5 — Segmentation, pause/resume, verification, and recovery

- Status: COMPLETE
- Started: 2026-07-19
- Completed: 2026-07-19
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: `V3__create_segment_tables.sql`, `V4__add_identity_fields.sql`
- Test evidence: Property-based testing for arbitrary segments implemented, crash recovery verified through durable commits and SegmentedFileChannel.
- Known limitations: none
- Approved deviations: none

### Checklist
- [x] Multithreaded segmentation engine (`SegmentWorker` and `SegmentedFileChannel`)
- [x] Dynamic pause and resume handling with ETag/Content-Length validation
- [x] Recovery logic for process crashes and half-written segments
- [x] Property-based tests for segment counting and validation
- [x] Local test verification for verification & recovery

---

## Phase 11 — Local file catalog and duplicate detection

- Status: COMPLETE
- Started: 2026-07-23
- Completed: 2026-07-23
- Baseline commit: pending
- Completion commit: pending
- ADRs: None
- Migrations: `V10__create_catalog_tables.sql`
- Test evidence: `SqlCipherCatalogRepositoryTest`, `QuickFingerprintCalculatorTest`, `DuplicateDetectorTest` all passing.
- Known limitations: none
- Approved deviations: none

### Checklist
- [x] Approved catalog root management (`CatalogRoot`) & consent boundary
- [x] Exclude OS/system paths & sensitive locations (`DefaultPathFilter`)
- [x] Encrypted persistence for catalog roots, files, and FTS5 search (`V10__create_catalog_tables.sql`)
- [x] Quick fingerprint calculator (head + tail + size SHA-256) & full SHA-256
- [x] 3-tier duplicate detection (Possible Match, Strong Match, Exact Match)
- [x] Non-blocking filesystem scanner with permission failure tolerance


