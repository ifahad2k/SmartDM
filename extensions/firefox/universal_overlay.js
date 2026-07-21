(function () {
  'use strict';

  // Do not run on YouTube (YouTube has its dedicated overlay script)
  if (window.location.hostname.includes('youtube.com')) return;

  const PLAYER_PROCESSED_ATTR = 'data-smartdm-universal-attached';

  function initUniversalOverlay() {
    const observer = new MutationObserver(() => {
      scanPlayers();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanPlayers();
  }

  function scanPlayers() {
    const mediaElements = document.querySelectorAll('video:not([' + PLAYER_PROCESSED_ATTR + ']), audio:not([' + PLAYER_PROCESSED_ATTR + '])');
    mediaElements.forEach(attachUniversalBanner);
  }

  function findTopPlayerContainer(mediaEl) {
    let current = mediaEl;
    let container = mediaEl.parentElement || mediaEl;
    let depth = 0;

    while (current && current.parentElement && current.parentElement !== document.body && depth < 8) {
      current = current.parentElement;
      const tag = current.tagName.toLowerCase();
      
      if (tag === 'article' || current.getAttribute('role') === 'dialog' || current.getAttribute('role') === 'region') {
        container = current;
        break;
      }

      const style = window.getComputedStyle(current);
      if (style.position === 'relative' || style.position === 'absolute' || style.position === 'fixed') {
        container = current;
      }
      depth++;
    }

    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    return container;
  }

  function attachUniversalBanner(mediaEl) {
    if (mediaEl.getAttribute(PLAYER_PROCESSED_ATTR)) return;
    mediaEl.setAttribute(PLAYER_PROCESSED_ATTR, 'true');

    const container = findTopPlayerContainer(mediaEl);
    if (container.querySelector('.smartdm-universal-host')) return;

    const host = document.createElement('div');
    host.className = 'smartdm-universal-host';
    host.style.position = 'absolute';
    host.style.top = '16px';
    host.style.right = '16px';
    host.style.zIndex = '2147483647'; // Maximum z-index
    host.style.pointerEvents = 'auto';

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
    let dragStartX = 0, dragStartY = 0;

    bannerBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
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
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = '<div class="status-text">Fetching formats...</div>';

      const pageUrl = window.location.href;
      const directSrc = mediaEl.src || mediaEl.currentSrc;

      // 1. Fetch extracted formats via yt-dlp first
      chrome.runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: pageUrl }, (res) => {
        let formats = [];
        if (res && res.success && res.formats && res.formats.length > 0) {
          formats = res.formats;
        }

        // 2. Also check network-intercepted media streams for this tab
        chrome.runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
          const netMedia = (netRes && netRes.media) ? netRes.media : [];

          // Add direct element source if available
          if (directSrc && !directSrc.startsWith('blob:') && !netMedia.some(m => m.url === directSrc)) {
            netMedia.unshift({
              url: directSrc,
              contentType: 'video/mp4',
              filename: 'video_stream.mp4',
              contentLength: 0
            });
          }

          renderUniversalFormats(content, formats, netMedia, pageUrl, popover);
        });
      });
    });

    container.appendChild(host);
  }

  function renderUniversalFormats(container, ytDlpFormats, netMediaList, pageUrl, popover) {
    container.innerHTML = '';

    const allItems = [];

    // Add yt-dlp formats
    ytDlpFormats.forEach(fmt => {
      const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
      const ext = (fmt.ext || 'MP4').toUpperCase();
      const sizeText = fmt.fileSize > 0 
        ? (fmt.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
        : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      allItems.push({
        title: `${resolution} (${ext})`,
        badge: sizeText,
        url: pageUrl,
        formatId: fmt.formatId,
        fileName: null
      });
    });

    // Add network intercepted direct streams
    netMediaList.forEach((m, idx) => {
      const ext = m.filename.substring(m.filename.lastIndexOf('.') + 1).toUpperCase() || 'MEDIA';
      const sizeText = m.contentLength > 0 
        ? (m.contentLength / (1024 * 1024)).toFixed(1) + ' MB'
        : 'Direct Stream';

      allItems.push({
        title: `Stream ${idx + 1} (${ext})`,
        badge: sizeText,
        url: m.url,
        formatId: 'best',
        fileName: m.filename
      });
    });

    if (allItems.length === 0) {
      container.innerHTML = '<div class="status-text">No media formats detected.</div>';
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

        chrome.runtime.sendMessage(
          {
            type: 'START_MEDIA_DOWNLOAD',
            url: item.url,
            formatId: item.formatId,
            fileName: item.fileName
          },
          () => {
            setTimeout(() => popover.classList.remove('active'), 800);
          }
        );
      });

      container.appendChild(div);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUniversalOverlay);
  } else {
    initUniversalOverlay();
  }
})();
