# SmartDM Dependency Register

**Document Location:** `docs/architecture/DEPENDENCY_REGISTER.md`  
**Purpose:** Phase 0 strict supply-chain policy and external dependency inventory.  

## 1. Java Dependencies (Bundled via Gradle)

All Java dependencies listed below are checked against `gradle/verification-metadata.xml` for SHA-256 integrity on every build. They are bundled inside the SmartDM application distribution.

| Dependency | Version | Source | License | Origin URL | Bundled? |
|---|---|---|---|---|---|
| **JavaFX** | 21.0.7 | Maven Central | GPL-2.0 w/ CPE | https://openjfx.io | Yes |
| **Jackson Databind** | 2.18.3 | Maven Central | Apache 2.0 | https://github.com/FasterXML/jackson | Yes |
| **SQLite-JDBC (SQLCipher)** | 3.53.2.0 | Maven Central | Apache 2.0 | https://github.com/Willena/sqlite-jdbc-crypt | Yes |
| **Flyway Core** | 10.15.2 | Maven Central | Apache 2.0 | https://flywaydb.org | Yes |
| **BouncyCastle** | 1.84 | Maven Central | MIT | https://www.bouncycastle.org | Yes |
| **JNA & JNA Platform** | 5.14.0 | Maven Central | LGPL-2.1 | https://github.com/java-native-access/jna | Yes |
| **SLF4J API** | 2.0.17 | Maven Central | MIT | https://www.slf4j.org | Yes |
| **Logback Classic** | 1.5.38 | Maven Central | EPL-1.0 | https://logback.qos.ch | Yes |

### Update and Rollback Mechanism
- **Updates:** Version bumps are made in `gradle/libs.versions.toml`. A new SHA-256 hash must be generated and signed into `verification-metadata.xml`.
- **Rollback:** Reverting the commit in Git automatically restores the previous working version and its valid checksum.
- **Redistribution Obligations:** A `THIRD_PARTY_LICENSES.md` file is bundled with all distributions containing full license texts. OpenJFX requires source-offer on request (met via GitHub repository).

## 2. External Executables (User-Installed / Managed)

| Executable | Version | Source URL | License | Bundled? | Hash Policy |
|---|---|---|---|---|---|
| **yt-dlp** | Auto-managed | https://github.com/yt-dlp/yt-dlp/releases | Unlicense | No | Verified at download/execution |
| **FFmpeg/FFprobe** | System | https://ffmpeg.org | GPL-3.0 | No | N/A (User provided / Linux PM) |
| **secret-tool** | System | libsecret (GNOME) | LGPL | No | N/A (Linux OS utility) |

### yt-dlp Distribution and Update Mechanism
- **Bundling Decision:** `yt-dlp` is **NOT bundled** in the installer to comply with its rapid update cycles and to prevent unnecessary bloat. 
- **Update Mechanism:** SmartDM downloads the latest stable executable dynamically from GitHub Releases on first launch. Updates are managed via a dedicated background updater thread fetching the latest release hash.
- **Rollback:** The updater maintains a `/backup` of the previous `yt-dlp` binary. If a new version crashes, it reverts to the backup.

### FFmpeg Distribution
- **Bundling Decision:** `FFmpeg` is **NOT bundled** due to patent liabilities and GPL-3.0 source-distribution requirements.
- **Update Mechanism:** SmartDM relies on the user's system `PATH` (e.g., via `apt install ffmpeg` on Linux, or user-downloaded builds on Windows).

## 3. Platform Distribution Mechanisms

| Platform | Installer Type | Code Signing / Signature Policy | Update Mechanism |
|---|---|---|---|
| **Windows** | `.msi` / `.zip` | **Unsigned** initially. A SHA-256 hash is published on GitHub. The UI honestly discloses SmartScreen warnings. | Check GitHub API for releases. |
| **Linux** | Flatpak / `.tar.gz` | N/A | Flathub updates / Manual download. |
| **Browser Extension** | Firefox `.xpi` | AMO Signed Unlisted | Auto-updated via AMO. |
| **Browser Extension** | Chrome Unpacked | Unsigned | Developer Mode manual loading. |
