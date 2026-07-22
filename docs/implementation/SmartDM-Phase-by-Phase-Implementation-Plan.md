<!-- markdownlint-disable MD013 MD024 -->

# SmartDM Phase-by-Phase Implementation Plan

> An AI-executable build plan for a free, local-first download manager for Windows and Linux.

| Document field | Decision |
| --- | --- |
| Product | SmartDM |
| Document type | Phase-by-phase implementation plan |
| Status | Approved planning baseline |
| Revision | 1.0 |
| Primary platforms | Windows and Linux |
| Desktop stack | Java 21 LTS, Gradle, JavaFX, SQLite/SQLCipher |
| Browser targets | Google Chrome and Mozilla Firefox |
| Media tools | yt-dlp and FFmpeg/FFprobe |
| AI model | Local-first; optional Gemini free API with explicit user consent |
| Product editions | One free edition; no premium features or paid feature gates |
| Backend | None; no SmartDM-owned server |

---

## 1. Authority of this plan

This document supersedes conflicting product-scope decisions in the earlier SmartDM architecture document. In particular:

- SmartDM targets **Windows and Linux only**.
- There is **no macOS work** in this plan.
- There is **one free product edition**.
- There is **no premium or Pro module**.
- All SmartDM features are available to every user.
- SmartDM has **no account system, cloud sync, telemetry backend, license server, or SmartDM-owned API server**.
- Private indexing, duplicate detection, prompt search, file scanning, and normal folder suggestions run on the user's computer.
- Gemini is an optional, user-keyed fallback for work the user explicitly agrees to send.
- Chrome and Firefox are first-class browser targets.
- YouTube/media selection is implemented with a locally executed yt-dlp and FFmpeg toolchain.

If code, an issue, an AI prompt, or another design document conflicts with this plan, this plan controls until the conflict is resolved through a new Architecture Decision Record (ADR) approved by the project owner.

---

## 2. Confirmed product vision

SmartDM will combine:

1. the normal capabilities users expect from Internet Download Manager-style software;
2. reliable high-speed segmented downloads with pause, resume, retry, queues, and schedules;
3. Chrome and Firefox capture integration;
4. a SmartDM icon over YouTube thumbnails so users can inspect and download available video resolutions or audio without first playing the video;
5. a minimal, friendly JavaFX interface with multiple themes;
6. local file indexing and duplicate discovery across user-approved locations;
7. smart destination-folder suggestions that learn from user choices;
8. natural-language file search using file type, dates, duration, size, download history, names, paths, and optional indexed content;
9. local safety scanning and clear risk warnings;
10. optional Gemini assistance using the user's own free API key and an explicit consent gate;
11. local encryption for SmartDM-managed secrets, history, catalog, settings, and diagnostics;
12. no required payment, subscription, account, or SmartDM server.

---

## 3. Non-negotiable product rules

### 3.1 Free and local-first

- The application must complete ordinary downloads, media downloads, folder suggestions, duplicate checks, safety scans, and useful prompt searches without Gemini.
- Gemini quota exhaustion, API changes, an invalid key, network loss, or user refusal must not disable the application.
- Every bundled dependency must be free to redistribute under its license.
- No feature is hidden behind a payment or entitlement check.
- The project should be open source; the exact project license is finalized in Phase 0.

### 3.2 No SmartDM backend

SmartDM does not operate a server. Network connections are limited to:

- the original file/media host selected by the user;
- an optional user-consented Gemini request sent directly from the desktop application;
- optional yt-dlp, FFmpeg, antivirus-definition, application, and browser-extension update sources;
- addons.mozilla.org, used only to obtain the free signed Firefox `.xpi` at build/release time; optional Chrome/Firefox store infrastructure only if a public store listing is enabled later.

Every optional connection is documented and independently disableable. There is no hidden telemetry.

### 3.3 Privacy

- Local catalog records never leave the device automatically.
- Gemini is disabled by default.
- The user supplies their own Gemini API key.
- Before every Gemini request in strict-consent mode, SmartDM displays the exact payload, destination, reason, and a warning about the free-tier data terms.
- SmartDM never sends file bytes, file contents, complete directory trees, hashes, browser cookies, authorization headers, or arbitrary system metadata to Gemini.
- Paths and filenames are removed by default. The user may explicitly include a filename or query when they understand the disclosure.
- Declining a request immediately invokes the local fallback.

Google's current Gemini API documentation says free-tier content may be used to improve Google products. The additional terms state that human reviewers may process unpaid-service inputs and outputs and instruct users not to submit personal or sensitive information. Therefore, “free Gemini” cannot be treated as a private local processor. See [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms).

### 3.4 Security wording

SmartDM must never claim that AI can prove a file is safe. Safety states are:

```text
UNSCANNED
SCANNING
NO_THREATS_DETECTED
SUSPICIOUS
MALWARE_DETECTED
SCAN_FAILED
```

`NO_THREATS_DETECTED` means scanners found nothing known; it does not mean guaranteed safe. AI may summarize evidence and explain warnings, but deterministic security rules and local antivirus engines determine the result.

### 3.5 Downloaded-file encryption boundary

SmartDM encrypts its own database, secrets, catalog, history, settings, temporary credentials, and production diagnostics. Finished user downloads remain in their normal original formats so other applications can open them. An optional encrypted vault can be designed later, but silently changing every downloaded file into an encrypted container is out of scope.

### 3.6 Authorized-content boundary

The media feature is for content the user owns or is authorized to download. It must not bypass DRM, paywalls, access controls, or protected streams. YouTube's terms restrict downloading except where the service or rights holders authorize it; the product must show an appropriate first-use notice and avoid language that promises unrestricted downloading. See [YouTube Terms of Service](https://www.youtube.com/static?template=terms).

### 3.7 Distribution trust and code signing

SmartDM releases are **unsigned at launch**. A paid Authenticode certificate is not a project dependency. Consequences and required mitigations:

- Windows SmartScreen will show an "unrecognized publisher" warning on first run; the first-run notice and download page must explain this honestly instead of hiding or suppressing it.
- Every release artifact still ships a published SHA-256 checksum (and, once feasible, detached signatures using a free mechanism such as `cosign`/Sigstore or GPG) so integrity can be verified without a paid certificate.
- The project may apply to a free-for-open-source signing service (for example SignPath.io) once it meets that service's eligibility bar. This is an opportunistic upgrade, never a blocking dependency for any phase.
- No phase may weaken this by silently self-signing with an untrusted throwaway certificate and presenting it as "signed"; unsigned must stay honestly labeled as unsigned.
- Firefox add-on signing through AMO is free and required regardless, since Firefox will not load unsigned extensions; this is a signing step, not a store listing, and stays free. Chrome and Firefox extensions are distributed as a bundled unpacked folder and a self-hosted signed `.xpi` respectively (see Phase 8), so no Chrome Web Store submission or fee is needed for v1. If a store listing is ever added later purely for discoverability, its one-time fee is a deliberate future upgrade decision, not a hidden requirement of this plan.

---

## 4. Definition of “everything in IDM”

For this project, “everything in IDM” means the following practical feature-parity checklist, subject to the authorized-content and non-DRM rules.

| Feature family | Required SmartDM capability | Planned phase |
| --- | --- | ---: |
| Core transfer | HTTP/HTTPS downloads, redirects, metadata probe, temp files, atomic completion | 4 |
| Acceleration | Dynamic byte-range segmentation and bounded parallel connections | 5 |
| Recovery | Pause, resume, retry, crash recovery, remote-change detection | 5 |
| Queue | Priorities, reordering, multiple queues, concurrency limits | 6 |
| Scheduler | Start windows, recurring schedules, pause at end, missed-trigger policy | 6 |
| Speed control | Global, queue, download, and host bandwidth limits | 6 |
| Categories | Rules based on extension, MIME type, host, and user choice | 7 and 12 |
| Browser capture | “Download with SmartDM,” ordinary link capture, download-all-links | 8 |
| Clipboard | Detect copied HTTP/HTTPS URLs with user-controlled monitoring | 7 |
| Batch download | Paste/import URLs and numeric URL patterns | 7 and 16 |
| Authentication | Basic/digest-compatible flows where supported, approved headers, proxy auth | 7 |
| Cookies/sessions | Per-site opt-in handoff from browser; encrypted at rest; never global scraping | 8 |
| Proxy | System, HTTP, and SOCKS proxy profiles with protected credentials | 7 |
| Expired links | Reprobe and browser-assisted refresh workflow | 8 and 16 |
| Video/audio | Available formats, resolution, size estimate, audio-only, subtitles, merge | 9 |
| YouTube panel | Icon on thumbnails, no playback required, Chrome and Firefox | 10 |
| Site/link collector | User-started page/site link collection with scope and rate limits | 16 |
| Duplicate handling | Find existing local/download-history matches and offer safe actions | 11 |
| Verification | Size and SHA-256/SHA-512 verification | 5 |
| Safety | Extension/MIME rules, local antivirus, quarantine, warnings | 15 |
| Completion actions | Notify, open, reveal, optional sleep/shutdown with confirmation | 16 |
| Import/export | SmartDM JSON/CSV/text; optional compatible legacy import where documented | 16 |
| Command line | Add, pause, resume, status, import, and safe scripting commands | 16 |
| UI | Minimal list/details layout, themes, keyboard access, helpful errors | 3 and 17 |
| Search | Keyword, filters, and natural-language local search | 13 |
| Organization | Smart folder recommendations and learned preferences | 12 |
| Diagnostics | Local logs, health checks, support bundle, no telemetry | 2 and 17 |

A feature is not considered complete because a button exists. It must pass the phase's recovery, failure, security, performance, and acceptance tests.

---

## 5. Low-end computer strategy

### 5.1 Supported performance profiles

SmartDM detects a suggested profile on first run but allows the user to override it.

| Profile | Example hardware | Default behavior |
| --- | --- | --- |
| Potato | 2 CPU cores, 4 GB RAM, HDD or slow SSD | No local embedding model; 2 downloads; 2 segments each; low-priority indexer; FTS5 and rules only |
| Standard | 4+ cores, 8 GB RAM | 3 downloads; 4 segments; optional semantic pack; normal index rate |
| Performance | 8+ cores, 16 GB RAM | Higher user-approved limits; parallel hashing and richer indexing |

### 5.2 Potato-mode rules

- Do not run a local large language model.
- Use SQLite FTS5, deterministic query parsing, metadata filters, and a tiny preference-ranking model.
- Keep file catalog paging in the database; do not load the full catalog into memory.
- Hash only duplicate candidates, not every file immediately.
- Pause or throttle scanning while the user is actively downloading, on battery, or under memory pressure.
- Run media metadata extraction in a bounded worker process.
- Do not enable the optional semantic-embedding pack automatically.
- Offer Gemini only when the local parser cannot confidently satisfy a request and the user consents.

### 5.3 Initial performance budgets

| Measurement | Target |
| --- | ---: |
| Idle CPU after startup | Below 1% average |
| Idle resident memory | Below 220 MiB on Potato profile |
| Memory with 100,000 catalog entries | Below 350 MiB |
| Local metadata search over 100,000 files | p95 below 300 ms |
| UI progress refresh | 4–8 times/second, coalesced |
| Startup | Below 5 seconds on SSD; below 10 seconds on HDD |
| Background indexer CPU | Configured low priority; below 15% average in Potato mode |
| UI-thread blocking task | None above 16 ms without explicit loading state |

Budgets are verified in Phase 17 and adjusted only through a documented ADR with measurements.

---

## 6. Technology and dependency policy

### 6.1 Baseline

| Concern | Technology |
| --- | --- |
| Language | Java 21 LTS |
| Build | Gradle wrapper with Kotlin DSL |
| UI | JavaFX with FXML/CSS and presentation view models |
| Database | SQLite with FTS5; encrypted at rest through a validated SQLCipher integration |
| HTTP | Java `HttpClient` |
| JSON | Jackson |
| Logging | SLF4J + Logback with a privacy-safe encrypted appender |
| Media | yt-dlp subprocess adapter; FFmpeg/FFprobe subprocess adapter |
| Windows integration | JNA where necessary; fixed-argument native commands where safer |
| Linux integration | XDG directories, portals/desktop integration, Secret Service |
| Tests | JUnit 5, AssertJ, Mockito only at true seams, TestFX, local HTTP fixtures |
| Search | SQLite FTS5 plus local query parser |
| Optional semantic search | Small separately installed ONNX embedding pack, never required |
| Antivirus | Windows Defender adapter; ClamAV adapter on Linux; local rule engine on both |

### 6.2 Free dependency register

Phase 0 must verify the exact version, source, hash, transitive dependencies, and distribution license of every item.

| Dependency | Intended use | Important rule |
| --- | --- | --- |
| OpenJDK and OpenJFX | Runtime and UI | Package platform-native runtime images |
| Gradle | Build | Commit wrapper and verify distribution checksum |
| SQLite/SQLCipher | Encrypted local data and FTS | Prove Windows/Linux packaging before feature work depends on it |
| Jackson | JSON | Disable unsafe polymorphic deserialization |
| SLF4J/Logback | Logging | Redact before encryption; never log secret values |
| yt-dlp | Media metadata and transfer orchestration | Pin a verified release; never shell-concatenate arguments |
| FFmpeg/FFprobe | Merge, remux, audio extraction, media metadata | Select a compliant build and ship notices/source as required |
| ClamAV | Linux malware scan | Detect availability and signature freshness; do not silently claim protection |
| JNA | Selected OS services | Keep native access inside platform adapters |

yt-dlp documents format selection, audio-only choices, and FFmpeg-based merging in its [official repository](https://github.com/yt-dlp/yt-dlp). FFmpeg licensing depends on build configuration; review the [official FFmpeg legal guidance](https://ffmpeg.org/legal.html) before distribution.

### 6.3 No hardcoded cloud promises

Gemini model names, free quotas, regions, and terms can change. The code must:

- isolate Gemini behind a provider port;
- expose “free tier may change” in settings;
- treat quota/rate errors as normal fallbacks;
- keep a tested local path for every Gemini-assisted feature;
- avoid promising that a specific model remains free;
- update model configuration only through a signed application release or explicit user configuration.

---

## 7. Target repository

```text
smartdm/
├── README.md
├── LICENSE
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradle/
│   ├── libs.versions.toml
│   ├── verification-metadata.xml
│   └── wrapper/
├── build-logic/
│   └── src/main/kotlin/
│       ├── smartdm.java-library.gradle.kts
│       ├── smartdm.javafx-app.gradle.kts
│       ├── smartdm.testing.gradle.kts
│       └── smartdm.packaging.gradle.kts
├── apps/
│   └── desktop/
├── modules/
│   ├── domain/
│   ├── application/
│   ├── download-engine/
│   ├── download-http/
│   ├── persistence-api/
│   ├── persistence-sqlcipher/
│   ├── secure-storage/
│   ├── file-catalog/
│   ├── search-local/
│   ├── organization-local/
│   ├── ai-api/
│   ├── ai-gemini/
│   ├── safety-api/
│   ├── safety-rules/
│   ├── safety-windows-defender/
│   ├── safety-clamav/
│   ├── media-api/
│   ├── media-ytdlp/
│   ├── media-ffmpeg/
│   ├── browser-protocol/
│   ├── browser-native-host/
│   ├── platform-api/
│   ├── platform-windows/
│   ├── platform-linux/
│   └── desktop-ui/
├── extensions/
│   ├── common/
│   ├── chrome/
│   └── firefox/
├── tools/
│   ├── test-http-server/
│   ├── test-media-fixtures/
│   └── catalog-benchmark/
├── packaging/
│   ├── windows/
│   └── linux/
└── docs/
    ├── architecture/
    ├── adr/
    ├── implementation/
    │   ├── PHASE_STATUS.md
    │   ├── TEST_EVIDENCE.md
    │   └── KNOWN_LIMITATIONS.md
    ├── privacy/
    ├── security/
    ├── protocols/
    └── release/
```

### 7.1 Dependency direction

```text
desktop-ui -> application -> domain
download-engine -> application/domain ports
download-http -> transfer ports
persistence-sqlcipher -> persistence ports
file-catalog/search-local/organization-local -> application ports
ai-gemini -> ai-api
safety adapters -> safety-api
media adapters -> media-api
browser-native-host -> browser-protocol + application input ports
platform-windows/platform-linux -> platform-api
apps/desktop -> all selected runtime implementations
```

Forbidden dependencies are enforced by architecture tests:

- `domain` cannot import JavaFX, JDBC, HTTP, Jackson, OS APIs, AI providers, yt-dlp, or FFmpeg.
- UI cannot use JDBC or execute native commands.
- Gemini cannot read a repository, catalog, filesystem, or secret store directly.
- Browser extension code cannot access the local filesystem except through the versioned native-messaging protocol.
- Safety explanation code cannot override scanner evidence.
- No module may check a premium entitlement because no premium product exists.

---

## 8. AI implementation contract

Every coding AI must follow this contract.

### 8.1 Phase isolation

1. Implement only the requested phase and its explicitly listed prerequisites.
2. Do not begin a later phase to make a current demo look complete.
3. Do not add placeholder production services that silently return success.
4. A `TODO` is allowed only when recorded in `KNOWN_LIMITATIONS.md` and not required by the current exit gate.
5. Never weaken security, encryption, tests, or privacy to make a phase pass.
6. If a required dependency is unavailable or its license is unclear, stop and record a blocker; do not download a random binary.

### 8.2 Required workflow for each phase

Before editing:

1. Read this plan, `PHASE_STATUS.md`, relevant ADRs, and current module boundaries.
2. Inspect existing code and uncommitted changes.
3. Write a short implementation checklist in the phase status file.
4. Run the existing verification suite and record the baseline.

During implementation:

1. Complete the smallest end-to-end work package.
2. Add or update tests with the production code.
3. Use constructor injection and explicit interfaces.
4. Keep network, database, filesystem, hashing, process execution, and scanning off the JavaFX thread.
5. Use argument arrays rather than a shell for external processes.
6. Redact secrets and personal data before any log call.
7. Update schema through an immutable migration.
8. Record significant decisions in an ADR.
9. Continuously document all actions taken, files modified, and progress in `docs/implementation/memory.md` during the phase.

Before declaring complete:

1. Run all phase-specific tests.
2. Run the full regression suite.
3. Run formatting, static analysis, dependency verification, and architecture tests.
4. Update `TEST_EVIDENCE.md` with commands and results.
5. Update `KNOWN_LIMITATIONS.md` honestly.
6. Mark the phase complete only when every exit criterion is true.
7. Provide a handoff containing changed files, migrations, commands, results, risks, and the next allowed phase.
8. Ensure `docs/implementation/memory.md` is fully up-to-date with a summary of everything accomplished in the phase.

### 8.3 Standard verification commands

Linux:

```bash
./gradlew clean check
./gradlew architectureTest
./gradlew integrationTest
./gradlew uiTest
```

Windows:

```powershell
gradlew.bat clean check
gradlew.bat architectureTest
gradlew.bat integrationTest
gradlew.bat uiTest
```

Tasks are introduced when their owning phase is implemented. CI must use the committed Gradle wrapper.

### 8.4 Phase status format

```markdown
## Phase N — Name

- Status: NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE
- Started: YYYY-MM-DD
- Completed: YYYY-MM-DD
- Baseline commit: <hash>
- Completion commit: <hash>
- ADRs: ADR-NNN
- Migrations: VNNN__description.sql
- Test evidence: link/section
- Known limitations: link/section
- Approved deviations: none | description
```

### 8.5 Definition of done for every phase

- The feature works through the real application boundary, not only a unit test.
- Expected failures have stable error codes and useful UI messages.
- Cancellation and shutdown behavior are defined.
- No sensitive data appears in logs or exceptions shown to users.
- Tests are deterministic and require no public website unless the test is explicitly a manual compatibility test.
- Offline behavior is tested for every networked feature.
- Low-end limits are respected.
- Documentation and schemas match the code.
- There is no regression in earlier phase gates.

---

## 9. Master phase order

| Phase | Name | Main result |
| ---: | --- | --- |
| 0 | Product, legal, privacy, and supply-chain lock | Buildable decisions with no unresolved distribution blocker |
| 1 | Repository and engineering foundation | Reproducible multi-module build and CI |
| 2 | Secure local profile and encrypted persistence | Encrypted database, key storage, migrations, private diagnostics |
| 3 | Minimal JavaFX shell and theme system | Friendly navigable UI foundation |
| 4 | Single-download vertical slice | Reliable ordinary HTTP download |
| 5 | Segmentation, pause/resume, verification, recovery | Production-grade accelerated engine |
| 6 | Queues, scheduler, bandwidth, and resource control | IDM-style transfer management |
| 7 | Categories, batch, clipboard, authentication, and proxy | Advanced normal-download inputs |
| 8 | Chrome/Firefox native browser integration | Direct-link capture and download-all-links |
| 9 | yt-dlp and FFmpeg media subsystem | Format discovery, video/audio transfer and merge |
| 10 | YouTube thumbnail SmartDM panel | Thumbnail icon and format picker without playback |
| 11 | Local file catalog and duplicate detection | Existing-file discovery across approved roots |
| 12 | Local smart folder selection | Top folder suggestions that learn from user choices |
| 13 | Local natural-language search | Prompt-like search on a potato PC |
| 14 | Optional Gemini consented fallback | BYO-key heavy/ambiguous request assistance |
| 15 | Local safety scanner and risk center | Defender/ClamAV/rule evidence and warnings |
| 16 | Remaining IDM-parity workflows | Site collector, refresh, import/export, CLI, completion actions |
| 17 | UX, accessibility, localization, and performance hardening | Polished, minimal, low-end-friendly application |
| 18 | Packaging, browser-extension bundling, update, and release hardening | Unsigned-but-checksummed Windows/Linux release candidates with bundled, working browser extensions |

No phase may skip its exit gate. Phases 11–15 can be developed on separate branches after Phase 10 only if module boundaries are stable, but release integration must retain the numbered gate order.

---

## 10. Phase 0 — Product, legal, privacy, and supply-chain lock

### Goal

Remove decisions that could force a rewrite or prevent lawful redistribution.

### Required work packages

#### 0.1 Product specification

- Create `docs/architecture/product-scope.md` from Sections 1–4 of this plan.
- Record Windows and Linux as the only platforms.
- Record one free edition and the absence of accounts/telemetry/backend.
- Define supported protocols for v1 as HTTP and HTTPS.
- Define authorized-media and non-DRM policy.
- Define ordinary download, media download, local catalog, and AI privacy user journeys.
- Define unsupported behavior and wording the UI must not use.

#### 0.2 License decision

- Select the SmartDM source license; GPL-3.0-or-later is the recommended default for a permanently free/open-source product.
- Build a third-party license register.
- Confirm whether FFmpeg is bundled or user-installed.
- If bundled, select and document the exact build configuration, codecs, license obligations, source-offer process, and About-screen notices.
- Confirm yt-dlp redistribution and update behavior.
- Confirm addons.mozilla.org unlisted-signing policy for the planned Firefox `.xpi`; Chrome Web Store policy review is deferred since store submission is not part of v1.
- Record ADR-0xx: Windows/Linux installers ship unsigned at launch; checksums (and later free-tier signing, e.g. SignPath.io, if/when eligible) are the integrity mechanism instead of a paid certificate.
- Record ADR-0xx: browser extensions are distributed as a bundled unpacked folder (Chrome) and a free AMO-signed unlisted `.xpi` (Firefox), not through store listings, with Linux Snap/Flatpak sandboxing handled as an honest capability check rather than a blocker.

#### 0.3 Privacy and threat model

- Create a data inventory: URL, path, filename, headers, cookies, hash, history, catalog metadata, prompts, API key, logs.
- Classify each field by sensitivity, storage, retention, and allowed destination.
- Create trust-boundary and abuse-case diagrams.
- Define Gemini consent levels: `OFF`, `ASK_EVERY_TIME`, and `ALLOW_SELECTED_SANITIZED_FIELDS`.
- Make `OFF` the default.
- Define exact payload-preview requirements.
- Define no-telemetry verification tests.

#### 0.4 Supply chain

- Create an allowlist of official dependency sources.
- Require hashes/signatures for yt-dlp, FFmpeg, native libraries, and application updates.
- Define the SBOM format and license-report task.
- Define a vulnerability-response policy.
- Prohibit runtime download of executable code without explicit user action, verification, and rollback.

### Tests and evidence

- License scan proof for the proposed dependency set.
- Threat-model review checklist completed.
- Privacy table accounts for every persisted field.
- A manual trace proves there is no required SmartDM server.

### Exit gate

- No unresolved “can we distribute this?” blocker.
- One approved project license.
- Approved FFmpeg distribution approach.
- Approved Gemini consent/data policy reflecting unpaid-service terms.
- Approved YouTube/content-rights notice.
- Approved supported-platform matrix.
- Approved unsigned-first distribution/ADR, with checksum publication and an honest SmartScreen/unrecognized-publisher first-run notice.
- Approved unpacked-Chrome/AMO-signed-Firefox extension distribution ADR, with Linux Snap/Flatpak handling defined.
- ADR-001 through ADR-006 created for scope, license, no-backend, media boundary, AI privacy, and encrypted persistence.

### AI phase instruction

Do not write feature code. Produce reviewed decisions, source links, license evidence, threat model, data inventory, and ADRs. Stop on any unclear binary origin or license.

---

## 11. Phase 1 — Repository and engineering foundation

### Goal

Create a reproducible, enforceable project structure that later AIs cannot casually collapse into one module.

### Required work packages

#### 1.1 Gradle foundation

- Create Gradle wrapper and Kotlin DSL root project.
- Create version catalog and dependency verification metadata.
- Add Java 21 toolchain enforcement.
- Add convention plug-ins for libraries, JavaFX, tests, and packaging.
- Create the modules and applications listed in Section 7 with minimal descriptors.
- Avoid JPMS until JavaFX/native packaging is proven; enforce boundaries through Gradle and tests first.

#### 1.2 Code quality

- Configure formatting and import order.
- Configure static analysis and nullness policy.
- Treat warnings defined by the project as CI failures.
- Add forbidden-dependency architecture tests.
- Add secret scanning and generated-file checks.

#### 1.3 Test foundation

- Configure unit, integration, architecture, UI, and performance test source sets.
- Add deterministic fake clock, fake filesystem boundary, and cancellation test utilities.
- Create the local controllable HTTP fixture server module.
- Add test reports and failure artifact retention.

#### 1.4 CI

- Add Windows and Linux CI jobs.
- Cache only verified Gradle artifacts.
- Run compile, unit tests, architecture tests, dependency verification, and license reporting.
- Add a nightly job for integration and UI tests.

### Tests and evidence

- Clean checkout builds with wrapper on Windows and Linux.
- A deliberately forbidden domain-to-JavaFX dependency fails architecture tests.
- Dependency checksum tampering fails the build.
- Test reports are retained in CI.

### Exit gate

- `clean check` passes on both platforms.
- No module cycle.
- No unverified dependency.
- `PHASE_STATUS.md`, `TEST_EVIDENCE.md`, and `KNOWN_LIMITATIONS.md` exist and are current.

### AI phase instruction

Build only the engineering skeleton and verification rules. Do not create fake download features or UI beyond a launch smoke test if needed for JavaFX configuration.

---

## 12. Phase 2 — Secure local profile and encrypted persistence

### Goal

Establish encryption, key management, profile ownership, migrations, and privacy-safe diagnostics before sensitive download history exists.

### Required work packages

#### 2.1 Profile and single-instance ownership

- Resolve application-data, cache, temp, and logs through Windows/Linux platform adapters.
- Create one profile lock.
- Forward second-instance commands through an authenticated local user-scoped endpoint.
- Detect stale locks safely.

#### 2.2 Key management

- Generate a random database data-encryption key on first run.
- Protect it with Windows DPAPI on Windows.
- Protect it with Secret Service on Linux when available.
- Offer a master-password fallback when Linux secret storage is unavailable.
- Derive password wrapping keys with a memory-hard KDF such as Argon2id using reviewed parameters.
- Support key rotation and secure removal of replaced key material.
- Keep keys out of command lines, environment variables, crash messages, and logs.

#### 2.3 SQLCipher proof and adapter

- Build or select a reproducible, license-reviewed SQLCipher-enabled JDBC integration.
- Prove encrypted database creation/open/migration on supported Windows and Linux architectures.
- Verify database, WAL, journal, and backups do not expose searchable filenames or URLs.
- Add wrong-key, damaged-header, interrupted-migration, and backup-restore tests.
- Do not silently fall back to plaintext SQLite. If SQLCipher packaging fails, block the phase and request an approved architecture change.

#### 2.4 Migrations and core tables

Create immutable migrations for:

- `schema_migration`;
- `app_setting`;
- `secure_reference` without secret values;
- `domain_event`;
- `diagnostic_event`;
- `profile_metadata`.

#### 2.5 Private diagnostics

- Implement structured redaction before logging.
- Store production diagnostic events encrypted or use an encrypted rotating appender.
- Disable stdout/stderr details in production except a minimal non-personal emergency message.
- Add diagnostic IDs for user-visible errors.
- Add export of a user-previewable, redacted, optionally password-encrypted support bundle.

### Tests and evidence

- Strings planted as URLs, tokens, usernames, and paths cannot be found in raw database/WAL/log bytes.
- Wrong database key does not yield partial data.
- Second instance cannot concurrently own the same profile.
- Key rotation preserves data and invalidates the old wrapped key.
- Linux without Secret Service requires a master password or refuses sensitive features; it does not store plaintext secrets.

### Exit gate

- Encrypted persistence passes Windows and Linux integration tests.
- No plaintext fallback exists.
- Privacy-redaction tests pass.
- Backup and restore work.
- Single-instance ownership works.

### AI phase instruction

Treat this as a security phase. Do not implement downloads yet. Provide reproducible native-build evidence and fail closed when keys or secure storage are unavailable.

---

## 13. Phase 3 — Minimal JavaFX shell and theme system

### Goal

Create a user-friendly UI framework before complex feature screens appear.

### Required work packages

#### 3.1 Design tokens

- Define semantic tokens for colors, spacing, typography, radius, elevation, focus, success, warning, danger, and progress.
- Implement `System`, `Light`, `Dark`, and `High Contrast` themes.
- Implement `Comfortable` and `Compact` density.
- Keep animations subtle, short, and disableable.

#### 3.2 Application shell

Create:

- left navigation rail;
- top search placeholder;
- download list workspace;
- collapsible details pane;
- queue, scheduler, catalog, safety, and settings destinations;
- bottom transfer summary/status area;
- toast/notification region;
- first-run setup flow.

#### 3.3 Presentation architecture

- Use view models and immutable application projections.
- Keep JavaFX properties inside `desktop-ui`.
- Introduce `UiDispatcher` for all FX-thread updates.
- Add loading, empty, offline, error, and disabled-capability states.
- Create a reusable dialog service with keyboard and screen-reader behavior.

#### 3.4 Accessibility

- Full keyboard navigation.
- Visible focus.
- Accessible names for icon controls.
- No color-only state indication.
- Scalable text and layouts.
- Theme contrast tests.

### Tests and evidence

- TestFX navigation smoke tests.
- View-model tests require no JavaFX window where possible.
- Theme screenshot/reference checks for the major screens.
- A blocked fake task proves the UI thread remains responsive.

### Exit gate

- The shell launches on Windows and Linux.
- All themes switch live and persist encrypted settings.
- Keyboard navigation reaches every primary destination.
- No infrastructure dependency is imported by UI modules.

### AI phase instruction

Use fake immutable projections only. Build a polished shell and reusable components; do not add networking or database shortcuts to UI code.

---

## 14. Phase 4 — Single-download vertical slice

### Goal

Download one ordinary HTTP/HTTPS file reliably from URL entry to atomic completion.

### Required work packages

#### 4.1 Domain model

Implement:

- `DownloadId`, `SourceUri`, `Destination`, `RemoteResource`, `ByteCount`;
- states `QUEUED`, `PROBING`, `DOWNLOADING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELED`;
- central transition policy and domain events;
- stable error taxonomy.

#### 4.2 Database migration

Add:

- `download`;
- `download_header` with encrypted values;
- initial `download_event`/outbox mappings;
- indexes for state, creation, and update time;
- optimistic `row_version`.

#### 4.3 Probe and HTTP adapter

- Support HTTP/HTTPS only.
- Validate URI scheme and redirect count.
- Probe using HEAD with safe GET-range fallback.
- Parse length, MIME, ETag, Last-Modified, Content-Disposition, and final URI.
- Sanitize remote filenames and reserved names.
- Use Java HttpClient timeouts and cancellation.

#### 4.4 Managed file flow

- Write to an application-managed temp location.
- Stream with bounded buffers.
- Validate expected size.
- Flush and close.
- Move atomically into the destination when possible.
- For cross-filesystem destinations, copy to a destination-side temp file, flush, and rename.
- Apply destination conflict choices: ask, rename, skip, replace, verify/reuse.

#### 4.5 UI slice

- “Add download” dialog.
- URL validation and destination selector.
- Download row with name, state, bytes, speed, ETA, and actions.
- Details panel with safe source host and diagnostic information.
- Completion notification through platform adapter.

### Tests and evidence

The local HTTP server must simulate:

- normal length and unknown length;
- redirects and loops;
- wrong length;
- disconnect;
- timeout;
- HTTP errors;
- malicious Content-Disposition names;
- destination collision;
- disk/permission failures.

### Exit gate

- One URL downloads correctly on Windows and Linux.
- The destination never contains partial content under its final name.
- Cancel leaves the configured temp-file disposition.
- UI remains responsive.
- No test depends on a public website.

### AI phase instruction

Deliver one complete reliable stream. Do not implement segmentation, browser capture, media tools, AI, or catalog scanning.

---

## 15. Phase 5 — Segmentation, pause/resume, verification, and recovery

### Goal

Turn the basic transfer into a production-grade accelerated and recoverable download engine.

### Required work packages

#### 5.1 Range proof and planning

- Confirm range behavior with a real `206` and valid `Content-Range`; do not trust `Accept-Ranges` alone.
- Require known length and stable identity for segmentation.
- Use `Accept-Encoding: identity` for stable byte offsets.
- Implement balanced, gap-free, non-overlapping segment plans.
- Fall back to a single stream if a range is ignored or invalid.

#### 5.2 Segment persistence

Add `download_segment` with range, durable progress, attempt, state, and timestamp.

- Use one preallocated/sparse managed temp file with positional writes.
- One supervisor owns attempt cancellation and worker futures.
- Segment workers never mutate the aggregate directly.
- Persist progress every configured time/byte threshold, not every buffer.

#### 5.3 Pause/resume

- Add `PAUSING` and `PAUSED` states.
- Pause means workers stopped, file flushed, and checkpoints committed.
- Resume re-probes and compares strong ETag, Last-Modified, and content length.
- Changed/unknown identity triggers restart or an explicit unsafe-resume warning.
- Add browser-assisted link refresh hook without implementing the browser flow yet.

#### 5.4 Retry and recovery

- Classify transient and permanent failures.
- Add jittered exponential backoff and `Retry-After` handling.
- Add `RETRY_WAIT` state.
- Reconcile `PROBING`, `DOWNLOADING`, `PAUSING`, `VERIFYING`, and `RETRY_WAIT` on startup.
- Make finalization idempotent across crash points.

#### 5.5 Verification

- Add expected/computed SHA-256 and SHA-512.
- Mark MD5/SHA-1 as compatibility-only and weak if later supported.
- A mismatch never becomes `COMPLETED`.
- Show verification progress and evidence.

### Tests and evidence

- Property tests for arbitrary length/segment counts.
- Server ignores ranges.
- Invalid `Content-Range`.
- Resource changes ETag and bytes during resume.
- Pause at every segment boundary.
- Kill process after each durable step and restart.
- Crash between final file move and completion-state commit.
- Hash match and mismatch.

### Exit gate

- No corruption across the complete fault-injection matrix.
- Pause is durable, not cosmetic.
- Resume never combines known-different resource versions.
- Segment fallback works.
- Recovery is idempotent.

### AI phase instruction

Prioritize integrity over speed. Do not tune for maximum connection count until every crash and remote-change test passes.

---

## 16. Phase 6 — Queues, scheduler, bandwidth, and resource control

### Goal

Implement the core transfer-management behavior expected from IDM-class software.

### Required work packages

#### 6.1 Queues

- Multiple named queues.
- Drag/drop ordering.
- Priorities and starvation prevention.
- Per-queue concurrency and segment limits.
- Queue start, pause, stop-after-current, and resume.
- Serialized queue coordinator for slot ownership.

#### 6.2 Scheduler

- One-time and recurring schedules.
- Explicit IANA time zone.
- Active time windows.
- Pause or finish-current policy at window end.
- Missed-trigger policies after sleep/restart.
- Idempotent schedule execution claims.

#### 6.3 Bandwidth and host control

- Hierarchical token bucket: global, queue, download.
- Per-host connection cap.
- Live limit changes without restart.
- “Unlimited” is represented explicitly, never as zero permits.

#### 6.4 Resource monitor

- Detect low disk space before and during transfer.
- Reduce worker counts in Potato mode.
- Pause catalog work when downloads need disk bandwidth.
- Graceful shutdown protocol.

### Database additions

- `download_queue`;
- `queue_item`;
- `schedule`;
- `schedule_execution`;
- validated settings for concurrency and bandwidth.

### Tests and evidence

- Priority/reordering races.
- Scheduler/manual-start collision.
- Daylight-saving boundary calculations.
- Limit changes during transfer.
- Fairness among hosts and downloads.
- Shutdown with active/stuck workers.
- Disk pressure.

### Exit gate

- Queue capacity never exceeds configured limits.
- Schedules do not fire twice after a crash.
- Bandwidth limit stays within the measured tolerance.
- Shutdown leaves resumable state.

### AI phase instruction

Keep scheduling and queue decisions separate from transfer workers. Use commands; never let the timer or UI mutate download rows directly.

---

## 17. Phase 7 — Categories, batch, clipboard, authentication, and proxy

### Goal

Add advanced normal-download inputs without involving browser extensions.

### Required work packages

#### 7.1 Categories and rules

- Default categories: Compressed, Documents, Music, Programs, Video, Images, Other.
- Rules by MIME, extension, host, and size range.
- User-created categories and destination defaults.
- Ordered rule evaluation with a preview/explanation.

#### 7.2 Batch input

- Multiline URL paste.
- Text/CSV import.
- Numeric pattern expansion with preview and maximum count.
- Duplicate URL detection.
- Per-item validation; one invalid item does not discard the batch.

#### 7.3 Clipboard monitor

- Disabled by default or explicitly enabled during onboarding.
- Detect only supported URL schemes.
- Ignore sensitive clipboard types.
- Provide site/type ignore rules and a temporary pause.
- Never retain non-URL clipboard contents.

#### 7.4 Authentication and headers

- Approved header allowlist.
- Basic authentication where appropriate.
- Never log or expose authorization/cookie values.
- Store credentials through secret references.
- Strip sensitive headers on cross-origin redirects by default.

#### 7.5 Proxy

- System proxy.
- Manual HTTP and SOCKS profiles.
- Per-download/queue selection.
- Protected proxy credentials.
- Connectivity test with a clear destination disclosure.

### Tests and evidence

- Category rule ordering.
- Batch size abuse and invalid patterns.
- Clipboard privacy tests.
- Auth redirect leak prevention.
- Proxy authentication and offline fallback through local fixtures.

### Exit gate

- All inputs feed the same `AddDownload` application command.
- No secret reaches logs, UI projections, or unencrypted storage.
- Batch and clipboard limits prevent UI/resource abuse.

### AI phase instruction

Do not build browser cookie extraction or YouTube behavior. Complete secure local input methods and category rules only.

---

## 18. Phase 8 — Chrome and Firefox native browser integration

### Goal

Capture normal links from both browsers using one versioned protocol and a local native host.

Chrome and Firefox both support native messaging between an extension and an installed native application. Chrome requires messages from content scripts to pass through an extension page/service worker before native messaging. See [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

SmartDM does not depend on the Chrome Web Store or a listed Firefox Add-ons page. The extensions ship inside the SmartDM install/update payload and are connected through an in-app "Connect your browser" step (see 8.6). This keeps browser integration free and avoids any store review dependency, consistent with the unsigned-first distribution decision in Section 3.7.

### Required work packages

#### 8.1 Shared browser protocol

Define versioned request/response schemas for:

- `PING`;
- `GET_CAPABILITIES`;
- `ADD_DOWNLOAD`;
- `ADD_BATCH`;
- `LIST_PAGE_LINKS` result submission;
- `GET_MEDIA_FORMATS` placeholder;
- `START_MEDIA_DOWNLOAD` placeholder;
- `REFRESH_SOURCE`;
- progress/status events.

Every message has protocol version, request ID, type, bounded payload, and safe error response.

#### 8.2 Native host & IDM-style auto-launch architecture

- Length-prefixed JSON over stdin/stdout exactly as each browser specifies.
- Write diagnostics only to stderr and privacy-safe storage.
- Validate extension origin/ID against an allowlist pinned to the fixed Chrome extension ID (8.3) and the signed Firefox extension ID (8.4); reject every other origin, including other locally sideloaded extensions.
- Enforce message and field size limits.
- **System Tray Daemon (`--background`)**: SmartDM runs as a persistent background daemon in the system tray when closed. Clicking `[X]` minimizes the application to the tray rather than terminating it, keeping `LocalIpcServer` active.
- **IDM-Style Auto-Launch Launcher**: If SmartDM is completely stopped (not running and not present in the system tray), when the extension sends a message, `NativeHostMain` automatically detects the offline status and executes `SmartDM.exe --background` silently in the background before connecting and forwarding the request.
- **Seamless Download Dialog Pop-Up**: Once spawned in the background, SmartDM brings `MediaDownloadDialog` directly over the browser with focus, opening the download window without manual user intervention.
- Use a per-installation pairing secret in addition to browser registration where feasible.
- Never accept an arbitrary executable path or unrestricted destination path.

#### 8.3 Chrome extension

- Manifest V3.
- Fixed `"key"` field in `manifest.json` so the extension ID is stable across reloads/reinstalls; the native host allowlist is pinned to this exact ID. The public key embedded here is not a secret and requires no paid certificate.
- Context menu: Download with SmartDM.
- Toolbar action and status.
- Page link collector with preview.
- Service worker forwards content-script messages to native messaging.
- Minimum permissions and host access.
- Distribution: unpacked folder shipped with the app; user enables Developer mode and loads it once via `chrome://extensions`. No Chrome Web Store submission or fee is required for this to work permanently.

#### 8.4 Firefox extension

- WebExtensions-compatible implementation sharing common code.
- Firefox-specific native host manifest and packaging.
- Same visible capabilities and protocol conformance tests.
- Distribution: submitted to addons.mozilla.org for free "unlisted" self-distribution signing (automated, no public store listing, typically returns a signed `.xpi` within minutes). Standard-release Firefox refuses to permanently install an unsigned extension, so this signing step is required and is not optional the way Windows Authenticode signing is; it stays free and outside the paid-certificate path in Section 3.7.
- The app links directly to the signed `.xpi` for local installation; Firefox prompts "Add extension" from that file.

#### 8.5 Linux browser-packaging capability check

- On Linux, detect whether the default Chrome/Chromium or Firefox binary is a Snap or Flatpak build (for example, an install path under `/snap/` or `/var/lib/flatpak/`/`~/.local/share/flatpak/`).
- Snap-packaged Chromium does not support native messaging at all; Snap-packaged Firefox has a history of intermittent native-messaging breakage even with the XDG portal installed.
- If a sandboxed browser package is detected, show an honest capability notice in the "Connect your browser" step explaining that browser capture will not work with that install, and link to the non-sandboxed alternative (distro `.deb`/RPM package or Mozilla/Google's own installer) rather than silently failing or retrying forever.
- The rest of the application (downloads, catalog, search, safety scanning) must remain fully functional regardless of this check's result.

#### 8.6 Connect-your-browser flow

- Add a first-run/settings wizard step: detect installed browsers, run the Linux capability check from 8.5, then walk the user through opening the extensions page, enabling Developer mode (Chrome) or opening the signed `.xpi` (Firefox), and selecting the bundled extension folder/file.
- Show a live "connected/not connected" status per browser, using the `PING` protocol message.
- Warn users, in-app and in the download-page instructions, that they should only ever load the extension folder that shipped with their verified SmartDM install (matching the published checksum), and never a copy obtained elsewhere — this mirrors real malware-delivery patterns (get victims to enable Developer mode and sideload something), so the instructions must be specific enough to distinguish the legitimate flow from that pattern.

#### 8.5 Cookie/session handoff

- Disabled by default.
- Per-site, per-download user approval.
- Send only cookies needed for the selected request.
- Encrypt immediately in the desktop profile and expire/delete according to policy.
- Never copy the complete browser cookie store.

### Tests and evidence

- Protocol fuzz tests and oversized message rejection.
- Wrong extension ID/origin rejection.
- Native host absent/old/new version flows.
- Chrome service worker suspension/reconnection.
- Firefox lifecycle.
- Link collector with thousands of page links.
- Cookie handoff consent and deletion.
- Chrome extension ID stays identical across reload/reinstall (fixed manifest key).
- Linux Snap/Flatpak detection correctly identifies sandboxed browsers on a fixture/test system and shows the capability notice instead of a silent failure.
- Signed Firefox `.xpi` installs on a standard-release Firefox without enabling any special preference.

### Exit gate

- Chrome and Firefox can add ordinary links and batches.
- The application works when browsers are absent.
- Native host rejects untrusted clients and malformed input.
- Protocol compatibility matrix is documented.
- Neither browser integration depends on a paid certificate, a store review, or a store fee.
- Linux sandboxed-browser detection is in place and disclosed honestly; no other feature is blocked by its result.

### AI phase instruction

Complete ordinary browser capture. Keep media message types disabled/unsupported until Phase 9 rather than returning fake format data.

---

## 19. Phase 9 — yt-dlp and FFmpeg media subsystem

### Goal

Provide a stable local adapter for media metadata, formats, downloads, audio extraction, subtitles, and merging.

### Required work packages

#### 9.1 Tool manager

- Discover a bundled or user-configured yt-dlp and FFmpeg/FFprobe.
- Verify version, origin, checksum/signature, executable permissions, and compatibility.
- Pin known-good minimum/maximum compatibility ranges.
- Never invoke through a shell.
- Use fixed executable path plus explicit argument array.
- Bound process runtime, stdout/stderr size, memory, temp space, and cancellation.
- Store tool updates in a versioned staging directory with rollback.

#### 9.2 Metadata discovery

- Use yt-dlp JSON output through a typed adapter.
- Extract title, duration, thumbnail URL, available formats, codecs, resolution, FPS, HDR, audio channels/bitrate, container, estimated/exact size, subtitles, and playlist context.
- Treat every field and filename as untrusted.
- Cache metadata briefly with source/version identity.
- Do not pass browser credentials unless the user approved the selected site/session.

#### 9.3 Format model

Present user-friendly choices:

- Best available;
- Smallest file;
- 2160p/1440p/1080p/720p/480p/etc. when available;
- exact format rows for advanced users;
- audio-only with original/best plus MP3, M4A, Opus, FLAC, WAV when technically available;
- subtitle languages;
- compatibility preference such as MP4/H.264/AAC.

Show when a selection requires separate audio/video downloads and FFmpeg merge.

#### 9.4 Media job pipeline

```text
DISCOVERING_FORMATS
-> WAITING_FOR_SELECTION
-> DOWNLOADING_MEDIA_PARTS
-> POST_PROCESSING
-> VERIFYING
-> SAFETY_SCANNING
-> COMPLETED
```

- Capture yt-dlp progress through a machine-readable template/progress channel.
- Map media subprocess progress into SmartDM projections.
- Support pause/cancel where the tool permits; otherwise cancel safely and resume through yt-dlp's partial-file behavior after validation.
- Use SmartDM-managed temp directories.
- Verify output exists and metadata matches expected selection.
- Do not report complete before post-processing ends.

#### 9.5 Legal and update behavior

- Show authorized-content notice on first media use.
- Do not implement DRM bypass.
- Do not hide site/tool errors as generic network failures.
- Make extractor updates user-visible and reversible.
- Provide tool license notices and source information.

### Tests and evidence

- Use locally served open test media and committed metadata fixtures.
- Mock yt-dlp/FFmpeg process outputs for deterministic error tests.
- Verify argument injection cannot occur through title, URL, or path.
- Test video-only + audio-only merge.
- Test audio extraction, subtitle selection, cancellation, disk full, tool crash, invalid JSON, update rollback.
- Public-site checks are manual compatibility tests and never required for the normal unit/integration suite.

### Exit gate

- Format list and size/codec labels are correct for fixtures.
- Audio-only and merged output succeed.
- External-process arguments are injection-safe.
- Tool absence/update failure produces recovery guidance.
- All media output remains within managed temp/destination roots.

### AI phase instruction

Implement adapters and a desktop media dialog first. Do not inject a YouTube thumbnail icon yet; the browser overlay belongs to Phase 10.

---

## 20. Phase 10 — YouTube thumbnail SmartDM panel

### Goal

Place a small SmartDM icon on YouTube video thumbnails in Chrome and Firefox. The user can choose available size/resolution or audio without starting playback.

### User flow

1. The user opens a YouTube page containing video thumbnails.
2. The extension identifies eligible video cards.
3. A small SmartDM icon appears on hover/focus in a consistent thumbnail corner.
4. Clicking the icon prevents page navigation for that click and opens a compact accessible panel.
5. The extension sends the canonical video URL to the native host.
6. SmartDM/yt-dlp returns normalized available formats.
7. The panel shows recommended resolutions, approximate/exact sizes, containers, and Audio Only.
8. The user chooses an option and destination behavior.
9. SmartDM adds the media job and the panel shows accepted/progress status.

### Required work packages

#### 10.1 DOM integration

- Use a scoped content script and `MutationObserver` because YouTube dynamically replaces content.
- Identify video URLs from anchors rather than relying only on unstable visual class names.
- Deduplicate overlays when DOM nodes are reused.
- Use Shadow DOM or strictly scoped CSS to avoid page-style conflicts.
- Show icon on hover and keyboard focus; do not cover built-in controls.
- Support home, search, subscriptions, channel, playlist, and related-video layouts through tested selectors/strategies.
- Fail quietly when layout is unknown.

#### 10.2 Accessible format panel

- Keyboard open/close and focus trap.
- Loading, tool-missing, app-not-installed, unsupported, consent, and error states.
- Quick choices plus an “Advanced formats” action opening SmartDM.
- Remember safe format preferences locally without transmitting browsing history.

#### 10.3 Browser/native flow

- Content script -> extension background/service worker -> native host -> SmartDM media service.
- Request IDs and cancellation.
- Short metadata cache keyed by canonical video ID and tool version.
- No direct media extraction inside extension code.
- No remote code in the extension.

#### 10.4 Privacy

- Do not transmit viewed page history to SmartDM unless the user clicks the icon or invokes a capture command.
- Do not send YouTube page content to Gemini.
- Do not log full watch URLs or query parameters.

### Tests and evidence

- DOM fixture tests for all supported layouts.
- Mutation/recycling/duplicate overlay tests.
- Keyboard and screen-reader checks.
- Chrome MV3 service worker wake/sleep behavior.
- Firefox behavior.
- Native host/app missing and version mismatch.
- Format response latency and cache invalidation.
- Manual YouTube compatibility run using content the tester is authorized to download.

### Exit gate

- Icon appears on supported thumbnails without playback.
- Both browsers show equivalent resolution/audio choices.
- Extension does not interfere with normal thumbnail clicks.
- No background browsing-history collection.
- A YouTube DOM change disables only the overlay, not SmartDM's normal downloads.

### AI phase instruction

Keep the site-specific code inside a YouTube integration package with fixture tests. Never copy media extraction logic into JavaScript; use the Phase 9 adapter.

---

## 21. Phase 11 — Local file catalog and duplicate detection

### Goal

Find files already present in user-approved locations and warn before unnecessary downloads.

### Required work packages

#### 11.1 Scope and consent

- First-run catalog setup asks which drives/folders may be indexed.
- Do not scan the whole system silently.
- Exclude OS directories, application caches, recycle/trash, browser profiles, and secret stores by default.
- Show estimated scope and allow pause/remove/rebuild.

#### 11.2 Catalog database

Add:

- `catalog_root`;
- `catalog_file`;
- `catalog_media_metadata`;
- `catalog_hash`;
- `catalog_scan`;
- FTS5 virtual tables for permitted searchable metadata.

Store canonical root-relative path, display name, extension, MIME, size, created/modified times when available, media duration/dimensions, and scan state. The database is encrypted.

#### 11.3 Scanner and watcher

- Bounded breadth/depth traversal.
- Respect symlink policy and avoid cycles.
- Permission failures are recorded, not retried in a tight loop.
- Use platform file watchers for incremental changes with overflow-triggered reconciliation.
- Checkpoint full scans and resume after restart.
- Low priority and configurable pause conditions.

#### 11.4 Metadata extraction

- Basic filesystem metadata in-process.
- MIME detection with bounded reads.
- FFprobe media metadata through a constrained worker.
- Optional document text/metadata extraction later through a sandboxed worker with size/time limits.

#### 11.5 Duplicate tiers

1. **Possible match:** normalized name and size.
2. **Strong match:** size plus quick fingerprint from bounded beginning/end samples.
3. **Exact match:** full SHA-256.

Full hashes are computed only for candidates or user-requested verification. A remote URL/ETag alone is not proof of file equality.

#### 11.6 Download integration

Before download, show possible/strong matches. After bytes are available, perform exact verification when needed. Actions:

- Open existing;
- Reveal existing;
- Verify;
- Use existing and cancel new download;
- Choose another destination;
- Download anyway.

### Tests and evidence

- 100,000-file synthetic tree benchmark.
- Permission errors, symlink cycles, watcher overflow, rename/move/delete.
- HDD-friendly throttling.
- Quick fingerprint collision escalates to full hash.
- Catalog root removal deletes metadata, not user files.
- Raw encrypted database does not expose paths or filenames.

### Exit gate

- Selected roots index incrementally and recoverably.
- Duplicate actions never delete or replace a file automatically.
- Potato profile meets memory/search/index budgets.
- Removing a catalog root stops monitoring and purges its catalog records safely.

### AI phase instruction

Do not call Gemini. Build deterministic cataloging and duplicate evidence first. Never scan outside approved roots.

---

## 22. Phase 12 — Local smart folder selection

### Goal

Suggest useful destination folders and show existing matching files without requiring cloud AI.

### Required work packages

#### 12.1 Candidate generation

Generate candidates from:

- category default folders;
- recent folders used for the source host/type;
- indexed folders containing similar file types;
- pinned user folders;
- existing duplicate locations;
- folders with sufficient free space and write access.

Never suggest OS/system/application-secret folders.

#### 12.2 Local feature model

Use lightweight explainable scoring:

```text
score = category_match
      + mime_extension_affinity
      + user_choice_frequency
      + recency
      + source_host_affinity
      + pinned_bonus
      + available_space
      - path_risk
      - duplicate_conflict
```

- Start from deterministic weights.
- Learn only from accepted/rejected suggestions stored locally.
- Use a small online linear/ranking model, not a local LLM.
- Allow reset/export/delete of learned preferences.

#### 12.3 Suggestion UI

Show up to three suggestions with plain reasons:

```text
Downloads/Videos — default for video files
D:/Courses/Java — you placed 8 similar files here
E:/Archive — an identical file may already exist here
```

Actions:

- choose suggestion;
- browse elsewhere;
- always use for this rule;
- never suggest this folder;
- open/reveal duplicate.

#### 12.4 Safety and correctness

- Recheck write permission and free space at selection and finalization.
- Normalize and constrain paths.
- User choice always wins.
- Never move an existing file without confirmation.

### Tests and evidence

- Stable ranking fixtures.
- Learning improves repeated synthetic choices.
- Reset removes learned influence.
- Malicious filenames/paths cannot create an external path.
- Low disk/permission changes invalidate a suggestion.
- Duplicate reason links to correct catalog evidence.

### Exit gate

- Useful top-three suggestions work with Gemini disabled.
- Every score has a user-facing explanation.
- No heavy model runs in Potato mode.
- Learned data remains encrypted and deletable.

### AI phase instruction

Build an explainable local ranker. Do not label deterministic folder rules as “AI” in code; expose them as Smart Suggestions and reserve the provider interface for Phase 14.

---

## 23. Phase 13 — Local natural-language search

### Goal

Let the user search with names or sentences such as “a video, not too long, downloaded around four days ago” on a low-end computer.

SQLite FTS5 provides local full-text search with ranking and query support; see the [official SQLite FTS5 documentation](https://sqlite.org/fts5.html).

### Required work packages

#### 13.1 Searchable sources

- SmartDM download history.
- User-approved file catalog.
- Queue/schedule state where relevant.
- Optional extracted document text, separately enabled.

#### 13.2 Query model

Parse into a typed plan:

```java
record LocalSearchPlan(
    Optional<String> text,
    Set<FileKind> kinds,
    Optional<InstantRange> dateRange,
    Optional<LongRange> sizeBytes,
    Optional<DurationRange> mediaDuration,
    Set<DownloadState> states,
    Optional<PathScope> scope,
    SortOrder sortOrder,
    List<String> unparsedTerms) {}
```

#### 13.3 Deterministic language parser

Support English first with architecture ready for localization:

- file types and synonyms: video, movie, clip, audio, song, PDF, image, archive, program;
- relative dates: today, yesterday, around four days ago, last week, in June;
- size: small, under 50 MB, larger than 1 GB;
- media duration: short, not too long, under 20 minutes, around an hour;
- state: completed, failed, paused, still downloading;
- source: from YouTube, from a host;
- location: in Downloads, on a selected drive;
- duplicate/safety attributes.

Define user-configurable meanings for vague words such as “short” and “large.”

#### 13.4 Search execution

- FTS5/BM25 for filename, title, tags, safe source host, and optional indexed text.
- SQL filters for dates, types, size, duration, state, and path scope.
- Merge history/catalog results without duplicates.
- Highlight why each item matched.
- Paginate; never materialize all results.

#### 13.5 Search UI

- Global command/search box.
- Plain-language query plus optional filter chips.
- “SmartDM understood” summary.
- User can remove/correct an interpreted filter.
- Search history is encrypted and locally clearable.
- No query leaves the device by default.

#### 13.6 Optional semantic pack

- Not required for release or Potato mode.
- Separately installed, checksum-verified, license-reviewed small ONNX embedding model.
- Operates only on approved metadata/text.
- Bounded model memory and background embedding queue.
- User can remove the pack and derived vectors.
- FTS/filter search remains the fallback.

### Example acceptance queries

| Query | Expected interpretation |
| --- | --- |
| `budget.xlsx` | Text/name search |
| `video not too long downloaded around 4 days ago` | Video kind + configured short-duration range + date window around four days ago |
| `failed PDFs from last week` | PDF kind + failed state + last-week range |
| `large files on D drive` | Configured large threshold + approved D scope |
| `the audio I downloaded yesterday` | Audio kind + download date yesterday |
| `same file already exists` | Duplicate-evidence filter |

### Tests and evidence

- Parser unit corpus for supported phrases and ambiguity.
- Time-zone and date-boundary tests.
- FTS escaping/injection tests.
- 100,000-item p95 benchmark.
- Search remains functional with optional semantic pack absent, corrupt, or removed.
- Query never invokes Gemini.

### Exit gate

- All acceptance queries produce an inspectable local plan.
- Search meets Potato-mode budgets.
- User can correct the parser.
- No cloud/network dependency exists.

### AI phase instruction

Implement typed parsing and FTS/filter execution. Do not add a local LLM. Optimize the given real-world query examples before adding broad “AI” abstractions.

---

## 24. Phase 14 — Optional Gemini consented fallback

### Goal

Use the user's Gemini free API key only for ambiguous folder classification or query interpretation that the local system cannot handle confidently.

### Required work packages

#### 14.1 Provider boundary

```java
interface OptionalAiAdvisor {
    AiCapability capability();
    CompletionStage<AiSuggestion> request(
        AiTask task,
        ApprovedPayload payload,
        CancellationToken cancellation);
}
```

The provider cannot receive repository, filesystem, or catalog interfaces.

#### 14.2 API key

- User creates and enters their own Gemini API key.
- Store only through secure storage.
- Provide test/revoke/remove actions.
- Never print key in logs, exceptions, URLs, or support bundles.
- Direct device-to-Google connection; no SmartDM proxy.

#### 14.3 Consent firewall

Before a request:

1. Local system declares why it needs help.
2. A sanitizer builds the smallest proposed payload.
3. A policy engine rejects forbidden fields.
4. UI shows exact JSON/text payload and current data-use warning.
5. User approves once or according to selected consent mode.
6. Audit record stores task type and field categories, not secret payload content.

Forbidden fields include file bytes, complete file contents, cookies, authorization headers, API keys, raw hashes, full catalog, full history, and unapproved absolute paths.

#### 14.4 Allowed tasks

- Parse an ambiguous natural-language query into a strict search-plan schema.
- Rank generic destination categories/folder aliases from an approved candidate list.
- Explain a deterministic safety warning without changing its status.

The response must use a strict JSON schema. Validate IDs against supplied candidates; reject invented paths or actions.

#### 14.5 Local fallback and quotas

- Timeout, offline, 4xx, 429, 5xx, malformed output, model retirement, and safety refusal all return to local behavior.
- Show “Gemini unavailable—using local result,” not a fatal error.
- Use request budget and cooldown to avoid accidental quota exhaustion.
- Do not assume a specific model is permanently free.

#### 14.6 Hardware routing

Hardware does not automatically authorize cloud use. Routing is:

```text
Local deterministic result confident -> use local
Local result uncertain + Gemini OFF -> show local clarification UI
Local result uncertain + Gemini enabled -> show consent payload
User declines -> local clarification UI
User approves -> direct Gemini request -> validate -> show suggestion
```

### Tests and evidence

- Fake Gemini server for every status and malformed response.
- Sanitizer attempts to leak forbidden fields.
- Consent cancellation and timeout.
- API key redaction.
- Invented path/candidate rejection.
- Quota exhaustion keeps local features working.
- Network inspection proves no call occurs before approval.

### Exit gate

- Gemini is disabled by default.
- No request can bypass the sanitizer/consent firewall.
- Every Gemini task has a local fallback.
- Free-tier data warning is accurate and linked to current terms.
- Removing the API key removes all Gemini capability without affecting core features.

### AI phase instruction

Do not send a realistic private dataset during development. Use a local fake provider and synthetic metadata. Treat external API behavior as unreliable and optional.

---

## 25. Phase 15 — Local safety scanner and risk center

### Goal

Give users layered local evidence about a downloaded file and warn before risky actions.

ClamAV supports local file scanning through tools such as `clamscan`; see [ClamAV scanning documentation](https://docs.clamav.net/manual/Usage/Scanning.html). Microsoft documents command-line Defender scanning through `MpCmdRun.exe`; integration privileges and supported invocation must be tested carefully rather than running the whole application elevated. See [Microsoft Defender command-line documentation](https://learn.microsoft.com/en-us/defender-endpoint/command-line-arguments-microsoft-defender-antivirus).

### Required work packages

#### 15.1 Pre-download risk rules

- HTTP rather than HTTPS.
- Executable/script/archive/document-with-macros categories.
- Double or misleading extension.
- Content-Disposition/MIME/extension mismatch.
- Suspicious Unicode/control characters.
- Unexpected executable permission.
- Untrusted redirect chain.
- Abnormally large claimed size or unknown size.

Rules create evidence, not a malware verdict.

#### 15.2 Post-download inspection

- Verify actual magic bytes/file signature.
- Recompare MIME and extension.
- SHA-256 compute.
- Archive structure checks with recursion, expanded-size, entry-count, and compression-ratio limits.
- Optional local YARA-compatible rule adapter only after license and update review.
- Signed-binary evidence on Windows where reliable.

#### 15.3 Antivirus adapters

Windows:

- Detect Defender availability and security-intelligence freshness.
- Use a supported targeted scan path without running the SmartDM UI as administrator.
- If a scan requires elevation or is blocked by policy, report `SCAN_FAILED` or available real-time-protection evidence accurately.
- Parse stable exit/result evidence; retain raw sensitive output only transiently.

Linux:

- Detect ClamAV/clamd availability and signature freshness.
- Prefer daemon scanning when securely configured; fall back to bounded `clamscan`.
- Provide installation/update guidance without silently installing packages as root.

#### 15.4 Risk decision engine

```text
MALWARE_DETECTED -> block open/run; quarantine options
SUSPICIOUS -> strong warning and explicit override
SCAN_FAILED -> explain incomplete protection
NO_THREATS_DETECTED -> normal completion with “not a guarantee” detail
UNSCANNED -> visible unscanned state
```

AI cannot downgrade `MALWARE_DETECTED`, remove evidence, or label a file safe.

#### 15.5 Quarantine

- Application-owned quarantine directory.
- Random opaque filename and encrypted metadata.
- Restrictive permissions and non-executable handling.
- Restore requires warning and destination revalidation.
- Delete is explicit and irreversible.

#### 15.6 Safety center UI

- Overall status and evidence list.
- Scanner name/version/signature date.
- File identity and verified hash.
- Explanation in plain language.
- Open/reveal disabled or warned according to status.
- Rescan, quarantine, delete, and approved override.

### Tests and evidence

- Use EICAR only in controlled test directories and according to scanner guidance.
- Benign executable/document/archive fixtures.
- MIME mismatch and double extension.
- Zip bomb simulation with safe synthetic limits.
- Missing/stale/blocked antivirus.
- Timeout and process crash.
- Quarantine traversal and permission tests.
- Gemini cannot change verdict state.

### Exit gate

- Scanner statuses are honest and evidence-backed.
- SmartDM never runs as administrator for normal operation.
- Malware verdict blocks direct open/run.
- Quarantine is isolated and recoverable.
- No file bytes or hashes go to external reputation services.

### AI phase instruction

Build a security evidence pipeline, not an “AI antivirus.” Fail visibly when scanning is incomplete. Never upload samples or hashes.

---

## 26. Phase 16 — Remaining IDM-parity workflows

### Goal

Complete the advanced workflows that are useful but should not delay the integrity, browser, media, search, and safety foundations.

### Required work packages

#### 16.1 Site/page link collector

- User-started crawl only.
- Scope by current page, path, host, and depth.
- Preview and filter links by type/size/pattern.
- Rate limits, concurrency, cancellation, maximum pages/links.
- Respect authentication scope and never export cookies.
- Avoid forms, destructive actions, scripts, and unsupported schemes.
- No DRM/paywall bypass.

#### 16.2 Expired-link refresh

- Reprobe.
- Browser-assisted recapture for the selected item.
- Compare remote identity before continuing partial bytes.
- Never attach a new resource to old partial data without validation.

#### 16.3 Import/export

- Versioned SmartDM JSON export/import.
- CSV/text history export without secrets.
- Optional password-encrypted export containing private metadata.
- Basic legacy/IDM import only when the format is documented and tests are available.
- Never export API keys, cookies, auth headers, or wrapped master keys by default.

#### 16.4 CLI

Commands:

```text
smartdm add <url>
smartdm add-batch <file>
smartdm list [filters]
smartdm pause <id>
smartdm resume <id>
smartdm cancel <id>
smartdm search <query>
smartdm verify <id-or-path>
```

- Forward to the running instance through the authenticated local endpoint.
- Structured JSON output option.
- No secret values in process arguments; use protected input channels for credentials.

#### 16.5 Completion actions

- Native notification.
- Open file and reveal in file manager.
- Optional queue-complete sleep/hibernate/shutdown.
- Destructive power action requires explicit configuration, countdown, cancellation, and platform capability.
- Never auto-run downloaded executables.

#### 16.6 Convenience features

- Drag/drop URL and URL text files.
- Multiple queues and category presets export/import.
- Sound themes with mute/do-not-disturb.
- Manual checksum verification for existing files.
- “Redownload,” “Move completed file,” and “Change destination” with transactional catalog updates.
- Independent, standalone progress dialog for individual downloads (similar to IDM's progress window with tabs for speed limits and completion options).

### Tests and evidence

- Crawl loop/scope/rate-limit tests.
- Expired link points to changed content.
- Import corruption/version mismatch.
- CLI authentication and argument redaction.
- Power-action countdown/cancel.
- Moving a completed file updates catalog/history atomically.

### Exit gate

- IDM parity matrix has no unexplained missing item.
- Advanced flows preserve all earlier security and recovery guarantees.
- CLI and import/export do not leak secrets.
- User can disable each automation.

### AI phase instruction

Implement one workflow at a time behind existing application commands. Do not create parallel download logic in the crawler, CLI, or importer.

---

## 27. Phase 17 — UX, accessibility, localization, and performance hardening

### Goal

Turn the feature-complete application into a coherent, minimal, responsive product suitable for low-end systems.

### Required work packages

#### 17.1 UX consolidation

- User testing of add, pause/resume, browser capture, format selection, duplicate handling, smart folder, search, and safety warning.
- Remove duplicated settings and unclear jargon.
- Progressive disclosure: simple recommended choices first, advanced details second.
- Consistent empty/error/retry states.
- Undo where safe.
- First-run setup that does not force catalog, Gemini, clipboard, or browser integration.
- Add a setting to control the rubber band selection scroll speed.

#### 17.2 Themes

- Polish System, Light, Dark, and High Contrast.
- Optional accent color.
- Compact and comfortable density.
- Theme preview and reset.
- No separate feature differences between themes.

#### 17.3 Accessibility

- Keyboard-only acceptance suite.
- Screen-reader labels and announcements.
- Progress changes throttled to avoid noisy announcements.
- Contrast validation.
- Reduced motion.
- Scaled text at 100–200%.

#### 17.4 Localization

- External resource bundles.
- English baseline.
- Add Bengali as the first secondary localization if project resources permit.
- Locale-aware numbers, dates, durations, sizes, and pluralization.
- Query-parser synonym packs separated by locale.

#### 17.5 Performance

- Profile startup, idle, active downloads, catalog, search, hashing, FFprobe, and safety scan.
- Eliminate JavaFX-thread blocking.
- Virtualize large lists and paginate database queries.
- Coalesce progress updates.
- Bound caches.
- Pause background work under resource pressure.
- Run Potato/Standard/Performance benchmark suite.

#### 17.6 Diagnostics and privacy review

- Health screen for database, tools, secure store, browser host, scanners, disk, and catalog.
- User-previewed support bundle.
- Verify no telemetry endpoints.
- Verify redaction and encrypted storage.
- Data deletion/export controls.

### Tests and evidence

- Performance budgets from Section 5.
- 100,000 downloads/history rows and catalog records.
- UI automated smoke under slow I/O.
- Accessibility checklist and manual screen-reader evidence.
- Localization layout tests.
- Privacy network capture with all optional external features disabled.

### Exit gate

- Performance budgets met or approved with measured ADR.
- No critical accessibility issue.
- Minimal UI works without advanced knowledge.
- Optional features remain opt-in.
- Privacy review finds no unexplained outbound request.

### AI phase instruction

Measure before optimizing. Do not remove correctness checks to improve benchmarks. Every UI simplification must preserve access to evidence and advanced controls.

---

## 28. Phase 18 — Packaging, browser-extension bundling, update, and release hardening

### Goal

Produce verifiable Windows and Linux release candidates with browser integration and safe updates.

### Required work packages

#### 18.1 Desktop packaging

Windows:

- `jlink` runtime image.
- `jpackage` application image and MSI or approved installer.
- Per-user install by default.
- Native messaging host registration for Chrome and Firefox.
- DPAPI and Defender integration smoke tests.
- Unsigned MSI/installer per ADR-0xx; published SHA-256 checksum for every artifact; honest in-app and download-page notice explaining the SmartScreen "unrecognized publisher" warning and how to verify the checksum.
- Optional: apply for free-for-open-source signing (e.g. SignPath.io) once eligible; treat this as a later, non-blocking upgrade, not a Phase 18 exit requirement.

Linux:

- `jlink` runtime image.
- DEB and AppImage or the two approved formats from Phase 0.
- XDG paths and user-level native host manifests.
- Secret Service/ClamAV capability checks.
- Desktop entry, icons, MIME/URL handlers where approved.

There is no macOS packaging job.

#### 18.2 Browser publishing

- Chrome extension shipped as an unpacked folder inside the release artifact; no Chrome Web Store submission is required and none is planned for v1.
- Firefox extension submitted to addons.mozilla.org for free unlisted signing on every release; the signed `.xpi` is bundled into the release artifact and linked from the download page.
- In-app and download-page descriptions accurately disclose the native application requirement, permissions, media behavior, privacy, and the exact install steps (Developer mode for Chrome, signed-`.xpi` install for Firefox).
- Extension and native protocol compatibility table.
- Staged rollout and rollback.
- Listing on the Chrome Web Store or Firefox Add-ons store remains an optional future upgrade (like Windows code signing in 18.1), never a Phase 18 exit requirement.

#### 18.3 Tool distribution

- Verified yt-dlp and FFmpeg acquisition/bundling according to Phase 0 decision.
- Third-party notices in app and package.
- Exact source/build information required by licenses.
- Signed/checksummed update metadata.
- Atomic install and rollback.

#### 18.4 Application updates

- No SmartDM server is required.
- Recommended source is GitHub Releases (checksums published per Section 3.7) or manual download for an open-source project.
- Update checks are user-configurable and disabled in strict offline mode.
- Verify checksum (and detached signature once a free signing mechanism is in place), version monotonicity, architecture, and package type; checksum verification alone is the minimum bar and is mandatory even while unsigned.
- Never execute an unverified update.
- Database backup before migrations.

#### 18.5 Release security

- SBOM.
- Dependency and vulnerability scan.
- Secret scan.
- Reproducibility report where feasible.
- Published checksums for every installer/artifact (Authenticode signing deferred per ADR-0xx; add detached GPG/Sigstore signatures as a free alternative once the release pipeline supports it).
- Privacy policy and data-flow disclosure.
- Content-rights notice.
- Security reporting process.

#### 18.6 Release test matrix

- Supported Windows versions on x64.
- Supported Linux distributions/package formats on x64.
- Chrome stable and Firefox stable, each in both a non-sandboxed build (.deb/RPM/official installer) and a Snap/Flatpak build, to verify the Section 8.5 capability check triggers correctly.
- Fresh install, upgrade, downgrade refusal, uninstall.
- App installed/not running/running with browser capture.
- Potato profile.
- Offline installation/use where package permits.
- Database/tool/browser protocol migration.

### Exit gate

- Install, launch, browser registration, download, media selection, search, scan, update, and uninstall pass on the release matrix.
- Every release artifact has a published, verified checksum; unsigned status is disclosed honestly in the UI and download page per ADR-0xx (Authenticode signing is not required to exit this phase).
- License notices/source obligations are satisfied.
- No macOS artifact or premium/entitlement code exists.
- Release candidate has documented known limitations and rollback.

### AI phase instruction

Do not improvise signing keys or publish automatically. Build repeatable unsigned test packages first; production signing/publishing requires owner-controlled credentials and explicit approval.

---

## 29. Cross-phase database migration order

| Migration group | Phase | Main objects |
| --- | ---: | --- |
| V001–V009 | 2 | schema, profile, settings, secure references, diagnostics, events |
| V010–V019 | 4 | download, protected headers, download events |
| V020–V029 | 5 | segments, retries, verification fields |
| V030–V039 | 6 | queues, queue items, schedules, executions |
| V040–V049 | 7 | categories, rules, proxy references, batch records |
| V050–V059 | 8–10 | browser pairings, protocol state, media job metadata |
| V060–V069 | 11 | catalog roots/files/media/hash/scan and FTS tables |
| V070–V079 | 12–14 | organization feedback, search settings/history, AI audit metadata |
| V080–V089 | 15 | safety scan, evidence, quarantine records |
| V090+ | 16–18 | imports, collector jobs, release/update metadata as needed |

Rules:

- Migrations are immutable after release.
- Every migration has upgrade, creation-from-zero, interrupted-run, and prior-version tests.
- Destructive changes use create-copy-validate-swap.
- Encrypted backup precedes high-risk migration.
- Application refuses a schema newer than it understands.

---

## 30. Cross-phase security gates

These gates apply continuously:

| Gate | Requirement |
| --- | --- |
| Secret handling | API keys, cookies, auth, proxy credentials, and DB keys never enter logs or normal DTOs |
| Process execution | No shell; fixed executable plus validated argument list; bounded output/time |
| Network | TLS validation remains enabled; redirect and header policies enforced |
| Files | Canonical destination validation; safe temp/finalization; no auto execution |
| Browser | Versioned native messages, origin allowlist, size bounds, minimum permissions |
| Gemini | Disabled by default; exact consent payload; forbidden fields; strict schema; local fallback |
| Catalog | Approved roots only; exclusions; bounded scanning; encrypted records |
| Safety | Evidence-based status; AI cannot downgrade; no external sample/hash upload |
| Updates | Verified source, signature/hash, atomic staging, rollback |
| UI | No background operation on JavaFX thread; destructive actions explicit |

Any failed gate blocks the phase even if the feature demo works.

---

## 31. Test infrastructure required across phases

### 31.1 HTTP behavior server

Must simulate:

- ranges, ignored ranges, invalid ranges;
- validators and changed resources;
- redirects and cross-origin header checks;
- slow headers/body, disconnects, resets;
- known/unknown/wrong length;
- auth, proxy, rate limits, retry-after;
- compressed responses;
- concurrent segment throttling.

### 31.2 Process fixture framework

Fake yt-dlp, FFmpeg, Defender, and ClamAV executables must emit controlled stdout/stderr, partial output, hangs, crashes, oversized output, and exit codes. Production adapters must pass contract tests against fakes before optional manual tests against real tools.

### 31.3 Filesystem fault framework

Simulate:

- disk full;
- permission denied;
- destination appears mid-download;
- locked files;
- cross-filesystem move;
- symlink changes;
- long/Unicode/reserved names;
- watcher overflow;
- slow I/O and sudden removal.

### 31.4 Privacy leak tests

Seed unique canary strings into URLs, paths, filenames, headers, cookies, API keys, prompts, and catalog fields. Search raw files, logs, support bundles, process arguments, and captured network traffic. A canary outside its explicitly approved encrypted/payload boundary fails the build.

### 31.5 Low-end benchmark

Use a repeatable 2-core/4-GB environment with:

- 1,000 history items;
- 100,000 catalog items;
- active download and throttled index scan;
- local prompt search;
- format-list process fixture;
- safety scan fixture.

Record startup, memory, CPU, UI latency, and search latency after relevant phases.

---

## 32. Release-level acceptance scenarios

### Scenario A — Ordinary accelerated download

1. Add an HTTPS URL from SmartDM.
2. Smart folder suggests three destinations.
3. Duplicate check finds none.
4. Segmented transfer begins.
5. Pause, close SmartDM, restart, resume.
6. Verify size/hash.
7. Scan locally.
8. Atomically finalize and notify.

Expected: no corruption, privacy leak, UI freeze, or false safety claim.

### Scenario B — Existing file found

1. Browser sends a download.
2. Catalog finds a strong possible match elsewhere.
3. User verifies full SHA-256.
4. SmartDM offers open/reveal/use-existing/download-anyway.

Expected: no existing file is deleted or replaced automatically.

### Scenario C — YouTube thumbnail

1. Open YouTube home/search without playing a video.
2. Hover/focus a thumbnail.
3. SmartDM icon appears.
4. Select 720p or Audio Only.
5. Native app receives and processes the job.
6. FFmpeg post-processing finishes before completion.

Expected: normal page behavior remains intact and no background history is collected.

### Scenario D — Local prompt search

Search:

```text
video not too long downloaded around 4 days ago
```

Expected: local parser shows interpreted chips, returns ranked results quickly, and sends no network request.

### Scenario E — Gemini fallback

1. Enter an intentionally ambiguous query.
2. Local parser requests clarification or optional help.
3. User chooses Gemini.
4. Payload preview excludes paths/catalog/history.
5. User approves.
6. Output validates against strict schema.
7. Quota failure returns to local clarification.

Expected: no silent request and no fatal cloud dependency.

### Scenario F — Suspicious file

1. Download a double-extension executable fixture.
2. Preflight warns.
3. File completes into temp.
4. Local scanner reports suspicious/malware evidence.
5. SmartDM blocks normal open and offers quarantine/delete/explicit override according to status.

Expected: AI cannot change the verdict and no sample/hash is uploaded.

### Scenario G — Potato PC

1. Launch with 100,000 catalog records.
2. Download two files.
3. Run a local prompt search.
4. Background catalog reconciles slowly.

Expected: memory and latency stay within budgets, no local LLM loads, and the UI stays responsive.

---

## 33. Risks and required mitigations

| Risk | Mitigation |
| --- | --- |
| “Everything in IDM” creates endless scope | Use the explicit parity matrix and phase gates |
| YouTube layout/extractor changes | Isolate adapters, fixture tests, verified yt-dlp updates, graceful disable |
| YouTube terms/copyright issues | Authorized-content notice, no DRM bypass, owner review before distribution |
| Gemini free tier is not private | Local default, exact payload consent, no sensitive data, direct BYO key |
| Gemini free tier changes or disappears | No required cloud path; provider and quota fallback |
| Local AI is too heavy | No LLM in Potato mode; FTS5, typed parser, small ranker |
| SQLCipher Java/native packaging fails | Phase 2 proof blocks later sensitive persistence; no plaintext fallback |
| Antivirus false confidence | Evidence states and “not a guarantee” wording; AI cannot declare safe |
| Defender requires privilege/policy | Capability adapter, do not elevate whole app, honest scan-failed state |
| ClamAV absent or signatures stale | Detect and explain; local rules still run; never fake scanned status |
| FFmpeg licensing mistake | Phase 0 build/license decision and notices/source compliance |
| External binary compromise | Official sources, signature/hash, staging, rollback, no shell execution |
| Unsigned installer triggers SmartScreen/publisher-trust warnings and user distrust | Honest first-run/download-page disclosure, published checksums, GPG/Sigstore signatures, apply to SignPath.io once eligible |
| Snap/Flatpak-packaged Chrome or Firefox blocks native messaging on Linux | Section 8.5 capability detection, honest in-app notice, link to non-sandboxed install; core app stays fully usable without browser capture |
| Sideloading instructions (enable Developer mode, install unsigned extension) resemble malware social-engineering patterns | Specific, checksum-referenced instructions tied only to the verified SmartDM install; explicit warning never to load a copy from elsewhere |
| Catalog invades privacy or consumes resources | Opt-in roots, encryption, exclusions, throttling, pause/delete controls |
| Search leaks private terms to Gemini | Search stays local unless exact query payload is explicitly approved |
| Browser extension collects history | Act only on user capture/click; no passive URL reporting |
| AI agent skips hard tests | Phase isolation, status/evidence files, non-negotiable exit gates |

---

## 34. Copyable prompt for a coding AI

Use this prompt at the start of each phase:

```text
You are implementing SmartDM Phase <N>: <NAME>.

Authoritative plan:
docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md

Rules:
1. Read the entire phase, the AI implementation contract, PHASE_STATUS.md,
   TEST_EVIDENCE.md, KNOWN_LIMITATIONS.md, and relevant ADRs.
2. Inspect the repository and preserve unrelated user changes.
3. Implement this phase only. Do not begin later phases.
4. Break the phase into the listed work packages and finish each vertically.
5. Add deterministic tests with every production change.
6. Keep I/O off the JavaFX thread.
7. Never log or expose secrets/personal data.
8. Never invoke external tools through a shell.
9. Never weaken encryption, consent, safety, or recovery to pass a demo.
10. Record migrations and significant decisions.
11. Run the full required verification suite.
12. Do not mark COMPLETE until every exit criterion is proven.

Before coding, report:
- current phase status;
- relevant existing modules;
- work-package checklist;
- risks/blockers;
- baseline test result.

At handoff, report:
- completed work packages;
- changed files/modules;
- schema migrations;
- tests and exact results;
- manual verification;
- privacy/security evidence;
- remaining limitations;
- whether the exit gate is fully satisfied;
- the next phase that is allowed to start.
```

---

## 35. Final build order recommendation

The implementation must prove difficult invariants before adding attractive AI features:

```text
Decisions and licenses
-> reproducible build
-> encrypted profile
-> friendly UI shell
-> reliable single download
-> segmented recovery
-> queues and scheduling
-> secure input/browser capture
-> media subsystem
-> YouTube thumbnail panel
-> local catalog and duplicates
-> local folder intelligence
-> local natural-language search
-> optional consented Gemini
-> layered safety scanning
-> remaining parity
-> polish and release
```

This order keeps SmartDM useful on a potato PC, functional without a server or Gemini, and safe to develop incrementally. It also prevents the project from building a polished browser/AI layer on top of an unreliable download and recovery engine.
