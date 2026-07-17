# ADR-001: Project Scope and Target Platforms

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context

SmartDM is a free, local-first, open-source download manager. Before development begins, the project must clearly define its scope — which platforms it targets, what editions it offers, what services it operates, and which protocols it supports in the initial release. These boundaries affect architecture, licensing, distribution, testing, CI/CD, and user expectations from day one.

Key factors driving this decision:

- **Platform coverage**: macOS has unique code-signing, notarization, and sandboxing requirements that add significant development and maintenance burden. The core team currently has limited macOS testing capacity.
- **Edition model**: Many download managers fragment their feature set behind free/premium tiers, which conflicts with SmartDM's mission to be fully free and open-source.
- **Cloud services**: Operating servers introduces costs, privacy obligations, security liabilities, and maintenance burden that conflict with the local-first philosophy.
- **Telemetry**: Any data collection — even opt-in — erodes user trust and creates compliance obligations (GDPR, etc.).
- **Protocol support**: HTTP and HTTPS cover the vast majority of download use cases. Additional protocols (FTP, SFTP, magnet/torrent) can be added later.

## Decision

SmartDM adopts the following scope constraints:

1. **Target platforms**: Windows and Linux only. No macOS support.
2. **Editions**: One free edition. No premium, Pro, or paid tier — now or in the future.
3. **Accounts**: No user accounts, registration, or login of any kind.
4. **Cloud sync**: No cloud synchronization of downloads, settings, or history.
5. **Telemetry**: No telemetry, analytics, crash reporting, or usage tracking of any kind — not even opt-in.
6. **License server**: No license server or activation mechanism.
7. **SmartDM-owned API server**: SmartDM does not operate any backend server. See [ADR-003](ADR-003-no-backend.md) for the complete network policy.
8. **Supported protocols (v1)**: HTTP and HTTPS only.
9. **Feature availability**: All features are available to every user. No feature gating, no A/B testing, no staged rollouts that restrict functionality.

## Consequences

### Positive

- **Simplified architecture**: No server-side components, authentication flows, or subscription management to build and maintain.
- **Privacy by design**: Zero data leaves the user's machine unless the user explicitly opts into a specific, documented connection (e.g., Gemini AI assistance).
- **Reduced maintenance burden**: Two platforms (Windows, Linux) instead of three. No App Store / notarization pipeline.
- **Trust**: Users can verify the claim "no telemetry" by inspecting the source code. There are no server endpoints to audit.
- **Clear positioning**: "Free, local-first, open-source" is unambiguous. No confusing tier comparisons.

### Negative

- **No macOS users**: A meaningful segment of potential users is excluded. Community contributions could enable macOS support in the future, but it is not a project goal.
- **No cloud backup**: Users are responsible for their own settings/history backup. Export/import functionality can mitigate this.
- **Protocol limitations in v1**: Users needing FTP, SFTP, or torrent support must use other tools until those protocols are added in future releases.

### Neutral

- The decision to have one free edition with no accounts does not prevent the project from accepting donations or sponsorships, provided they do not influence feature availability.

## References

- [ADR-003: No Backend Server](ADR-003-no-backend.md)
- [ADR-005: AI Privacy and Consent](ADR-005-ai-privacy.md)
- [SmartDM README](../../README.md)
