(function () {
  'use strict';

  const PLAYER_PROCESSED_ATTR = 'data-smartdm-tiktok-processed';

  function initTikTokOverlay() {
    const observer = new MutationObserver(() => {
      scanPlayers();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanPlayers();
  }

  function scanPlayers() {
    const mediaElements = document.querySelectorAll('video:not([' + PLAYER_PROCESSED_ATTR + '])');
    mediaElements.forEach(attachTikTokBanner);
  }

  function attachTikTokBanner(mediaEl) {
    if (mediaEl.getAttribute(PLAYER_PROCESSED_ATTR)) return;
    mediaEl.setAttribute(PLAYER_PROCESSED_ATTR, 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-tiktok-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';

    const syncPos = () => {
      const rect = mediaEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
      } else {
        host.style.opacity = '1';
        host.style.pointerEvents = 'auto';
        host.style.top = (rect.top + 16) + 'px';
        host.style.left = (rect.right - host.offsetWidth - 16) + 'px';
      }
    };

    window.addEventListener('scroll', syncPos, true);
    window.addEventListener('resize', syncPos);
    setInterval(syncPos, 100);
    setTimeout(syncPos, 50);

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .banner-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        transition: all 0.2s ease;
        user-select: none;
      }
      .banner-btn:hover {
        background: rgba(30, 41, 59, 0.95);
        border-color: rgba(56, 189, 248, 0.5);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(56, 189, 248, 0.25);
      }
      .banner-icon {
        width: 14px;
        height: 14px;
        fill: currentColor;
        color: #38bdf8;
      }
      .popover {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 260px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
        padding: 12px;
        z-index: 2147483647;
        color: #f8fafc;
        box-sizing: border-box;
      }
      .popover.active {
        display: block;
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .popover-header {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .format-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: 8px;
        background: #1e293b;
        margin-bottom: 6px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        border: 1px solid transparent;
      }
      .format-item:last-child {
        margin-bottom: 0;
      }
      .format-item:hover {
        background: #334155;
        border-color: #38bdf8;
      }
      .format-info {
        display: flex;
        flex-direction: column;
      }
      .format-title {
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .format-badge {
        font-size: 10px;
        font-weight: 700;
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .status-text {
        font-size: 12px;
        color: #94a3b8;
        text-align: center;
        padding: 12px 0;
      }
      .spinner-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px 0;
        gap: 8px;
      }
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(56, 189, 248, 0.2);
        border-top-color: #38bdf8;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;

    const container = document.createElement('div');
    container.style.position = 'relative';

    const bannerBtn = document.createElement('div');
    bannerBtn.className = 'banner-btn';
    bannerBtn.innerHTML = `
      <svg class="banner-icon" viewBox="0 0 24 24">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span>TikTok Download</span>
    `;

    const popover = document.createElement('div');
    popover.className = 'popover';
    popover.innerHTML = `
      <div class="popover-header">
        <span>TikTok Formats</span>
      </div>
      <div class="popover-content"></div>
    `;

    container.appendChild(bannerBtn);
    container.appendChild(popover);
    shadow.appendChild(style);
    shadow.appendChild(container);

    const content = shadow.querySelector('.popover-content');

    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    });

    let formatSearchInterval = null;
    let formatSearchTimeout = null;

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        if (formatSearchInterval) clearInterval(formatSearchInterval);
        if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
        return;
      }

      popover.classList.add('active');
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Searching for TikTok streams...</span>
        </div>
      `;

      // Extract exact page URL for this specific video post
      let pageUrl = window.location.href;
      const isVideoLink = (href) => {
        if (!href) return false;
        const h = href.toLowerCase();
        return h.includes('/video/') || h.includes('/@');
      };

      let el = mediaEl;
      let found = false;
      while (el && el !== document.body) {
        if (el.tagName === 'A' && isVideoLink(el.href)) {
          pageUrl = el.href;
          found = true;
          break;
        }
        el = el.parentElement;
      }

      if (!found) {
        let currentParent = mediaEl.parentElement;
        let searchDepth = 0;
        while (currentParent && currentParent !== document.body && searchDepth < 25) {
          const links = currentParent.querySelectorAll('a[href]');
          for (let i = 0; i < links.length; i++) {
            if (isVideoLink(links[i].href)) {
              pageUrl = links[i].href;
              found = true;
              break;
            }
          }
          if (found) break;
          currentParent = currentParent.parentElement;
          searchDepth++;
        }
      }

      const startTime = Date.now();
      const MIN_SEARCH_TIME = 1500;

      const checkFormats = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MIN_SEARCH_TIME) {
          if (formatSearchInterval) clearInterval(formatSearchInterval);
          if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
          
          let liveSrc = mediaEl.currentSrc || mediaEl.src;
          if (!liveSrc || liveSrc.startsWith('blob:')) {
            const sourceChild = mediaEl.querySelector('source');
            if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
              liveSrc = sourceChild.src;
            }
          }
          renderTikTokFormats(content, liveSrc, pageUrl, popover);
        }
      };

      checkFormats();
      formatSearchInterval = setInterval(checkFormats, 300);

      formatSearchTimeout = setTimeout(() => {
        if (formatSearchInterval) clearInterval(formatSearchInterval);
        let liveSrc = mediaEl.currentSrc || mediaEl.src;
        if (!liveSrc || liveSrc.startsWith('blob:')) {
          const sourceChild = mediaEl.querySelector('source');
          if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
            liveSrc = sourceChild.src;
          }
        }
        renderTikTokFormats(content, liveSrc, pageUrl, popover);
      }, 4000);
    });

    document.body.appendChild(host);
  }

  function renderTikTokFormats(container, liveSrc, pageUrl, popover) {
    container.innerHTML = '';

    if (!liveSrc || !liveSrc.startsWith('http')) {
      container.innerHTML = '<div class="status-text">No active TikTok media stream detected.</div>';
      return;
    }

    const div = document.createElement('div');
    div.className = 'format-item';
    div.innerHTML = `
      <div class="format-info">
        <span class="format-title">TikTok Video Stream (HD)</span>
      </div>
      <span class="format-badge">Main Stream</span>
    `;

    div.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';
      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      runtime.sendMessage({
        type: 'START_MEDIA_DOWNLOAD',
        url: pageUrl,
        videoUrl: liveSrc,
        audioUrl: null,
        formatId: 'best'
      }, () => {
        setTimeout(() => {
          if (popover && popover.classList) {
            popover.classList.remove('active');
          }
        }, 800);
      });
    });

    container.appendChild(div);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTikTokOverlay);
  } else {
    initTikTokOverlay();
  }
})();
