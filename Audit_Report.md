# SmartDM Code Audit Report: Universal Media Intelligence Engine

## 1. Facebook CDN Token Bug
- **UI Prevention:** The logic in `smartdm_overlay.js` (`isOpaqueTokenOrHash`) successfully scrubs generic hashes and opaque strings from appearing in UI dropdowns, format badges, and filenames.
- **Variant Coverage (BUG FOUND):** `isOpaqueTokenOrHash()` **DOES NOT** correctly catch all base64 variants.
  - *Location:* `extensions/chrome/smartdm_overlay.js` (and Firefox) line 61, as well as `apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs` line 112.
  - *Flaw:* The regex `/^[A-Za-z0-9_.-]+$/` (and `@"^[a-z0-9_\-]+$"` in C#) restricts matches to alphanumeric, underscore, and dash. It explicitly excludes standard base64 characters like `+`, `/`, and `=`. This means base64 tokens with these characters will slip through and appear in the UI.
  - *Fix Recommended:* Update the regex to support base64 characters: `/^[A-Za-z0-9_.+=\/-]+$/` and in C# `@"^[a-z0-9_\-\+\/\=]+$"`.
- **Byte Range Deduplication:** **Verified.** `sanitizeStreamUrl()` in `background.js` correctly strips `bytestart` and `byteend` parameters via `URL.searchParams.delete()`, ensuring identical streams don't spam memory.
- **Semantic Page Title:** **Verified.** `extractSemanticPageTitle()` gracefully checks OpenGraph (`og:title`), Twitter card metadata, and JSON-LD structured data (like `VideoObject`) while bypassing generic titles.

## 2. Pornhub & Streaming Sites Infinite Spinner Bug
- **Infinite Spinner Cause:** The legacy behavior caused an infinite spinner because `buildFallbackFormats` and background queries were heavily dependent on the native messaging host. If the desktop app wasn't running, or for non-YouTube sites, it hung on loopback HTTP requests (which lacked timeouts) or `sendNativeMessage` (which can stall).
- **Infinite Spinner Fixed:** **Verified.** The UI will never hang indefinitely again.
  - *Immediate Response:* In `background.js`, `GET_DETECTED_MEDIA` now immediately responds `return false;` (0ms synchronous return from the memory graph).
  - *AbortController:* `appendCookiesAndSend()` now properly utilizes an `AbortController` with a strict `350ms` timeout on the desktop IPC loopback.
  - *Native Message Bypass:* `chrome.runtime.sendNativeMessage` is completely bypassed if `request.type === 'GET_MEDIA_FORMATS'`.
  - *Safety Timeout:* `fetchMediaFormats()` sets a `1200ms` strict fallback safety timeout that fires `buildFallbackFormats()` if callbacks aren't hit.
  - *Short-Circuiting:* Non-YouTube URLs bypass the desktop IPC entirely and return locally immediately.

## 3. YouTube Integrity
- **Native Resolution:** **Verified.** `LocalIpcService.cs` correctly funnels verified YouTube URLs to `YouTubeMediaResolver.ResolveYouTubeFormatsAsync()`.
- **URL Extractors:** **Verified.** `ExtractYouTubeVideoId()` properly handles standard `?v=`, `youtu.be`, and `/shorts/` URL structures. `IsYouTubeUrl()` works safely on these extracted IDs.

## 4. Code Hygiene, Edge Cases & Memory Lifecycle
- **Memory Lifecycle:** **Verified.** `chrome.tabs.onRemoved` successfully deletes map entries in `detectedMediaMap`, preventing memory leaks when tabs are closed.
- **ReDoS Vulnerabilities:** **Verified.** The URL and title regexes (`\s*[\-\|\:·•]\s*...`) are constructed cleanly. The wildcard match `.*$` does not introduce nested overlapping quantifiers, making the regexes immune to catastrophic backtracking (ReDoS).
- **Extension Sync:** **Verified.** The Chrome and Firefox extension codebases are functionally identical (`git diff --no-index extensions/chrome extensions/firefox` returns no differences for the audited files).
- **Build Status:** **Verified.** `dotnet build apps/desktop-avalonia` completed successfully in `1.37s` with **0 errors and 0 warnings**.

### Final Verdict & Sign-Off
The implementation comprehensively resolves the infinite spinner bugs and handles network-level media interception effectively. However, the `isOpaqueTokenOrHash` logic must be slightly tweaked across both JS and C# implementations to properly capture standard Base64 characters (`+`, `/`, `=`), otherwise some Facebook/CDN base64 hashes will still leak into the UI.

Once the regex is patched, the system is cleared for deployment.
