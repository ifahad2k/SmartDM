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

## 📦 Installation Guide

Installing SmartDM takes less than 30 seconds:

1. Download **`SmartDM-Setup-v1.0.0.exe`** from the official GitHub Releases page.
2. Double-click **`SmartDM-Setup-v1.0.0.exe`** to run the standalone installer.
3. The installer automatically:
   - Sets up the SmartDM desktop application.
   - Bundles native media extraction tools (`yt-dlp` and `ffmpeg`).
   - Bundles pre-packaged browser extensions.
   - Registers the Native Messaging host in your Windows Registry.
4. Launch **SmartDM** from your Start Menu or Desktop shortcut!

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

## ❓ Troubleshooting & FAQ

### Q1: Downloads are not triggering when I click links in Chrome!
* **Check for IDM Conflict**: If you have **Internet Download Manager (IDM)** installed, IDM's browser extension may steal clicks before Chrome registers them. Disable or exit IDM.
* **Verify Developer Mode**: Ensure **Developer mode** is toggled **ON** in `chrome://extensions`.

### Q2: Browser displays "SmartDM App is not running" or connection lost?
* Open SmartDM desktop app.
* Click **Browser Integration (🧩 Puzzle icon)** in the top bar.
* Click **⚡ Re-Register Native Host**. This instantly repairs the Windows Registry connection between Chrome and SmartDM.

### Q3: Why does GitHub ask for a password?
* GitHub releases are completely free and public. If a password prompt appears, simply update to **SmartDM v1.0.0+** where automatic cookie fallback resolves presigned CDN redirects smoothly.

### Q4: How do I verify the installer's safety?
* Compare the SHA-256 hash of your downloaded `SmartDM-Setup-v1.0.0.exe` with the official hashes listed in **`SHA256SUMS.txt`** on the release page using PowerShell:
  ```powershell
  Get-FileHash SmartDM-Setup-v1.0.0.exe -Algorithm SHA256
  ```

---

*Enjoy ultra-fast downloading with SmartDM!* 🚀
