# SmartDM Phase Status

## Phase 0 - Product, legal, privacy, and supply-chain lock

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-0
- Known limitations: KNOWN_LIMITATIONS.md#phase-0
- Approved deviations: none

### Exit-gate checklist
- [ ] No unresolved "can we distribute this?" blocker.
- [ ] One approved project license.
- [ ] Approved FFmpeg distribution approach.
- [ ] Approved Gemini consent/data policy reflecting unpaid-service terms.
- [ ] Approved YouTube/content-rights notice.
- [ ] Approved supported-platform matrix.
- [ ] Approved unsigned-first distribution/ADR, with checksum publication and an honest SmartScreen/unrecognized-publisher first-run notice.
- [ ] Approved unpacked-Chrome/AMO-signed-Firefox extension distribution ADR, with Linux Snap/Flatpak handling defined.
- [ ] ADR-001 through ADR-006 created for scope, license, no-backend, media boundary, AI privacy, and encrypted persistence.

---

## Phase 1 - Repository and engineering foundation

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-1
- Known limitations: KNOWN_LIMITATIONS.md#phase-1
- Approved deviations: none

### Exit-gate checklist
- [ ] `clean check` passes on both platforms.
- [ ] No module cycle.
- [ ] No unverified dependency.
- [ ] `PHASE_STATUS.md`, `TEST_EVIDENCE.md`, and `KNOWN_LIMITATIONS.md` exist and are current.

---

## Phase 2 - Secure local profile and encrypted persistence

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-2
- Known limitations: KNOWN_LIMITATIONS.md#phase-2
- Approved deviations: none

### Exit-gate checklist
- [ ] Encrypted persistence passes Windows and Linux integration tests.
- [ ] No plaintext fallback exists.
- [ ] Privacy-redaction tests pass.
- [ ] Backup and restore work.
- [ ] Single-instance ownership works.

---

## Phase 3 - Minimal JavaFX shell and theme system

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-3
- Known limitations: KNOWN_LIMITATIONS.md#phase-3
- Approved deviations: none

### Exit-gate checklist
- [ ] The shell launches on Windows and Linux.
- [ ] All themes switch live and persist encrypted settings.
- [ ] Keyboard navigation reaches every primary destination.
- [ ] No infrastructure dependency is imported by UI modules.

---

## Phase 4 - Single-download vertical slice

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-4
- Known limitations: KNOWN_LIMITATIONS.md#phase-4
- Approved deviations: none

### Exit-gate checklist
- [ ] One URL downloads correctly on Windows and Linux.
- [ ] The destination never contains partial content under its final name.
- [ ] Cancel leaves the configured temp-file disposition.
- [ ] UI remains responsive.
- [ ] No test depends on a public website.

---

## Phase 5 - Segmentation, pause/resume, verification, and recovery

- Status: COMPLETED
- Started: 2026-07-17
- Completed: 2026-07-20
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-5
- Known limitations: KNOWN_LIMITATIONS.md#phase-5
- Approved deviations: none

### Exit-gate checklist
- [ ] No corruption across the complete fault-injection matrix.
- [ ] Pause is durable, not cosmetic.
- [ ] Resume never combines known-different resource versions.
- [ ] Segment fallback works.
- [ ] Recovery is idempotent.

---

## Phase 6 - Queues, scheduler, bandwidth, and resource control

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-6
- Known limitations: KNOWN_LIMITATIONS.md#phase-6
- Approved deviations: none

### Exit-gate checklist
- [ ] Queue capacity never exceeds configured limits.
- [ ] Schedules do not fire twice after a crash.
- [ ] Bandwidth limit stays within the measured tolerance.
- [ ] Shutdown leaves resumable state.

---

## Phase 7 - Categories, batch, clipboard, authentication, and proxy

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-7
- Known limitations: KNOWN_LIMITATIONS.md#phase-7
- Approved deviations: none

### Exit-gate checklist
- [ ] All inputs feed the same `AddDownload` application command.
- [ ] No secret reaches logs, UI projections, or unencrypted storage.
- [ ] Batch and clipboard limits prevent UI/resource abuse.

---

## Phase 8 - Chrome and Firefox native browser integration

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-8
- Known limitations: KNOWN_LIMITATIONS.md#phase-8
- Approved deviations: none

### Exit-gate checklist
- [ ] Chrome and Firefox can add ordinary links and batches.
- [ ] The application works when browsers are absent.
- [ ] Native host rejects untrusted clients and malformed input.
- [ ] Protocol compatibility matrix is documented.
- [ ] Neither browser integration depends on a paid certificate, a store review, or a store fee.
- [ ] Linux sandboxed-browser detection is in place and disclosed honestly; no other feature is blocked by its result.

---

## Phase 9 - yt-dlp and FFmpeg media subsystem

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-9
- Known limitations: KNOWN_LIMITATIONS.md#phase-9
- Approved deviations: none

### Exit-gate checklist
- [ ] Format list and size/codec labels are correct for fixtures.
- [ ] Audio-only and merged output succeed.
- [ ] External-process arguments are injection-safe.
- [ ] Tool absence/update failure produces recovery guidance.
- [ ] All media output remains within managed temp/destination roots.

---

## Phase 10 - YouTube thumbnail SmartDM panel

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-10
- Known limitations: KNOWN_LIMITATIONS.md#phase-10
- Approved deviations: none

### Exit-gate checklist
- [ ] Icon appears on supported thumbnails without playback.
- [ ] Both browsers show equivalent resolution/audio choices.
- [ ] Extension does not interfere with normal thumbnail clicks.
- [ ] No background browsing-history collection.
- [ ] A YouTube DOM change disables only the overlay, not SmartDM's normal downloads.

---

## Phase 11 - Local file catalog and duplicate detection

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-11
- Known limitations: KNOWN_LIMITATIONS.md#phase-11
- Approved deviations: none

### Exit-gate checklist
- [ ] Selected roots index incrementally and recoverably.
- [ ] Duplicate actions never delete or replace a file automatically.
- [ ] Potato profile meets memory/search/index budgets.
- [ ] Removing a catalog root stops monitoring and purges its catalog records safely.

---

## Phase 12 - Local smart folder selection

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-12
- Known limitations: KNOWN_LIMITATIONS.md#phase-12
- Approved deviations: none

### Exit-gate checklist
- [ ] Useful top-three suggestions work with Gemini disabled.
- [ ] Every score has a user-facing explanation.
- [ ] No heavy model runs in Potato mode.
- [ ] Learned data remains encrypted and deletable.

---

## Phase 13 - Local natural-language search

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-13
- Known limitations: KNOWN_LIMITATIONS.md#phase-13
- Approved deviations: none

### Exit-gate checklist
- [ ] All acceptance queries produce an inspectable local plan.
- [ ] Search meets Potato-mode budgets.
- [ ] User can correct the parser.
- [ ] No cloud/network dependency exists.

---

## Phase 14 - Optional Gemini consented fallback

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-14
- Known limitations: KNOWN_LIMITATIONS.md#phase-14
- Approved deviations: none

### Exit-gate checklist
- [ ] Gemini is disabled by default.
- [ ] No request can bypass the sanitizer/consent firewall.
- [ ] Every Gemini task has a local fallback.
- [ ] Free-tier data warning is accurate and linked to current terms.
- [ ] Removing the API key removes all Gemini capability without affecting core features.

---

## Phase 15 - Local safety scanner and risk center

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-15
- Known limitations: KNOWN_LIMITATIONS.md#phase-15
- Approved deviations: none

### Exit-gate checklist
- [ ] Scanner statuses are honest and evidence-backed.
- [ ] SmartDM never runs as administrator for normal operation.
- [ ] Malware verdict blocks direct open/run.
- [ ] Quarantine is isolated and recoverable.
- [ ] No file bytes or hashes go to external reputation services.

---

## Phase 16 - Remaining IDM-parity workflows

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-16
- Known limitations: KNOWN_LIMITATIONS.md#phase-16
- Approved deviations: none

### Exit-gate checklist
- [ ] IDM parity matrix has no unexplained missing item.
- [ ] Advanced flows preserve all earlier security and recovery guarantees.
- [ ] CLI and import/export do not leak secrets.
- [ ] User can disable each automation.

---

## Phase 17 - UX, accessibility, localization, and performance hardening

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-17
- Known limitations: KNOWN_LIMITATIONS.md#phase-17
- Approved deviations: none

### Exit-gate checklist
- [ ] Performance budgets met or approved with measured ADR.
- [ ] No critical accessibility issue.
- [ ] Minimal UI works without advanced knowledge.
- [ ] Optional features remain opt-in.
- [ ] Privacy review finds no unexplained outbound request.

---

## Phase 18 - Packaging, browser-extension bundling, update, and release hardening

- Status: IN_PROGRESS
- Started: 2026-07-17
- Completed: 
- Baseline commit: 
- Completion commit: 
- Test evidence: TEST_EVIDENCE.md#phase-18
- Known limitations: KNOWN_LIMITATIONS.md#phase-18
- Approved deviations: none

### Exit-gate checklist
- [ ] Install, launch, browser registration, download, media selection, search, scan, update, and uninstall pass on the release matrix.
- [ ] Every release artifact has a published, verified checksum; unsigned status is disclosed honestly in the UI and download page per ADR-0xx (Authenticode signing is not required to exit this phase).
- [ ] License notices/source obligations are satisfied.
- [ ] No macOS artifact or premium/entitlement code exists.
- [ ] Release candidate has documented known limitations and rollback.

---

