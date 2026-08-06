# SmartDM Website

A responsive, animated, dependency-free landing website for SmartDM.

## Configure before deployment

Open `config.js` and update:

- `githubRepo`
- release asset filenames
- published SHA-256 checksum

All GitHub, download, bug-report, feature-request, security, license, and contribution links are generated from this configuration.

## Preview locally

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy

The site is static and can be deployed to GitHub Pages, Netlify, Cloudflare Pages, Vercel, or any normal web server.

## Main files

- `index.html` — structure and content
- `styles.css` — visual system, responsive layouts, and animations
- `script.js` — interactions, platform detection, download links, tabs, and clipboard actions
- `config.js` — repository and release settings
- `assets/smartdm-app.png` — application screenshot
