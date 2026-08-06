# 🚀 SmartDM — User Guide & Setup Documentation

Welcome to **SmartDM**, the ultimate high-speed, modern, and open-source download manager built for maximum performance, video downloading, and seamless browser integration!

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Installation Guide](#installation-guide)
3. [Browser Extension Setup (Chrome, Edge, Brave, Firefox)](#browser-extension-setup)
4. [Downloading Files](#downloading-files)
5. [Downloading Videos (YouTube, TikTok, Social Media)](#downloading-videos)
6. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 🌟 Overview

SmartDM is designed to provide an Internet Download Manager (IDM) level experience with a sleek, modern glassmorphic interface and powerful built-in tools:

* **⚡ Ultra Fast Downloads**: Multi-segment downloading with dynamic connection splitting and chunk assembly.
* **🎥 Video & Media Downloader**: Integrated video format extraction for YouTube, TikTok, Facebook, and direct media streams.
* **🌐 Seamless Browser Extension**: Automatically intercepts link clicks and download triggers from your favorite web browsers.
* **🤖 AI Assistant Support**: Built-in support for Gemini and Ollama AI to assist with file categorization and organization.
* **🔒 Privacy & Safety First**: Real-time safety checks, RTLO spoofing protection, and local cryptographic checksum validation.


---

## 🌐 Browser Extension Setup

To allow SmartDM to catch download clicks directly from your web browser, follow these simple steps to load the included browser extension:

### For Google Chrome, Microsoft Edge, Brave, and Vivaldi:

1. Open **SmartDM** desktop app.
2. Click the **Browser Integration (🧩 Puzzle icon)** on the top bar or in Settings.
3. Click the **📁 Open Chrome Extension Folder** button.
   > 💡 *This automatically opens File Explorer to the exact extension folder and copies its file path to your clipboard!*
4. Open your browser and go to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
5. Turn **ON** the **Developer mode** toggle in the top-right corner.
6. Click **Load unpacked** (top-left).
7. Select the **`chrome`** extension folder opened in Step 3!

---

### For Mozilla Firefox:

1. Open **SmartDM** and click **Browser Integration (🧩 Puzzle icon)**.
2. Click **🦊 Open Firefox Extension Folder**.
3. Open Firefox and go to: `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on...**
5. Select the **`manifest.json`** file inside the `firefox` extension folder!

---

## 📥 Downloading Files

### 1. Automatic Link Interception
Once the browser extension is installed, whenever you click a download button on any site (e.g. GitHub releases, file hosts, zip files, software installers), SmartDM will automatically:
- Intercept the click.
- Open the **SmartDM Download Dialog** on your screen.
- Start downloading the file in high-speed parallel segments!

### 2. Manual Download
- Click **+ Add URL** in SmartDM's sidebar.
- Paste any direct download URL.
- Click **Start Download**.

---

## 🎬 Downloading Videos (YouTube, TikTok, Social Media)

### 🔴 YouTube Downloads
- Navigate to any YouTube video page in Chrome.
- A **▶ Download this video** button will appear automatically above the video player.
- Click the button to reveal all available video qualities (1080p, 4K, 60fps) and Audio-only options.
- Select your desired format to start downloading instantly!

### 🎵 TikTok Downloads
- Visit any TikTok video.
- SmartDM's TikTok overlay banner will detect the high-resolution media streams.
- Select your quality badge to download the video directly without watermarks!

---

## 5. Security & Verification

SmartDM is open-source. Release binaries are published with cryptographic SHA-256 signatures in `SHA256SUMS.txt`.

To verify your installer integrity:
```powershell
Get-FileHash SmartDM-Setup-v1.0.1.exe -Algorithm SHA256
```

---

## 6. Frequently Asked Questions (FAQ)

### Q1: Does SmartDM support Facebook & Instagram Reels?
* Yes! SmartDM includes dynamic URL resolution and capture-phase mouse handling to bypass transparent gesture overlays on Facebook and Instagram Reels.

### Q2: Does SmartDM support TikTok?
* Yes! SmartDM has a dedicated TikTok overlay engine that parses intercepted video streams and direct media URLs seamlessly.

### Q3: Why does GitHub ask for a password?
* GitHub releases are completely free and public. If a password prompt appears, simply update to **SmartDM v1.0.1+** where automatic cookie fallback resolves presigned CDN redirects smoothly.

### Q4: How do I verify the installer's safety?
* Compare the SHA-256 hash of your downloaded `SmartDM-Setup-v1.0.1.exe` with the official hashes listed in **`SHA256SUMS.txt`** on the release page using PowerShell:
  ```powershell
  Get-FileHash SmartDM-Setup-v1.0.1.exe -Algorithm SHA256
  ```

---

*Enjoy ultra-fast downloading with SmartDM!* 🚀
