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

  function scanPlayer() {
    const player = document.querySelector('#movie_player:not([' + PLAYER_PROCESSED_ATTR + ']), .html5-video-player:not([' + PLAYER_PROCESSED_ATTR + '])');
    if (!player) return;

    player.setAttribute(PLAYER_PROCESSED_ATTR, 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-player-host';
    host.style.position = 'absolute';
    host.style.top = '12px';
    host.style.right = '12px';
    host.style.zIndex = '99999';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .idm-banner {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 6px;
          padding: 6px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
          transition: all 0.2s ease;
          user-select: none;
        }
        .idm-banner:hover {
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          border-color: #38bdf8;
          box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
          transform: translateY(-1px);
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
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(14px);
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .popover-content {
          max-height: 230px;
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
        }
        .format-title {
          font-weight: 700;
          color: #f8fafc;
        }
        .format-note {
          font-size: 10px;
          color: #94a3b8;
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
        <div class="popover-title">
          <span>SmartDM Video Formats</span>
        </div>
        <div class="popover-content">
          <div class="status-text">Probing video formats...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.idm-banner');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const videoUrl = getCanonicalUrl(window.location.href);
      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = '<div class="status-text">Fetching formats from SmartDM...</div>';

      const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        if (!res || !res.success || !res.formats || res.formats.length === 0) {
          content.innerHTML = '<div class="status-text" style="color:#ef4444;">Opening SmartDM Dialog...</div>';
          runtime.sendMessage({ type: 'START_MEDIA_DOWNLOAD', url: videoUrl });
          setTimeout(() => popover.classList.remove('active'), 1200);
          return;
        }

        content.innerHTML = '';

        // Add "Open Full SmartDM Dialog" top choice
        const topOption = document.createElement('div');
        topOption.className = 'format-item';
        topOption.style.background = 'rgba(56, 189, 248, 0.15)';
        topOption.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        topOption.innerHTML = `
          <div class="format-info">
            <span class="format-title" style="color:#38bdf8;">★ Open SmartDM Download Window</span>
            <span class="format-note">Select directory & full format details</span>
          </div>
        `;
        topOption.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          runtime.sendMessage({ type: 'START_MEDIA_DOWNLOAD', url: videoUrl });
          popover.classList.remove('active');
        });
        content.appendChild(topOption);

        res.formats.forEach((fmt) => {
          const item = document.createElement('div');
          item.className = 'format-item';

          const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
          const extText = (fmt.ext || 'MP4').toUpperCase();
          const sizeText = fmt.fileSize > 0 
            ? (fmt.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
            : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Media Format');

          item.innerHTML = `
            <div class="format-info">
              <span class="format-title">${resolution} (${extText})</span>
              ${fmt.formatNote ? `<span class="format-note">${fmt.formatNote}</span>` : ''}
            </div>
            <span class="format-badge">${sizeText}</span>
          `;

          item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            content.innerHTML = '<div class="status-text" style="color:#38bdf8;">Opening SmartDM Window...</div>';

            runtime.sendMessage(
              {
                type: 'START_MEDIA_DOWNLOAD',
                url: videoUrl,
                formatId: fmt.formatId,
                fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
              },
              () => {
                setTimeout(() => popover.classList.remove('active'), 1500);
              }
            );
          });

          content.appendChild(item);
        });
      });
    });

    player.appendChild(host);
  }

  function scanThumbnails() {
    const anchors = document.querySelectorAll('a#thumbnail:not([' + PROCESSED_ATTR + ']), a[href*="/watch?v="]:not([' + PROCESSED_ATTR + ']), a[href*="/shorts/"]:not([' + PROCESSED_ATTR + '])');
    anchors.forEach(attachBadge);
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
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
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
        <div class="popover-title">SmartDM Video Download</div>
        <div class="popover-content">
          <div class="status-text">Probing video formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.badge-btn');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = '<div class="status-text">Fetching formats...</div>';

      const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        if (!res || !res.success || !res.formats || res.formats.length === 0) {
          content.innerHTML = '<div class="status-text" style="color:#ef4444;">Opening SmartDM Window...</div>';
          runtime.sendMessage({ type: 'START_MEDIA_DOWNLOAD', url: videoUrl });
          setTimeout(() => popover.classList.remove('active'), 1200);
          return;
        }

        content.innerHTML = '';
        res.formats.forEach((fmt) => {
          const item = document.createElement('div');
          item.className = 'format-item';
          const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
          const sizeText = fmt.fileSize > 0 
            ? (fmt.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
            : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : (fmt.ext || 'MP4').toUpperCase());

          item.innerHTML = `
            <div class="format-info">
              <span class="format-name">${resolution}</span>
            </div>
            <span class="format-ext">${sizeText}</span>
          `;

          item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            content.innerHTML = '<div class="status-text" style="color:#38bdf8;">Opening SmartDM Window...</div>';

            runtime.sendMessage(
              {
                type: 'START_MEDIA_DOWNLOAD',
                url: videoUrl,
                formatId: fmt.formatId,
                fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
              },
              () => {
                setTimeout(() => popover.classList.remove('active'), 1500);
              }
            );
          });

          content.appendChild(item);
        });
      });
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
