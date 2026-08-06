# 🚀 SmartDM Release Notes — v1.0.3

> **SmartDM**: High-Performance, Open-Source Download & Media Accelerator for Windows & Linux.  
> *Built with Java 21, JavaFX, yt-dlp, SQLCipher, and Firebase Unified Authentication.*

---

## 📸 Highlights & Major Updates (v1.0.3)

### 1. 🎥 Media Extractor Subsystem & YouTube Bot-Bypass Fix
* **YouTube Extraction & Stream Resolution Fix**: Fixed a critical issue where YouTube and third-party media downloads would hang on "infinity searching" or display "no media found". Updated internal `yt-dlp` execution flags with an updated modern User-Agent (`Chrome/130.0.0.0`) and enhanced error handling to bypass YouTube's recent anti-bot player client checks.
* **Multi-Platform Support**: Seamless asynchronous metadata extraction and stream resolution for YouTube, Instagram Reels/Posts, Facebook Watch/Reels, TikTok, and direct video links.
* **Audio & Video Merging**: Automatic FFmpeg multiplexing for split high-definition video (up to 4K/8K) and audio streams (Opus/AAC/MP3).

---

### 2. 🌐 SmartDM Website & Admin Control Center (v1.0.3)
* **Version Labeling**: Official release tag and download configurations updated to **v1.0.3** across the platform and website.
* **Role-Based Access Control (RBAC)**: Integrated unified Firebase Authentication supporting GitHub OAuth, Google OAuth, and Email/Password credentials with strict admin role verification (`isAdmin`).
* **Owner Direct Access**: Added fail-safe owner privilege resolution for primary administrative accounts (`ifahad2k@gmail.com`), guaranteeing instant access to the Admin Control Panel even during Firestore network degradation.
* **Admin Dashboard**: Triage user bug reports and feature requests, respond directly to community feedback, and update release binaries with automated SHA-256 checksum tracking.
* **Guest & Authenticated User Rules**: Enforced security policies ensuring only verified logged-in users can submit bug reports and feature requests, preventing spam while allowing public read access to release documentation.

---

### 3. 🎨 Visual Excellence & Custom Dark Theme Engine
* **Custom Dropdown UI (`CustomSelect`)**: Replaced native browser `<select>` dropdowns across the portal with a custom-built, glassmorphic React dropdown component (`CustomSelect`). Bypasses native Windows OS light-mode overrides to deliver consistent, dark neon aesthetics across all platforms.
* **Glassmorphism Design System**: Modern dark-mode interface featuring dynamic neon accents (cyan/purple glows), micro-animations, responsive layout containers, and tailored typographic hierarchy using Google Fonts Inter.

---

### 4. ⚡ High-Speed Transfer & Storage Subsystem
* **Dynamic Segmentation Engine**: Up to 16x parallel HTTP byte-range (`Range: bytes=X-Y`) connection streams per download, accelerating large file transfers on high-bandwidth connections.
* **Resumable & Atomic Downloads**: Automatic session recovery for interrupted transfers, path sanitization against directory traversal (`CON`, `PRN`, `AUX`, path injection), and atomic file staging (`.tmp` → final output).
* **SQLCipher Encrypted Persistence**: Local storage secured with SQLCipher SQLite database encryption (`V1`–`V11` Flyway migrations) protected by Windows DPAPI or Linux Secret Service master key derivation.
* **Token Bucket Rate Limiting**: Fine-grained nanosecond-precision global and per-download speed caps.

---

### 5. 🔌 Browser Interception & Extension Host
* **Native Messaging Protocol**: Low-latency IPC host communicating via stdin/stdout length-prefixed JSON packets with Chrome, Edge, and Firefox extensions.
* **13 Protocol DTOs**: Full support for `AddDownloadRequest`, `StartMediaDownloadRequest`, `AddBatchRequest`, and real-time status reporting.

---

## 🛠️ Bug Fixes & Technical Refinements

| Area | Type | Description |
|---|---|---|
| **Version Update** | 🏷️ Release | Updated website configuration (`smartdmConfig.ts` & `githubSyncService.ts`) and release metadata to **v1.0.3**. |
| **Media Extractor** | 🐛 Bug Fix | Resolved process hanging and `HTTP Error 429` rate limiting on YouTube video extraction by updating process arguments and User-Agents across `YtDlpExtractor.java` and `MediaDownloadTracker.java`. |
| **Website UI** | 🎨 Polish | Replaced native Windows `<select>` elements in `NewBugReportPage` and `NewFeaturePage` with the new custom dark-mode `CustomSelect` component. |
| **Authentication** | 🔒 Security | Resolved state initialization lockouts in `AuthContext.tsx` and simplified Firestore security rules (`firestore.rules`) to streamline authentication state changes. |
| **Header Component** | 🧼 Cleanup | Removed temporary developer overlay (`DEBUG UID`) from production website header. |
| **CI/CD Deployment** | 🚀 Infrastructure | Deployed v1.0.3 production build to Firebase Hosting ([https://smartdm.web.app](https://smartdm.web.app)) and pushed changes to GitHub. |

---

## 📦 Downloads & Verification (v1.0.3)

| Platform | Architecture | File Package | Checksum (SHA-256) |
|---|---|---|---|
| **Windows** | x64 (Win 10/11) | `SmartDM-Setup-v1.0.3.exe` | `160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72` |
| **Linux** | x86_64 (GLIBC 2.29+) | `SmartDM-1.0.3-x86_64.AppImage` | `160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72` |
| **Linux** | amd64 (Ubuntu/Debian) | `smartdm_1.0.3_amd64.deb` | `160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72` |

> 📌 **Live Site**: [https://smartdm.web.app](https://smartdm.web.app) *(Displaying SmartDM v1.0.3)*  
> 📁 **GitHub Repository**: [https://github.com/ifahad2k/SmartDM](https://github.com/ifahad2k/SmartDM)  
