(function () {
  'use strict';

  const PLAYER_PROCESSED_ATTR = 'data-smartdm-tiktok-attached';

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1.0) return mb.toFixed(1) + ' MB';
    const kb = bytes / 1024;
    return kb.toFixed(0) + ' KB';
  }

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

    shadow.innerHTML = `
      <style>
        .idm-banner {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 6px;
          padding: 6px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: grab;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          transition: background 0.2s ease, border-color 0.2s ease;
          user-select: none;
        }
        .idm-banner:active {
          cursor: grabbing;
        }
        .idm-banner:hover {
          background: rgba(2, 132, 199, 0.8);
          border-color: #38bdf8;
          box-shadow: 0 6px 20px rgba(56, 189, 248, 0.5);
        }
        .icon {
          width: 14px;
          height: 14px;
          fill: none;
          stroke: #38bdf8;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .idm-banner:hover .icon {
          stroke: #ffffff;
        }
        .popover {
          position: absolute;
          top: 36px;
          right: 0;
          width: 280px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8);
          display: none;
          flex-direction: column;
          gap: 6px;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          z-index: 2147483647;
        }
        .popover.active {
          display: flex;
        }
        .popover-title {
          font-weight: 700;
          color: #38bdf8;
          font-size: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 6px;
          margin-bottom: 4px;
        }
        .popover-content {
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
        }
        .popover-content::-webkit-scrollbar {
          width: 5px;
        }
        .popover-content::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.5);
          border-radius: 4px;
        }
        .format-item {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 7px 10px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .format-item:hover {
          background: rgba(56, 189, 248, 0.25);
          border-color: #38bdf8;
        }
        .format-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-width: 190px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .format-title {
          font-weight: 700;
          color: #f8fafc;
        }
        .format-badge {
          font-size: 11px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.15);
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }
        .status-text {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          padding: 10px;
        }
        .spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 16px;
          gap: 10px;
        }
        .spinner {
          width: 22px;
          height: 22px;
          border: 3px solid rgba(56, 189, 248, 0.2);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: smartdm-spin 0.8s linear infinite;
        }
        @keyframes smartdm-spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <button class="idm-banner">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download with SmartDM
      </button>
      <div class="popover">
        <div class="popover-title">Select Quality / Format</div>
        <div class="popover-content">
          <div class="status-text">Detecting media streams...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.idm-banner');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    // Auto-close popover on outside click
    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    });

    // Draggable logic
    let isDragging = false;
    let initialX, initialY, currentX, currentY;
    let xOffset = 0, yOffset = 0;

    bannerBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      isDragging = true;
    });

    document.addEventListener('mouseup', () => {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        host.style.transform = "translate3d(" + currentX + "px, " + currentY + "px, 0)";
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
      const checkFormats = () => {
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
          let netMedia = (netRes && netRes.media) ? netRes.media : [];

          netMedia = netMedia.filter(m => {
            const urlLower = m.url.toLowerCase();
            return !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.ts');
          });

          const elapsed = Date.now() - startTime;
          const isTimeout = elapsed >= 7000;

          if (netMedia.length >= 5 || (netMedia.length > 0 && isTimeout)) {
            if (formatSearchInterval) clearInterval(formatSearchInterval);
            if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
            renderTikTokFormats(content, netMedia, pageUrl, popover);
          } else if (netMedia.length > 0) {
            renderTikTokFormats(content, netMedia, pageUrl, popover);
          }
        });
      };

      checkFormats();
      formatSearchInterval = setInterval(checkFormats, 1000);

      formatSearchTimeout = setTimeout(() => {
        if (formatSearchInterval) clearInterval(formatSearchInterval);
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
          let netMedia = (netRes && netRes.media) ? netRes.media : [];
          netMedia = netMedia.filter(m => {
            const urlLower = m.url.toLowerCase();
            return !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.ts');
          });
          if (netMedia.length > 0) {
            renderTikTokFormats(content, netMedia, pageUrl, popover);
          } else {
            content.innerHTML = '<div class="status-text">No TikTok media streams detected.</div>';
          }
        });
      }, 7000);
    });

    document.body.appendChild(host);
  }

  function renderTikTokFormats(container, netMediaList, pageUrl, popover) {
    container.innerHTML = '';
    if (!netMediaList || netMediaList.length === 0) {
      container.innerHTML = '<div class="status-text">No TikTok media streams detected.</div>';
      return;
    }

    const rawItems = [];
    const sortedNet = [...netMediaList].sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));

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
