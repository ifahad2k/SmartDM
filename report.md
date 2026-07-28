# SmartDM Project & Engineering Handoff Report (`report.md`)

> **For AI Agents & Developers Continuing Work on SmartDM**  
> *Generated on July 28, 2026*

---

## 1. Project Overview & Non-Negotiable Core Rules

**SmartDM** is a free, local-first, open-source download manager targeting **Windows and Linux only**.

### Critical Product Rules (Do NOT break under any circumstances)
1. **Target Platforms**: Windows and Linux ONLY. No macOS builds/code.
2. **Monetization / Edition**: Exactly **one free edition**. No premium tiers, accounts, cloud sync, telemetry, license servers, or SmartDM-owned backend servers.
3. **Architecture / Dependencies**: Java 21 LTS, Gradle, JavaFX 21+, SQLCipher for SQLite, yt-dlp + FFmpeg for media, Chrome & Firefox native messaging extension.
4. **AI Rules (Gemini)**: Optional, off-by-default, user-keyed fallback for local search/organization only. Never send file contents, hashes, full directory trees, cookies, or auth headers to Gemini. Local features (search, duplicate detection, folder suggestion) MUST work completely without AI.
5. **Security & Process Rules**:
   - **Secrets**: Redact secrets, keys, and tokens from logs, DTOs, and exception messages.
   - **Process Execution**: NO shell execution (`sh`, `bash`, `cmd`). Always use explicit string array arguments with fixed executable paths.
   - **JavaFX UI Thread**: NEVER run blocking network, database, file I/O, hashing, process execution, or scanning on the JavaFX UI thread.
   - **Safety Verdict Wording**: Scanners only yield `UNSCANNED`, `SCANNING`, `NO_THREATS_DETECTED`, `SUSPICIOUS`, `MALWARE_DETECTED`, or `SCAN_FAILED`. Never state or display that an AI claims a file is "safe".

---

## 2. Multi-Module Project Structure

The project uses a clean multi-module Gradle architecture enforcing clear boundary rules via architecture tests (`modules/` and `apps/`):

```
SmartDM/
├── apps/
│   └── desktop                 # Main entry point combining all modules & JavaFX Application Launcher
├── modules/
│   ├── domain                  # Pure core domain entities, value objects, domain logic (No JavaFX/JDBC/HTTP)
│   ├── application             # Use cases, application service ports & orchestration
│   ├── download-engine         # Multithreaded transfer coordinator, range management, integrity validation
│   ├── download-http           # OkHttp transfer provider & probe adapters
│   ├── persistence-api         # Repository & database interface contracts
│   ├── persistence-sqlcipher   # Encrypted SQLite (SQLCipher) implementation & Flyway migrations
│   ├── secure-storage          # OS Credential storage (DPAPI for Windows, Secret Service/Argon2 for Linux)
│   ├── desktop-ui              # JavaFX user interface, themes, custom controls, dark mode
│   ├── file-catalog            # Non-blocking file crawler, duplicate detection, quick fingerprinting
│   ├── search-local            # FTS5 local database search engine
│   ├── organization-local      # Rule-based auto-categorization & directory suggestion
│   ├── ai-api                  # Contracts for AI search/organization assistant
│   ├── ai-gemini               # Optional Google Gemini provider with consent payload validation
│   ├── safety-api              # Security scanner interfaces & threat evaluation model
│   ├── safety-rules            # Rule-based threat heuristic engine
│   ├── safety-windows-defender # Windows Defender CLI wrapper
│   ├── safety-clamav           # ClamAV daemon / CLI adapter
│   ├── media-api               # Media extraction contracts (qualities, formats, streams)
│   ├── media-ytdlp             # Local yt-dlp execution wrapper for YouTube/media info extraction
│   ├── media-ffmpeg            # Local FFmpeg execution wrapper for audio/video merging and conversion
│   ├── browser-protocol        # Native messaging schema & JSON protocol entities
│   ├── browser-native-host     # Host application communicating with Chrome/Firefox extensions
│   ├── platform-api            # Native system integration contracts
│   ├── platform-windows        # Windows OS shell integrations, registry, notifications
│   └── platform-linux          # Linux OS shell integrations, freedesktop desktop entries
├── extensions/                 # Native messaging browser extensions (Chrome unpacked, Firefox AMO signed)
├── tools/                      # Test servers, media fixtures, catalog benchmarks
└── docs/                       # Authoritative documentation, ADRs, phase tracking, implementation plans
```

### Module Boundary Regulations (Enforced by CI Architecture Tests)
- `domain` MUST NOT depend on JavaFX, JDBC, HTTP, Jackson, native OS APIs, or third-party engines.
- `desktop-ui` MUST NOT access JDBC databases or execute native process strings directly.
- `ai-gemini` MUST ONLY take `ApprovedPayload` (no database, filesystem, or raw catalog access).
- Browser extensions communicate ONLY via the versioned `browser-protocol` native messaging pipeline.

---

## 3. Implementation Status & Phase Roadmap

Implementation follows the master plan in `docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md`. Tracking is maintained in `docs/implementation/PHASE_STATUS.md`.

### Completed Phases (0 – 5 & 11)
- **Phase 0 (Foundation & Legal)**: Product specs, legal/privacy rules, threat model, third-party licenses locked.
- **Phase 1 (Engineering Scaffolding)**: Gradle multi-module layout, build-logic plugins, CI workflows, ArchUnit tests.
- **Phase 2 (Encrypted Persistence & Profile Lock)**: SQLCipher database setup with Flyway migrations (`V1`), DPAPI / Linux Argon2 profile encryption, log redaction.
- **Phase 3 (Minimal JavaFX Shell & Theme System)**: Modern responsive dark/light UI shell, custom stylesheets, keyboard navigation.
- **Phase 4 (Single-Download Vertical Slice)**: Transfer coordinator, temp file handling, HTTP probe, atomic commit, `V2` database migration.
- **Phase 5 (Multithreaded Segmentation & Recovery)**: Byte-range segmentation engine (`SegmentWorker` & `SegmentedFileChannel`), dynamic pause/resume, ETag/Content-Length change detection, crash recovery, `V3`/`V4` schema migrations.
- **Phase 11 (File Catalog & Duplicate Detection)**: Approved root directory consent boundary, system folder exclusions (`DefaultPathFilter`), head+tail+size SHA-256 fingerprinting, 3-tier duplicate detection (`V10` schema migration).

### Active / Next Up Phases
- **Phase 6**: Download Queue Engine & Scheduler (Priority, concurrency limits, global/per-queue speed limiters).
- **Phase 7**: Clipboard monitoring, Batch Downloads, Basic/Proxy Authentication profiles.
- **Phase 8**: Chrome/Firefox native messaging browser capture integration.
- **Phase 9 & 10**: yt-dlp + FFmpeg media stream parsing, UI overlay for YouTube video/audio download dialog.

---

## 4. Verification & Testing Instructions

Always verify your changes before committing!

### Running Standard Test Suites
Run the following Gradle commands from the repository root:

```bash
# On Linux
./gradlew clean check
./gradlew architectureTest
./gradlew integrationTest
./gradlew uiTest
```

```powershell
# On Windows
.\gradlew.bat clean check
.\gradlew.bat architectureTest
.\gradlew.bat integrationTest
.\gradlew.bat uiTest
```

### Protocol Before Completing Any Work Package
1. Run all unit, architecture, integration, and UI tests.
2. Ensure no sensitive data (tokens, keys, user paths) leaks in log output.
3. Update `docs/implementation/TEST_EVIDENCE.md` with test execution results.
4. Update `docs/implementation/KNOWN_LIMITATIONS.md` with any unresolved gaps.
5. Update `docs/implementation/PHASE_STATUS.md` checklist items.

---

## 5. Key File Index

- `AGENTS.md` — Agent instructions & core repository rules (Read before every session).
- `docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md` — Authoritative product & architecture specification.
- `docs/implementation/PHASE_STATUS.md` — Live progress tracker across all 19 phases.
- `docs/implementation/TEST_EVIDENCE.md` — Latest test execution results.
- `docs/implementation/KNOWN_LIMITATIONS.md` — Active limitations and acceptable temporary stubs.
- `docs/adr/` — Architecture Decision Records.
