(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-smartdm-attached';

  function initOverlay() {
    const observer = new MutationObserver(() => scanThumbnails());
    observer.observe(document.body, { childList: true, subtree: true });
    scanThumbnails();
  }

  function scanThumbnails() {
    const anchors = document.querySelectorAll('a#thumbnail:not([' + PROCESSED_ATTR + ']), a[href*="/watch?v="]:not([' + PROCESSED_ATTR + ']), a[href*="/shorts/"]:not([' + PROCESSED_ATTR + '])');
    anchors.forEach(attachBadge);
  }

  function attachBadge(anchor) {
    if (anchor.getAttribute(PROCESSED_ATTR)) return;
    anchor.setAttribute(PROCESSED_ATTR, 'true');

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

      const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
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

            runtime.sendMessage(
              {
                type: 'START_MEDIA_DOWNLOAD',
                url: videoUrl,
                formatId: fmt.formatId,
                fileName: fmt.title ? fmt.title + '.' + fmt.ext : null
              },
              () => {
                content.innerHTML = '<div class="status-text" style="color:#22c55e;">Added to SmartDM!</div>';
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
