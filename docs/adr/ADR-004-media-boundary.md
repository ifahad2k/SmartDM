# ADR-004: Media Feature Legal Boundary

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context

SmartDM includes a media download feature powered by yt-dlp and FFmpeg. This feature enables users to download audio and video content from supported sites. However, the legality of downloading media varies significantly by jurisdiction, content type, and the terms of service of the hosting platform.

Key legal and ethical considerations:

- **Copyright law**: Downloading copyrighted content without authorization is illegal in most jurisdictions, regardless of the tool used.
- **DRM and access controls**: Circumventing Digital Rights Management (DRM) or technical protection measures violates laws like the DMCA (US), EU Copyright Directive, and equivalents in other countries.
- **Platform Terms of Service**: YouTube's Terms of Service, for example, explicitly prohibit downloading unless a download button or link is provided by YouTube. Other platforms have similar restrictions.
- **Tool liability**: While tools themselves are generally legal (dual-use doctrine), marketing or positioning a tool as a means to circumvent restrictions increases legal risk.
- **FFmpeg licensing**: FFmpeg is licensed under LGPL-2.1+ (or GPL depending on build configuration). Redistributing FFmpeg binaries with SmartDM would create LGPL/GPL compliance obligations regarding linking, source distribution, and build reproducibility.
- **yt-dlp licensing**: yt-dlp is released under the Unlicense (public domain equivalent), which allows unrestricted redistribution and bundling.

## Decision

### 1. Content Authorization Boundary

SmartDM's media feature is designed for downloading content that the user **owns or is authorized to download**. Specifically:

- SmartDM **must not** bypass DRM, paywalls, access controls, or protected streams.
- SmartDM **must not** circumvent technical protection measures of any kind.
- SmartDM **must not** extract content from authenticated/premium-only streams that the user has not paid for.
- SmartDM relies on yt-dlp's standard extraction capabilities, which operate on publicly accessible media URLs.

### 2. First-Use Notice

On first use of the media feature, SmartDM displays a mandatory notice (cannot be dismissed without acknowledgment):

> **Media Download Notice**
>
> SmartDM's media feature is intended for content you own or are authorized to download. Downloading copyrighted content without permission may violate copyright law and platform terms of service in your jurisdiction.
>
> YouTube's Terms of Service restrict downloading except where a download button or link is provided by YouTube or where otherwise authorized.
>
> By proceeding, you acknowledge that you are responsible for ensuring your downloads comply with applicable laws and terms of service.

This notice is stored in the user's settings to prevent repeated display, but can be reviewed at any time in Settings → Media → Legal Notice.

### 3. Product Language

SmartDM's UI, documentation, marketing, and README must:

- **Avoid** language promising unrestricted downloading (e.g., "download any video", "rip from YouTube").
- **Use** neutral language (e.g., "download media", "save authorized content").
- **Include** the legal notice in the README and documentation.
- **Not** specifically name platforms in feature descriptions where doing so implies circumvention of that platform's terms.

### 4. FFmpeg Distribution Approach (v1)

For the initial release, FFmpeg is **user-installed with guided setup**:

- SmartDM detects whether FFmpeg is available on the system `PATH` or in a configured location.
- If FFmpeg is not found, SmartDM displays a setup guide with:
  - Link to the official FFmpeg download page.
  - Platform-specific installation instructions (Windows: download + add to PATH; Linux: package manager command).
  - Verification step (SmartDM tests the FFmpeg binary and confirms version).
- SmartDM does **not** bundle, redistribute, or automatically download FFmpeg binaries.

**Rationale**: Avoiding FFmpeg redistribution eliminates LGPL/GPL compliance complexity for v1. The user installs FFmpeg independently, and SmartDM simply invokes it as an external tool. This is analogous to how many applications depend on system-installed FFmpeg.

### 5. yt-dlp Redistribution

yt-dlp is redistributed with SmartDM under the following conditions:

- **License**: Unlicense (public domain equivalent) — safe to bundle and redistribute without restrictions.
- **Pinning**: SmartDM pins to a specific, verified yt-dlp release version.
- **Hash verification**: The SHA-256 hash of the bundled yt-dlp binary is verified at build time against the hash published in the official yt-dlp GitHub release.
- **Update mechanism**: Users can update yt-dlp through SmartDM's optional update check (see [ADR-003](ADR-003-no-backend.md)), which also verifies hashes before applying updates.
- **No modification**: SmartDM does not modify, patch, or fork yt-dlp. It is used as-is.

## Consequences

### Positive

- **Legal risk mitigation**: The first-use notice, neutral language, and explicit content boundary reduce the project's exposure to legal claims.
- **FFmpeg simplicity**: User-installed FFmpeg avoids LGPL compliance complexity and reduces installer size.
- **yt-dlp safety**: The Unlicense and hash verification provide a clean, auditable redistribution path.
- **User responsibility**: The notice clearly places responsibility for legal compliance on the user, consistent with standard practice for dual-use tools.

### Negative

- **User friction (FFmpeg)**: Requiring users to install FFmpeg manually adds friction to the media feature setup. This is acceptable for v1 but should be revisited in future releases.
- **Limited media capability without FFmpeg**: Some media operations (e.g., format conversion, audio extraction) require FFmpeg. SmartDM must degrade gracefully and clearly communicate what is unavailable without FFmpeg.
- **Content restriction ambiguity**: The boundary between "authorized" and "unauthorized" content is ultimately a legal determination that varies by jurisdiction. SmartDM cannot enforce this technically — it can only inform the user.

### Neutral

- The first-use notice does not constitute legal advice. Users are advised to consult their own legal counsel if unsure about the legality of specific downloads in their jurisdiction.
- Future versions may explore bundling FFmpeg if LGPL compliance can be achieved cleanly (e.g., dynamic linking, source offer).

## References

- [yt-dlp License (Unlicense)](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE)
- [FFmpeg License](https://ffmpeg.org/legal.html)
- [YouTube Terms of Service](https://www.youtube.com/static?template=terms)
- [DMCA § 1201 — Circumvention of Copyright Protection Systems](https://www.law.cornell.edu/uscode/text/17/1201)
- [ADR-003: No Backend Server](ADR-003-no-backend.md)
- [THIRD_PARTY_LICENSES](../architecture/THIRD_PARTY_LICENSES.md)
