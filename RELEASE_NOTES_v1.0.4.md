# SmartDM Release Notes — v1.0.4

**Release Date:** August 7, 2026  
**Build Target:** Windows x64 (Single-EXE Installer)  
**Binary Output:** `build/release/SmartDM-Setup-v1.0.4.exe`

---

## 🚀 Key Improvements & Fixes

### 1. 🎬 Facebook Caption & Filename Resolution
* **Fixed Generic Filenames**: Resolved an issue where Facebook video downloads defaulted to `video.mp4` instead of using the video's actual title/caption.
* **Smart Description Fallback**: Enhanced `YtDlpExtractor` to inspect the `description` metadata block when `title` or `_filename` return generic string placeholders (such as `"Video"` or `"Facebook Video"`). The backend now extracts and cleans the first line of the Facebook caption for filename generation.

### 2. 🎯 Universal Overlay UI Targeting & Anti-Cluttering
* **Fixed Navigation Link Misplacement**: Fixed an issue where the download overlay injected badges onto non-media navigation elements (e.g. top category headers like "Porn Videos").
* **Strict Element Criteria**: Enforced strict element filtering in `universal_overlay.js` requiring:
  1. An explicit child `<img>` or visual container tag.
  2. A minimum visual bounding box height of **>= 40px** to ensure badges only attach to genuine media thumbnails and not text navigation links.

### 3. ⚡ Background Prefetching & Timeout Tuning
* **Page-Load Auto-Prefetch**: The browser extension now immediately initiates background format resolution as soon as a main video page (`/watch`, `/reel`, `/video/`) loads, significantly reducing perceived popover wait time.
* **Extended Extraction Timeout**: Increased the format search timeout in `universal_overlay.js` from 10s to 40s to allow `yt-dlp` sufficient time to parse complex Facebook Graph API schemas without throwing premature "No media found" errors.

### 4. 🛠️ System Sync & Protocol Synchronization
* **App Library Sync**: Synchronized updated binary JARs into the user installation runtime directory (`AppData/Local/SmartDM/lib`).
* **Extension Version Sync**: Updated Chrome and Firefox extension manifests to **v1.0.4**.

---

## 🔒 Verification & Hashes
```
Package: SmartDM-Setup-v1.0.4.exe
Manifest: build/release/SHA256SUMS.txt
```
