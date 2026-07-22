(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-smartdm-attached';
  const PLAYER_PROCESSED_ATTR = 'data-smartdm-player-attached';

  function initOverlay() {
    const observer = new MutationObserver(() => {
      scanThumbnails();
      scanPlayer();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanThumbnails();
    scanPlayer();
  }

  function getCanonicalUrl(rawUrl) {
    if (!rawUrl) return window.location.href;
    try {
      return new URL(rawUrl, window.location.origin).href;
    } catch (e) {
      return window.location.href;
    }
  }

  const ytDlpCache = {};
  const prefetchQueue = [];
  let isPrefetching = false;

  function prefetchUrl(url, priority = false) {
    if (!url || ytDlpCache[url]) return;

    ytDlpCache[url] = { status: 'loading', callbacks: [] };

    if (priority) {
      prefetchQueue.unshift(url);
    } else {
      prefetchQueue.push(url);
    }

    processPrefetchQueue();
  }

  function processPrefetchQueue() {
    if (isPrefetching || prefetchQueue.length === 0) return;
    isPrefetching = true;

    const url = prefetchQueue.shift();
    const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

    runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: url }, (res) => {
      if (res && res.success && res.formats && res.formats.length > 0) {
        ytDlpCache[url].status = 'done';
        ytDlpCache[url].data = res;
      } else {
        ytDlpCache[url].status = 'error';
        ytDlpCache[url].data = res || { success: false, error: 'failed' };
      }

      const cbs = ytDlpCache[url] ? ytDlpCache[url].callbacks : [];
      cbs.forEach(cb => cb(ytDlpCache[url].data));

      isPrefetching = false;
      setTimeout(processPrefetchQueue, 250); // 250ms sequential gap
    });
  }

  function getCachedYtDlpFormats(url, callback) {
    if (!url) return;
    if (ytDlpCache[url] && ytDlpCache[url].status === 'done') {
      callback(ytDlpCache[url].data);
      return;
    }
    if (ytDlpCache[url] && ytDlpCache[url].status === 'error') {
      callback(ytDlpCache[url].data);
      return;
    }
    if (ytDlpCache[url] && ytDlpCache[url].status === 'loading') {
      ytDlpCache[url].callbacks.push(callback);
      return;
    }

    ytDlpCache[url] = { status: 'loading', callbacks: [callback] };
    prefetchQueue.unshift(url); // Priority prefetch on user click
    processPrefetchQueue();
  }



  function renderFormatItems(container, formats, videoUrl, popover) {
    container.innerHTML = '';
    formats.forEach((fmt) => {
      const item = document.createElement('div');
      item.className = 'format-item';

      const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
      const extText = (fmt.ext || 'MP4').toUpperCase();
      const sizeText = fmt.fileSize > 0 
        ? (fmt.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
        : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      item.innerHTML = `
        <div class="format-info">
          <span class="format-title">${resolution} (${extText})</span>
        </div>
        <span class="format-badge">${sizeText}</span>
      `;

      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';

        chrome.runtime.sendMessage(
          {
            type: 'START_MEDIA_DOWNLOAD',
            url: videoUrl,
            formatId: fmt.formatId,
            fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
          },
          () => {
            setTimeout(() => popover.classList.remove('active'), 800);
          }
        );
      });

      container.appendChild(item);
    });
  }

  function scanPlayer() {
    if (!window.location.pathname.startsWith('/watch') && !window.location.pathname.startsWith('/shorts')) return;

    // Immediately prefetch formats for the active watch video page in background
    prefetchUrl(window.location.href, true);

    const player = document.querySelector('#movie_player:not([' + PLAYER_PROCESSED_ATTR + ']), .html5-video-player:not([' + PLAYER_PROCESSED_ATTR + '])');
    if (!player) return;

    player.setAttribute(PLAYER_PROCESSED_ATTR, 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-player-host';
    host.style.position = 'absolute';
    host.style.top = '24px';
    host.style.right = '12px';
    host.style.zIndex = '99999';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
        .idm-banner {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 6px;
          padding: 6px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: grab;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          transition: background 0.2s ease, border-color 0.2s ease;
          user-select: none;
        }
        .idm-banner:active {
          cursor: grabbing;
        }
        .idm-banner:hover {
          background: rgba(2, 132, 199, 0.75);
          border-color: #38bdf8;
          box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
        }
        .play-icon {
          width: 0;
          height: 0;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 8px solid #38bdf8;
        }
        .idm-banner:hover .play-icon {
          border-left-color: #ffffff;
        }
        .popover {
          position: absolute;
          top: 36px;
          right: 0;
          width: 270px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
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
          z-index: 100000;
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
          max-height: 230px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
        }
        .popover-content:hover {
          overflow-y: overlay;
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
        }
        .status-text {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          padding: 10px;
        }
      </style>
      <button class="idm-banner">
        <span class="play-icon"></span>
        Download this video
      </button>
      <div class="popover">
        <div class="popover-title">Select Quality / Format</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.idm-banner');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    // Auto-close on click outside
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
    let dragStartX = 0, dragStartY = 0;

    bannerBtn.addEventListener('mousedown', (e) => {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
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

    bannerBtn.addEventListener('click', (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.sqrt(dx*dx + dy*dy) > 5) {
        e.preventDefault();
        return; // was a drag
      }

      e.preventDefault();
      e.stopPropagation();

      const videoUrl = getCanonicalUrl(window.location.href);

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');

      getCachedYtDlpFormats(videoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, videoUrl, popover);
        } else if (res && res.success === false) {
          const errMsg = (res.error && res.error.includes("not running")) 
            ? "SmartDM App is not running.<br><span style='font-size:10px; color:#94a3b8;'>Please open SmartDM desktop app.</span>" 
            : "Could not extract formats.<br><span style='font-size:10px; color:#94a3b8;'>Click to retry or check SmartDM app.</span>";
          content.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">' + errMsg + '</div>';
        } else {
          content.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
        }
      });

      if (!ytDlpCache[videoUrl] || ytDlpCache[videoUrl].status !== 'done') {
        content.innerHTML = `
          <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
            <div class="spinner" style="width:14px; height:14px; border:2px solid rgba(56,189,248,0.2); border-top-color:#38bdf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
            <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching for video formats...</span>
          </div>
        `;
      }
    });

    player.appendChild(host);
  }

  function scanThumbnails() {
    const thumbnailElements = document.querySelectorAll('ytd-thumbnail, ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, a#thumbnail');
    thumbnailElements.forEach((el) => {
      const container = el.closest('ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-grid-playlist-renderer, ytd-thumbnail, a#thumbnail') || el;
      if (container.getAttribute(PROCESSED_ATTR)) return;
      container.setAttribute(PROCESSED_ATTR, 'true');

      let thumbAnchor = container.querySelector('a#thumbnail, a.ytd-thumbnail, a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!thumbAnchor && container.tagName === 'A') {
        thumbAnchor = container;
      }
      if (thumbAnchor) {
        attachBadge(thumbAnchor);
      }
    });
  }

  function attachBadge(anchor) {
    if (anchor.getAttribute(PROCESSED_ATTR)) return;
    anchor.setAttribute(PROCESSED_ATTR, 'true');

    const parent = anchor.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    const rawUrl = anchor.getAttribute('href') || anchor.href || window.location.href;
    if (!rawUrl || (!rawUrl.includes('/watch?v=') && !rawUrl.includes('/shorts/'))) return;
    const videoUrl = getCanonicalUrl(rawUrl);

    // Queue background prefetching for this thumbnail URL
    prefetchUrl(videoUrl, false);

    const host = document.createElement('div');
    host.className = 'smartdm-host';
    host.style.position = 'absolute';
    host.style.top = '6px';
    host.style.right = '6px';
    host.style.zIndex = '9999';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
        .badge-btn {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 6px;
          padding: 4px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.2s ease;
          opacity: 0.85;
        }
        .badge-btn:hover {
          opacity: 1;
          background: rgba(14, 165, 233, 0.9);
          color: #ffffff;
          border-color: #ffffff;
          transform: translateY(-1px);
        }
        .popover {
          position: absolute;
          top: 28px;
          right: 0;
          width: 250px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 10px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
          display: none;
          flex-direction: column;
          gap: 6px;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          z-index: 10000;
        }
        .popover.active {
          display: flex;
        }
        .popover-title {
          font-weight: 700;
          color: #38bdf8;
          font-size: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 4px;
          margin-bottom: 2px;
        }
        .popover-content {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
        }
        .popover-content::-webkit-scrollbar {
          width: 4px;
        }
        .popover-content::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.5);
          border-radius: 4px;
        }
        .format-item {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          padding: 6px 8px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
        }
        .format-item:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
        }
        .format-info {
          display: flex;
          flex-direction: column;
        }
        .format-name {
          font-weight: 600;
        }
        .format-ext {
          color: #38bdf8;
          font-weight: 700;
          font-size: 11px;
        }
        .status-text {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          padding: 8px;
        }
      </style>
      <button class="badge-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        SmartDM
      </button>
      <div class="popover">
        <div class="popover-title">Select Quality / Format</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.badge-btn');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    // Auto-close on click outside
    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');

      getCachedYtDlpFormats(videoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, videoUrl, popover);
        } else if (res && res.success === false) {
          const errMsg = (res.error && res.error.includes("not running")) 
            ? "SmartDM App is not running.<br><span style='font-size:10px; color:#94a3b8;'>Please open SmartDM desktop app.</span>" 
            : "Could not extract formats.<br><span style='font-size:10px; color:#94a3b8;'>Click to retry or check SmartDM app.</span>";
          content.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">' + errMsg + '</div>';
        } else {
          content.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
        }
      });

      if (!ytDlpCache[videoUrl] || ytDlpCache[videoUrl].status !== 'done') {
        content.innerHTML = `
          <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
            <div class="spinner" style="width:14px; height:14px; border:2px solid rgba(56,189,248,0.2); border-top-color:#38bdf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
            <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching for video formats...</span>
          </div>
        `;
      }
    });

    if (anchor.style.position === 'static' || !anchor.style.position) {
      anchor.style.position = 'relative';
    }
    anchor.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlay);
  } else {
    initOverlay();
  }
})();
