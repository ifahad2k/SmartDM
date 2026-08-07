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
      const u = new URL(rawUrl, window.location.origin);
      if (u.pathname.includes('/watch')) {
        const v = u.searchParams.get('v');
        if (v) return 'https://www.youtube.com/watch?v=' + v;
      } else if (u.pathname.includes('/shorts/')) {
        const parts = u.pathname.split('/shorts/');
        if (parts[1]) {
          const shortId = parts[1].split('/')[0].split('?')[0];
          return 'https://www.youtube.com/shorts/' + shortId;
        }
      }
      return u.href;
    } catch (e) {
      return window.location.href;
    }
  }

  const ytDlpCache = {};

  function parseYtInitialPlayerResponseFromDOM() {
    try {
      let playerResponse = null;
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.streamingData) {
        playerResponse = window.ytInitialPlayerResponse;
      } else {
        const scripts = document.querySelectorAll('script');
        for (let s of scripts) {
          if (s.textContent && s.textContent.includes('ytInitialPlayerResponse')) {
            let text = s.textContent;
            let idx = text.indexOf('ytInitialPlayerResponse');
            if (idx >= 0) {
              let firstBrace = text.indexOf('{', idx);
              if (firstBrace >= 0) {
                let openCount = 0, lastBrace = -1, inString = false, escape = false;
                for (let i = firstBrace; i < text.length; i++) {
                  let c = text.charAt(i);
                  if (inString) {
                    if (escape) escape = false;
                    else if (c === '\\') escape = true;
                    else if (c === '"') inString = false;
                  } else {
                    if (c === '"') inString = true;
                    else if (c === '{') openCount++;
                    else if (c === '}') {
                      openCount--;
                      if (openCount === 0) { lastBrace = i; break; }
                    }
                  }
                }
                if (lastBrace > firstBrace) {
                  playerResponse = JSON.parse(text.substring(firstBrace, lastBrace + 1));
                  break;
                }
              }
            }
          }
        }
      }

      if (playerResponse && playerResponse.streamingData) {
        const videoDetails = playerResponse.videoDetails || {};
        const title = videoDetails.title || 'YouTube Video';
        const streamingData = playerResponse.streamingData;
        const formats = [];

        const combined = streamingData.formats || [];
        combined.forEach(f => {
          formats.push({
            formatId: String(f.itag || ('fmt_' + formats.length)),
            resolution: f.qualityLabel || f.quality || 'HD',
            ext: (f.mimeType || '').includes('webm') ? 'webm' : 'mp4',
            formatNote: 'Direct Video + Audio',
            fileSize: parseInt(f.contentLength || 0, 10),
            fps: f.fps || 30,
            isAudioOnly: false,
            title: title
          });
        });

        const adaptive = streamingData.adaptiveFormats || [];
        adaptive.forEach(f => {
          const mime = (f.mimeType || '').toLowerCase();
          const isAudio = mime.startsWith('audio/');
          const isVideo = mime.startsWith('video/');
          formats.push({
            formatId: String(f.itag || ('fmt_' + formats.length)),
            resolution: isAudio ? ('Audio Only (' + (f.audioBitrate || 128) + 'k)') : (f.qualityLabel || 'High Res'),
            ext: (mime.includes('webm') ? (isAudio ? 'webm' : 'webm') : (isAudio ? 'm4a' : 'mp4')),
            formatNote: isAudio ? 'Audio Only Stream' : 'High Res Video',
            fileSize: parseInt(f.contentLength || 0, 10),
            tbr: Math.round((f.bitrate || 0) / 1000),
            fps: f.fps || 0,
            isAudioOnly: isAudio,
            isVideoOnly: isVideo,
            title: title
          });
        });

        if (formats.length > 0) {
          return { success: true, status: 'ok', formats: formats };
        }
      }
    } catch(err) {}
    return null;
  }

  function fetchYouTubeFormatsInBrowser(videoUrl) {
    return new Promise((resolve) => {
      try {
        let videoId = null;
        if (videoUrl.includes('/watch?v=')) {
          videoId = new URL(videoUrl).searchParams.get('v');
        } else if (videoUrl.includes('/shorts/')) {
          videoId = videoUrl.split('/shorts/')[1].split('/')[0].split('?')[0];
        }
        if (!videoId) { resolve(null); return; }

        fetch('https://www.youtube.com/youtubei/v1/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: videoId,
            contentCheckOk: true,
            racyCheckOk: true,
            context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } }
          })
        })
        .then(r => r.json())
        .then(data => {
          if (data && data.streamingData) {
            const videoDetails = data.videoDetails || {};
            const title = videoDetails.title || 'YouTube Video';
            const streamingData = data.streamingData;
            const formats = [];

            const combined = streamingData.formats || [];
            combined.forEach(f => {
              formats.push({
                formatId: String(f.itag || ('fmt_' + formats.length)),
                resolution: f.qualityLabel || f.quality || '360p',
                ext: (f.mimeType || '').includes('webm') ? 'webm' : 'mp4',
                formatNote: 'Direct Video + Audio',
                fileSize: parseInt(f.contentLength || 0, 10),
                fps: f.fps || 30,
                isAudioOnly: false,
                title: title
              });
            });

            const adaptive = streamingData.adaptiveFormats || [];
            adaptive.forEach(f => {
              const mime = (f.mimeType || '').includes('audio/') ? 'audio/' : ((f.mimeType || '').includes('video/') ? 'video/' : '');
              const isAudio = mime.startsWith('audio/');
              const isVideo = mime.startsWith('video/');
              const kbps = Math.round((f.bitrate || 0) / 1000);
              formats.push({
                formatId: String(f.itag || ('fmt_' + formats.length)),
                resolution: isAudio ? ('Audio Only (' + (kbps > 0 ? kbps + 'k' : '128k') + ')') : (f.qualityLabel || 'High Res'),
                ext: (f.mimeType || '').includes('webm') ? (isAudio ? 'webm' : 'webm') : (isAudio ? 'm4a' : 'mp4'),
                formatNote: isAudio ? 'Audio Only Stream' : 'High Res Video',
                fileSize: parseInt(f.contentLength || 0, 10),
                tbr: kbps,
                fps: f.fps || 0,
                isAudioOnly: isAudio,
                isVideoOnly: isVideo,
                title: title
              });
            });

            if (formats.length > 0) {
              resolve({ success: true, status: 'ok', formats: formats });
              return;
            }
          }
          resolve(null);
        })
        .catch(() => resolve(null));
      } catch (e) {
        resolve(null);
      }
    });
  }

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

    // Fast-path 0ms DOM extraction on watch pages
    if (window.location.pathname.startsWith('/watch') || window.location.pathname.startsWith('/shorts')) {
      const domResult = parseYtInitialPlayerResponseFromDOM();
      if (domResult && domResult.formats.length > 0) {
        ytDlpCache[url] = { status: 'done', data: domResult, callbacks: [] };
        callback(domResult);
        return;
      }
    }

    ytDlpCache[url] = { status: 'loading', callbacks: [callback] };

    // Try browser-native fetch directly from YouTube site inside browser context
    fetchYouTubeFormatsInBrowser(url).then(browserResult => {
      if (browserResult && browserResult.formats && browserResult.formats.length > 0) {
        ytDlpCache[url].status = 'done';
        ytDlpCache[url].data = browserResult;
        ytDlpCache[url].callbacks.forEach(cb => cb(browserResult));
        ytDlpCache[url].callbacks = [];
        return;
      }

      // Fallback to Native Messaging IPC call to Desktop App
      const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: url }, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          ytDlpCache[url].status = 'done';
          ytDlpCache[url].data = res;
          ytDlpCache[url].callbacks.forEach(cb => cb(res));
          ytDlpCache[url].callbacks = [];
        } else {
          ytDlpCache[url].status = 'error';
          const cbs = ytDlpCache[url].callbacks || [];
          delete ytDlpCache[url];
          cbs.forEach(cb => cb(res));
        }
      });
    });
  }

  function renderFormatItems(container, formats, videoUrl, popover) {
    container.innerHTML = '';
    const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

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
    if (!window.location.pathname.startsWith('/watch') && !window.location.pathname.startsWith('/shorts')) return;

    const videoUrl = getCanonicalUrl(window.location.href);
    // Immediately prefetch formats for the active watch video page in background
    fetchYtDlpFormats(videoUrl, () => {});

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
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
        .idm-banner {
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(248, 250, 252, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 6px;
          padding: 6px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
          opacity: 0.5;
          transition: opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
          user-select: none;
        }
        .idm-banner:hover {
          opacity: 1.0;
          background: rgba(15, 23, 42, 0.95);
          border-color: #38bdf8;
          color: #ffffff;
          box-shadow: 0 6px 22px rgba(56, 189, 248, 0.6);
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

    fetchYtDlpFormats(videoUrl, () => {});

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

      fetchYtDlpFormats(videoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, videoUrl, popover);
        } else if (res && res.success === false) {
          const errMsg = res.error 
            ? (res.error.includes("not running") 
                ? "SmartDM App is not running.<br><span style='font-size:10px; color:#94a3b8;'>Please open SmartDM desktop app.</span>" 
                : res.error + "<br><span style='font-size:10px; color:#94a3b8;'>Click to retry or check SmartDM app.</span>")
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
    const thumbnailElements = document.querySelectorAll('ytd-thumbnail, ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, a#thumbnail, yt-lockup-view-model, a.yt-lockup-view-model__content-image');
    thumbnailElements.forEach((el) => {
      const container = el.closest('ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-grid-playlist-renderer, ytd-thumbnail, yt-lockup-view-model') || el;
      if (container.getAttribute('data-smartdm-scanned')) return;
      container.setAttribute('data-smartdm-scanned', 'true');

      let thumbAnchor = container.querySelector('a#thumbnail, a.ytd-thumbnail, a.yt-lockup-view-model__content-image, a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!thumbAnchor && container.tagName === 'A') {
        thumbAnchor = container;
      }
      if (thumbAnchor && !thumbAnchor.closest('#player, #movie_player, .html5-video-player')) {
        const rawUrl = thumbAnchor.getAttribute('href') || thumbAnchor.href;
        if (rawUrl && (rawUrl.includes('/watch?v=') || rawUrl.includes('/shorts/'))) {
          container.addEventListener('mouseenter', () => {
            fetchYtDlpFormats(getCanonicalUrl(rawUrl), () => {});
          });
        }
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

    const host = document.createElement('div');
    host.className = 'smartdm-host';
    host.style.position = 'absolute';
    host.style.top = '6px';
    host.style.right = '6px';
    host.style.zIndex = '99999';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
        .badge-btn {
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(248, 250, 252, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 6px;
          padding: 4px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          opacity: 0.5;
          transition: opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
        }
        .badge-btn:hover {
          opacity: 1.0;
          background: rgba(15, 23, 42, 0.95);
          color: #ffffff;
          border-color: #38bdf8;
          box-shadow: 0 6px 20px rgba(56, 189, 248, 0.6);
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

    btn.addEventListener('mouseenter', () => {
      const rawUrl = anchor.getAttribute('href') || anchor.href || window.location.href;
      if (rawUrl && (rawUrl.includes('/watch?v=') || rawUrl.includes('/shorts/'))) {
        fetchYtDlpFormats(getCanonicalUrl(rawUrl), () => {});
      }
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const rawUrl = anchor.getAttribute('href') || anchor.href || window.location.href;
      if (!rawUrl || (!rawUrl.includes('/watch?v=') && !rawUrl.includes('/shorts/'))) return;
      const currentVideoUrl = getCanonicalUrl(rawUrl);

      const isActive = popover.classList.contains('active');
      document.querySelectorAll('.smartdm-host, .smartdm-player-host').forEach((h) => {
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

      content.innerHTML = `
        <div class="spinner-container" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 0;">
          <div class="spinner" style="width:14px; height:14px; border:2px solid rgba(56,189,248,0.2); border-top-color:#38bdf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
          <span class="status-text" style="font-size:11px; color:#94a3b8; padding:0;">Searching for video formats...</span>
        </div>
      `;

      fetchYtDlpFormats(currentVideoUrl, (res) => {
        if (res && (res.success || res.status === 'ok') && res.formats && res.formats.length > 0) {
          renderFormatItems(content, res.formats, currentVideoUrl, popover);
        } else if (res && (res.status === 'error' || res.success === false)) {
          const errMsg = (res.message && res.message.includes("not connect")) 
            ? "SmartDM App is not running.<br><span style='font-size:10px; color:#94a3b8;'>Please launch SmartDM desktop app.</span>" 
            : "Could not extract formats.<br><span style='font-size:10px; color:#94a3b8;'>Click to retry.</span>";
          content.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">' + errMsg + '</div>';
        } else {
          content.innerHTML = '<div class="status-text" style="padding:6px 0; color:#94a3b8;">No media formats detected.</div>';
        }
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
