(function () {
  'use strict';

  // Do not run on YouTube (YouTube has its dedicated overlay script)
  if (window.location.hostname.includes('youtube.com')) return;



  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1.0) return mb.toFixed(1) + ' MB';
    const kb = bytes / 1024;
    return kb.toFixed(0) + ' KB';
  }

  const PLAYER_PROCESSED_ATTR = 'data-smartdm-universal-attached';
  const THUMB_PROCESSED_ATTR = 'data-smartdm-universal-thumb-attached';

  const ytDlpCache = {};

  function sendExtensionMessage(message, callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn('sendExtensionMessage error:', err.message);
        }
        if (callback) callback(err ? { success: false, error: err.message } : (res || { success: false, error: 'Empty response' }));
      });
    } else {
      if (callback) callback({ success: false, error: 'Extension API not found' });
    }
  }

  function prefetchYtDlpFormats(url) {
    if (!ytDlpCache[url]) {
      ytDlpCache[url] = { status: 'fetching', formats: null, callbacks: [] };
      sendExtensionMessage({ type: 'GET_MEDIA_FORMATS', url: url }, (res) => {
        if (res && (res.success || res.status === 'ok') && res.formats && res.formats.length > 0) {
          ytDlpCache[url].status = 'done';
          ytDlpCache[url].formats = res;
          ytDlpCache[url].callbacks.forEach(cb => cb(res));
          ytDlpCache[url].callbacks = [];
        } else {
          ytDlpCache[url].status = 'error';
          const cbs = ytDlpCache[url].callbacks || [];
          delete ytDlpCache[url];
          cbs.forEach(cb => cb(res));
        }
      });
    }
  }

  function getCachedYtDlpFormats(url, callback) {
    if (ytDlpCache[url] && ytDlpCache[url].status === 'error') {
      delete ytDlpCache[url];
    }
    if (!ytDlpCache[url]) {
      prefetchYtDlpFormats(url);
    }
    if (ytDlpCache[url].status === 'done') {
      callback(ytDlpCache[url].formats);
    } else {
      ytDlpCache[url].callbacks.push(callback);
    }
  }


  function initUniversalOverlay() {
    const observer = new MutationObserver(() => {
      scanPlayers();
      scanThumbnails();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanPlayers();
    scanThumbnails();
  }

  function scanPlayers() {
    const mediaElements = document.querySelectorAll('video:not([' + PLAYER_PROCESSED_ATTR + ']), audio:not([' + PLAYER_PROCESSED_ATTR + '])');
    mediaElements.forEach(attachUniversalBanner);
  }

  function isThumbnailVideo(mediaEl) {
    if (!mediaEl) return false;
    
    const host = window.location.hostname.toLowerCase();
    if (host.includes('facebook.com') || host.includes('instagram.com') || host.includes('tiktok.com') || host.includes('twitter.com') || host.includes('x.com')) {
      return false; // Social media feed videos are always main videos
    }

    // A main video usually has controls, or is large.
    if (mediaEl.hasAttribute('controls')) return false;
    
    // If it's a large video, it's almost certainly the main player, not a thumbnail preview.
    if (mediaEl.offsetWidth >= 500 || mediaEl.offsetHeight >= 400) return false;

    // Check if it's inside a link (most thumbnails are wrapped in a tags)
    let el = mediaEl;
    let depth = 0;
    while(el && el !== document.body && depth < 5) {
        if (el.tagName === 'A') return true;
        el = el.parentElement;
        depth++;
    }

    // Check dimensions - thumbnail preview videos are small/medium grid cards
    if (mediaEl.offsetWidth > 0 && mediaEl.offsetWidth < 500) {
      const parentCard = mediaEl.closest('.videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, article, li, .card, .thumb, [class*="thumb"], [class*="card"], [class*="grid"], [class*="item"]');
      if (parentCard) return true;
    }

    // Fallback: check classes for explicit thumbnail indicators
    let current = mediaEl;
    depth = 0;
    while (current && current.parentElement && depth < 8) {
      current = current.parentElement;
      const cls = (current.className || '').toString().toLowerCase();
      const id = (current.id || '').toString().toLowerCase();
      
      // Be more restrictive: only match if it explicitly says 'thumb' or 'preview'
      if (cls.includes('thumb') || cls.includes('preview') || id.includes('thumb') || id.includes('preview')) {
        return true;
      }
      depth++;
    }

    return false;
  }

  function findTopPlayerContainer(mediaEl) {
    const hostDomain = window.location.hostname.toLowerCase();
    if (hostDomain.includes('instagram.com') || hostDomain.includes('facebook.com') || hostDomain.includes('tiktok.com') || hostDomain.includes('twitter.com') || hostDomain.includes('x.com')) {
      return document.body;
    }

    let current = mediaEl;
    let container = mediaEl.parentElement || mediaEl;
    let depth = 0;

    // Look for common video player wrapper classes
    while (current && current.parentElement && current.parentElement !== document.body && depth < 8) {
      current = current.parentElement;
      const tag = current.tagName.toLowerCase();
      const cls = (current.className || '').toString().toLowerCase();
      
      if (tag === 'article' || current.getAttribute('role') === 'dialog' || current.getAttribute('role') === 'region') {
        container = current;
        break;
      }

      if (cls.includes('player') || cls.includes('video-wrapper') || cls.includes('vjs-') || cls.includes('plyr') || cls.includes('html5-video-container')) {
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
    const container = findTopPlayerContainer(mediaEl);
    if (container !== document.body && container.querySelector('.smartdm-universal-host')) return;
    mediaEl.setAttribute(PLAYER_PROCESSED_ATTR, 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-universal-host';
    
    if (container === document.body) {
      host.style.setProperty('position', 'fixed', 'important');
      host.style.setProperty('z-index', '2147483647', 'important');
      host.style.setProperty('pointer-events', 'auto', 'important');
      
      const syncPos = () => {
        if (!mediaEl || !mediaEl.isConnected) {
          if (host.parentNode) host.parentNode.removeChild(host);
          return;
        }
        let targetEl = mediaEl;
        let rect = targetEl.getBoundingClientRect();
        if ((rect.width === 0 || rect.height === 0) && mediaEl.parentElement) {
          targetEl = mediaEl.parentElement;
          rect = targetEl.getBoundingClientRect();
        }
        
        if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
          host.style.display = 'none';
        } else {
          host.style.display = 'block';
          host.style.opacity = '1';
          host.style.pointerEvents = 'auto';
          host.style.top = Math.max(16, rect.top + 16) + 'px';
          const bannerWidth = host.offsetWidth || 160;
          host.style.left = Math.max(16, rect.right - bannerWidth - 16) + 'px';
        }
      };
      
      window.addEventListener('scroll', syncPos, true);
      window.addEventListener('resize', syncPos);
      setInterval(syncPos, 100);
      setTimeout(syncPos, 50);
    } else {
      host.style.setProperty('position', 'absolute', 'important');
      host.style.setProperty('top', '16px', 'important');
      host.style.setProperty('right', '16px', 'important');
      host.style.setProperty('z-index', '2147483647', 'important');
      host.style.setProperty('pointer-events', 'auto', 'important');
    }

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          z-index: 2147483647 !important;
          pointer-events: auto !important;
        }
        .idm-banner {
          background: rgba(15, 23, 42, 0.5) !important;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: rgba(248, 250, 252, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 6px;
          padding: 6px 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer !important;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
          opacity: 0.5;
          transition: opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
          user-select: none;
          pointer-events: auto !important;
          position: relative !important;
          z-index: 2147483647 !important;
        }
        .idm-banner:active {
          cursor: grabbing;
        }
        .idm-banner:hover {
          opacity: 1.0 !important;
          background: rgba(15, 23, 42, 0.95) !important;
          border-color: #38bdf8 !important;
          color: #ffffff !important;
          box-shadow: 0 6px 22px rgba(56, 189, 248, 0.6) !important;
          transform: translateY(-1px);
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

    function resolveCurrentMediaUrl(mEl) {
      let pageUrl = window.location.href;
      const hostLower = window.location.hostname.toLowerCase();
      const isFb = hostLower.includes('facebook.com');
      const isIg = hostLower.includes('instagram.com');
      const isX = hostLower.includes('x.com') || hostLower.includes('twitter.com');
      const isTt = hostLower.includes('tiktok.com');

      const isVideoLink = (href) => {
        if (!href) return false;
        const h = href.toLowerCase();
        if (isIg) {
          if (h.includes('/audio/') || h.includes('/music/')) return false;
          return /\/(p|reel|reels|tv)\/[\w\-]+/.test(h) || h.includes('/stories/');
        }
        if (isFb) {
          return h.includes('/watch') || h.includes('/reel/') || h.includes('/reels/') || h.includes('/videos/') ||
                 h.includes('fb.watch') || h.includes('story_fbid=') || h.includes('fbid=') ||
                 h.includes('/posts/') || h.includes('/permalink') || h.includes('/share/v/') ||
                 h.includes('/share/r/') || h.includes('/share/p/');
        }
        if (isX) return h.includes('/status/');
        if (isTt) return h.includes('/video/') || h.includes('/@');
        return false;
      };

      if (isFb || isIg || isX || isTt) {
        if (isVideoLink(pageUrl)) {
          if (isIg) pageUrl = pageUrl.replace('/reels/', '/reel/');
          if (isFb) pageUrl = pageUrl.replace('/reels/', '/reel/');
          return pageUrl;
        }

        let el = mEl;
        let found = false;
        while (el && el !== document.body) {
          if (el.tagName === 'A' && isVideoLink(el.href)) {
            pageUrl = el.href;
            found = true;
            break;
          }
          el = el.parentElement;
        }

        if (!found && mEl) {
          const card = mEl.closest('[data-pagelet*="FeedUnit"], [role="feed"] > div, [role="article"], article, section, [data-video-id], div[class*="x1yztall"]');
          if (card) {
            const links = card.querySelectorAll('a[href]');
            for (let i = 0; i < links.length; i++) {
              if (isVideoLink(links[i].href)) {
                pageUrl = links[i].href;
                found = true;
                break;
              }
            }
          }
        }

        if (!found && mEl) {
          let currentParent = mEl.parentElement;
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
      }
      if (isIg && pageUrl) pageUrl = pageUrl.replace('/reels/', '/reel/');
      if (isFb && pageUrl) pageUrl = pageUrl.replace('/reels/', '/reel/');
      return pageUrl;
    }

    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evtName => {
      bannerBtn.addEventListener(evtName, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    });

    bannerBtn.addEventListener('mouseenter', () => {
      prefetchYtDlpFormats(resolveCurrentMediaUrl(mediaEl));
    });

    let formatSearchInterval = null;
    let formatSearchTimeout = null;

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const pageUrl = resolveCurrentMediaUrl(mediaEl);

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
          <span class="status-text" style="padding:0;">Searching for video formats...</span>
        </div>
      `;

      let directSrc = mediaEl.currentSrc || mediaEl.src;
      if (!directSrc || directSrc.startsWith('blob:')) {
        const sourceChild = mediaEl.querySelector('source');
        if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
          directSrc = sourceChild.src;
        }
      }

      let hasFound = false;

      // Async query yt-dlp formats (uses cache for instant response)
      getCachedYtDlpFormats(pageUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          hasFound = true;
          if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
          renderUniversalFormats(content, res.formats, [], pageUrl, popover);
        } else {
          // yt-dlp failed or no formats, try network streams
          chrome.runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
            let netMedia = (netRes && netRes.media) ? netRes.media : [];
            netMedia = netMedia.filter(m => {
              const urlLower = m.url.toLowerCase();
              return !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.ts');
            });

            if (netMedia.length > 0) {
              hasFound = true;
              if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
              renderUniversalFormats(content, [], netMedia, pageUrl, popover);
            } else if (directSrc && directSrc.startsWith('http')) {
              hasFound = true;
              if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
              const fallbackFormats = [{
                format_id: 'direct_stream',
                format_note: 'Direct Media Stream',
                ext: directSrc.includes('.webm') ? 'webm' : 'mp4',
                resolution: 'Direct Video Stream (HD)',
                filesize: 0,
                url: directSrc
              }];
              renderUniversalFormats(content, fallbackFormats, [], pageUrl, popover);
            } else {
              if (formatSearchTimeout) clearTimeout(formatSearchTimeout);
              content.innerHTML = '<div class="status-text">No media formats detected.</div>';
            }
          });
        }
      });

      formatSearchTimeout = setTimeout(() => {
        if (!hasFound) {
          if (directSrc && directSrc.startsWith('http')) {
            hasFound = true;
            const fallbackFormats = [{
              format_id: 'direct_stream',
              format_note: 'Direct Media Stream',
              ext: directSrc.includes('.webm') ? 'webm' : 'mp4',
              resolution: 'Direct Video Stream (HD)',
              filesize: 0,
              url: directSrc
            }];
            renderUniversalFormats(content, fallbackFormats, [], pageUrl, popover);
          } else {
            content.innerHTML = '<div class="status-text">No media formats detected. Timeout.</div>';
          }
        }
      }, 10000);
    });

    container.appendChild(host);
  }

  function renderUniversalFormats(container, ytDlpFormats, netMediaList, pageUrl, popover) {
    container.innerHTML = '';

    const hostDomain = window.location.hostname.toLowerCase();
    if (hostDomain.includes('netflix.com')) {
      container.innerHTML = '<div class="status-text">No media formats detected.</div>';
      return;
    }

    const rawItems = [];

    // 1. Add yt-dlp extracted quality/resolution formats
    ytDlpFormats.forEach(fmt => {
      const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
      const ext = (fmt.ext || 'MP4').toUpperCase();
      const formattedSize = formatSize(fmt.fileSize);
      const sizeText = formattedSize ? formattedSize : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      rawItems.push({
        title: `${resolution} (${ext})`,
        badge: sizeText,
        url: pageUrl,
        formatId: fmt.formatId,
        fileName: null
      });
    });

    // 2. Add network-intercepted media streams if yt-dlp produced no formats
    if (ytDlpFormats.length === 0 && netMediaList.length > 0) {
      netMediaList.forEach((m, idx) => {
        const ext = (m.filename.includes('.') ? m.filename.substring(m.filename.lastIndexOf('.') + 1) : 'MP4').toUpperCase();
        const formattedSize = formatSize(m.contentLength);
        const sizeText = m.customBadge || (formattedSize ? formattedSize : 'Stream');

        let qualityName = m.customTitle || '';
        if (!qualityName) {
          const lowerUrl = m.url.toLowerCase();
          if (lowerUrl.includes('1080') || lowerUrl.includes('hd')) qualityName = `1080p HD (${ext})`;
          else if (lowerUrl.includes('720')) qualityName = `720p HD (${ext})`;
          else if (lowerUrl.includes('480')) qualityName = `480p (${ext})`;
          else if (lowerUrl.includes('360')) qualityName = `360p (${ext})`;
          else qualityName = `Video Stream ${idx + 1} (${ext})`;
        }

        rawItems.push({
          title: qualityName,
          badge: sizeText,
          url: m.url,
          videoUrl: m.videoUrl || null,
          audioUrl: m.audioUrl || null,
          formatId: m.formatId || (m.customTitle ? m.customTitle.replace(/[^0-9p]/g, '') : 'best'),
          fileName: m.filename
        });
      });
    }

    // Deduplicate items strictly by title so we never show duplicate 1080p HD rows
    const seenTitles = new Set();
    const allItems = [];
    rawItems.forEach(item => {
      if (!seenTitles.has(item.title)) {
        seenTitles.add(item.title);
        allItems.push(item);
      }
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
            videoUrl: item.videoUrl || null,
            audioUrl: item.audioUrl || null,
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

  // --- GLOBAL CLICK INTERCEPTOR FOR FILE DOWNLOADS ---
  function initGlobalClickInterceptor() {
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      
      try {
        let el = e.target;
        let depth = 0;
        while (el && el !== document.body && depth < 10) {
          if (el.tagName && (el.tagName.toUpperCase() === 'A' || el.tagName.toUpperCase() === 'SVG')) {
            let rawHref = el.href;
            let hrefStr = '';
            if (typeof rawHref === 'string') {
              hrefStr = rawHref;
            } else if (rawHref && typeof rawHref.baseVal === 'string') {
              hrefStr = rawHref.baseVal;
            } else if (el.getAttribute) {
              hrefStr = el.getAttribute('href') || '';
            }

            if (hrefStr && typeof hrefStr === 'string') {
              const urlLower = hrefStr.toLowerCase();
              const isFileExt = urlLower.match(/\.(zip|rar|7z|exe|msi|iso|bin|mp4|mkv|avi|mp3|flac|wav|pdf|epub|mobi|apk|tar|gz|bz2)(\?.*)?$/i);
              const isDownloadAttr = el.hasAttribute && el.hasAttribute('download');
              
              if ((isFileExt || isDownloadAttr) && urlLower.startsWith('http')) {
                e.preventDefault();
                e.stopPropagation();
                
                let basename = '';
                try {
                  basename = new URL(hrefStr).pathname.split('/').pop();
                } catch(err) {}
                
                const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
                runtime.sendMessage({
                  type: 'ADD_DOWNLOAD',
                  url: hrefStr,
                  fileName: basename || null,
                  referer: window.location.href
                });
                return;
              }
            }
          }
          el = el.parentElement || el.parentNode;
          depth++;
        }
      } catch (err) {
        // Never swallow errors to ensure web page clicks remain 100% functional
      }
    }, true);
  }

  // --- THUMBNAIL HOVER DOWNLOAD OVERLAY FOR MEDIA SITES ---
  function scanThumbnails() {
    const host = window.location.hostname.toLowerCase();
    // Do NOT attach thumbnail badges on social feed platforms (Facebook, Instagram, TikTok, Twitter/X)
    if (host.includes('facebook.com') || host.includes('instagram.com') || host.includes('tiktok.com') || host.includes('twitter.com') || host.includes('x.com')) {
      return;
    }

    const selectors = [
      'a[href*="/view_video.php"]',
      'a[href*="/video-"]',
      'a[href*="/videos/"]',
      'a[href*="/video/"]',
      'a[href*="/watch/"]',
      '.ph-thumbnail',
      '.videoCard',
      '.thumb'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    elements.forEach((el) => {
      // Find outermost card container to prevent multiple buttons on the same video card
      const cardContainer = el.closest('.videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, article, li, .card, .thumb') || el;
      if (cardContainer.getAttribute(THUMB_PROCESSED_ATTR)) return;
      cardContainer.setAttribute(THUMB_PROCESSED_ATTR, 'true');

      let videoUrl = el.href;
      if (!videoUrl) {
        const link = cardContainer.querySelector('a[href*="/view_video.php"], a[href*="/video-"], a[href*="/videos/"], a[href*="/video/"], a[href*="/watch/"]');
        if (link) videoUrl = link.href;
      }
      if (!videoUrl) return;

      attachThumbnailBadge(cardContainer, videoUrl);
    });
  }

  function attachThumbnailBadge(containerEl, videoUrl) {
    if (!videoUrl) return;
    if (!videoUrl) return;

    if (window.getComputedStyle(containerEl).position === 'static') {
      containerEl.style.position = 'relative';
    }

    const host = document.createElement('div');
    host.className = 'smartdm-universal-host';
    host.style.position = 'absolute';
    host.style.top = '16px';
    host.style.right = '16px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .thumb-btn {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.6);
          border-radius: 5px;
          padding: 4px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          opacity: 0.85;
          transition: opacity 0.2s ease, background 0.2s ease, border-color 0.2s ease;
          user-select: none;
        }
        :host(:hover) .thumb-btn, .thumb-btn:hover {
          opacity: 1;
          background: rgba(2, 132, 199, 0.95);
          border-color: #38bdf8;
          box-shadow: 0 4px 16px rgba(56, 189, 248, 0.6);
        }
        .icon {
          width: 12px;
          height: 12px;
          fill: none;
          stroke: #38bdf8;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .thumb-btn:hover .icon {
          stroke: #ffffff;
        }
        .popover {
          position: absolute;
          top: 28px;
          right: 0;
          width: 260px;
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 8px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
          display: none;
          flex-direction: column;
          gap: 5px;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          z-index: 999999;
        }
        .popover.active {
          display: flex;
        }
        .popover-title {
          font-weight: 700;
          color: #38bdf8;
          font-size: 11px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 4px;
          margin-bottom: 3px;
        }
        .popover-content {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-right: 2px;
        }
        .format-item {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          padding: 6px 8px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .format-item:hover {
          background: rgba(56, 189, 248, 0.3);
          border-color: #38bdf8;
        }
        .format-title {
          font-weight: 700;
          color: #f8fafc;
        }
        .format-badge {
          font-size: 10px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.15);
          padding: 2px 5px;
          border-radius: 3px;
        }
        .status-text {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          padding: 8px;
        }
      </style>
      <button class="thumb-btn">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
      </button>
      <div class="popover">
        <div class="popover-title">Download Video</div>
        <div class="popover-content">
          <div class="status-text">Fetching resolutions...</div>
        </div>
      </div>
    `;

    const thumbBtn = shadow.querySelector('.thumb-btn');
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

    thumbBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });

    let thumbInterval = null;
    let thumbTimeout = null;

    thumbBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        if (thumbInterval) clearInterval(thumbInterval);
        if (thumbTimeout) clearTimeout(thumbTimeout);
        return;
      }

      popover.classList.add('active');
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Searching for video formats...</span>
        </div>
      `;

      let hasFound = false;

      // We do not use network-intercepted media for thumbnails on tube sites.
      // Tube site thumbnail hovers always use yt-dlp to get the full video.


      // Async query yt-dlp formats (uses cache for instant response)
      getCachedYtDlpFormats(videoUrl, (res) => {
        if (res && res.success && res.formats && res.formats.length > 0) {
          hasFound = true;
          if (thumbInterval) clearInterval(thumbInterval);
          if (thumbTimeout) clearTimeout(thumbTimeout);
          renderThumbnailFormats(content, res.formats, [], videoUrl, popover);
        } else if (res && res.success === false) {
          hasFound = true;
          if (thumbInterval) clearInterval(thumbInterval);
          if (thumbTimeout) clearTimeout(thumbTimeout);
          content.innerHTML = '<div class="status-text" style="color:#f87171; font-weight:600; padding:6px 0;">SmartDM App is not running.<br><span style="font-size:10px; color:#94a3b8;">Please open SmartDM desktop app.</span></div>';
        }
      });

      // 40-second timeout: if no formats found after 40 seconds, display "No media formats detected."
      thumbTimeout = setTimeout(() => {
        if (thumbInterval) clearInterval(thumbInterval);
        if (!hasFound) {
          content.innerHTML = '<div class="status-text">No media formats detected.</div>';
        }
      }, 40000);
    });

    containerEl.appendChild(host);
  }

  function renderThumbnailFormats(container, ytDlpFormats, netMediaList, videoUrl, popover) {
    container.innerHTML = '';
    const rawItems = [];

    if (ytDlpFormats && ytDlpFormats.length > 0) {
      ytDlpFormats.forEach(fmt => {
        const resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
        const ext = (fmt.ext || 'MP4').toUpperCase();
        const formattedSize = formatSize(fmt.fileSize);
        const sizeText = formattedSize ? formattedSize : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

        rawItems.push({
          title: `${resolution} (${ext})`,
          badge: sizeText,
          url: videoUrl,
          formatId: fmt.formatId,
          fileName: null
        });
      });
    }

    if (rawItems.length === 0 && netMediaList && netMediaList.length > 0) {
      netMediaList.forEach((m, idx) => {
        const ext = (m.filename.includes('.') ? m.filename.substring(m.filename.lastIndexOf('.') + 1) : 'MP4').toUpperCase();
        const formattedSize = formatSize(m.contentLength);
        const sizeText = m.customBadge || (formattedSize ? formattedSize : 'Stream');

        let qualityName = m.customTitle || '';
        if (!qualityName) {
          const lowerUrl = m.url.toLowerCase();
          if (lowerUrl.includes('1080') || lowerUrl.includes('hd')) qualityName = `1080p HD (${ext})`;
          else if (lowerUrl.includes('720')) qualityName = `720p HD (${ext})`;
          else if (lowerUrl.includes('480')) qualityName = `480p (${ext})`;
          else if (lowerUrl.includes('360')) qualityName = `360p (${ext})`;
          else qualityName = `Video Stream ${idx + 1} (${ext})`;
        }

        rawItems.push({
          title: qualityName,
          badge: sizeText,
          url: m.url,
          videoUrl: m.videoUrl || null,
          audioUrl: m.audioUrl || null,
          formatId: 'best',
          fileName: m.filename
        });
      });
    }

    // Deduplicate items strictly by title
    const seenTitles = new Set();
    const items = [];
    rawItems.forEach(item => {
      if (!seenTitles.has(item.title)) {
        seenTitles.add(item.title);
        items.push(item);
      }
    });

    if (items.length === 0) {
      container.innerHTML = '<div class="status-text">No media formats detected.</div>';
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'format-item';
      div.innerHTML = `
        <div class="format-info">
          <span class="format-title">${item.title}</span>
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
    document.addEventListener('DOMContentLoaded', () => {
      initUniversalOverlay();
      initGlobalClickInterceptor();
    });
  } else {
    initUniversalOverlay();
    initGlobalClickInterceptor();
  }
})();
