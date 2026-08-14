# SmartDM Release v1.0.7 - Comprehensive Release Notes

**Release Date:** August 14, 2026  
**Tag:** [`v1.0.7`](https://github.com/ifahad2k/SmartDM/releases/tag/v1.0.7)  
**Branch:** [`fix/v1.0.6-bugfixes`](https://github.com/ifahad2k/SmartDM/tree/fix/v1.0.6-bugfixes)  
**Package:** `SmartDM-Setup-v1.0.7.exe`  

---

## 🚀 Branch Cumulative Summary (`fix/v1.0.6-bugfixes`)

SmartDM **v1.0.7** consolidates all major features, security hardening, browser extension overhaul, UI branding, media overlay enhancements, and installer wizard redesign built in the `fix/v1.0.6-bugfixes` development branch.

---

## 🎨 1. Standalone Installer Redesign & Dark Theme

* **Native DWM Immersive Dark Mode**: Integrated Windows DWM dark mode frame APIs (`DwmSetWindowAttribute`), eliminating legacy white window titlebars in favor of a dark slate theme (`#0F172A`) consistent with the SmartDM desktop app.
* **4-Stage Guided Setup Wizard**:
  1. **Stage 1 (Privacy & Agreement)**: Interactive EULA and Zero-Telemetry Privacy Policy agreement screen with required user consent checkbox.
  2. **Stage 2 (Directory & Options)**: Destination folder picker, Desktop shortcut generator, and Windows Startup auto-launch configuration.
  3. **Stage 3 (Progress)**: Live unpacking progress bar with step-by-step extraction text.
  4. **Stage 4 (Completion)**: Clean finish screen with instant application launch options.
* **Ampersand Mnemonic Rendering Fix**: Resolved WinForms mnemonic text stripping by enforcing `UseMnemonic = false` across all UI labels, restoring proper formatting (`&`).

---

## 🔒 2. Enterprise System Security & Core Architecture Audit (P0/P1)

* **25-Module Security Audit & Hardening**: Fixed critical memory leaks, buffer limit validations, array bounds safety, IPC protocol deserialization risks, and unchecked stream reads across all 25 codebase modules.
* **SQLCipher AES-256 Storage**: Hardened local database encryption, ensuring all catalog metadata, download history, and category organization rules are stored securely.
* **Clean Uninstaller with Data Erase Option**: Created `uninstall.bat` registry cleanup script with automatic registry key removal and optional user data erasure.

---

## 🌐 3. Browser Extension & Native Messaging Overhaul

* **Native Messaging Host Suite (`io.smartdm.host`)**: Automated native host manifest creation and registry configuration for Chrome, Edge, Brave, and Firefox.
* **Multi-Browser & Multi-Profile Integration**: Added granular browser profile scanner supporting custom installation paths, enterprise policy registries (`ExtensionInstallForcelist`), and developer mode verification guards.
* **Classpath Fallback for Production**: Fixed production `host.bat` launcher script to ensure reliable JVM execution and stdin/stdout IPC communication.
* **First-Run Setup Popup**: Guided 3-step browser extension setup wizard added to desktop UI on first launch.

---

## 🎥 4. Media Detection & Browser Overlay Enhancements

* **Smooth Draggable Download Overlay Button**: Implemented left-click drag positioning handlers on video player overlay buttons (e.g. YouTube), reparenting to `document.body` so the button stays top-level and clickable everywhere.
* **Hover Prefetch & Smart Filtering**:
  * Added hover prefetching to start video link resolution before clicking.
  * Ignored Facebook UI audio/header clips and thumbnail preview videos.
  * Added dismiss cross button (`×`) and reduced overlay button size for cleaner playback.

---

## 🎨 5. High-Resolution Branding & Polish

* **Branding Overhaul**: Replaced all legacy icons and logos with high-resolution `sdm.png`, `app.ico`, and `setup.ico` assets across desktop UI, taskbar, executable launcher, and installer binaries.

---

## 📦 Binary Verification (SHA-256)

| Release File | Output Location |
|---|---|
| `SmartDM-Setup-v1.0.7.exe` | Desktop & `build/release/` |
| `SHA256SUMS.txt` | `build/release/` |

---

## 📁 Branch Commit Log Summary (`fix/v1.0.6-bugfixes`)

```
1febb1d docs: add release notes for v1.0.7
1620d9b fix(installer): remove browser integration UI checkbox and clean compiler warnings
cdfd36e fix(installer): set UseMnemonic = false to render ampersands properly
c74e03c feat(installer): redesign setup wizard with DWM dark mode titlebar and privacy agreement
5544c69 fix(core): resolve all P0/P1 system vulnerabilities across all 25 modules
c4fcfc2 fix(ui): remove redundant profile scanner section from BrowserIntegrationDialog
0b70050 feat: Add Guided Manual Installation for Chrome & Firefox, First-Run Setup Pop-up
d12691a fix(extension): reparent overlay host to document.body on drag so button stays top-level
264871e fix(extension): add left-click drag positioning handler to YouTube player overlay button
7f0cc2c fix(extension): prevent universal player banner on thumbnail preview videos
8e81bda fix(extension): ignore Facebook UI sound effects/headers and add dismiss button
988ce35 style: replace all app logos and windows icons with high-res sdm.png branding
e2e9e4a fix: Add classpath fallback to host.bat for production installation
24c27a3 fix: Add extension ID to host allowed_origins and build 3-step setup suite
4e2eb99 feat: Add Developer Mode verification guard and prompt user to turn ON Dev Mode
a6442bc feat: Implement Option 1 with direct browser launcher and Desktop shortcut generator
b47c343 feat: Add granular multi-browser and multi-profile integration manager UI
```

---

*Thank you for using SmartDM Download Manager!*
