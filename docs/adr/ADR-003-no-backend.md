# ADR-003: No Backend Server — Network Connection Policy

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context

SmartDM's local-first philosophy means that all data processing, storage, and management happens on the user's machine. However, a download manager inherently makes network connections — it downloads files from remote hosts. The project must clearly define which network connections SmartDM makes, why, and how users can control them.

Key concerns:

- **Trust**: Users must be able to verify that SmartDM is not "phoning home" or communicating with any SmartDM-controlled infrastructure.
- **Privacy**: No data about the user, their downloads, or their system should leave their machine without explicit, informed consent.
- **Transparency**: Every outbound connection must be documented, justified, and independently controllable.
- **Auditability**: The open-source codebase must make it straightforward to verify these claims.

## Decision

**SmartDM does not operate, maintain, or connect to any SmartDM-owned server, API endpoint, or cloud service.**

All network connections made by SmartDM fall into the following categories, each of which is documented and independently disableable:

### 1. File/Media Host (User-Initiated) — Always Enabled

| Property | Detail |
|----------|--------|
| **Destination** | The original file or media host URL selected by the user |
| **Purpose** | Download the file the user requested |
| **User control** | User initiates every download; no automatic/background downloads |
| **Disableable** | N/A — this is the core function of the application |

### 2. Gemini AI Assistance (Optional, Disabled by Default)

| Property | Detail |
|----------|--------|
| **Destination** | Google Gemini API (`generativelanguage.googleapis.com`) |
| **Purpose** | AI-assisted features (e.g., filename suggestion, category detection) |
| **User control** | Disabled by default. User must supply their own API key and explicitly set consent level. See [ADR-005](ADR-005-ai-privacy.md) |
| **Disableable** | Yes — Settings → AI → Consent Level → OFF (default) |

### 3. Component Update Checks (Optional, Disabled by Default)

| Property | Detail |
|----------|--------|
| **Destinations** | yt-dlp GitHub releases, FFmpeg project site, ClamAV definition mirrors, SmartDM GitHub releases (for app updates), browser extension update manifest |
| **Purpose** | Check for updates to bundled/integrated components |
| **User control** | Each update source is independently toggleable. No automatic downloads — user must confirm every update |
| **Disableable** | Yes — each source independently via Settings → Updates |

### 4. Firefox Extension Signing (Build-Time Only)

| Property | Detail |
|----------|--------|
| **Destination** | `addons.mozilla.org` (AMO) |
| **Purpose** | Submit the Firefox browser extension for free signing via AMO's unlisted self-distribution channel |
| **User control** | This connection occurs during the build/release process only, not at runtime. End users never connect to AMO through SmartDM |
| **Disableable** | N/A — build-time only, not a runtime connection |

### Prohibited Connections

SmartDM **never** makes connections for:

- Telemetry, analytics, or crash reporting
- User tracking or fingerprinting
- Advertisement loading or display
- License validation or activation
- Cloud sync of settings, history, or downloads
- Any SmartDM-owned or SmartDM-controlled server or API
- DNS-over-HTTPS or other proxy connections not requested by the user

### Implementation Requirements

1. **No hidden endpoints**: Every hostname SmartDM can connect to must be listed in a single, auditable configuration file or constant class.
2. **Connection logging**: All outbound connections are logged locally (destination, timestamp, purpose) in the encrypted database for user inspection.
3. **Firewall-friendly**: SmartDM must function fully offline except for the actual download operation. All optional network features must degrade gracefully when blocked.
4. **Code review gate**: Any PR that introduces a new outbound connection must update this ADR and the network policy documentation, and requires explicit maintainer approval.

## Consequences

### Positive

- **Zero infrastructure cost**: No servers to maintain, secure, or pay for.
- **Complete user control**: Users can verify and control every connection SmartDM makes.
- **Privacy by architecture**: No data exfiltration vector exists because there is no SmartDM endpoint to receive data.
- **Firewall/air-gap compatible**: SmartDM works in restricted network environments with no degradation of core functionality.
- **Auditability**: The open-source code and the documented connection list make it trivial to verify the no-backend claim.

### Negative

- **No crash reporting**: Bug reports depend entirely on user-submitted logs and descriptions.
- **No usage insights**: The team has no data on feature usage, common errors, or user demographics.
- **No push notifications**: SmartDM cannot proactively notify users of critical security updates — users must enable update checks or check manually.
- **No cloud features**: No cross-device sync, no remote queue management, no web interface.

### Neutral

- The absence of a backend does not prevent the project from hosting a static website, documentation site, or GitHub repository — these are informational resources, not application backends.

## References

- [ADR-001: Project Scope](ADR-001-project-scope.md)
- [ADR-005: AI Privacy and Consent](ADR-005-ai-privacy.md)
- [ADR-008: Browser Extension Distribution](ADR-008-browser-extension-distribution.md)
