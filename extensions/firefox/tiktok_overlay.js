(function () {
  'use strict';

  const POST_PROCESSED_ATTR = 'data-smartdm-tiktok-card-processed';

  function initTikTokOverlay() {
    const observer = new MutationObserver(() => {
      scanTikTokPosts();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanTikTokPosts();
  }

  function scanTikTokPosts() {
    // Select all TikTok post card containers in feeds, profile grids, and video pages
    const selectors = [
      'div[data-e2e="recommend-list-item-container"]',
      'div[data-e2e="user-post-item"]',
      'div[class*="DivItemContainer"]',
      'div[class*="DivVideoWrapper"]',
      'div[class*="DivContainer"]',
      'article'
    ];

    const postElements = document.querySelectorAll(selectors.join(','));
    postElements.forEach(attachTikTokBannerToCard);

    // Fallback: also scan standalone <video> elements that might not be inside card containers
    const mediaElements = document.querySelectorAll('video:not([' + POST_PROCESSED_ATTR + '])');
    mediaElements.forEach((videoEl) => {
      const parentCard = videoEl.closest(selectors.join(',')) || videoEl.parentElement;
      if (parentCard) attachTikTokBannerToCard(parentCard);
    });
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function attachTikTokBannerToCard(cardEl) {
    if (!cardEl || cardEl.getAttribute(POST_PROCESSED_ATTR)) return;
    cardEl.setAttribute(POST_PROCESSED_ATTR, 'true');

    // Ensure container has relative positioning for absolute placement
    if (window.getComputedStyle(cardEl).position === 'static') {
      cardEl.style.position = 'relative';
    }

    const host = document.createElement('div');
    host.className = 'smartdm-tiktok-host';
    host.style.position = 'absolute';
    host.style.top = '16px';
    host.style.right = '16px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';

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

      // DYNAMIC AT CLICK TIME: Query the live video element inside THIS specific post container
      const liveVideoEl = cardEl.querySelector('video') || document.querySelector('video');
      let directSrc = liveVideoEl ? (liveVideoEl.currentSrc || liveVideoEl.src) : null;
      if (!directSrc || directSrc.startsWith('blob:')) {
        const sourceChild = liveVideoEl ? liveVideoEl.querySelector('source') : null;
        if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
          directSrc = sourceChild.src;
        }
      }

      // DYNAMIC AT CLICK TIME: Query the exact post URL link inside THIS specific post container
      let pageUrl = window.location.href;
      const postLink = cardEl.querySelector('a[href*="/video/"]');
      if (postLink && postLink.href) {
        pageUrl = postLink.href;
      }

      const startTime = Date.now();
      const MIN_SEARCH_TIME = 1500; // Enforce searching animation for at least 1.5 seconds

      const checkFormats = () => {
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
          let netMedia = (netRes && netRes.media) ? netRes.media : [];

          netMedia = netMedia.filter(m => {
            const urlLower = m.url.toLowerCase();
            return !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.ts');
          });

          const elapsed = Date.now() - startTime;

          if (elapsed >= MIN_SEARCH_TIME) {
            if (formatSearchInterval) clearInterval(formatSearchInterval);
            if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
            renderTikTokFormats(content, directSrc, netMedia, pageUrl, popover);
          }
        });
      };

      checkFormats();
      formatSearchInterval = setInterval(checkFormats, 500);

      formatSearchTimeout = setTimeout(() => {
        if (formatSearchInterval) clearInterval(formatSearchInterval);
        renderTikTokFormats(content, directSrc, [], pageUrl, popover);
      }, 5000);
    });

    cardEl.appendChild(host);
  }

  function renderTikTokFormats(container, directSrc, netMediaList, pageUrl, popover) {
    container.innerHTML = '';

    const rawItems = [];

    // 1. Direct stream from the exact live video element of THIS post card
    if (directSrc && directSrc.startsWith('http')) {
      rawItems.push({
        title: 'TikTok Video Stream (HD)',
        badge: 'Main Stream',
        url: directSrc,
        videoUrl: directSrc,
        audioUrl: null,
        formatId: 'best',
        fileName: null
      });
    } else if (netMediaList && netMediaList.length > 0) {
      // 2. Fallback to netMedia ONLY if directSrc is missing
      let videoId = null;
      if (pageUrl) {
        const match = pageUrl.match(/\/video\/(\d+)/);
        if (match) videoId = match[1];
      }

      let filteredNet = netMediaList;
      if (videoId) {
        const idMatches = netMediaList.filter(m => m.url.includes(videoId));
        if (idMatches.length > 0) filteredNet = idMatches;
      }

      const sortedNet = [...filteredNet].sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));
      sortedNet.forEach((m, idx) => {
        if (m.contentLength && m.contentLength < 50000 && sortedNet.length > 1) return;

        const ext = (m.filename && m.filename.includes('.') ? m.filename.substring(m.filename.lastIndexOf('.') + 1) : 'MP4').toUpperCase();
        const formattedSize = formatSize(m.contentLength);
        const sizeText = m.customBadge || (formattedSize ? formattedSize : 'Stream');
        let qualityName = `TikTok Video Stream ${idx + 1} (${ext})`;

        rawItems.push({
          title: qualityName,
          badge: sizeText,
          url: m.url,
          videoUrl: m.videoUrl || m.url,
          audioUrl: m.audioUrl || null,
          formatId: 'best',
          fileName: m.filename
        });
      });
    }

    const seenUrls = new Set();
    const allItems = [];
    rawItems.forEach(item => {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allItems.push(item);
      }
    });

    if (allItems.length === 0) {
      container.innerHTML = '<div class="status-text">No TikTok media streams detected.</div>';
      return;
    }

    allItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'format-item';
      div.innerHTML = `
        <div class="format-info">
          <span class="format-title" title="${item.title}">${item.title}</span>
        </div>
        <span class="format-badge">${item.badge}</span>
      `;
      div.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        runtime.sendMessage({
          type: 'START_MEDIA_DOWNLOAD',
          url: pageUrl,
          videoUrl: item.url,
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
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTikTokOverlay);
  } else {
    initTikTokOverlay();
  }
})();
