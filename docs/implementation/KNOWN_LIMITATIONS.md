# Known Limitations

This file tracks significant technical limitations, pending architectural work, and missing features that have been explicitly identified during development.

## Media Engine Limitations
- **HLS/M3U8 Streaming**: The application currently has no native capability to download `.m3u8`, `.mpd`, or `.ts` streaming media formats (like those used heavily on MegaCloud/Aniwave). Attempting to intercept these results in dummy 2KB text files. The extension explicitly filters these out until Phase 11+ introduces full HLS downloading support via FFmpeg.
- **YouTube Bot Protection**: YouTube frequently updates its bot-protection measures which blocks `yt-dlp`. We currently bypass this by injecting specific extractor arguments (`youtube:player_client=web,default`), but this is a cat-and-mouse game and might break if YouTube changes its client APIs. Older versions of `yt-dlp` installed on a user's system may also lack support for the `--extractor-args` parameter.
- **Anti-Tamper Iframes**: Certain sites (like Aniwave) use aggressive anti-tamper scripts in their iframes that instantly turn the video player black if the DOM is mutated. The universal extension injects the overlay directly into `documentElement` using `position: fixed` to evade this.
