# ADR-002: Project License — GPL-3.0-or-later

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context

SmartDM is committed to being a permanently free, open-source download manager. The choice of license is foundational — it determines how the source code can be used, modified, and redistributed by others, and it constrains which third-party dependencies the project can incorporate.

Key considerations:

- **Permanence**: The license must ensure that SmartDM and all derivative works remain free and open-source. A permissive license (MIT, Apache-2.0) would allow proprietary forks that undermine the project's mission.
- **Copyleft strength**: Strong copyleft (GPL family) requires derivative works to be distributed under the same license, preventing proprietary capture.
- **Dependency compatibility**: The license must be compatible with the project's core dependencies — OpenJDK 21 (GPLv2+CE), OpenJFX (GPLv2+CE), SQLCipher (BSD-3-Clause), Jackson (Apache-2.0), SLF4J (MIT), yt-dlp (Unlicense), and others.
- **Contributor clarity**: All contributors must understand and agree to the license terms before contributing.
- **"or later" clause**: The `GPL-3.0-or-later` identifier (using SPDX convention) allows the project to adopt future GPL versions published by the Free Software Foundation, providing long-term flexibility without re-licensing.

## Decision

SmartDM is licensed under the **GNU General Public License v3.0 or later** (`GPL-3.0-or-later`, SPDX identifier).

Specific terms:

1. **All source code** in the SmartDM repository is covered by GPL-3.0-or-later unless explicitly noted otherwise (e.g., vendored files with their own compatible license).
2. **All contributors** must agree that their contributions are licensed under GPL-3.0-or-later. This is documented in the contributing guidelines and enforced via the Developer Certificate of Origin (DCO) sign-off process.
3. **The full license text** is included in the repository root as `LICENSE`.
4. **SPDX headers** are used in source files for machine-readable license identification.
5. **Dependency compatibility** is verified before adding any new dependency. Incompatible licenses (e.g., AGPL-3.0 for non-network software, proprietary, GPL-incompatible copyleft) are rejected.

## Consequences

### Positive

- **Permanent openness**: No one can create a proprietary fork of SmartDM. All derivative works must also be GPL-3.0-or-later.
- **Aligned with mission**: The copyleft requirement directly enforces SmartDM's "permanently free" commitment.
- **Broad compatibility**: GPL-3.0 is compatible with most of SmartDM's dependencies:
  - GPLv2 with Classpath Exception (OpenJDK, OpenJFX) — compatible, CE allows linking.
  - Apache-2.0 (Gradle, Jackson, JNA, AssertJ) — compatible with GPL-3.0.
  - MIT (SLF4J, Mockito) — compatible.
  - BSD-3-Clause (SQLCipher) — compatible.
  - Unlicense (yt-dlp) — compatible.
  - EPL-1.0/LGPL-2.1 (Logback) — LGPL-2.1 compatible; EPL-1.0 dual-licensed.
  - EPL-2.0 (JUnit 5) — compatible with GPL-3.0 via secondary license.
  - EUPL-1.1 (TestFX) — compatible with GPL-3.0.
  - Public Domain (SQLite) — compatible.
- **Future-proofing**: The "or later" clause allows adopting future GPL versions without a full re-licensing effort.

### Negative

- **Contributor friction**: Some developers prefer permissive licenses and may choose not to contribute to a GPL project.
- **Corporate adoption barriers**: Some organizations have policies against using or contributing to GPL-licensed projects.
- **Copyleft obligations**: Distributors of modified versions must provide source code, which adds compliance overhead for downstream packagers.

### Neutral

- GPL-3.0-or-later does not restrict SmartDM from being distributed commercially (e.g., sold on a USB drive), but the source code must always be available.
- The license does not affect the user's downloaded files in any way — only SmartDM's own code is covered.

## References

- [GNU GPL v3 Full Text](https://www.gnu.org/licenses/gpl-3.0.html)
- [SPDX License Identifier: GPL-3.0-or-later](https://spdx.org/licenses/GPL-3.0-or-later.html)
- [LICENSE file](../../LICENSE)
- [THIRD_PARTY_LICENSES](../architecture/THIRD_PARTY_LICENSES.md)
