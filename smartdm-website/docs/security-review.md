# SmartDM Website — Security Review & Threat Model

## 1. Threat Model & Risk Analysis

| Surface | Potential Threat | Mitigation | Risk Level |
|---|---|---|---|
| Binary Downloads | Tampering or spoofed releases | Enforce HTTPS GitHub release URLs & published SHA-256 hashes | High |
| External Links | Reverse tabnabbing / malicious redirect | Enforce `rel="noopener noreferrer"` on all `target="_blank"` links | Low |
| GitHub API Integration | Rate-limit failure or XSS via API response | Fallback to hardcoded HTML links; insert content strictly via `textContent` | Medium |
| Script Injection | Unsafe DOM manipulation | Ban `innerHTML` for dynamic content; rely on static DOM elements | High |

## 2. Content Security Policy (CSP) Recommendation
For maximum static security, hosters should emit the following headers (or via meta tag):
```text
default-src 'self';
script-src 'self' https://api.github.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://api.github.com;
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self' https://github.com;
```

## 3. Privacy & Data Handling
- The website contains zero tracking scripts, cookies, or analytics beacons.
- No user telemetry or diagnostic data is harvested during site usage.
