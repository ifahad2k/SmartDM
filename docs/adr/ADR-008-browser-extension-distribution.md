# ADR-008: Browser Extension Distribution

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context
SmartDM requires browser extensions for Chrome and Firefox to provide seamless link capture and "download all links" functionality. Distributing these extensions through official stores (like the Chrome Web Store) involves developer registration fees, review processes, and potential delays, which complicate the initial release of a free, open-source project. Additionally, Linux environments increasingly use sandboxed browsers (Snap/Flatpak) that break traditional native messaging.

## Decision
1. **Chrome Extension**: Distributed as a bundled unpacked folder. Users will load it via Developer Mode. The `manifest.json` must include a fixed `"key"` so the extension ID remains stable for native messaging. There will be no Chrome Web Store submission for v1.
2. **Firefox Extension**: Signed for free via addons.mozilla.org (AMO) as an **unlisted** self-distributed `.xpi` file. This is mandatory because standard Firefox refuses to load unsigned extensions, but it avoids the need for a public store listing.
3. **Linux Sandboxing**: SmartDM will detect Snap/Flatpak-packaged browsers. Instead of silently failing, it will show an honest capability notice explaining that Snap/Flatpak environments do not support native messaging. The rest of the app will continue to function normally.
4. **Onboarding Safety**: All UI strings related to enabling Developer Mode or installing the extension must reference the verified checksum and explicitly warn against using copies obtained from other sources, as this installation flow resembles common social-engineering patterns.

## Consequences
- **Positive**: Zero cost for extension distribution. Immediate updates without store review delays.
- **Negative**: Increased friction during installation for Chrome users (Developer mode required).

## References
- Chrome Developer Mode documentation
- Mozilla AMO Unlisted Add-ons documentation
