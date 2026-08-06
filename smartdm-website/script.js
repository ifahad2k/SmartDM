(() => {
  const config = window.SMARTDM_CONFIG || {};
  const owner = config.githubOwner || "ifahad2k";
  const repo = String(config.githubRepo || `https://github.com/${owner}/SmartDM`).replace(/\/$/, "");
  const version = config.version || "1.0.0";
  const asset = config.releaseAssets || {};
  const checksums = config.checksums || {};
  const releaseBase = `${repo}/releases/download/v${version}`;

  const setHref = (selector, href) => document.querySelectorAll(selector).forEach(el => el.href = href);
  const setText = (selector, text) => document.querySelectorAll(selector).forEach(el => el.textContent = text);

  // Bind repository & release links
  setText(".version-text", `v${version}`);
  setHref("[data-link='repository']", repo);
  setHref(".github-release-link", `${repo}/releases`);
  setHref("[data-link='bug-report']", `${repo}/issues/new?template=bug_report.yml`);
  setHref("[data-link='feature-request']", `${repo}/issues/new?template=feature_request.yml`);
  setHref("[data-link='security']", `${repo}/blob/main/SECURITY.md`);
  setHref("[data-link='license']", `${repo}/blob/main/LICENSE`);
  setHref("[data-link='contributing']", `${repo}/blob/main/CONTRIBUTING.md`);

  // Bind release download links
  const winAsset = asset.windows?.filename || `SmartDM-Setup-v${version}.exe`;
  const appImageAsset = asset.appImage?.filename || `SmartDM-${version}-x86_64.AppImage`;
  const debAsset = asset.deb?.filename || `smartdm_${version}_amd64.deb`;

  setHref("[data-download='windows']", `${releaseBase}/${winAsset}`);
  setHref("[data-download='appimage']", `${releaseBase}/${appImageAsset}`);
  setHref("[data-download='deb']", `${releaseBase}/${debAsset}`);

  setText(".sha-value", checksums.windows || config.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  setText("#current-year", new Date().getFullYear());

  // Primary download CTA (Windows installer)
  const primaryTargetHref = `${releaseBase}/${winAsset}`;

  document.querySelectorAll("[data-action='primary-download']").forEach(link => {
    link.href = primaryTargetHref;
    const label = link.querySelector(".primary-download-label");
    if (label) label.textContent = "Download for Windows";
  });

  // Header, scroll progress and mobile navigation
  const header = document.querySelector(".site-header");
  const progress = document.querySelector(".scroll-progress span");
  const updateScrollUI = () => {
    header?.classList.toggle("scrolled", window.scrollY > 18);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
  };
  addEventListener("scroll", updateScrollUI, { passive: true });
  updateScrollUI();

  const menuButton = document.querySelector(".menu-button");
  const mobilePanel = document.querySelector(".mobile-panel");
  const setMenu = open => {
    menuButton?.setAttribute("aria-expanded", String(open));
    mobilePanel?.setAttribute("aria-hidden", String(!open));
    mobilePanel?.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    if (menuButton) menuButton.innerHTML = `<svg><use href="#${open ? "i-x" : "i-menu"}"/></svg>`;
  };
  menuButton?.addEventListener("click", () => setMenu(!mobilePanel.classList.contains("open")));
  mobilePanel?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenu(false)));

  // Intersection reveal observer
  const reveals = [...document.querySelectorAll(".reveal")];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const delay = Number(entry.target.dataset.delay || 0);
      setTimeout(() => entry.target.classList.add("visible"), delay);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px" });
  reveals.forEach(el => observer.observe(el));

  // Cursor glow effect
  const glow = document.querySelector(".cursor-glow");
  addEventListener("pointermove", e => {
    if (!glow) return;
    glow.style.left = `${e.clientX}px`;
    glow.style.top = `${e.clientY}px`;
  }, { passive: true });

  // App mockup tilt
  document.querySelectorAll("[data-tilt]").forEach(el => {
    el.addEventListener("pointermove", e => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = `rotateY(${x * 7}deg) rotateX(${y * -6}deg)`;
    });
    el.addEventListener("pointerleave", () => el.style.transform = "");
  });

  // Dynamic feature card light effect
  document.querySelectorAll(".feature-card").forEach(card => {
    card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  // Speed bar visualizer
  const speedBars = document.querySelector(".speed-bars");
  if (speedBars) {
    const heights = [35,47,56,42,69,77,62,84,78,93,72,89,96,74,85,67,91,79,97,83,88,74,95,81,92,86,98,90];
    speedBars.innerHTML = heights.map((h,i) => `<i style="height:${h}%;animation-delay:${-(i % 8) * .13}s"></i>`).join("");
  }
  const speedNumber = document.querySelector("#speed-number");
  if (speedNumber) setInterval(() => speedNumber.textContent = (82 + Math.random() * 15).toFixed(1), 1250);

  // Documentation tabs & keyboard navigation
  const docButtons = document.querySelectorAll("[data-doc-tab]");
  const panels = document.querySelectorAll("[data-doc-panel]");
  docButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.docTab;
      docButtons.forEach(b => {
        const isSelected = b === button;
        b.classList.toggle("active", isSelected);
        b.setAttribute("aria-selected", String(isSelected));
      });
      panels.forEach(panel => {
        panel.classList.toggle("active", panel.dataset.docPanel === target);
      });
    });
  });

  // AI model switch visual
  document.querySelectorAll(".model-switch button").forEach(button => {
    button.addEventListener("click", () => {
      button.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === button));
    });
  });

  // Copy buttons with live status announcement
  const toast = document.querySelector(".toast");
  let toastTimer;
  document.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", async () => {
      const textToCopy = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(textToCopy);
        toast?.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast?.classList.remove("show"), 1800);
      } catch {
        window.prompt("Copy to clipboard:", textToCopy);
      }
    });
  });

  // Fetch GitHub Star Count with Session Storage Caching
  const updateStarCount = async () => {
    const starContainers = document.querySelectorAll("[data-star-count]");
    if (!starContainers.length) return;

    const cachedStars = sessionStorage.getItem("smartdm_star_count");
    if (cachedStars) {
      starContainers.forEach(el => el.innerHTML = `<svg><use href="#i-star"/></svg> ${cachedStars} Stars`);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://api.github.com/repos/${owner}/SmartDM`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const count = data.stargazers_count ? data.stargazers_count.toLocaleString() : "Star";
        sessionStorage.setItem("smartdm_star_count", count);
        starContainers.forEach(el => el.innerHTML = `<svg><use href="#i-star"/></svg> ${count} Stars`);
      }
    } catch {
      // Graceful fallback to default SVG Star text
    }
  };

  // Dynamic Latest Release Resolution System (Rate-limit free & 100% resilient)
  const applyReleaseData = async (tag, assets) => {
    if (!tag) return;
    const cleanVer = tag.replace(/^v/, "");
    
    // Update all version tags
    setText(".version-text", `v${cleanVer}`);

    // Resolve Windows setup asset URL & filename
    let winAsset = assets?.find(a => a.name && (a.name.endsWith(".exe") || a.name.includes("Setup")));
    let winDownloadUrl = winAsset ? winAsset.browser_download_url : `${repo}/releases/download/${tag}/SmartDM-Setup-${tag}.exe`;
    let winFilename = winAsset ? winAsset.name : `SmartDM-Setup-${tag}.exe`;

    // Update download buttons
    setHref("[data-action='primary-download']", winDownloadUrl);
    setHref("[data-download='windows']", winDownloadUrl);
    setHref(".download-windows", winDownloadUrl);

    // Update filename text & verification code blocks
    setText(".windows-asset-name", winFilename);
    setText(".windows-filename-code", winFilename);
    setText(".verify-command-code", `Get-FileHash -Algorithm SHA256 ${winFilename}`);

    const verifyCmdBtn = document.querySelector(".verify-copy-button");
    if (verifyCmdBtn) verifyCmdBtn.dataset.copy = `Get-FileHash -Algorithm SHA256 ${winFilename}`;

    // Fetch SHA256SUMS.txt manifest automatically if available
    const shaUrl = `${repo}/releases/download/${tag}/SHA256SUMS.txt`;
    try {
      const shaRes = await fetch(shaUrl);
      if (shaRes.ok) {
        const shaText = await shaRes.text();
        const match = shaText.match(/([a-fA-F0-9]{64})\s+.*SmartDM-Setup/i) || shaText.match(/([a-fA-F0-9]{64})/);
        if (match && match[1]) {
          const shaHash = match[1].toUpperCase();
          setText(".sha-value", shaHash);
          const shaCopyBtn = document.querySelector(".copy-sha-button");
          if (shaCopyBtn) shaCopyBtn.dataset.copy = shaHash;
        }
      }
    } catch (e) {}
  };

  const fetchLatestRelease = async () => {
    // 1. Try GitHub HTML redirect resolution (0% chance of REST API rate limiting)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${repo}/releases/latest`, { redirect: "follow", signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok && res.url) {
        const match = res.url.match(/\/releases\/tag\/([^/]+)/);
        if (match && match[1]) {
          const latestTag = match[1];
          await applyReleaseData(latestTag, null);
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback to REST API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://api.github.com/repos/${owner}/SmartDM/releases/latest`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const tag = data.tag_name;
        const assets = data.assets || [];
        await applyReleaseData(tag, assets);
      }
    } catch (e) {}
  };

  updateStarCount();
  fetchLatestRelease();
})();
