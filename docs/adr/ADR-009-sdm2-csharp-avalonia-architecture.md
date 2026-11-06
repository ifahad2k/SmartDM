# ADR-009: SmartDM 2.0 C#/.NET 9 Architecture and Legacy Java Decommissioning Plan

| Field         | Value                                               |
|---------------|-----------------------------------------------------|
| **Status**    | Accepted                                            |
| **Date**      | 2026-10-29                                          |
| **Approved By** | Repository Maintainer                             |
| **Authors**   | Antigravity AI Assistant & Repository Maintainer    |
| **Branch**    | `sdm2.0`                                            |

## Maintainer Approval Record

Approved by the repository maintainer on 2026-10-29 with the following explicit record:
> "I approve ADR-009: C#/.NET 9 and Avalonia are the supported SmartDM desktop architecture on sdm2.0. Keep the existing SmartDM browser format engine and C# media paths; do not add yt-dlp. Replace the remaining Java daemon dependency after C# transfer parity is tested. Change the ADR status to Accepted and record my approval."


## Context

SmartDM initially started as a multi-module Java 21 LTS project using JavaFX and Gradle. On the `sdm2.0` branch, development transitioned to a native desktop experience using C# and .NET 9 with Avalonia UI (`apps/desktop-avalonia`), accompanied by browser extensions for Google Chrome and Mozilla Firefox.

A detailed inspection and audit of the `sdm2.0` codebase revealed the true architectural structure:
1. **Browser Extraction Engine**: The Chrome and Firefox extensions contain SmartDM's native format engine in `modules/format_engine.js`. This engine parses HLS playlists and Facebook DASH manifests directly in JavaScript and builds adaptive format ladders.
2. **Desktop Format Discovery**:
   - YouTube media extraction is handled via the **YoutubeExplode** library in `YouTubeMediaResolver.cs`. It does **not** invoke or depend on `yt-dlp`.
   - Direct HLS media discovery is implemented natively in C# via `HlsMediaResolver.cs`.
3. **Stream Post-Processing**: `FFmpeg` is utilized strictly for post-processing operations (audio/video muxing, stream remuxing, and transcode operations). It is not an extractor. Past hardcoded paths referencing `yt-dlp.FFmpeg` WinGet directories were legacy artifacts and are not production dependencies.
4. **Transfer Engine & Java Runtime**:
   - The primary transfer engine is the C# `DownloadEngine.cs` and `SegmentWorker.cs`, supporting segmented parallel transfers, HTTP ranges, and HLS chunk streaming.
   - However, `IpcDownloadEngine.cs` still conditionally delegates ordinary HTTP downloads to a background Java daemon (`EngineDaemonLauncher.cs`) when present. This creates a hidden runtime dependency on Java.
5. **Security Finding C-06**: `HlsMediaResolver.cs` contained an unsafe `RemoteCertificateValidationCallback` that accepted all TLS certificates unconditionally (`(_, _, _, _) => true`), disabling TLS security.

Prior documentation (`AGENTS.md`, `README.md`, `PHASE_STATUS.md`, and the implementation plan) still described a Java-only stack, creating architectural drift and misleading AI agents and contributors.

## Permanent Product Constraints (Non-Negotiable)

The foundational principles established in ADR-001 through ADR-008 remain binding:
- **Platforms**: Windows and Linux only. No macOS support.
- **Editions**: Exactly one free edition. No "Pro", "Premium", or commercial tiers now or ever (ADR-001).
- **Accounts & Servers**: Zero accounts, zero registration, zero remote license servers, and zero SmartDM backend servers (ADR-003).
- **Telemetry**: Zero telemetry, zero analytics, zero crash reporting to external servers (ADR-003).
- **Local-First & AI Privacy**: All features function locally/offline. Optional Gemini assistance is user-keyed, disabled by default, and strictly requires previewed consent per request (ADR-005).
- **Truthful Safety Verdicts**: Honest scanner evidence only. Missing scanners, missing files, or heuristics cannot claim "clean" or "safe".
- **Executable & Supply-Chain Security**: Fixed executable paths and argument arrays/lists (`ArgumentList`); no shell concatenation. Pinned checksum verification for all external tool binaries.

## Decision

1. **Adopt C#/.NET 9 and Avalonia as the Supported Desktop Product**:
   - `apps/desktop-avalonia` is officially approved as the sole supported desktop product on branch `sdm2.0`.
   - A root solution file `SmartDm.sln` will organize the desktop application, class libraries, and dedicated test projects.
   - Both Windows and Linux CI builds will compile and test .NET 9.

2. **Decommission Java Runtime Dependency**:
   - The Java daemon is designated as a legacy development tool only.
   - In Work Package 1, ordinary HTTP transfers will be transitioned exclusively to the C# `DownloadEngine`.
   - `IpcDownloadEngine.cs`, `SmartDmIpcClient.cs`, and `EngineDaemonLauncher.cs` will be removed from production composition once transfer parity is proven.
   - The final product will have **zero Java runtime or Gradle requirement**.
   - No `yt-dlp` executable or wrapper will be added to the project.

3. **Media Engine Architecture**:
   - **Browser**: Retain and maintain `modules/format_engine.js` in the Chrome and Firefox extensions for in-browser HLS/DASH manifest parsing.
   - **YouTube**: Maintain **YoutubeExplode** in `YouTubeMediaResolver.cs` behind an explicit interface (`IMediaResolver`), noting it as an external open-source library.
   - **HLS**: Maintain native C# HLS discovery in `HlsMediaResolver.cs`.
   - **FFmpeg**: Configured explicitly as a standalone external utility with validated argument lists for muxing and format conversion only.

4. **Strict TLS Validation (Fix C-06)**:
   - Wildcard `RemoteCertificateValidationCallback` is eliminated immediately from `HlsMediaResolver.cs`.
   - Standard platform TLS certificate validation is enforced; untrusted or invalid certificates fail closed.

5. **Architectural Layering**:
   Enforce clear boundaries:
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

## Consequences

- Resolves the identity and architecture conflict between documentation and branch `sdm2.0`.
- Closes critical vulnerability C-06 by restoring platform TLS validation.
- Establishes a concrete path to eliminate the Java runtime dependency without risking transfer regressions.
- CI and test suites are aligned with the C# .NET 9 codebase while preserving legacy verification during the transition.

## References
- [SMARTDM_FULL_BUG_AUDIT.md](../audits/2026-10-26/SMARTDM_FULL_BUG_AUDIT.md)
- [ADR-001: Project Scope and Target Platforms](ADR-001-project-scope.md)
- [ADR-003: No Backend Server](ADR-003-no-backend.md)
- [ADR-005: AI Privacy and Consent](ADR-005-ai-privacy.md)
