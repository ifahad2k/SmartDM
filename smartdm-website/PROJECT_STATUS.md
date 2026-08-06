# SmartDM Website — Project Status & Contract Baseline

## Current Phase
**Phase 2 — Parallel Implementation & Local Integration**

## Frozen Contracts

### 1. Configuration Schema (v1.0)
```js
window.SMARTDM_CONFIG = {
  productName: "SmartDM",
  version: "1.0.0",
  githubRepo: "https://github.com/ifahad2k/SmartDM",
  defaultBranch: "main",
  license: "GPL-3.0-or-later",
  releaseAssets: {
    windows: {
      filename: "SmartDM-Setup-v1.0.0.exe",
      architecture: "x64",
      minimumOs: "Windows 10"
    },
    appImage: {
      filename: "SmartDM-1.0.0-x86_64.AppImage",
      architecture: "x86_64"
    },
    deb: {
      filename: "smartdm_1.0.0_amd64.deb",
      architecture: "amd64"
    }
  },
  checksums: {
    windows: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    appImage: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    deb: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  links: {
    documentation: "#docs",
    discussions: "https://github.com/ifahad2k/SmartDM/discussions"
  }
};
```

### 2. Stable DOM Hooks
- `[data-action="primary-download"]` — Dynamic OS-targeted primary download CTA
- `[data-download="windows"]` — Windows installer direct link
- `[data-download="appimage"]` — AppImage direct link
- `[data-download="deb"]` — Debian package direct link
- `[data-link="repository"]` — Main GitHub repository URL
- `[data-link="bug-report"]` — Structured bug report link
- `[data-link="feature-request"]` — Structured feature suggestion link
- `[data-doc-tab]` — Documentation tab button
- `[data-doc-panel]` — Documentation content panel
- `[data-copy]` — Clipboard copy trigger button
- `[data-star-count]` — Dynamic GitHub star counter text container

### 3. Breakpoints & Viewport Boundaries
- Small mobile: `320px – 479px`
- Mobile: `480px – 767px`
- Tablet: `768px – 1023px`
- Desktop: `1024px – 1439px`
- Large desktop: `1440px+`

### 4. Target Browser Support Matrix
- Chrome (Latest 2 versions)
- Edge (Latest 2 versions)
- Firefox (Latest 2 versions)
- Safari (Latest 2 versions)
- Graceful degradation for older Chromium browsers & JavaScript-disabled clients

---

## Active Task Matrix

| Task ID | Owner | Target Artifact | Status | Description |
|---|---|---|---|---|
| P0-T01 | Agent 0 | `PROJECT_STATUS.md` | COMPLETE | Baseline inventory and contract freeze |
| P1-T01 | Agent 1 | `docs/content-spec.md` | COMPLETE | Technical content & facts specification |
| P1-T02 | Agent 2 | `docs/design-system.md` | COMPLETE | Visual token specification & accessibility contrast audit |
| P1-T03 | Agent 5 | `.github/ISSUE_TEMPLATE/*`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE` | COMPLETE | Repository community governance & issue forms |
| P1-T04 | Agent 5 | `docs/release-process.md` | COMPLETE | Release tag standards and checksum policies |
| P2-T01 | Agent 3 | `index.html` | COMPLETE | Accessible semantic HTML markup & DOM hooks |
| P2-T02 | Agent 2 | `styles.css` | COMPLETE | CSS design system, responsive layouts & reduced motion |
| P2-T03 | Agent 4 | `config.js`, `script.js` | COMPLETE | Dynamic configuration, star API fallback & interaction logic |
| P2-T05 | Agent 5 | `.github/workflows/*` | COMPLETE | Site validation & GitHub Pages deployment workflows |
| P3-T01 | Agent 6 | `docs/security-review.md` | COMPLETE | Security threat model, CSP headers & supply chain review |
| P3-T02 | Agent 7 | `tests/acceptance-checklist.md` | COMPLETE | Acceptance test battery & QA checklists |
| P4-T03 | Agent 7 | `tests/release-signoff.md` | COMPLETE | Final release candidate signoff |

---

## Decision Log

| Decision ID | Summary | Date | Author |
|---|---|---|---|
| DEC-001 | Single-repo branch `smartdm-website` inside `smartdm-website/` directory | 2026-08-06 | Orchestrator |
| DEC-002 | GitHub Repository target fixed to `ifahad2k/SmartDM` | 2026-08-06 | Orchestrator |
| DEC-003 | Zero external runtime JS frameworks; pure Vanilla HTML/CSS/JS with zero runtime bloat | 2026-08-06 | Lead Architect |

---

## Risk Register

| Risk | Impact | Mitigation | Status |
|---|---|---|---|
| Unset repository placeholders | High | Centralized `config.js` schema with runtime warning | RESOLVED |
| GitHub API rate limiting on star count | Low | Session storage caching with static link fallback | RESOLVED |
| Missing keyboard focus rings | Medium | System-wide `:focus-visible` custom outlines | RESOLVED |
