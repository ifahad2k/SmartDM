# SmartDM Phases 0–12: Specific Problems and Detailed Remediation Plan

**Document type:** Engineering audit and corrective implementation specification  
**Repository:** [ifahad2k/SmartDM](https://github.com/ifahad2k/SmartDM)  
**Repository branch reviewed:** `main`  
**Visible latest commit during review:** `97cb50c`  
**Review date:** 2026-07-23  
**Reference specification:** *SmartDM Phase-by-Phase Implementation Plan*, revision 1.0  
**Coverage:** Phases 0 through 12  
**Recommended next action:** Stabilize and verify Phases 0–12 before starting Phase 13

---

## 1. Purpose

This document converts the Phase 0–12 repository audit into a concrete implementation plan that a human developer or autonomous coding agent can follow.

It does not merely list missing features. For each problem, it specifies:

- the affected phase and files;
- the observed evidence;
- why the problem matters;
- the likely root cause;
- the required technical solution;
- tests that must be added;
- the exact acceptance criteria;
- dependencies and implementation order;
- risks that an AI coding agent must avoid.

The target is not to make the repository *look* complete. The target is to make every phase satisfy its actual exit gate with reproducible evidence on Windows and Linux.

---

## 2. Audit limitations and evidence standard

### 2.1 What was inspected

The assessment used the public repository, including:

- repository root and module structure;
- `.github/workflows/ci.yml`;
- `docs/implementation/PHASE_STATUS.md`;
- `docs/implementation/TEST_EVIDENCE.md`;
- `docs/implementation/Implementation_Tracker.md`;
- `gradle/verification-metadata.xml`;
- Phase 11 catalog classes;
- Phase 12 smart-folder classes;
- visible commit and workflow history;
- the approved phase-by-phase implementation plan.

### 2.2 What was not independently verified

The repository could not be cloned and executed in the review environment because direct container network access was unavailable. Therefore:

- build success was not independently reproduced;
- Windows and Linux runtime behavior was not directly observed;
- UI behavior was not manually exercised;
- database encryption was not forensically tested;
- browser extensions were not installed;
- yt-dlp and FFmpeg process behavior was not executed.

Any item based only on missing evidence is labeled an **unverified completion gap**, not automatically a confirmed code defect.

### 2.3 Severity definitions

| Severity | Meaning |
|---|---|
| **Blocker** | Prevents trustworthy verification, security, or release. Must be fixed first. |
| **Critical** | Can cause corruption, secret exposure, incorrect security behavior, or a major architecture violation. |
| **High** | Major planned capability is missing, unsafe, or likely to fail under real use. |
| **Medium** | Important correctness, maintainability, UX, or performance issue. |
| **Low** | Cleanup, consistency, documentation, or non-blocking improvement. |

### 2.4 Evidence labels

| Label | Meaning |
|---|---|
| **Confirmed** | Directly visible in repository code or files. |
| **Strongly indicated** | Multiple repository signals support the finding, but runtime verification is still needed. |
| **Unverified gap** | Required evidence or implementation could not be located; the team must verify before claiming completion. |

---

## 3. Executive summary

SmartDM contains substantial real implementation work. It is not an empty scaffold. The strongest areas are:

- modular Gradle layout;
- JavaFX application shell;
- ordinary and segmented transfer code;
- browser/native messaging work;
- media extraction integration;
- initial encrypted persistence;
- initial file catalog;
- initial smart-folder ranking.

However, the repository currently has a serious difference between **feature existence** and **phase completion**.

The largest risks are:

1. CI runs terminate in only a few seconds and do not provide reliable build evidence.
2. Dependency verification metadata is invalid.
3. Phase tracking documents contradict one another.
4. Test evidence is stale and covers only Phases 0–5.
5. Phase 6 and Phase 7 are marked complete despite important required capabilities being absent from their own summaries.
6. Phase 8–10 functionality is broad but lacks security, compatibility, and deterministic test evidence.
7. Phase 11 performs quick hashing on every indexed file and lacks the planned incremental watcher/checkpoint architecture.
8. Phase 11 duplicate detection computes the full hash before cheaper candidate tiers.
9. Phase 12 likely compares relative catalog paths against absolute candidate paths incorrectly.
10. Phase 12 appears to perform repository and filesystem work from the JavaFX thread.
11. The README advertises Phase 13 and Phase 14 capabilities before those phases are complete.
12. Repository root hygiene allows backup sources, test programs, prototypes, and a compiled `.class` file.

### Current engineering interpretation

A fair status statement is:

> Major feature prototypes exist through Phase 12, but verified plan-compliant completion is not proven beyond approximately Phase 5.

The repository should enter a stabilization milestone before Phase 13.

---

# Part I — Cross-cutting blockers

## SDM-001 — CI does not provide trustworthy verification

- **Severity:** Blocker
- **Evidence:** Strongly indicated
- **Affected phases:** 1–12
- **Primary file:** `.github/workflows/ci.yml`
- **Observed behavior:** Recent visible workflow runs complete in approximately 5–9 seconds, far too quickly to compile and test a large multi-module Java/JavaFX application. The workflow pins action commits, but the pinned references appear to fail before Gradle execution.

### Why this matters

Every phase definition requires:

- full regression tests;
- architecture tests;
- integration tests;
- UI tests;
- Windows and Linux evidence;
- retained reports.

Without working CI, no current commit can be confidently called complete.

### Required solution

Replace invalid or obsolete action references with supported, verified references.

Recommended workflow structure:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Validate Gradle wrapper
        uses: gradle/actions/wrapper-validation@v4

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Verify
        shell: bash
        run: ./gradlew --no-daemon clean check architectureTest integrationTest

      - name: Run UI tests
        shell: bash
        run: ./gradlew --no-daemon uiTest

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: verification-reports-${{ matrix.os }}
          path: |
            **/build/reports/**
            **/build/test-results/**
          if-no-files-found: warn
```

For Windows, GitHub Bash usually resolves `./gradlew`; alternatively create OS-specific commands:

```yaml
- name: Verify on Windows
  if: runner.os == 'Windows'
  run: .\gradlew.bat --no-daemon clean check architectureTest integrationTest uiTest
```

Add a nightly job for longer tests:

```yaml
on:
  schedule:
    - cron: "0 2 * * *"
```

Nightly jobs should run:

- all UI tests;
- fault-injection tests;
- catalog benchmark;
- large-link browser protocol tests;
- media fixtures;
- packaging smoke tests when available.

### Required tests and evidence

1. Push a harmless documentation commit.
2. Confirm both Ubuntu and Windows jobs enter the Gradle build step.
3. Confirm reports are uploaded even when a test fails.
4. Deliberately introduce a failing unit test on a temporary branch and verify CI fails.
5. Deliberately add a forbidden architecture dependency and verify `architectureTest` fails.
6. Record the run links and commit SHA in `TEST_EVIDENCE.md`.

### Acceptance criteria

- Both matrix jobs pass on the same commit.
- The workflow takes long enough to actually compile and test.
- Unit, integration, architecture, and UI reports exist.
- A known failing test fails CI.
- Branch protection requires the CI check before merging.

---

## SDM-002 — Invalid Gradle dependency-verification metadata

- **Severity:** Blocker
- **Evidence:** Confirmed
- **Affected phases:** 0, 1, 9, 18
- **File:** `gradle/verification-metadata.xml`
- **Observed content:** `true false`

### Why this matters

This is not valid Gradle dependency-verification metadata. It does not provide component checksums, trusted keys, or artifact verification. Therefore:

- dependency tampering cannot be detected;
- Phase 1’s supply-chain exit gate is not met;
- claims that dependencies are verified are unsupported.

### Required solution

Regenerate the metadata through Gradle.

Example:

```bash
./gradlew --write-verification-metadata sha256 help
./gradlew --write-verification-metadata sha256 clean check
```

Then review the generated XML and commit it.

Recommended Gradle settings:

```properties
org.gradle.dependency.verification=strict
```

Do not blindly trust all generated artifacts. Review:

- group and module identity;
- expected repositories;
- native binaries;
- classifiers;
- unexpected transitive dependencies.

Configure repositories with content filters and reject insecure protocols:

```kotlin
repositories {
    mavenCentral {
        content {
            excludeGroupByRegex("com\\.unknown\\..*")
        }
    }
}
```

Add repository rules:

- no `mavenLocal()` in production builds;
- no dynamic versions such as `1.+`;
- no `latest.release`;
- no unpinned snapshots;
- no HTTP repositories;
- no runtime executable download without hash/signature verification.

### Required tests

1. Modify a checksum in a temporary branch; build must fail.
2. Add an unverified dependency; build must fail until metadata is deliberately updated.
3. Run dependency verification on Windows and Linux.
4. Generate and retain a dependency report and SBOM.

### Acceptance criteria

- `verification-metadata.xml` is valid XML generated by Gradle.
- Strict verification is enabled.
- Tampered checksum test fails.
- All dependencies have reviewed source and license entries.
- `PHASE_STATUS.md` no longer claims Phase 1 complete until this passes.

---

## SDM-003 — Phase documentation contradicts itself

- **Severity:** High
- **Evidence:** Confirmed
- **Affected phases:** 0–12
- **Files:**
  - `docs/implementation/PHASE_STATUS.md`
  - `docs/implementation/TEST_EVIDENCE.md`
  - `docs/implementation/Implementation_Tracker.md`
  - `docs/implementation/memory.md`

### Observed contradictions

- `Implementation_Tracker.md` marks Phases 6–11 complete and Phase 12 not started.
- The commit history contains Phase 12 implementation.
- `PHASE_STATUS.md` contains entries for Phases 0–5 and 11, skipping 6–10 and 12.
- `TEST_EVIDENCE.md` says only Phases 0–5 are verified.
- Completion commit values remain `pending`.
- Phase 4 is marked complete while its known limitation states cancellation/pause was stubbed at that time.
- Phase 2 claims completion while recording a Linux Secret Service mock.

### Why this matters

An AI agent relies on these files as its operational memory. Contradictory status data causes it to:

- skip required work;
- overwrite existing functionality;
- start later phases prematurely;
- claim completion without tests;
- misinterpret known limitations.

### Required solution

Make `PHASE_STATUS.md` the sole authoritative status file.

Use one section per phase:

```markdown
## Phase 6 — Queues, scheduler, bandwidth, and resource control

- Status: IN_PROGRESS
- Started: 2026-07-20
- Completed:
- Baseline commit: <sha>
- Completion commit:
- ADRs:
- Migrations:
- Test evidence: TEST_EVIDENCE.md#phase-6
- Known limitations: KNOWN_LIMITATIONS.md#phase-6
- Approved deviations: none

### Exit-gate checklist
- [x] Multiple named queues
- [ ] Hierarchical bandwidth limits
- [ ] Per-host connection caps
- [ ] Scheduler crash idempotency
...
```

`Implementation_Tracker.md` should either be removed or generated automatically from `PHASE_STATUS.md`. It must not become a second source of truth.

`TEST_EVIDENCE.md` should include:

- exact commit SHA;
- date;
- platform;
- Java version;
- command;
- task results;
- test count;
- report location;
- benchmark results;
- failures or skips;
- manual compatibility checks.

### Acceptance criteria

- Every phase from 0–12 has a complete section.
- No phase has a completion commit of `pending`.
- Status reflects actual exit-gate completion, not feature existence.
- Test evidence links resolve to real results.
- Known limitations are consistent across all documents.

---

## SDM-004 — Repository root contains generated and experimental artifacts

- **Severity:** Medium
- **Evidence:** Confirmed
- **Affected phase:** 1
- **Observed root artifacts include:**
  - `TestCandidate.class`
  - `TestCandidate.java`
  - `TestService.java`
  - `RegexTest.java`
  - `SmartDmApp_785da03.java`
  - `SmartDmApp_a8593fe.java`
  - `test.jsh`
  - `test_youtube_dom.js`
  - HTML UI prototypes
  - `scratch/`

### Why this matters

These files:

- obscure the production source of truth;
- can be accidentally compiled or packaged;
- confuse coding agents;
- indicate missing generated-file checks;
- create security and maintenance risk;
- make repository review harder.

### Required solution

Classify every artifact:

| Category | Action |
|---|---|
| Compiled binaries | Delete from Git history going forward; add ignore rule. |
| Useful tests | Move into the correct module’s `src/test`. |
| UI design prototypes | Move to `docs/design/prototypes/`. |
| Diagnostic scripts | Move to `tools/dev/` with README. |
| Backup source files | Delete; Git history already preserves old versions. |
| Scratch work | Remove or explicitly exclude from production checks. |

Add `.gitignore` rules:

```gitignore
*.class
.gradle/
build/
out/
.idea/
.vscode/
*.log
*.tmp
```

Add a CI check:

```bash
git ls-files '*.class' | grep . && exit 1 || true
```

Add a repository hygiene Gradle task that rejects:

- compiled files;
- secrets;
- backup source patterns;
- files over an approved size;
- generated package artifacts.

### Acceptance criteria

- No `.class` file is tracked.
- No backup `SmartDmApp_<hash>.java` files remain.
- Experimental tests are moved or deleted.
- Prototypes are under documentation directories.
- CI fails if forbidden generated files are committed.

---

## SDM-005 — README advertises incomplete features

- **Severity:** Medium
- **Evidence:** Confirmed
- **Affected phases:** 13 and 14, although audit scope ends at 12
- **File:** `README.md`

### Observed issue

The README presents these as current capabilities:

- local natural-language search;
- optional Gemini assistance.

The implementation tracker says Phase 13 and Phase 14 are not started.

### Required solution

Separate features into:

```markdown
## Available now
- HTTP/HTTPS download engine
- Browser capture
- Media format selection
- Local catalog prototype
- Smart folder prototype

## In development
- Natural-language local search
- Optional consented Gemini fallback
- Safety center
```

Do not advertise security guarantees until they have automated evidence.

### Acceptance criteria

- Every advertised feature maps to a completed phase.
- Planned features are labeled as planned/in development.
- No claim says encryption, browser support, or safety is complete without evidence.

---

# Part II — Phase-specific remediation

# Phase 0 — Product, legal, privacy, and supply-chain lock

## SDM-P0-01 — Phase 0 is marked complete without current dependency evidence

- **Severity:** High
- **Evidence:** Confirmed documentation gap
- **Root cause:** Phase completion was based on document presence, not validated supply-chain outputs.

### Required solution

Reopen Phase 0 until the following exist:

- approved dependency register;
- exact versions;
- official source URL;
- SHA-256/signature policy;
- license;
- redistribution obligations;
- bundled vs user-installed decision;
- update mechanism;
- rollback mechanism;
- source-offer requirements where applicable.

Special attention:

- SQLCipher JDBC integration;
- yt-dlp;
- FFmpeg/FFprobe;
- JNA;
- browser extension signing;
- native launchers and installers.

### Acceptance criteria

- Every runtime dependency appears in the register.
- No binary origin is unknown.
- FFmpeg build configuration is documented.
- yt-dlp update behavior is explicit.
- unsigned Windows distribution is clearly documented.
- Phase 0 completion commit is recorded.

---

## SDM-P0-02 — Privacy claims need executable verification

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Add a no-telemetry integration test:

1. Launch the application against a loopback-controlled environment.
2. Exercise ordinary downloads, catalog, search placeholder, and smart folders.
3. Capture DNS and outbound connections.
4. Assert only user-requested hosts and documented update endpoints are accessed.
5. Confirm Gemini remains completely inactive without explicit configuration.

Add structured data-flow documentation for:

- URL;
- filename;
- destination path;
- headers;
- cookies;
- hashes;
- media metadata;
- catalog entries;
- logs;
- browser messages.

### Acceptance criteria

- A test proves no SmartDM-owned backend is contacted.
- Optional outbound connections are independently disableable.
- Browser URL query parameters are redacted from logs.

---

# Phase 1 — Repository and engineering foundation

## SDM-P1-01 — CI runs only `clean check`, not all required suites

- **Severity:** High
- **Evidence:** Confirmed
- **File:** `.github/workflows/ci.yml`

### Required solution

The plan’s standard verification commands include:

```bash
./gradlew clean check
./gradlew architectureTest
./gradlew integrationTest
./gradlew uiTest
```

Update CI to invoke all available tasks. Do not assume `check` depends on custom suites unless Gradle configuration proves it.

Add a task graph test or documentation showing:

```bash
./gradlew check --dry-run
```

If `check` should include all verification tasks, wire them explicitly:

```kotlin
tasks.named("check") {
    dependsOn("architectureTest", "integrationTest")
}
```

UI tests may remain separate due to headless requirements, but they must run in CI.

### Acceptance criteria

- CI logs show all intended suites.
- No custom task silently does nothing.
- Test reports contain tests from multiple modules.

---

## SDM-P1-02 — Architecture enforcement needs current proof

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Create deliberate negative tests to ensure:

- `domain` cannot import JavaFX;
- UI cannot use JDBC;
- UI cannot call `ProcessBuilder`;
- Gemini adapter cannot access filesystem/catalog repositories;
- extension code cannot bypass native protocol;
- premium-entitlement checks cannot exist.

Use ArchUnit or equivalent static architecture tests.

Example:

```java
@ArchTest
static final ArchRule domain_must_not_depend_on_javafx =
    noClasses()
        .that().resideInAPackage("..domain..")
        .should().dependOnClassesThat()
        .resideInAnyPackage("javafx..", "java.sql..");
```

### Acceptance criteria

- A deliberately forbidden import fails CI.
- Rules cover all forbidden dependencies listed in the plan.
- Architecture tests run on both OS matrix jobs.

---

# Phase 2 — Secure local profile and encrypted persistence

## SDM-P2-01 — Linux Secret Service is a mock despite phase completion

- **Severity:** Critical
- **Evidence:** Confirmed in phase documentation
- **Risk:** Secrets may be stored through a non-production path or security behavior may differ on Linux.

### Required solution

Implement a real Linux secure-storage decision tree:

```text
Secret Service available
    -> store wrapped key in user keyring
Secret Service unavailable
    -> require master password
User declines master password
    -> refuse sensitive profile initialization
```

Do not silently store:

- database key;
- API key;
- proxy password;
- browser cookies;
- authorization headers

in plaintext.

Create an interface:

```java
interface MasterKeyStorage {
    Availability availability();
    WrappedKey load();
    void store(WrappedKey key);
    void delete();
}
```

Implement:

- Windows DPAPI adapter;
- Linux Secret Service adapter;
- Argon2id master-password adapter;
- explicit unavailable adapter that fails closed.

### Required tests

- Secret Service present.
- Secret Service absent.
- Locked keyring.
- User cancels password entry.
- Wrong password.
- Key rotation.
- Crash during key replacement.
- Permission denied.
- No plaintext key in environment, command line, DB, logs, temp files.

### Acceptance criteria

- Linux mock is test-only.
- Production Linux build uses real secure storage or master password.
- Sensitive features fail closed.
- Phase 2 is reclassified until this passes.

---

## SDM-P2-02 — Encryption claims need raw-byte leakage tests

- **Severity:** Critical
- **Evidence:** Unverified gap

### Required solution

Automate raw-file scanning after inserting sentinel secrets:

```text
https://private.example/token-ABC123
C:\Users\Test\Secret\file.pdf
Authorization: Bearer SENTINEL
Cookie: SESSION=SENTINEL
```

Scan:

- database;
- WAL;
- journal;
- backups;
- logs;
- crash artifacts;
- support bundle;
- temp files.

Example test approach:

```java
assertThat(Files.readAllBytes(databasePath))
    .doesNotContain("token-ABC123".getBytes(UTF_8));
```

Use controlled encryption and log-redaction tests rather than merely checking APIs.

### Acceptance criteria

- Sentinel values cannot be found in raw bytes.
- Wrong key returns no partial data.
- Interrupted migration does not create plaintext fallback.
- Support bundle preview contains no secrets.

---

# Phase 3 — Minimal JavaFX shell and theme system

## SDM-P3-01 — Accessibility evidence is incomplete

- **Severity:** Medium
- **Evidence:** Unverified gap

### Required solution

Add tests and manual evidence for:

- full keyboard traversal;
- visible focus;
- icon accessible names;
- high contrast;
- text scaling;
- screen-reader labels;
- no color-only state;
- reduced motion;
- dialog focus restoration.

Use TestFX where possible, and maintain a manual accessibility checklist for Windows Narrator and a Linux screen reader.

### Acceptance criteria

- Every primary destination is reachable without mouse.
- Every icon button has accessible text.
- theme contrast checks pass.
- focus never disappears into hidden panes.

---

## SDM-P3-02 — UI-thread blocking guard is not systematic

- **Severity:** High
- **Evidence:** Strongly indicated by later Phase 12 integration

### Required solution

Create a strict application rule:

- database;
- filesystem;
- hashing;
- HTTP;
- process execution;
- antivirus;
- media metadata

must never run on the FX thread.

Add a utility:

```java
public final class FxThreadGuard {
    public static void requireBackgroundThread(String operation) {
        if (Platform.isFxApplicationThread()) {
            throw new IllegalStateException(operation + " cannot run on FX thread");
        }
    }
}
```

Use it at infrastructure boundaries in development/test builds.

Add a `UiDispatcher` that only publishes immutable projections to JavaFX.

### Acceptance criteria

- Blocking repository calls fail tests when invoked on FX thread.
- loading states appear for asynchronous operations.
- UI responsiveness test detects tasks over the allowed threshold.

---

# Phase 4 — Single-download vertical slice

## SDM-P4-01 — Completion status and historical limitation conflict

- **Severity:** Medium
- **Evidence:** Confirmed documentation inconsistency

### Required solution

Re-run Phase 4 tests against current code and rewrite evidence. Phase 5 may now supply pause/cancel behavior, but the Phase 4 section should not retain a stale “stubbed” limitation while claiming no limitation.

Verify:

- unknown length;
- redirects;
- redirect loops;
- wrong content length;
- disconnection;
- timeout;
- HTTP errors;
- malicious filename;
- reserved Windows names;
- permission failure;
- disk full;
- destination collision;
- cross-filesystem finalization.

### Acceptance criteria

- final destination never contains partial data under final name;
- cancel has documented temp behavior;
- current evidence references the current commit;
- no stale limitation remains.

---

# Phase 5 — Segmentation, pause/resume, verification, and recovery

## SDM-P5-01 — Fault-injection evidence is not tied to current commit

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Create deterministic crash-point tests around:

- segment checkpoint commit;
- temp-file flush;
- pause transition;
- resume re-probe;
- final file move;
- completion-state commit;
- hash verification;
- process shutdown.

Use named fault points:

```java
enum RecoveryFaultPoint {
    AFTER_SEGMENT_WRITE,
    AFTER_PROGRESS_COMMIT,
    BEFORE_FINAL_MOVE,
    AFTER_FINAL_MOVE,
    BEFORE_COMPLETION_COMMIT
}
```

Inject failures in tests and restart the coordinator.

### Acceptance criteria

- no corruption across all fault points;
- finalization is idempotent;
- changed ETag/content length prevents unsafe resume;
- ignored ranges fall back to one stream;
- hash mismatch never becomes completed.

---

# Phase 6 — Queues, scheduler, bandwidth, and resource control

## SDM-P6-01 — Phase 6 completion evidence covers only queue and timer features

- **Severity:** High
- **Evidence:** Confirmed documentation gap
- **Missing or unverified requirements:**
  - multiple named queues;
  - starvation prevention;
  - per-queue concurrency;
  - hierarchical bandwidth limits;
  - per-host connection caps;
  - active windows;
  - recurring schedules;
  - timezone handling;
  - missed-trigger policies;
  - crash-safe idempotent execution claims;
  - low-disk handling;
  - Potato-mode worker reduction;
  - graceful shutdown.

### Required solution

Split Phase 6 into four internal packages:

```text
queue-coordinator
schedule-service
bandwidth-controller
resource-monitor
```

#### Queue coordinator

Use serialized ownership of slots:

```java
record QueueLimits(int maxDownloads, int maxSegmentsPerDownload) {}
```

Avoid UI mutation of queue rows. UI sends commands.

#### Scheduler

Persist schedule execution claims:

```sql
CREATE TABLE schedule_execution (
    schedule_id TEXT NOT NULL,
    trigger_instant TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    completed_at TEXT,
    PRIMARY KEY (schedule_id, trigger_instant)
);
```

This unique key prevents duplicate firing after crash.

Use IANA timezone IDs, not fixed offsets.

#### Bandwidth controller

Implement hierarchical token buckets:

```text
global bucket
  -> queue bucket
      -> download bucket
```

Add per-host semaphores separately.

#### Resource monitor

Implement:

- low-space preflight;
- continuous free-space threshold;
- catalog throttling;
- Potato-mode limits;
- graceful shutdown deadline;
- resumable checkpoint on forced shutdown.

### Required tests

- queue reordering under concurrent completion;
- priority fairness;
- starvation prevention;
- schedule/manual start collision;
- DST transition;
- missed trigger after sleep;
- crash after trigger claim;
- runtime limit change;
- host fairness;
- disk pressure;
- stuck worker shutdown.

### Acceptance criteria

Phase 6 must be set to `IN_PROGRESS` until every required capability is implemented and evidenced.

---

# Phase 7 — Categories, batch, clipboard, authentication, and proxy

## SDM-P7-01 — Authentication and proxy scope is not evidenced

- **Severity:** High
- **Evidence:** Strongly indicated
- **Current documented scope:** batch dialog, categories, clipboard.
- **Missing or unverified scope:** authentication, header security, HTTP/SOCKS proxies, protected credentials.

### Required solution

#### Header policy

Create an explicit allowlist:

```java
Set<String> allowedUserHeaders = Set.of(
    "Accept",
    "Accept-Language",
    "Referer",
    "User-Agent"
);
```

Authorization and cookies require protected dedicated fields, not arbitrary headers.

Strip sensitive headers on cross-origin redirects.

#### Credentials

Store only secret references in download records:

```java
record CredentialReference(String id) {}
```

No password or cookie value in projections, logs, or exceptions.

#### Proxy profiles

Support:

- system;
- direct;
- HTTP;
- SOCKS.

Store proxy credentials through secure storage.

#### Batch limits

Add:

- maximum URL count;
- maximum numeric expansion;
- preview before enqueue;
- cancellation;
- per-item validation.

#### Clipboard privacy

- default disabled or explicit onboarding enablement;
- retain only recognized URLs;
- never store other clipboard text;
- ignore sensitive applications/types if technically available;
- temporary pause and site ignore list.

### Required tests

- cross-origin redirect strips credentials;
- same-origin approved auth flow;
- proxy authentication;
- SOCKS fixture;
- offline proxy;
- malformed batch;
- excessive numeric expansion;
- clipboard non-URL never persisted.

### Acceptance criteria

- All inputs call the same `AddDownload` command.
- No secret appears in UI projection or log.
- Proxy profiles are encrypted.
- Phase 7 is not complete until auth/proxy tests pass.

---

# Phase 8 — Chrome and Firefox native browser integration

## SDM-P8-01 — Native protocol security evidence is missing

- **Severity:** Critical
- **Evidence:** Unverified gap

### Required solution

Enforce:

- protocol version;
- request ID;
- maximum message size;
- maximum field sizes;
- trusted extension IDs;
- local user scope;
- per-install pairing secret;
- bounded batch count;
- destination restrictions;
- stable error codes.

Never trust extension input simply because it came through native messaging.

Example envelope:

```json
{
  "protocolVersion": 1,
  "requestId": "uuid",
  "type": "ADD_DOWNLOAD",
  "pairingToken": "protected-install-token",
  "payload": {}
}
```

Store pairing token in protected local storage and never log it.

### Required tests

- wrong extension ID;
- wrong pairing token;
- missing request ID;
- oversized message;
- deeply nested JSON;
- huge batch;
- invalid URL scheme;
- arbitrary executable path;
- path traversal;
- old/new protocol mismatch;
- native host crash and reconnect.

### Acceptance criteria

- malformed clients cannot create downloads;
- untrusted extensions are rejected;
- protocol fuzz suite passes;
- logs do not contain payload secrets.

---

## SDM-P8-02 — Linux Snap/Flatpak capability checks are unverified

- **Severity:** Medium
- **Evidence:** Unverified gap

### Required solution

Implement a browser installation detector that reports:

- binary path;
- package type;
- native-messaging capability;
- remediation instructions.

Do not repeatedly retry unsupported sandboxed browsers.

### Acceptance criteria

- fixture paths for Snap and Flatpak are detected;
- user sees a clear capability notice;
- the rest of SmartDM remains usable.

---

## SDM-P8-03 — Firefox signed XPI and Chrome stable ID evidence is missing

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Release verification must prove:

- Chrome extension ID remains stable across reload/reinstall;
- native host allowlist matches that ID;
- Firefox `.xpi` is AMO-signed for unlisted distribution;
- standard Firefox installs it without developer preferences;
- protocol works in both browsers.

### Acceptance criteria

- compatibility matrix is recorded;
- extension artifacts are traceable to release checksum;
- no paid store requirement exists;
- browser setup wizard detects connection state.

---

# Phase 9 — yt-dlp and FFmpeg media subsystem

## SDM-P9-01 — Tool provenance and update security are not evidenced

- **Severity:** Critical
- **Evidence:** Unverified gap

### Required solution

Create a `MediaToolManifest`:

```json
{
  "tool": "yt-dlp",
  "version": "x.y.z",
  "platform": "windows-x64",
  "sha256": "...",
  "source": "official-release",
  "license": "Unlicense"
}
```

Tool manager must:

1. discover configured path;
2. verify executable identity;
3. reject unexpected origin when bundled;
4. enforce minimum/maximum compatibility;
5. stage updates in versioned directory;
6. verify before activation;
7. retain previous version;
8. roll back on health-check failure.

Never shell-concatenate arguments.

### Required tests

- malicious title;
- URL containing shell metacharacters;
- destination containing spaces/quotes;
- corrupt executable;
- wrong checksum;
- incompatible version;
- invalid JSON;
- excessive stdout/stderr;
- process timeout;
- cancellation;
- rollback after failed update.

### Acceptance criteria

- all process calls use argument arrays;
- tool provenance is displayed;
- update failure does not remove working version;
- process output is bounded.

---

## SDM-P9-02 — Cookie fallback may conflict with explicit consent boundary

- **Severity:** Critical
- **Evidence:** Strongly indicated by commit history mentioning `cookies-from-browser` fallback

### Why this matters

The plan requires cookie/session handoff to be:

- disabled by default;
- per-site;
- per-download;
- explicitly approved;
- minimal;
- encrypted immediately;
- deleted/expired by policy.

An automatic fallback that invokes browser cookie extraction can violate the privacy boundary.

### Required solution

Remove automatic cookie extraction.

Use this flow:

```text
Media extraction fails due to authentication/bot protection
  -> show site-specific explanation
  -> offer "Use browser session for this download"
  -> show data disclosure
  -> user approves
  -> obtain only required session data
  -> encrypt immediately
  -> apply expiry/deletion policy
```

Do not read the complete browser cookie database.

### Acceptance criteria

- no cookie access before explicit approval;
- approval is scoped to one site/download unless user selects a broader supported mode;
- logs and support bundles contain no cookie values;
- cancellation deletes temporary session material.

---

# Phase 10 — YouTube and thumbnail SmartDM panel

## SDM-P10-01 — Site integration scope expanded before YouTube exit gate was locked

- **Severity:** High
- **Evidence:** Strongly indicated by commit history
- **Observed pattern:** universal overlays and many social-media fixes were added while YouTube DOM behavior was still receiving repeated fixes.

### Why this matters

Broad site-specific code multiplies:

- DOM fragility;
- privacy risk;
- maintenance burden;
- test fixtures;
- browser differences;
- regressions.

### Required solution

Create a provider architecture:

```text
extensions/common/media-overlay/
extensions/sites/youtube/
extensions/sites/facebook/
extensions/sites/instagram/
```

Every site integration must implement:

```typescript
interface MediaSiteAdapter {
  canHandle(location: Location): boolean;
  discoverTargets(root: ParentNode): MediaTarget[];
  canonicalize(target: MediaTarget): string;
  attachOverlay(target: MediaTarget): OverlayHandle;
}
```

Phase 10 completion should depend only on tested YouTube layouts. Other sites should be separately gated.

### Required tests

Committed DOM fixtures for:

- home;
- search;
- subscriptions;
- channel;
- playlist;
- related videos;
- shorts where supported;
- SPA node recycling;
- mutation storms;
- duplicate observer registration;
- unknown layout.

### Acceptance criteria

- one overlay per eligible target;
- normal thumbnail navigation is unaffected;
- unknown layout fails quietly;
- no extraction request occurs until user clicks;
- YouTube failure does not disable normal downloads.

---

## SDM-P10-02 — Accessibility and privacy tests are not evidenced

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Test:

- keyboard open/close;
- focus trap;
- Escape behavior;
- focus restoration;
- accessible name;
- screen-reader announcements;
- panel loading and error states;
- no passive URL submission;
- no full watch URL/query logging.

### Acceptance criteria

- zero background browsing-history collection;
- equivalent Chrome and Firefox behavior;
- cached metadata keyed only by canonical video identity and tool version;
- user preferences remain local.

---

# Phase 11 — Local file catalog and duplicate detection

## SDM-P11-01 — Scanner computes quick hash for every indexed file

- **Severity:** High
- **Evidence:** Confirmed
- **File:** `modules/file-catalog/.../FileCatalogScanner.java`
- **Observed code:** `QuickFingerprintCalculator.calculateQuickHash(file)` is called for each regular file during traversal.

### Why this matters

The plan explicitly says:

> Hash only duplicate candidates, not every file immediately.

Hashing every file:

- increases HDD reads;
- increases scan duration;
- competes with active downloads;
- raises CPU use;
- violates Potato-mode strategy;
- makes 100,000-file indexing expensive.

### Required solution

Use staged cataloging.

#### Initial scan

Store only:

- path;
- name;
- extension;
- MIME;
- size;
- timestamps;
- file key/inode where available;
- metadata state.

Do not calculate hashes.

#### Candidate escalation

When a duplicate check occurs:

1. query name + size candidates;
2. quick-hash only those candidate files;
3. compare quick fingerprints;
4. full-hash only strong candidates.

Add hash states:

```text
NOT_REQUESTED
QUEUED
COMPUTING
AVAILABLE
FAILED
STALE
```

Invalidate hashes when size or modification time changes.

### Required tests

- indexing 100,000 files performs zero hash reads;
- duplicate candidate triggers bounded quick hashing;
- exact verification triggers full hash;
- stale hash is recomputed after modification;
- active downloads throttle hash workers.

### Acceptance criteria

- initial scan does not hash all files;
- full hash only runs for candidate verification or explicit user action;
- Potato-mode performance budget is met.

---

## SDM-P11-02 — Duplicate tiers are evaluated in the wrong cost order

- **Severity:** High
- **Evidence:** Confirmed
- **File:** `DuplicateDetector.java`
- **Observed order:**
  1. calculate quick hash;
  2. calculate full hash;
  3. query exact hash;
  4. query quick hash;
  5. query name and size.

### Why this matters

This defeats the purpose of tiered duplicate detection. The most expensive operation is performed before the cheapest candidate query.

### Required solution

Correct flow:

```text
Tier 1: query name + size
    no candidates -> return no match
    candidates -> quick-hash incoming and candidate files

Tier 2: compare quick fingerprint
    no strong candidate -> return possible matches
    strong candidates -> full-hash only strong candidates

Tier 3: compare full SHA-256
```

Suggested API:

```java
DuplicateAssessment assessIncoming(
    IncomingFileMetadata incoming,
    DuplicateVerificationPolicy policy
);
```

Return progressive evidence instead of hiding lower tiers.

### Required tests

- no candidate: no hashes calculated;
- possible candidate: quick hash only;
- quick mismatch: no full hash;
- quick match: full hash;
- full mismatch remains strong/possible, not exact;
- I/O failure returns explicit incomplete evidence.

### Acceptance criteria

- hash call counts are asserted in tests;
- exceptions are not silently swallowed;
- UI can display incomplete verification state.

---

## SDM-P11-03 — Scanner silently ignores file errors

- **Severity:** Medium
- **Evidence:** Confirmed
- **Observed code:** catches and `visitFileFailed` continue without recording details.

### Why this matters

The plan requires permission failures to be recorded. Silent skipping causes:

- inaccurate catalog completeness;
- repeated failures with no diagnostics;
- inability to explain missing files;
- hidden security and permission problems.

### Required solution

Add `catalog_scan_error`:

```sql
CREATE TABLE catalog_scan_error (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    relative_path TEXT,
    error_code TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    retryable INTEGER NOT NULL
);
```

Store privacy-safe relative paths only when permitted.

Use stable codes:

```text
ACCESS_DENIED
FILE_DISAPPEARED
SYMLINK_REJECTED
METADATA_FAILED
HASH_FAILED
WATCH_OVERFLOW
```

### Acceptance criteria

- errors are countable and visible in scan summary;
- no tight retry loop;
- root state can be `COMPLETED_WITH_ERRORS`;
- diagnostics do not expose unapproved absolute paths.

---

## SDM-P11-04 — No incremental watcher and overflow reconciliation are evidenced

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Implement a platform-neutral watcher service around `WatchService`, with platform adapters if necessary.

Required behavior:

- register approved roots;
- register new subdirectories;
- handle create/modify/delete/move;
- debounce repeated events;
- detect overflow;
- schedule bounded reconciliation;
- stop monitoring removed roots;
- recover after restart.

Do not treat watcher events as authoritative. They are hints; reconcile against filesystem state.

### Required tests

- create;
- modify;
- delete;
- rename;
- directory move;
- watcher overflow;
- root removal;
- inaccessible directory;
- rapid event burst.

### Acceptance criteria

- catalog updates without full manual rescan;
- overflow triggers reconciliation;
- watcher restart recovers state;
- removed root is no longer monitored.

---

## SDM-P11-05 — No scan checkpoint/resume mechanism is evidenced

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Persist scan state:

```sql
catalog_scan(
    id,
    root_id,
    status,
    started_at,
    last_checkpoint,
    files_seen,
    errors_seen
)
```

Checkpoint traversal batches. On restart:

- identify incomplete scan;
- validate root identity;
- resume or safely restart;
- avoid duplicate records using stable path identity/upsert.

### Acceptance criteria

- killing the application mid-scan does not corrupt catalog;
- restart completes scan;
- duplicate rows are not created;
- user can pause and resume.

---

## SDM-P11-06 — MIME detection uses filename path rather than actual file path

- **Severity:** Medium
- **Evidence:** Confirmed
- **Observed code:** `Files.probeContentType(Paths.get(fileName))`

### Why this matters

Passing only the basename loses directory context and may probe a nonexistent path in the current working directory. MIME result can be inaccurate.

### Required solution

Pass the actual `Path file` to MIME detection:

```java
private String detectMimeType(Path file, String extension) {
    try {
        String detected = Files.probeContentType(file);
        if (detected != null) return detected;
    } catch (IOException ignored) {
        // record metadata error
    }
    return fallbackByExtension(extension);
}
```

Use bounded magic-byte detection if a reviewed library is adopted.

### Acceptance criteria

- actual file path is used;
- MIME mismatch is represented as evidence;
- detection failure is not silently treated as authoritative.

---

## SDM-P11-07 — Stable file identity and update semantics are unclear

- **Severity:** High
- **Evidence:** Strongly indicated
- **Observed behavior:** Scanner creates `UUID.randomUUID()` for each scanned file.

### Why this matters

A new UUID on every scan can create duplicate records unless repository upsert logic compensates. Rename/move tracking also becomes unreliable.

### Required solution

Define identity rules:

- root ID + normalized relative path as logical identity;
- platform file key/inode as optional rename hint;
- content hash as identity evidence, not primary database key.

Repository should upsert:

```sql
UNIQUE(root_id, normalized_relative_path)
```

On rescan:

- update metadata;
- preserve record ID;
- invalidate stale hashes;
- mark unseen records deleted after successful reconciliation.

### Acceptance criteria

- rescanning does not duplicate rows;
- modifications update existing record;
- deletion removes or tombstones record;
- rename is represented correctly.

---

## SDM-P11-08 — Phase 11 benchmark evidence is missing

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Create `tools/catalog-benchmark` with deterministic synthetic tree generation.

Measure:

- scan elapsed time;
- peak memory;
- CPU;
- DB size;
- search p50/p95;
- watcher update latency;
- hash candidate latency.

Profiles:

- 10,000 files;
- 100,000 files;
- deep tree;
- wide tree;
- permission errors;
- HDD-like throttled filesystem fixture where practical.

### Acceptance criteria

- 100,000-entry memory budget is met;
- local metadata search p95 is below plan threshold;
- benchmark results are recorded in `TEST_EVIDENCE.md`;
- performance regression threshold fails CI/nightly.

---

# Phase 12 — Local smart folder selection

## SDM-P12-01 — Duplicate-location comparison mixes relative and absolute paths

- **Severity:** High
- **Evidence:** Confirmed
- **File:** `LocalFolderScorer.java`
- **Observed expression:**

```java
Path.of(cf.getRelativePath()).startsWith(path)
```

`cf.getRelativePath()` is a root-relative path, while `path` is normally an absolute candidate folder.

### Why this matters

The duplicate-location bonus will usually never match, so the recommendation:

> “An existing matching file is in this folder”

may not appear even when correct.

### Required solution

Resolve the catalog file through its catalog root:

```java
Path absoluteCatalogPath =
    catalogRootPath.resolve(cf.getRelativePath()).normalize();

Path candidateNormalized =
    candidate.toAbsolutePath().normalize();

if (absoluteCatalogPath.getParent().equals(candidateNormalized)
        || absoluteCatalogPath.startsWith(candidateNormalized)) {
    // duplicate-location evidence
}
```

Better: make the catalog repository return a value object that already includes resolved approved-root identity:

```java
record CatalogLocation(
    CatalogRootId rootId,
    Path relativePath,
    Path approvedAbsolutePath
) {}
```

Never construct an absolute path without validating that it remains under the approved root.

### Required tests

- same candidate folder;
- candidate parent folder;
- different root;
- relative path containing `..`;
- symlink escape;
- Windows case behavior;
- Linux case behavior.

### Acceptance criteria

- duplicate reason points to the correct approved path;
- path traversal cannot escape root;
- test covers Windows and Linux normalization.

---

## SDM-P12-02 — Filesystem and repository work may run on JavaFX thread

- **Severity:** Critical
- **Evidence:** Strongly indicated by integration pattern and scorer implementation
- **Blocking operations in scorer include:**
  - `categoryRepository.findAll()`;
  - `affinityRepository.findByPath()`;
  - catalog queries;
  - filesystem free-space checks.

### Why this matters

Running this from `Platform.runLater` can freeze the UI, especially with SQLCipher, slow disks, disconnected drives, or large catalogs.

### Required solution

Use asynchronous orchestration:

```java
CompletableFuture
    .supplyAsync(
        () -> smartFolderService.suggestFolders(request),
        smartFolderExecutor
    )
    .thenAccept(suggestions ->
        uiDispatcher.execute(() -> viewModel.setSuggestions(suggestions))
    )
    .exceptionally(error -> {
        uiDispatcher.execute(() -> viewModel.setSuggestionError(...));
        return null;
    });
```

Add cancellation or generation tokens so outdated requests do not overwrite newer file-name selections.

Do not expose JavaFX properties inside `organization-local`.

### Required tests

- repository blocks for 500 ms; FX thread remains responsive;
- newer request cancels/invalidates older result;
- dialog closes during calculation;
- disconnected drive does not freeze UI;
- error produces fallback destination.

### Acceptance criteria

- no DB or filesystem call occurs on FX thread;
- loading state appears;
- stale results are discarded;
- UI-thread guard test passes.

---

## SDM-P12-03 — “Recently” explanation is not backed by a recency calculation

- **Severity:** Medium
- **Evidence:** Confirmed
- **Observed behavior:** choice count generates text like “Chosen N times recently,” but visible scoring uses count only.

### Why this matters

The explanation can be misleading if choices were made months ago.

### Required solution

Persist timestamps:

```text
last_chosen_at
choice_count_30d
choice_count_total
```

Use decayed recency:

```text
recencyScore = exp(-ageDays / halfLifeDays)
```

Example combined learning:

```text
choice score =
  min(totalCount, cap) * frequencyWeight
  + recencyScore * recencyWeight
```

Update explanation:

- “Chosen 5 times in the last 30 days”
- “Used yesterday for downloads from example.com”

### Acceptance criteria

- old choices decay;
- explanation matches the score;
- tests use a fake clock;
- reset removes learning influence.

---

## SDM-P12-04 — Rejection learning and user-control actions are incomplete

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Implement explicit actions:

- choose suggestion;
- browse elsewhere;
- always use for this rule;
- never suggest this folder;
- pin folder;
- unpin folder;
- reset learned preferences;
- export preferences;
- delete preferences.

Do not interpret a simple “browse elsewhere” as a strong rejection automatically. Distinguish:

```text
ACCEPTED
IGNORED
REJECTED_FOR_REQUEST
BLACKLISTED
PINNED
RULE_CREATED
```

### Acceptance criteria

- blacklisted folder never appears;
- reset restores deterministic defaults;
- export contains no secrets;
- delete removes all learning records;
- UI explains what “always use” will change.

---

## SDM-P12-05 — Candidate path safety is insufficiently evidenced

- **Severity:** Critical
- **Evidence:** Unverified gap

### Required solution

Every candidate must pass:

- approved user folder or explicit category folder;
- normalized absolute path;
- no system/secret path;
- no traversal;
- no symlink escape;
- write permission;
- sufficient space;
- destination conflict validation.

Recheck at both:

1. suggestion generation;
2. final download creation/finalization.

Never trust old free-space values.

### Required tests

- folder becomes read-only after suggestion;
- disk space drops after suggestion;
- symlink target changes;
- network drive disconnects;
- candidate points to OS directory;
- malicious filename attempts traversal.

### Acceptance criteria

- unsafe candidate is removed or invalidated;
- user receives a clear reason;
- finalization never escapes destination root.

---

## SDM-P12-06 — Scoring is difficult to test and calibrate

- **Severity:** Medium
- **Evidence:** Confirmed design weakness
- **Observed implementation:** hardcoded numeric weights embedded in `LocalFolderScorer`.

### Required solution

Extract scoring configuration:

```java
record FolderScoringWeights(
    double categoryExtension,
    double categoryMime,
    double pinned,
    double choiceFrequency,
    double extensionAffinity,
    double hostAffinity,
    double duplicateLocation,
    double freeSpace,
    double pathRisk
) {}
```

Represent evidence as typed features:

```java
record FolderFeatureVector(
    boolean categoryMatch,
    boolean pinned,
    int recentChoices,
    boolean extensionAffinity,
    boolean hostAffinity,
    boolean duplicateLocation,
    long usableBytes,
    PathRisk pathRisk
) {}
```

Then score pure data in a deterministic function.

### Acceptance criteria

- scorer unit tests do not require database or filesystem;
- equal scores have stable tie-breaking;
- every user-facing reason maps to a feature;
- changing weights is versioned and documented.

---

## SDM-P12-07 — Candidate generation may miss indexed similar folders and risk filtering

- **Severity:** High
- **Evidence:** Unverified gap

### Required solution

Candidate generator should combine:

- category defaults;
- recent accepted folders;
- pinned folders;
- approved catalog folders with similar types;
- duplicate locations;
- standard user folders;
- host affinity;
- writeable folders with enough space.

Then deduplicate by canonical path and apply risk filtering before scoring.

Limit candidate count, for example:

```text
max 50 generated
max 20 scored with filesystem checks
top 3 displayed
```

### Acceptance criteria

- candidate generation is bounded;
- duplicates are canonicalized;
- dangerous system paths never enter scoring;
- test verifies sources of candidates.

---

## SDM-P12-08 — Phase 12 lacks a complete deterministic test suite

- **Severity:** High
- **Evidence:** Unverified gap

### Required test suite

1. Stable ranking fixture.
2. Category default wins when appropriate.
3. Pinned folder bonus.
4. Recent choice learning.
5. Old choice decay.
6. Host affinity.
7. Extension affinity.
8. Duplicate location.
9. Blacklist.
10. Reset.
11. Low-space invalidation.
12. Permission invalidation.
13. path traversal.
14. symlink escape.
15. disconnected drive.
16. deterministic tie-break.
17. top-three limit.
18. no FX-thread blocking.
19. persistence encryption.
20. preference export/delete.

### Acceptance criteria

- tests run in normal CI;
- filesystem tests use temporary directories;
- time tests use fake clock;
- repository tests use encrypted integration database;
- no network is required.

---

# Part III — Additional design corrections

## SDM-006 — Exception swallowing hides real defects

- **Severity:** High
- **Evidence:** Confirmed in Phase 11 and visible patterns
- **Examples:**
  - `catch (Exception ignored) {}`
  - duplicate detector ignores extraction failures;
  - scanner skips errors silently.

### Required solution

Use stable domain errors and structured diagnostics.

Never log sensitive paths directly. Record:

- diagnostic ID;
- operation;
- stable error code;
- root ID;
- relative path when approved;
- retryable flag.

User-visible message:

> SmartDM could not inspect 12 files. The catalog completed with limited coverage. Diagnostic ID: CAT-2026-...

### Acceptance criteria

- no broad ignored catch in production paths unless documented;
- failures produce evidence;
- one bad file does not stop entire scan;
- secrets are redacted.

---

## SDM-007 — Broad feature changes are merged without phase-gate regression evidence

- **Severity:** High
- **Evidence:** Strongly indicated by rapid commits and stale evidence

### Required solution

Adopt pull-request gates even for a single maintainer.

Each PR must include:

```markdown
## Phase
Phase 11

## Scope
Watcher overflow reconciliation

## Changed files
...

## Tests
...

## Exit-gate impact
...

## Known limitations
...
```

Require:

- passing CI;
- one phase label;
- updated memory/status/evidence;
- no unrelated UI redesign;
- rollback notes for migrations.

### Acceptance criteria

- no direct unverified feature push to `main`;
- phase status updates with each completion;
- release branch is cut only from green commit.

---

## SDM-008 — No realistic low-end performance proof

- **Severity:** High
- **Evidence:** Unverified gap
- **Affected phases:** 3, 6, 9, 11, 12

### Required solution

Create a reusable performance harness recording:

- startup time;
- idle memory;
- idle CPU;
- active download memory;
- 100,000 catalog entry memory;
- search latency;
- smart-folder latency;
- UI frame blocking;
- media process limits.

Run on representative profiles:

- 2 cores / 4 GB;
- 4 cores / 8 GB;
- 8+ cores / 16 GB.

### Acceptance criteria

- budgets are measured, not estimated;
- regressions are tracked;
- Potato mode has explicit worker and segment limits;
- catalog and smart-folder operations do not block downloads.

---

# Part IV — Required status reset

Until remediation is complete, use the following honest phase statuses:

| Phase | Recommended status |
|---:|---|
| 0 | IN_PROGRESS — supply-chain evidence incomplete |
| 1 | BLOCKED — CI and verification metadata broken |
| 2 | IN_PROGRESS — Linux secure storage and leakage proof required |
| 3 | IN_PROGRESS — accessibility and thread-safety proof required |
| 4 | IN_PROGRESS — current regression evidence required |
| 5 | IN_PROGRESS — current fault-injection evidence required |
| 6 | IN_PROGRESS — substantial required scope missing/unverified |
| 7 | IN_PROGRESS — authentication and proxy scope missing/unverified |
| 8 | IN_PROGRESS — security and browser-distribution evidence required |
| 9 | IN_PROGRESS — provenance, cookie consent, process hardening required |
| 10 | IN_PROGRESS — fixture, accessibility, and privacy gates required |
| 11 | IN_PROGRESS — watcher, checkpoint, hashing, benchmark work required |
| 12 | IN_PROGRESS — correctness, threading, learning, and tests required |
| 13 | NOT_STARTED — do not begin yet |

This status reset is not a criticism of the work already completed. It distinguishes:

- implemented code;
- manually working feature;
- tested feature;
- phase-complete feature;
- release-ready feature.

---

# Part V — Prioritized remediation sequence

## Milestone A — Restore trust in the build

Complete in this order:

1. Fix CI action references.
2. Run all verification suites.
3. Regenerate dependency verification metadata.
4. Clean repository root.
5. Add generated-file checks.
6. Record exact current test failures.
7. Reset phase documentation honestly.

### Milestone A exit criteria

- green Windows and Linux CI;
- valid dependency verification;
- clean repository root;
- status documents agree;
- current commit SHA recorded.

---

## Milestone B — Close security gaps

1. Real Linux Secret Service or master-password fallback.
2. raw-byte leakage tests.
3. native messaging origin/token validation.
4. browser cookie consent enforcement.
5. yt-dlp/FFmpeg provenance and rollback.
6. argument-injection tests.
7. secret-redaction verification.

### Milestone B exit criteria

- no plaintext secret fallback;
- no unapproved cookie access;
- untrusted native clients rejected;
- media tools verified before execution.

---

## Milestone C — Complete Phases 6–10

1. Phase 6 bandwidth/resource/scheduler idempotency.
2. Phase 7 auth/proxy.
3. Phase 8 browser capability and signing evidence.
4. Phase 9 deterministic media fixtures.
5. Phase 10 YouTube fixture/accessibility/privacy tests.

### Milestone C exit criteria

Each phase has:

- complete exit-gate checklist;
- tests;
- Windows/Linux evidence;
- known limitations;
- completion commit.

---

## Milestone D — Rebuild Phase 11 correctly

1. Remove eager hash from scanner.
2. correct duplicate-tier order.
3. record scan errors.
4. add stable upsert identity.
5. add checkpoint/resume.
6. add watcher and overflow reconciliation.
7. add metadata worker boundaries.
8. add 100,000-file benchmark.

### Milestone D exit criteria

- incremental and recoverable catalog;
- no eager hashing;
- benchmark within budget;
- selected roots only;
- root removal stops monitoring and purges metadata safely.

---

## Milestone E — Complete Phase 12

1. fix path resolution;
2. move work off FX thread;
3. extract feature vector and weights;
4. add recency;
5. implement rejection and reset;
6. enforce path safety;
7. add deterministic test suite;
8. verify encrypted preference persistence.

### Milestone E exit criteria

- useful top-three suggestions;
- every reason explainable;
- no heavy model;
- learning is deletable;
- unsafe folders never suggested;
- no UI blocking.

---

## Milestone F — Phase 0–12 release-quality verification

Run:

```bash
./gradlew clean check
./gradlew architectureTest
./gradlew integrationTest
./gradlew uiTest
```

Also run:

- catalog benchmark;
- native protocol fuzz tests;
- media process safety tests;
- raw encryption leakage tests;
- manual Chrome/Firefox matrix;
- manual Windows/Linux smoke test.

Only after this should Phase 13 begin.

---

# Part VI — AI-agent implementation rules

A coding agent assigned this remediation must follow these rules.

## 1. Do not mark a phase complete because code compiles

Completion requires:

- exit criteria;
- tests;
- current commit evidence;
- documentation;
- known limitations.

## 2. Do not modify several phases in one uncontrolled patch

One work package per branch/PR.

Bad:

> Fix all SmartDM problems through Phase 12.

Good:

> Implement Phase 11 lazy duplicate hashing and add call-count tests. Do not modify UI, browser, media, or Phase 12.

## 3. Preserve module boundaries

- domain remains infrastructure-free;
- UI does not access JDBC/filesystem/process APIs;
- repositories remain behind interfaces;
- external processes stay in adapters;
- browser protocol stays versioned;
- security evidence cannot be overridden by UI.

## 4. Never weaken tests to get green CI

Do not:

- disable tests;
- increase timeouts without diagnosis;
- catch and ignore failures;
- replace integration tests with mocks;
- skip Windows or Linux;
- remove strict dependency verification.

## 5. Record every action

Update:

- `docs/implementation/memory.md`;
- `PHASE_STATUS.md`;
- `TEST_EVIDENCE.md`;
- `KNOWN_LIMITATIONS.md`.

## 6. Use deterministic local fixtures

No required test may depend on:

- YouTube;
- Facebook;
- public download servers;
- live Gemini;
- public antivirus services.

Manual compatibility tests may use public sites separately.

## 7. Security defaults must fail closed

If:

- encryption unavailable;
- tool checksum invalid;
- pairing token invalid;
- path escapes root;
- scanner cannot complete;
- remote identity changed,

the application must not silently continue as successful.

---

# Part VII — Suggested issue backlog

| ID | Title | Severity | Phase | Dependency |
|---|---|---:|---:|---|
| SDM-001 | Repair CI workflow | Blocker | 1 | None |
| SDM-002 | Regenerate dependency verification metadata | Blocker | 0–1 | SDM-001 |
| SDM-003 | Reconcile implementation status documents | High | 0–12 | SDM-001 |
| SDM-004 | Clean repository root and add hygiene checks | Medium | 1 | SDM-001 |
| SDM-P2-01 | Implement Linux production secure storage | Critical | 2 | SDM-001 |
| SDM-P2-02 | Add raw-byte leakage tests | Critical | 2 | SDM-P2-01 |
| SDM-P5-01 | Add current crash fault matrix | High | 5 | SDM-001 |
| SDM-P6-01 | Complete queue/scheduler/bandwidth/resource scope | High | 6 | SDM-P5-01 |
| SDM-P7-01 | Implement secure auth/header/proxy subsystem | High | 7 | SDM-P2-01 |
| SDM-P8-01 | Harden native messaging protocol | Critical | 8 | SDM-P2-01 |
| SDM-P8-02 | Detect unsupported sandboxed browsers | Medium | 8 | SDM-P8-01 |
| SDM-P8-03 | Verify stable Chrome ID and signed Firefox XPI | High | 8 | SDM-P8-01 |
| SDM-P9-01 | Add media-tool provenance and rollback | Critical | 9 | SDM-002 |
| SDM-P9-02 | Enforce browser-cookie consent | Critical | 9 | SDM-P8-01 |
| SDM-P10-01 | Separate site adapters and lock YouTube scope | High | 10 | SDM-P8-01 |
| SDM-P10-02 | Add overlay accessibility/privacy tests | High | 10 | SDM-P10-01 |
| SDM-P11-01 | Remove eager catalog hashing | High | 11 | SDM-001 |
| SDM-P11-02 | Correct duplicate tier evaluation | High | 11 | SDM-P11-01 |
| SDM-P11-03 | Persist scan errors | Medium | 11 | SDM-P11-01 |
| SDM-P11-04 | Add watcher and overflow reconciliation | High | 11 | SDM-P11-03 |
| SDM-P11-05 | Add scan checkpoint and resume | High | 11 | SDM-P11-03 |
| SDM-P11-06 | Correct MIME detection path | Medium | 11 | SDM-P11-01 |
| SDM-P11-07 | Define stable catalog identity/upsert | High | 11 | SDM-P11-05 |
| SDM-P11-08 | Add 100k-file benchmark | High | 11 | All Phase 11 fixes |
| SDM-P12-01 | Fix relative/absolute duplicate path matching | High | 12 | SDM-P11-07 |
| SDM-P12-02 | Move smart-folder work off FX thread | Critical | 12 | None |
| SDM-P12-03 | Add real recency scoring | Medium | 12 | None |
| SDM-P12-04 | Add rejection/reset/export/delete learning | High | 12 | SDM-P12-03 |
| SDM-P12-05 | Enforce candidate path safety | Critical | 12 | SDM-P12-01 |
| SDM-P12-06 | Extract testable scoring features and weights | Medium | 12 | None |
| SDM-P12-07 | Complete bounded candidate generation | High | 12 | SDM-P12-05 |
| SDM-P12-08 | Add complete Phase 12 tests | High | 12 | All Phase 12 fixes |

---

# Part VIII — Final completion checklist before Phase 13

Phase 13 must not begin until all statements below are true.

## Build and supply chain

- [ ] Windows CI passes.
- [ ] Linux CI passes.
- [ ] `architectureTest` passes.
- [ ] `integrationTest` passes.
- [ ] `uiTest` passes.
- [ ] dependency verification is strict and valid.
- [ ] SBOM and license report are generated.
- [ ] no compiled or backup artifacts are tracked.

## Security

- [ ] Linux secret storage is production-ready.
- [ ] no plaintext fallback exists.
- [ ] raw DB/WAL/log leakage tests pass.
- [ ] native messaging rejects untrusted clients.
- [ ] media tool checksums are verified.
- [ ] cookie access always requires explicit consent.
- [ ] process argument injection tests pass.

## Phase 6–10 completeness

- [ ] bandwidth limits and host caps work.
- [ ] schedules are crash-idempotent.
- [ ] auth and proxy support are tested.
- [ ] browser capability matrix is documented.
- [ ] Firefox signed XPI is verified.
- [ ] YouTube fixtures and accessibility tests pass.

## Phase 11

- [ ] initial scanning does not hash every file.
- [ ] duplicate tiers escalate from cheap to expensive.
- [ ] watcher updates catalog.
- [ ] watcher overflow reconciles.
- [ ] scans checkpoint and resume.
- [ ] errors are recorded.
- [ ] rescans do not duplicate rows.
- [ ] 100,000-file benchmark passes.

## Phase 12

- [ ] catalog paths resolve safely.
- [ ] scoring runs off FX thread.
- [ ] recency is real and testable.
- [ ] blacklist/reset/delete work.
- [ ] candidate safety is revalidated.
- [ ] every reason maps to a typed feature.
- [ ] ranking tests are deterministic.
- [ ] user learning remains encrypted and deletable.

## Documentation

- [ ] status files agree.
- [ ] each phase has a completion commit.
- [ ] test evidence is current.
- [ ] limitations are honest.
- [ ] README distinguishes available and planned features.

---

# Conclusion

SmartDM has a strong and ambitious foundation, but the project currently needs verification and stabilization more than another feature phase.

The most important correction is cultural as much as technical:

> A working screen is not a completed phase. A completed phase is a working feature with security boundaries, deterministic tests, failure behavior, recovery behavior, performance evidence, documentation, and a reproducible green build.

Completing the remediation milestones in this document will make Phase 13 substantially safer to implement. It will provide Phase 13 with:

- a trustworthy encrypted catalog;
- correct and efficient duplicate data;
- stable smart-folder metadata;
- reliable FTS infrastructure;
- clean module boundaries;
- green CI;
- realistic low-end performance evidence.

Without that stabilization, Phase 13 would be built on uncertain schemas and incomplete evidence, increasing the likelihood of rewrites and hidden defects.

---

## Source references

- [SmartDM repository](https://github.com/ifahad2k/SmartDM)
- [CI workflow](https://github.com/ifahad2k/SmartDM/blob/main/.github/workflows/ci.yml)
- [Phase status](https://github.com/ifahad2k/SmartDM/blob/main/docs/implementation/PHASE_STATUS.md)
- [Test evidence](https://github.com/ifahad2k/SmartDM/blob/main/docs/implementation/TEST_EVIDENCE.md)
- [Implementation tracker](https://github.com/ifahad2k/SmartDM/blob/main/docs/implementation/Implementation_Tracker.md)
- [Dependency verification metadata](https://github.com/ifahad2k/SmartDM/blob/main/gradle/verification-metadata.xml)
- [FileCatalogScanner](https://github.com/ifahad2k/SmartDM/blob/main/modules/file-catalog/src/main/java/io/smartdm/catalog/FileCatalogScanner.java)
- [DuplicateDetector](https://github.com/ifahad2k/SmartDM/blob/main/modules/file-catalog/src/main/java/io/smartdm/catalog/DuplicateDetector.java)
- [LocalFolderScorer](https://github.com/ifahad2k/SmartDM/blob/main/modules/organization-local/src/main/java/io/smartdm/organization/LocalFolderScorer.java)
