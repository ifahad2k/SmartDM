(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-smartdm-attached';
  const PLAYER_PROCESSED_ATTR = 'data-smartdm-player-attached';

  function initOverlay() {
    const observer = new MutationObserver(() => {
      scanThumbnails();
      scanPlayer();
      scanPlaylist();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanThumbnails();
    scanPlayer();
    scanPlaylist();
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

  function fetchYtDlpFormats(url, callback) {
    if (!url) return;
    if (ytDlpCache[url] && ytDlpCache[url].status === 'done') {
      callback(ytDlpCache[url].data);
      return;
    }
    if (ytDlpCache[url] && ytDlpCache[url].status === 'loading') {
      ytDlpCache[url].callbacks.push(callback);
      return;
    }

    ytDlpCache[url] = { status: 'loading', callbacks: [callback] };

    const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
    runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: url }, (res) => {
      if (res && res.success && res.formats && res.formats.length > 0) {
        ytDlpCache[url].status = 'done';
        ytDlpCache[url].data = res;
      } else {
        delete ytDlpCache[url];
      }

      const cbs = ytDlpCache[url] ? ytDlpCache[url].callbacks : [callback];
      cbs.forEach(cb => cb(res));
    });
  }

  function renderFormatItems(container, formats, videoUrl, popover) {
    container.innerHTML = '';
    const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

    // Filter Audio Only for YT Music
    const audioFormats = formats.filter(f => f.isAudioOnly || (f.resolution === 'audio only') || (f.vcodec === 'none'));
    const displayFormats = audioFormats.length > 0 ? audioFormats : formats;

    displayFormats.forEach((fmt) => {
      const item = document.createElement('div');
      item.className = 'format-item';

      const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Stream');
      const extText = (fmt.ext || 'M4A').toUpperCase();
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

        runtime.sendMessage(
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
    if (!window.location.pathname.startsWith('/watch')) return;

    const playerBar = document.querySelector('ytmusic-player-bar:not([' + PLAYER_PROCESSED_ATTR + '])');
    if (!playerBar) return;

    playerBar.setAttribute(PLAYER_PROCESSED_ATTR, 'true');
    const videoUrl = getCanonicalUrl(window.location.href);
    fetchYtDlpFormats(videoUrl, () => {});

    const host = document.createElement('div');
    host.className = 'smartdm-player-host';
    host.style.position = 'absolute';
    host.style.top = '-50px';
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
          bottom: 36px;
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
        Download Song
      </button>
      <div class="popover">
        <div class="popover-title">Select Audio Quality</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.idm-banner');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    });

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentVideoUrl = getCanonicalUrl(window.location.href);

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');

      fetchYtDlpFormats(currentVideoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, currentVideoUrl, popover);
        } else if (res && res.success === false) {
          content.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">Error fetching formats.<br>Ensure SmartDM is running.</div>';
        } else {
          content.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
        }
      });

      if (!ytDlpCache[currentVideoUrl] || ytDlpCache[currentVideoUrl].status !== 'done') {
        content.innerHTML = `
          <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
            <div class="spinner"></div>
            <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching...</span>
          </div>
        `;
      }
    });

    playerBar.appendChild(host);

    // Also inject into the main player area (album art / video)
    const mainPlayer = document.querySelector('ytmusic-player:not([data-smartdm-main-player-attached])');
    if (mainPlayer) {
        mainPlayer.setAttribute('data-smartdm-main-player-attached', 'true');
        const host2 = document.createElement('div');
        host2.className = 'smartdm-main-player-host';
        host2.style.position = 'absolute';
        host2.style.top = '12px';
        host2.style.left = '12px';
        host2.style.zIndex = '99999';
        host2.style.pointerEvents = 'auto';
        
        const shadow2 = host2.attachShadow({ mode: 'open' });
        shadow2.innerHTML = shadow.innerHTML; // Reuse the same UI
        
        const bannerBtn2 = shadow2.querySelector('.idm-banner');
        const popover2 = shadow2.querySelector('.popover');
        const content2 = shadow2.querySelector('.popover-content');

        document.addEventListener('click', (e) => {
          if (popover2.classList.contains('active')) {
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(host2) && !host2.contains(e.target)) {
              popover2.classList.remove('active');
            }
          }
        });

        bannerBtn2.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const currentVideoUrl = getCanonicalUrl(window.location.href);

          const isActive = popover2.classList.contains('active');
          if (isActive) {
            popover2.classList.remove('active');
            return;
          }

          popover2.classList.add('active');

          fetchYtDlpFormats(currentVideoUrl, (res) => {
            if (res && res.success && res.formats && res.formats.length > 0) {
              renderFormatItems(content2, res.formats, currentVideoUrl, popover2);
            } else if (res && res.success === false) {
              content2.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">Error fetching formats.</div>';
            } else {
              content2.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
            }
          });

          if (!ytDlpCache[currentVideoUrl] || ytDlpCache[currentVideoUrl].status !== 'done') {
            content2.innerHTML = `
              <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
                <div class="spinner"></div>
                <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching...</span>
              </div>
            `;
          }
        });
        
        mainPlayer.appendChild(host2);
    }
  }

  function scanThumbnails() {
    const thumbnailElements = document.querySelectorAll('ytmusic-responsive-list-item-renderer:not([' + PROCESSED_ATTR + ']), ytmusic-two-row-item-renderer:not([' + PROCESSED_ATTR + ']), ytmusic-player-queue-item:not([' + PROCESSED_ATTR + '])');
    thumbnailElements.forEach((container) => {
      let thumbAnchor = container.querySelector('a[href*="watch?v="]');
      
      if (thumbAnchor && !thumbAnchor.closest('ytmusic-player-bar')) {
        container.setAttribute(PROCESSED_ATTR, 'true');
        attachBadge(container, thumbAnchor.href);
      }
    });
  }

  function attachBadge(container, url) {
    if (getComputedStyle(container).position === 'static' || !container.style.position) {
      container.style.position = 'relative';
    }

    const videoUrl = getCanonicalUrl(url);

    const host = document.createElement('div');
    host.className = 'smartdm-music-host';
    host.style.position = 'absolute';
    
    // Position on the top-left of the parent container (which neatly aligns with the thumbnail)
    host.style.top = '8px';
    if (container.tagName === 'YTMUSIC-TWO-ROW-ITEM-RENDERER') {
        host.style.left = '8px';
    } else {
        // List items have album index numbers sometimes, so we indent slightly
        host.style.left = '16px'; 
    }
    
    host.style.zIndex = '99999';
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
          left: 0;
          width: 250px;
          background: rgba(15, 23, 42, 0.95);
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
      <button class="badge-btn" title="Download Audio">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
      <div class="popover">
        <div class="popover-title">Select Audio Quality</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.badge-btn');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');

    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const isActive = popover.classList.contains('active');
      document.querySelectorAll('.smartdm-music-host, .smartdm-player-host').forEach((h) => {
        if (h.shadowRoot) {
          const p = h.shadowRoot.querySelector('.popover');
          if (p) p.classList.remove('active');
        }
      });

      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');

      fetchYtDlpFormats(videoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, videoUrl, popover);
        } else if (res && res.success === false) {
          content.innerHTML = '<div class="status-text" style="color:#ef4444; font-weight:600; padding:6px 0;">Error fetching formats.</div>';
        } else {
          content.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
        }
      });

      if (!ytDlpCache[videoUrl] || ytDlpCache[videoUrl].status !== 'done') {
        content.innerHTML = `
          <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
            <div class="spinner"></div>
            <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching...</span>
          </div>
        `;
      }
    });

    container.appendChild(host);
  }

  function createPlaylistDownloadHost() {
    const host = document.createElement('div');
    host.className = 'smartdm-playlist-host';
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    host.style.pointerEvents = 'auto';
    host.style.verticalAlign = 'middle';
    
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .idm-banner {
          background: rgba(15, 23, 42, 0.85);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 36px;
          padding: 8px 16px;
          font-family: "Roboto", sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.2s ease;
        }
        .idm-banner:hover {
          background: rgba(14, 165, 233, 0.9);
          border-color: #38bdf8;
        }
        .icon {
          width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5;
        }
      </style>
      <button class="idm-banner">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download Playlist
      </button>
    `;

    const btn = shadow.querySelector('.idm-banner');
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
        btn.innerHTML = '<span style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</span>';
        
        runtime.sendMessage({
            type: 'START_MEDIA_DOWNLOAD',
            url: window.location.href, // Playlist URL
            formatId: 'bestaudio/best', // Hint for audio only
            fileName: null
        }, () => {
            setTimeout(() => {
                btn.innerHTML = `
                    <svg class="icon" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download Playlist
                `;
            }, 1000);
        });
    });
    return host;
  }

  function scanPlaylist() {
    // Inject into Sort button area (Tracklist header)
    // Sometimes the sort button isn't there, so we target the shelf header itself
    const shelfHeader = document.querySelector('ytmusic-playlist-shelf-renderer #header:not([' + PROCESSED_ATTR + ']), ytmusic-shelf-renderer #header:not([' + PROCESSED_ATTR + '])');
    if (shelfHeader) {
        shelfHeader.setAttribute(PROCESSED_ATTR, 'true');
        const host = createPlaylistDownloadHost();
        host.style.marginLeft = '12px';
        shelfHeader.appendChild(host);
    }

    // Inject into Main header buttons (Album/Playlist header)
    const headerMenu = document.querySelector('ytmusic-detail-header-renderer ytmusic-menu-renderer:not([' + PROCESSED_ATTR + ']), ytmusic-responsive-header-renderer ytmusic-menu-renderer:not([' + PROCESSED_ATTR + '])');
    if (headerMenu) {
        headerMenu.setAttribute(PROCESSED_ATTR, 'true');
        const host = createPlaylistDownloadHost();
        host.style.marginRight = '12px';
        headerMenu.insertBefore(host, headerMenu.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlay);
  } else {
    initOverlay();
  }
})();
