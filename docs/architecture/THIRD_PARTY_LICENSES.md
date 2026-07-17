# SmartDM Third-Party Licenses

This document registers the licenses for all third-party dependencies used in SmartDM.

## Dependency Register

| Dependency | Version | License | Source | Use in SmartDM | Distribution Notes |
|------------|---------|---------|--------|----------------|--------------------|
| OpenJDK | 21 | GPLv2+CE | Adoptium/Eclipse Temurin | Java Runtime | Packaged with application |
| OpenJFX | 21.0.7 | GPLv2+CE | Maven Central / openjfx.io | UI Framework | Linked dynamically |
| Gradle | 8.14.1 | Apache-2.0 | gradle.org | Build System | Wrapper verified by checksum |
| SQLite | 3.49.1.0 | Public Domain | Maven Central | Database Engine | Bundled via jdbc |
| SQLCipher | N/A | BSD-3-Clause | zetetic.net | Database Encryption | Bundled library |
| Jackson | 2.18.3 | Apache-2.0 | Maven Central | JSON Parsing | Standard dependency |
| SLF4J | 2.0.17 | MIT | Maven Central | Logging Facade | Standard dependency |
| Logback | 1.5.18 | EPL-1.0 / LGPL-2.1 | Maven Central | Logging Implementation | Standard dependency |
| yt-dlp | pinned | Unlicense | GitHub Releases | Media Metadata Extraction | Bundled binary |
| FFmpeg | N/A | LGPL-2.1+ / GPL | ffmpeg.org | Media Merge / Audio Extraction | User-installed (v1) |
| ClamAV | N/A | GPLv2 | clamav.net | Malware Scanning (Linux) | System-installed |
| JNA | 5.17.0 | Apache-2.0 / LGPL-2.1 | Maven Central | OS Native Access | Standard dependency |
| JUnit 5 | 5.12.2 | EPL-2.0 | Maven Central | Testing Framework | Test-only |
| AssertJ | 3.27.3 | Apache-2.0 | Maven Central | Test Assertions | Test-only |
| Mockito | 5.15.2 | MIT | Maven Central | Mocking Framework | Test-only |
| TestFX | 4.0.18 | EUPL-1.1 | Maven Central | UI Testing | Test-only |

## FFmpeg Distribution Approach (v1)

For the initial release (v1), SmartDM does **not** bundle or redistribute FFmpeg binaries. FFmpeg is required for advanced media features (e.g., merging video and audio streams, extracting audio).

Instead, SmartDM relies on a **user-installed approach with guided setup**:
1. SmartDM detects if FFmpeg is available on the system PATH.
2. If not found, SmartDM provides the user with instructions and a link to download FFmpeg from the official sources.

**Rationale**: FFmpeg is licensed under the LGPL-2.1+ (and often GPL, depending on the build configuration). Redistributing FFmpeg binaries creates complex compliance obligations regarding linking, disclosing source code, and build reproducibility. By requiring the user to install FFmpeg independently, SmartDM functions purely as an external caller of a system tool, avoiding these redistribution complexities for v1.

## yt-dlp Redistribution

yt-dlp is bundled with SmartDM.
- **License**: Unlicense (public domain equivalent), which places no restrictions on redistribution or bundling.
- **Verification**: SmartDM pins to a specific verified release of yt-dlp and verifies the SHA-256 hash of the binary during the build process and before any execution.

## Firefox Extension AMO Signing

The SmartDM Firefox extension is signed via addons.mozilla.org (AMO) as an **unlisted** add-on. This is a free process that provides a signed `.xpi` file. This signing is required because standard Firefox releases refuse to install unsigned extensions. By choosing "unlisted" distribution, SmartDM avoids the need for a public store listing and review process, maintaining a self-hosted distribution model.
