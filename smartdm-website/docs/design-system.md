# SmartDM — Web Design System Specification

## 1. Color System & Contrast Audit

```css
:root {
  --bg-dark: #070916;
  --bg-surface: #0e1329;
  --bg-surface-elevated: #151c3d;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-glow: rgba(0, 240, 255, 0.3);

  --text-main: #f0f4fc;      /* AAA contrast ratio against --bg-dark (16.2:1) */
  --text-muted: #94a3b8;     /* AA contrast ratio against --bg-dark (6.4:1) */
  --accent-cyan: #00f0ff;    /* Primary highlight accent */
  --accent-violet: #8b5cf6;  /* Secondary gradient accent */
  --accent-green: #10b981;   /* Security & success indicator */
}
```

## 2. Typography Hierarchy
- **Font Stack**: System UI / Modern Sans (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Monospace Stack**: JetBrains Mono, Fira Code, Consolas, monospace
- **Headings**:
  - `h1`: 3.25rem (52px), line-height 1.15, font-weight 800
  - `h2`: 2.25rem (36px), line-height 1.2, font-weight 700
  - `h3`: 1.25rem (20px), line-height 1.4, font-weight 600
- **Body**: 1rem (16px), line-height 1.6

## 3. Responsive Breakpoints & Container Layouts
- Container max width: `1200px` with fluid `1.5rem` padding.
- Grid layouts collapse to single-column under `768px`.
- Touch targets strictly enforced at minimum `44px x 44px`.

## 4. Motion Guidelines & Reduced Motion
- Transitions use GPU-accelerated `transform` and `opacity` properties.
- Duration: Standard `200ms - 350ms` with `cubic-bezier(0.16, 1, 0.3, 1)`.
- Under `@media (prefers-reduced-motion: reduce)`:
  - Background auroras, card tilts, ticker scrolling, and floating card physics are disabled or frozen.
  - All page element opacity reveals resolve instantly without layout shifts.
