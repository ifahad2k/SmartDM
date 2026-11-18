# Shared background implementation

Edit these sources, then run `node tools/build-extensions.cjs` from the repository root.
Chrome and Firefox keep self-contained `background.js` bundles, so their loading,
permissions, manifests and unpacked installation flow do not change.

| Source | Responsibility |
| --- | --- |
| metadata.js | Titles, resolution labels and URL metadata |
| manifest_reader.js | Bounded/coalesced HLS and DASH network reads |
| manifest_parsers.js | HLS/DASH format parsing and audio pairing |
| desktop_handoff.js | Cookie capture and authenticated native handoff |
| youtube_resolver.js | Existing service-worker YouTube fallback |
| page_resolver.js | Selected watch-page media discovery |
| runtime.js | Browser event wiring, capture state and request routing |

These are classic-script sections in one browser worker scope, not independently
loaded ES modules. Top-level function names and state ownership are preserved.
`node tools/build-extensions.cjs --check` and the browser suite reject stale bundles.
Do not edit generated bundles directly or copy changes between browsers by hand.
