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
          top: 34px;
          right: 0;
          width: 240px;
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.7);
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
          padding-bottom: 4px;
          margin-bottom: 2px;
        }
        .format-item {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          padding: 6px 10px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
        }
        .format-item:hover {
          background: rgba(56, 189, 248, 0.25);
          border-color: #38bdf8;
        }
        .format-name {
          font-weight: 600;
        }
        .format-ext {
          color: #94a3b8;
          font-size: 10px;
        }
        .status-text {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          padding: 8px;
        }
      </style>
      <button class="idm-banner">
        <span class="play-icon"></span>
        Download this video
      </button>
      <div class="popover">
        <div class="popover-title">SmartDM Video Formats</div>
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

      const videoUrl = window.location.href;
      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = '<div class="status-text">Fetching formats from SmartDM...</div>';

      chrome.runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        if (!res || !res.success || !res.formats || res.formats.length === 0) {
          // Fallback: Send direct download trigger to open desktop dialog
          content.innerHTML = '<div class="status-text" style="color:#ef4444;">Opening SmartDM...</div>';
          chrome.runtime.sendMessage({ type: 'START_MEDIA_DOWNLOAD', url: videoUrl });
          setTimeout(() => popover.classList.remove('active'), 1200);
          return;
        }

        content.innerHTML = '';
        res.formats.slice(0, 6).forEach((fmt) => {
          const item = document.createElement('div');
          item.className = 'format-item';
          item.innerHTML = `
            <span class="format-name">${fmt.qualityLabel || fmt.resolution || 'Download'}</span>
            <span class="format-ext">${fmt.ext ? fmt.ext.toUpperCase() : 'MP4'}</span>
          `;

          item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            content.innerHTML = '<div class="status-text" style="color:#38bdf8;">Opening SmartDM Dialog...</div>';

            chrome.runtime.sendMessage(
              {
                type: 'START_MEDIA_DOWNLOAD',
                url: videoUrl,
                formatId: fmt.formatId,
                fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
              },
              () => {
                content.innerHTML = '<div class="status-text" style="color:#22c55e;">Opened SmartDM Dialog!</div>';
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

    const videoUrl = anchor.href || window.location.href;
    if (!videoUrl || (!videoUrl.includes('/watch?v=') && !videoUrl.includes('/shorts/'))) return;

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
          width: 220px;
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
        .format-name {
          font-weight: 600;
        }
        .format-ext {
          color: #94a3b8;
          font-size: 10px;
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

      chrome.runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        if (!res || !res.success || !res.formats || res.formats.length === 0) {
          content.innerHTML = '<div class="status-text" style="color:#ef4444;">Formats unavailable</div>';
          return;
        }

        content.innerHTML = '';
        res.formats.slice(0, 5).forEach((fmt) => {
          const item = document.createElement('div');
          item.className = 'format-item';
          item.innerHTML = `
            <span class="format-name">${fmt.qualityLabel || fmt.resolution || 'Download'}</span>
            <span class="format-ext">${fmt.ext ? fmt.ext.toUpperCase() : 'MP4'}</span>
          `;

          item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            content.innerHTML = '<div class="status-text" style="color:#38bdf8;">Starting download...</div>';

            chrome.runtime.sendMessage(
              {
                type: 'START_MEDIA_DOWNLOAD',
                url: videoUrl,
                formatId: fmt.formatId,
                fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
              },
              () => {
                content.innerHTML = '<div class="status-text" style="color:#22c55e;">Opened SmartDM Dialog!</div>';
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
