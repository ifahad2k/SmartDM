# SmartDM Release v1.0.7 - Release Notes

**Release Date:** August 14, 2026  
**Tag:** [`v1.0.7`](https://github.com/ifahad2k/SmartDM/releases/tag/v1.0.7)  
**Package:** `SmartDM-Setup-v1.0.7.exe`  

---

## 🚀 Overview

SmartDM **v1.0.7** introduces a completely redesigned, professional **Single-EXE Standalone Setup Wizard** featuring native Windows 10/11 DWM dark mode frame integration, a multi-step installation workflow, explicit Privacy Policy & EULA agreements, and clean system shortcuts integration.

---

## ✨ Key Features & Improvements

### 🎨 1. Professional Standalone Installer Wizard
* **Native DWM Immersive Dark Mode**: Eliminates legacy light window frames in favor of a sleek, dark slate UI (`#0F172A`) consistent with the SmartDM desktop application.
* **Multi-Step Setup Flow**:
  1. **Page 1 (Privacy & Agreement)**: Interactive EULA and Zero-Telemetry Privacy Policy agreement.
  2. **Page 2 (Options & Directory)**: Destination folder selection, Desktop shortcut toggle, and Windows Startup launch configuration.
  3. **Page 3 (Installation Progress)**: Real-time unpacking progress bar with live status text.
  4. **Page 4 (Completion)**: Clean finish screen with instant application launch options.

### 🛡️ 2. Zero-Telemetry & Encrypted Architecture
* Explicit Privacy Policy commitment embedded directly into the installer.
* **AES-256 SQLCipher** local encryption for all catalog metadata, download history, and category rules.
* Zero data tracking or external telemetry uploads.

### ⚙️ 3. Core System & Security Hardening
* **Module Hardening**: Verified and hardened all 25 system modules against memory leaks, buffer boundaries, and IPC protocol safety (restored stable baseline matching the Aug 15 1 AM release milestone).
* **Native Host Registration**: Silent background registration of Windows registry Native Messaging Host handles (`io.smartdm.host`) for Chrome, Edge, Brave, and Firefox extensions.

---

## 📦 Binary Verification (SHA-256 Manifest)

* Release installer binary: `SmartDM-Setup-v1.0.7.exe`
* Digest file: `SHA256SUMS.txt`

---

## 📁 File Changes Summary

* `modules/domain/src/main/resources/smartdm-version.properties`: Updated version to `1.0.7`.
* `tools/scripts/Installer.cs`: Redesigned setup wizard with DWM dark mode titlebar, WinForms `UseMnemonic = false` fix, multi-step panels, and progress tracking.
* `tools/scripts/build_single_exe_installer.ps1`: Updated version strings and release packaging pipeline.

---

*Thank you for using SmartDM Download Manager!*
