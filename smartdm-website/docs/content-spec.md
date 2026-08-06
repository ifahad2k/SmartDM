# SmartDM — Product Facts & Copy Specification

## 1. Core Value Proposition
SmartDM is a free, local-first download manager for Windows and Linux built with Java 21 LTS, JavaFX, and SQLite/SQLCipher. It provides multi-segment dynamic speed acceleration, browser download capture, local media extraction, optional AI cataloging (Gemini API or local Ollama), and local security verification.

## 2. Platform Capability Matrix

| Feature | Windows 10/11 | Linux (AppImage / DEB) | Notes |
|---|---|---|---|
| Multi-segment acceleration | Supported | Supported | Up to 16 parallel range streams |
| Browser Interception | Chrome, Edge, Brave, Firefox | Chrome, Firefox, Brave | Native messaging host |
| Media Extraction | Supported | Supported | Powered by `yt-dlp` and `FFmpeg` |
| Windows Defender Scanning | Supported | Not Applicable | Windows-native Defender check |
| SQLite Catalog Encryption | Supported | Supported | Local encryption via SQLCipher |
| System Tray Operation | Supported | Supported | System tray behavior depends on Linux DE |
| AI Cataloging | Supported | Supported | Gemini (Cloud API key) or Ollama (Local) |

## 3. Approved Product Terminology Glossary
- **SmartDM**: Exact camelcase formatting. Avoid "Smartdm" or "smartdm" in body titles.
- **Multi-segment Acceleration**: Downloading byte ranges in parallel to maximize throughput.
- **Local-First**: Operating on local disk without telemetry, mandatory cloud servers, or feature locks.
- **Native Messaging Host**: Communication protocol bridging browser extensions with desktop SmartDM application.
- **SHA-256 Checksum**: Cryptographic 256-bit hash used to verify binary integrity.

## 4. Platform Installation & Verification Copy

### Windows
- Recommended package: `SmartDM-Setup-v1.0.0.exe` (x64)
- Verification: `Get-FileHash -Algorithm SHA256 SmartDM-Setup-v1.0.0.exe`
- Prerequisite: Windows 10 or later (64-bit).

### Linux AppImage
- Recommended package: `SmartDM-1.0.0-x86_64.AppImage`
- Execution: `chmod +x SmartDM-1.0.0-x86_64.AppImage && ./SmartDM-1.0.0-x86_64.AppImage`

### Debian / Ubuntu
- Recommended package: `smartdm_1.0.0_amd64.deb`
- Installation: `sudo dpkg -i smartdm_1.0.0_amd64.deb`
