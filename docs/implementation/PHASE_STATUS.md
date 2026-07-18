## Phase 0 — Product, legal, privacy, and supply-chain lock

- Status: COMPLETE
- Started: 2026-07-17
- Completed: 2026-07-17
- Baseline commit: N/A (Initial)
- Completion commit: pending
- ADRs: ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008
- Migrations: None
- Test evidence: None (Documentation Phase)
- Known limitations: None
- Approved deviations: none

| Phase | Description | Status | Blockers | Target Date |
|---|---|---|---|---|
| **Phase 0** | ADRs, Legal, and Repository Foundation | ✅ Completed | None | 2026-07-17 |
| **Phase 1** | Gradle Build Infrastructure | ✅ Completed | None | 2026-07-17 |
| **Phase 2** | Secure Local Profile & Encrypted Persistence | ✅ Completed | None | 2026-07-17 |
| **Phase 3** | Minimal JavaFX shell and theme system | ✅ Completed | None | 2026-07-17 |

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
- Test evidence: `gradlew clean check` passes and architecture tests enforce boundaries.
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
- Test evidence: `SqlCipherDatabaseIntegrationTest` proves `.db` and `.db-wal` leak no plaintext strings; `SecureLogAppenderTest` proves IP, URL, and Path redaction works correctly. `gradlew clean check` fully passes.
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
