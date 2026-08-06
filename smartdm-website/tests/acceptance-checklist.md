# SmartDM Website — Quality Assurance & Acceptance Checklist

## 1. Functional Acceptance Gates

- [x] Primary download button dynamically switches label and href based on user OS detection (Windows vs Linux).
- [x] Download links resolve to valid assets under `https://github.com/ifahad2k/SmartDM/releases/download/v1.0.0/`.
- [x] "Star on GitHub" link targets `https://github.com/ifahad2k/SmartDM`.
- [x] GitHub star count fetches from GitHub API with local `sessionStorage` caching and graceful fallback.
- [x] Bug report link opens structured `.github/ISSUE_TEMPLATE/bug_report.yml`.
- [x] Feature request link opens structured `.github/ISSUE_TEMPLATE/feature_request.yml`.
- [x] Documentation tabs change content dynamically with ARIA role updates.
- [x] Checksum copy button copies SHA-256 string to clipboard and displays toast confirmation.
- [x] Mobile navigation menu opens/closes with keyboard and touch support.

## 2. Accessibility & Usability Gates

- [x] Skip link (`#main-content`) allows immediate keyboard bypass to hero content.
- [x] Single `<h1>` tag present on main page.
- [x] Screen-reader headings follow sequential logical levels (`h1` -> `h2` -> `h3`).
- [x] Visible keyboard focus indicators active across all interactive elements (`:focus-visible`).
- [x] Decorative SVGs marked with `aria-hidden="true"`.
- [x] Text elements maintain > 4.5:1 contrast against dark background.
- [x] `@media (prefers-reduced-motion: reduce)` halts background auroras, tilts, and ticker animations.
- [x] Page content remains fully readable and navigable when JavaScript is disabled.

## 3. Performance & Security Gates

- [x] Content Security Policy meta tag configured.
- [x] External links include `rel="noopener noreferrer"`.
- [x] Zero placeholders remaining (`YOUR_GITHUB_USERNAME` replaced with `ifahad2k`).
- [x] Image asset (`smartdm-app.png`) includes explicit width/height to eliminate layout shift.
