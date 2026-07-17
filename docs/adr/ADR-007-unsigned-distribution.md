# ADR-007: Unsigned Distribution

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context
Authenticode signing certificates for Windows are expensive and require identity verification that poses a barrier for an unfunded, open-source project. While signing provides a smoother user experience (avoiding SmartScreen warnings), making a paid certificate a blocking dependency would violate the project's goal of remaining entirely free and open.

## Decision
1. **Unsigned at Launch**: Windows and Linux installers will ship unsigned.
2. **Integrity Mechanism**: Every release artifact will ship with a published SHA-256 checksum. In the future, detached signatures using a free mechanism (e.g., `cosign`/Sigstore or GPG) will be provided.
3. **Honest Communication**: The project will not suppress or hide the fact that it is unsigned. The first-run notice and the download page will honestly explain the Windows SmartScreen "unrecognized publisher" warning.
4. **No Untrusted Certificates**: We will not self-sign with an untrusted throwaway certificate just to make it appear signed. Unsigned must remain honestly labeled as unsigned.
5. **Future Upgrades**: The project may apply to a free-for-open-source signing service (e.g., SignPath.io) once it meets the eligibility criteria. This is an opportunistic upgrade, never a blocking requirement.

## Consequences
- **Positive**: The project remains 100% free with no recurring financial blockers for releases. Integrity is maintained via verifiable checksums.
- **Negative**: Users will encounter SmartScreen warnings on Windows, which can cause friction and distrust among less technical users.

## References
- SignPath.io Open Source guidelines
- Sigstore documentation
