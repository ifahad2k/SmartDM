(function () {
  'use strict';

  const ATTR_ATTACHED = 'data-smartdm-attached';
  const ATTR_PLAYER_ATTACHED = 'data-smartdm-player-attached';
  const ATTR_THUMB_ATTACHED = 'data-smartdm-thumb-attached';

  const mediaFormatCache = {};

  // --- INITIALIZATION ---
  function initSmartDmOverlay() {
    const observer = new MutationObserver(() => {
      scanPlayers();
      scanThumbnails();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    scanPlayers();
    scanThumbnails();
    initGlobalClickInterceptor();
  }

  // --- UTILITY: CANONICAL URL PARSER ---
  function getCanonicalUrl(rawUrl) {
    if (!rawUrl) return window.location.href;
    try {
      const u = new URL(rawUrl, window.location.origin);
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        if (u.pathname.includes('/watch')) {
          const v = u.searchParams.get('v');
          if (v) return 'https://www.youtube.com/watch?v=' + v;
        } else if (u.pathname.includes('/shorts/')) {
          const shortId = u.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
          return 'https://www.youtube.com/shorts/' + shortId;
        }
      } else if (u.hostname.includes('bilibili.com')) {
        if (u.pathname.includes('/video/')) {
          const bvId = u.pathname.split('/video/')[1].split('/')[0].split('?')[0];
          return 'https://www.bilibili.com/video/' + bvId;
        }
      }
      return u.href;
    } catch (e) {
      return window.location.href;
    }
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function derivePageTitleFilename(ext = 'mp4') {
    try {
      let rawTitle = document.title || '';
      if (window.top !== window.self) {
        try {
          if (window.top.document && window.top.document.title) {
            rawTitle = window.top.document.title;
          }
        } catch (e) {}
      }
      if (rawTitle) {
        let clean = rawTitle.replace(/\s*[\-\|\:·]\s*(YouTube Music|YouTube|Bilibili|TikTok|Vimeo|Instagram|Facebook).*$/i, '').trim();
        if (!clean || clean.length < 2) clean = rawTitle;
        clean = clean.replace(/[\\/:*?""<>|]/g, '_').replace(/\s+/g, ' ').trim();
        if (clean.length > 0) {
          const lowerExt = '.' + ext.toLowerCase();
          if (!clean.toLowerCase().endsWith(lowerExt)) {
            return `${clean}${lowerExt}`;
          }
          return clean;
        }
      }
    } catch (e) {}
    return 'video.' + ext.toLowerCase();
  }

  // --- DYNAMIC IN-PAGE METADATA PARSER (TIER 1: SUB-5MS) ---
  function parsePageMetadataFromDOM() {
    try {
      // 1. YouTube streamingData from JS context or DOM scripts
      let ytResponse = null;
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.streamingData) {
        ytResponse = window.ytInitialPlayerResponse;
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
                  try { ytResponse = JSON.parse(text.substring(firstBrace, lastBrace + 1)); break; } catch(e) {}
                }
              }
            }
          }
        }
      }

      if (ytResponse && ytResponse.streamingData) {
        const title = (ytResponse.videoDetails && ytResponse.videoDetails.title) ? ytResponse.videoDetails.title : document.title;
        const formats = [];

        (ytResponse.streamingData.formats || []).forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            formats.push({
              formatId: String(f.itag || ('fmt_' + formats.length)),
              resolution: f.qualityLabel || (f.height ? f.height + 'p' : (f.quality || 'Direct Stream')),
              ext: (f.mimeType || '').includes('webm') ? 'webm' : 'mp4',
              fileSize: parseInt(f.contentLength || 0, 10),
              fps: f.fps || 30,
              isAudioOnly: false,
              title: title,
              url: f.url
            });
          }
        });

        (ytResponse.streamingData.adaptiveFormats || []).forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            const mime = (f.mimeType || '').toLowerCase();
            const isAudio = mime.startsWith('audio/');
            const kbps = Math.round((f.bitrate || 0) / 1000);
            const resLabel = isAudio 
              ? ('Audio Only (' + (kbps > 0 ? kbps + 'k' : 'Source Quality') + ')')
              : (f.qualityLabel || (f.height ? f.height + 'p' : (f.width ? f.width + 'x' + f.height : 'Adaptive Stream')));

            formats.push({
              formatId: String(f.itag || ('fmt_' + formats.length)),
              resolution: resLabel,
              ext: mime.includes('webm') ? (isAudio ? 'webm' : 'webm') : (isAudio ? 'm4a' : 'mp4'),
              fileSize: parseInt(f.contentLength || 0, 10),
              tbr: kbps,
              fps: f.fps || 0,
              isAudioOnly: isAudio,
              title: title,
              url: f.url
            });
          }
        });

        const hasDirectUrls = formats.some(f => f.url && f.url.startsWith('http'));
        if (formats.length > 0 && hasDirectUrls) {
          return { success: true, status: 'ok', title: title, formats: formats };
        }
      }

      // 2. Bilibili window.__playinfo__ extraction
      let biliInfo = null;
      if (window.__playinfo__ && window.__playinfo__.data && window.__playinfo__.data.dash) {
        biliInfo = window.__playinfo__.data.dash;
      } else {
        const scripts = document.querySelectorAll('script');
        for (let s of scripts) {
          if (s.textContent && s.textContent.includes('window.__playinfo__=')) {
            try {
              let jsonStr = s.textContent.split('window.__playinfo__=')[1].split(';</script>')[0].trim();
              let parsed = JSON.parse(jsonStr);
              if (parsed && parsed.data && parsed.data.dash) {
                biliInfo = parsed.data.dash;
                break;
              }
            } catch(e) {}
          }
        }
      }

      if (biliInfo) {
        const formats = [];
        const title = document.title.replace('_bilibili', '').trim();

        (biliInfo.video || []).forEach(v => {
          const resLabel = (v.height ? `${v.height}p` : `${v.width}x${v.height}`) + (v.frameRate && parseInt(v.frameRate, 10) > 30 ? ` ${v.frameRate}fps` : '');
          formats.push({
            formatId: 'bili_' + (v.id || formats.length),
            resolution: resLabel,
            ext: 'mp4',
            fileSize: 0,
            tbr: Math.round((v.bandwidth || 0) / 1000),
            fps: parseInt(v.frameRate || 30, 10),
            isAudioOnly: false,
            title: title,
            url: v.baseUrl
          });
        });

        const audioTrack = biliInfo.audio && biliInfo.audio[0] ? biliInfo.audio[0].baseUrl : null;
        if (audioTrack) {
          formats.forEach(f => { f.audioUrl = audioTrack; });
          formats.push({
            formatId: 'bili_audio',
            resolution: 'Audio Only (Source M4A)',
            ext: 'm4a',
            fileSize: 0,
            tbr: 192,
            isAudioOnly: true,
            title: title,
            url: audioTrack
          });
        }

        if (formats.length > 0) {
          return { success: true, status: 'ok', title: title, formats: formats };
        }
      }
    } catch(e) {}
    return null;
  }

  // --- DYNAMIC FORMAT EXTRACTION ENGINE (3 TIERS) ---
  function fetchMediaFormats(videoUrl, mediaEl, callback) {
    if (!videoUrl) videoUrl = window.location.href;

    if (mediaFormatCache[videoUrl] && mediaFormatCache[videoUrl].status === 'done') {
      callback(mediaFormatCache[videoUrl].data);
      return;
    }

    if (mediaFormatCache[videoUrl] && mediaFormatCache[videoUrl].status === 'loading') {
      mediaFormatCache[videoUrl].callbacks.push(callback);
      return;
    }

    mediaFormatCache[videoUrl] = { status: 'loading', callbacks: [callback] };

    const notifyCallbacks = (result) => {
      const entry = mediaFormatCache[videoUrl];
      if (result && result.formats && result.formats.length > 0) {
        mediaFormatCache[videoUrl] = { status: 'done', data: result, callbacks: [] };
        if (entry && entry.callbacks) entry.callbacks.forEach(cb => { try { cb(result); } catch(e) {} });
      } else {
        delete mediaFormatCache[videoUrl];
        if (entry && entry.callbacks) entry.callbacks.forEach(cb => { try { cb(result); } catch(e) {} });
      }
    };

    // Tier 1: Fast DOM & Page Context Check
    const domRes = parsePageMetadataFromDOM();
    if (domRes && domRes.formats && domRes.formats.length > 0) {
      notifyCallbacks(domRes);
      return;
    }

    // Tier 2: Check captured network media list & active <video> tag
    const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
    runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
      let netMedia = (netRes && netRes.media) ? netRes.media : [];
      let liveSrc = mediaEl ? (mediaEl.currentSrc || mediaEl.src) : null;
      if (mediaEl && (!liveSrc || liveSrc.startsWith('blob:'))) {
        const sourceChild = mediaEl.querySelector('source');
        if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
          liveSrc = sourceChild.src;
        }
      }

      // If active media element or network stream exists
      if (liveSrc || netMedia.length > 0) {
        const formats = [];
        const title = derivePageTitleFilename() || 'Media Stream';

        if (liveSrc && liveSrc.startsWith('http')) {
          const h = mediaEl ? (mediaEl.videoHeight || 0) : 0;
          const w = mediaEl ? (mediaEl.videoWidth || 0) : 0;
          const resText = (h > 0 && w > 0) ? `${h}p (${w}x${h})` : (h > 0 ? `${h}p` : 'Source Stream');
          formats.push({
            formatId: 'live_stream',
            resolution: resText,
            ext: liveSrc.includes('.webm') ? 'webm' : 'mp4',
            fileSize: 0,
            isAudioOnly: false,
            title: title,
            url: liveSrc
          });
        }

        netMedia.forEach((m, idx) => {
          if (liveSrc && m.url === liveSrc) return;
          const ext = (m.filename && m.filename.includes('.') ? m.filename.substring(m.filename.lastIndexOf('.') + 1) : 'mp4').toLowerCase();
          const isAudio = (m.contentType && m.contentType.includes('audio/')) || m.url.includes('.m4a') || m.url.includes('.mp3');
          let resLabel = m.customTitle || '';
          if (!resLabel) {
            if (m.height && m.height > 0) resLabel = m.width ? `${m.height}p (${m.width}x${m.height} ${ext.toUpperCase()})` : `${m.height}p (${ext.toUpperCase()})`;
            else resLabel = isAudio ? `Audio Stream ${idx + 1} (${ext.toUpperCase()})` : `Media Stream ${idx + 1} (${ext.toUpperCase()})`;
          }
          formats.push({
            formatId: 'net_' + idx,
            resolution: resLabel,
            ext: ext,
            fileSize: m.contentLength || 0,
            isAudioOnly: isAudio,
            title: m.filename || title,
            url: m.url
          });
        });

        if (formats.length > 0) {
          notifyCallbacks({ success: true, status: 'ok', title: title, formats: formats });
          return;
        }
      }

      // Tier 3: Service Worker / Native Backend Handshake
      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        if (res && (res.success || res.status === 'ok') && res.formats && res.formats.length > 0) {
          notifyCallbacks(res);
        } else {
          notifyCallbacks({ success: false, status: 'error', message: (res && res.error) ? res.error : 'Could not extract media formats.' });
        }
      });
    });
  }

  // --- RENDER DYNAMIC FORMAT DROPDOWN ITEMS ---
  function renderFormatDropdown(container, formats, videoUrl, popover) {
    container.innerHTML = '';
    const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

    const rawItems = [];

    (formats || []).forEach(fmt => {
      let resolution = fmt.resolution || fmt.qualityLabel || (fmt.isAudioOnly ? 'Audio Only' : 'Video');
      if (resolution === '0' || resolution === '0p' || resolution.includes('0x0')) {
        resolution = fmt.height ? `${fmt.height}p` : 'Source Stream';
      }
      const ext = (fmt.ext || 'MP4').toUpperCase();
      let cleanTitle = resolution;
      if (fmt.fps && fmt.fps > 30) cleanTitle += ` ${fmt.fps}fps`;
      if (!cleanTitle.toUpperCase().includes(ext)) cleanTitle += ` (${ext})`;
      cleanTitle = cleanTitle.replace(/\(([^)]+)\)\s*\(\1\)/gi, '($1)');

      const formattedSize = formatSize(fmt.fileSize);
      const sizeText = formattedSize ? formattedSize : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      let itemFileName = fmt.title ? (fmt.title.toLowerCase().endsWith('.' + ext.toLowerCase()) ? fmt.title : `${fmt.title}.${ext.toLowerCase()}`) : derivePageTitleFilename(ext.toLowerCase());
      itemFileName = itemFileName.replace(/[\\/:*?""<>|]/g, '_');

      rawItems.push({
        title: cleanTitle,
        badge: sizeText,
        url: fmt.url || videoUrl,
        videoUrl: fmt.videoUrl || fmt.url || videoUrl,
        audioUrl: fmt.audioUrl || null,
        formatId: fmt.formatId,
        fileName: itemFileName
      });
    });

    // Append Dynamic MP3 Audio Option for every media item
    if (rawItems.length > 0 && !rawItems.some(item => item.title.includes('Audio Only') || item.title.includes('Audio (MP3)'))) {
      const firstItem = rawItems[0];
      rawItems.push({
        title: 'Audio (MP3 / High Quality)',
        badge: 'Audio Only',
        url: firstItem.url,
        videoUrl: firstItem.videoUrl || null,
        audioUrl: firstItem.audioUrl || null,
        formatId: 'bestaudio/best',
        fileName: derivePageTitleFilename('mp3')
      });
    }

    // Append Dynamic HD Thumbnail Option for media item
    if (rawItems.length > 0 && !rawItems.some(item => item.title.includes('Thumbnail'))) {
      const firstItem = rawItems[0];
      rawItems.push({
        title: 'Thumbnail (Cover Image / HD)',
        badge: 'Image (JPG)',
        url: firstItem.url,
        videoUrl: null,
        audioUrl: null,
        formatId: 'thumbnail',
        fileName: derivePageTitleFilename('jpg')
      });
    }

    // Deduplicate items by title
    const seen = new Set();
    const items = [];
    rawItems.forEach(item => {
      if (!seen.has(item.title)) {
        seen.add(item.title);
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
          <span class="format-title" title="${item.title}">${item.title}</span>
        </div>
        <span class="format-badge">${item.badge}</span>
      `;

      div.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';

        // Find best audio URL and size
        let bestAudioUrl = null;
        let bestAudioSize = 0;
        (formats || []).forEach(f => {
          if (f.isAudioOnly && f.url && f.url.startsWith('http')) {
            if (!bestAudioUrl || f.formatId === '140') {
              bestAudioUrl = f.url;
              bestAudioSize = f.fileSize || 0;
            }
          }
        });

        // Prepare full formats array to transmit to SmartDM desktop app
        const formatsList = (formats || []).map(f => ({
          formatId: String(f.formatId || ''),
          resolution: f.resolution || f.qualityLabel || (f.isAudioOnly ? 'Audio Only' : 'Video'),
          ext: (f.ext || 'mp4').toLowerCase(),
          fileSize: f.fileSize || 0,
          isAudioOnly: !!f.isAudioOnly,
          url: f.url || f.videoUrl || null,
          audioUrl: f.audioUrl || (!f.isAudioOnly ? bestAudioUrl : null)
        }));

        if (!formatsList.some(f => f.formatId === 'bestaudio/best' || (f.isAudioOnly && f.ext === 'mp3'))) {
          formatsList.push({
            formatId: 'bestaudio/best',
            resolution: 'Audio (MP3 / High Quality)',
            ext: 'mp3',
            fileSize: bestAudioSize,
            isAudioOnly: true,
            url: bestAudioUrl || item.audioUrl || item.url || null,
            audioUrl: null
          });
        }

        let thumbUrl = null;
        try {
          const ogImg = document.querySelector('meta[property="og:image"]');
          if (ogImg && ogImg.content) thumbUrl = ogImg.content;
          if (!thumbUrl) {
            const linkImg = document.querySelector('link[rel="image_src"]');
            if (linkImg && linkImg.href) thumbUrl = linkImg.href;
          }
          if (!thumbUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) {
            const vidMatch = videoUrl.match(/[?&]v=([^&#]+)/) || videoUrl.match(/youtu\.be\/([^?&#]+)/) || videoUrl.match(/\/shorts\/([^?&#]+)/);
            if (vidMatch) thumbUrl = `https://i.ytimg.com/vi/${vidMatch[1]}/maxresdefault.jpg`;
          }
        } catch(e) {}

        if (!formatsList.some(f => f.formatId === 'thumbnail')) {
          formatsList.push({
            formatId: 'thumbnail',
            resolution: 'Thumbnail (Cover Image / HD)',
            ext: 'jpg',
            fileSize: 0,
            isAudioOnly: false,
            url: thumbUrl,
            audioUrl: null
          });
        }

        let directDownloadUrl = null;
        if (item.formatId === 'thumbnail') {
          directDownloadUrl = thumbUrl || item.url || videoUrl;
        } else if (item.formatId === 'bestaudio/best') {
          directDownloadUrl = bestAudioUrl || item.audioUrl || item.url || videoUrl;
        } else {
          directDownloadUrl = (item.url && item.url.startsWith('http') && item.url !== videoUrl)
            ? item.url
            : ((item.videoUrl && item.videoUrl.startsWith('http') && item.videoUrl !== videoUrl) ? item.videoUrl : videoUrl);
        }

        const audioUrlToSend = item.audioUrl || (!item.isAudioOnly && item.formatId !== 'thumbnail' ? bestAudioUrl : null);

        runtime.sendMessage({
          type: 'START_MEDIA_DOWNLOAD',
          url: directDownloadUrl,
          videoUrl: item.videoUrl,
          audioUrl: audioUrlToSend,
          formatId: item.formatId,
          fileName: item.fileName,
          formats: formatsList
        }, () => {
          setTimeout(() => popover.classList.remove('active'), 800);
        });
      }, true);

      container.appendChild(div);
    });
  }

  // --- UNIVERSAL PLAYER OVERLAY INJECTOR ---
  function scanPlayers() {
    const mediaElements = document.querySelectorAll('video:not([' + ATTR_PLAYER_ATTACHED + ']), audio:not([' + ATTR_PLAYER_ATTACHED + '])');
    mediaElements.forEach(attachPlayerBanner);
  }

  function attachPlayerBanner(mediaEl) {
    if (mediaEl.getAttribute(ATTR_PLAYER_ATTACHED)) return;
    mediaEl.setAttribute(ATTR_PLAYER_ATTACHED, 'true');

    // Strict filtering: ignore tiny background audio/icon elements
    const rect = mediaEl.getBoundingClientRect();
    if (mediaEl.tagName === 'VIDEO' && rect.height > 0 && rect.height < 60) return;

    const host = document.createElement('div');
    host.className = 'smartdm-player-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';

    const syncPos = () => {
      const r = mediaEl.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) {
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
      } else {
        host.style.opacity = '1';
        host.style.pointerEvents = 'auto';
        host.style.top = (r.top + 16) + 'px';
        host.style.left = (r.right - host.offsetWidth - 16) + 'px';
      }
    };

    window.addEventListener('scroll', syncPos, true);
    window.addEventListener('resize', syncPos);
    setInterval(syncPos, 150);
    setTimeout(syncPos, 50);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
        .banner-btn {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: rgba(248, 250, 252, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 6px;
          padding: 5px 10px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          transition: all 0.2s ease;
          user-select: none;
        }
        .banner-btn:hover {
          background: rgba(15, 23, 42, 0.95);
          border-color: #38bdf8;
          color: #ffffff;
          box-shadow: 0 6px 20px rgba(56, 189, 248, 0.6);
          transform: translateY(-1px);
        }
        .play-icon {
          width: 0; height: 0;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
          border-left: 7px solid #38bdf8;
        }
        .banner-btn:hover .play-icon { border-left-color: #ffffff; }
        .popover {
          position: absolute;
          top: 32px; right: 0;
          width: 270px;
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
          display: none;
          flex-direction: column;
          gap: 6px;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          z-index: 2147483647;
        }
        .popover.active { display: flex; }
        .popover-title {
          font-weight: 700;
          color: #38bdf8;
          font-size: 11px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 6px;
          margin-bottom: 4px;
        }
        .popover-content {
          max-height: 220px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-right: 4px;
        }
        .popover-content::-webkit-scrollbar { width: 4px; }
        .popover-content::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.5); border-radius: 4px; }
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
        .format-info { display: flex; flex-direction: column; gap: 2px; }
        .format-title { font-weight: 700; color: #f8fafc; }
        .format-badge {
          font-size: 10px; font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.15);
          padding: 2px 6px; border-radius: 4px;
        }
        .status-text { font-size: 11px; color: #94a3b8; text-align: center; padding: 8px; }
      </style>
      <button class="banner-btn">
        <span class="play-icon"></span>
        <span>Download Video</span>
      </button>
      <div class="popover">
        <div class="popover-title">SmartDM Universal Formats</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.banner-btn');
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

      const videoUrl = getCanonicalUrl(window.location.href);
      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Searching for video formats...</span>
        </div>
      `;

      fetchMediaFormats(videoUrl, mediaEl, (res) => {
        if (res && res.formats && res.formats.length > 0) {
          renderFormatDropdown(content, res.formats, videoUrl, popover);
        } else {
          content.innerHTML = '<div class="status-text" style="color:#f87171;">No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span></div>';
        }
      });
    });

    document.body.appendChild(host);
  }

  // --- UNIVERSAL THUMBNAIL OVERLAY INJECTOR ---
  function scanThumbnails() {
    const selectors = [
      'ytd-thumbnail',
      'ytd-compact-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'yt-lockup-view-model',
      'ytmusic-responsive-list-item-renderer',
      'ytmusic-two-row-item-renderer',
      '.bili-video-card',
      'a[href*="/video/BV"]',
      'a[href*="/view_video.php"]',
      'a[href*="/video-"]',
      'a[href*="/videos/"]',
      'a[href*="/video/"]',
      'a[href*="/watch/"]',
      'a[href*="/watch?"]',
      '.ph-thumbnail',
      '.videoCard',
      '.video-card',
      '.thumb',
      '[class*="thumbnail"]'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    elements.forEach((el) => {
      const cardContainer = el.closest('.videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb, a') || el;
      
      const rect = cardContainer.getBoundingClientRect();
      if (rect.height < 40) return;

      if (cardContainer.getAttribute(ATTR_THUMB_ATTACHED)) return;
      cardContainer.setAttribute(ATTR_THUMB_ATTACHED, 'true');

      let videoUrl = null;
      if (cardContainer.tagName === 'A' && cardContainer.href) {
        videoUrl = cardContainer.href;
      } else {
        const link = cardContainer.querySelector('a[href*="/watch"], a[href*="/video/"], a[href*="/view_video.php"]');
        if (link) videoUrl = link.href;
      }

      if (!videoUrl) return;
      attachThumbnailBadge(cardContainer, getCanonicalUrl(videoUrl));
    });
  }

  function attachThumbnailBadge(containerEl, videoUrl) {
    if (window.getComputedStyle(containerEl).position === 'static') {
      containerEl.style.position = 'relative';
    }

    const host = document.createElement('div');
    host.className = 'smartdm-thumb-host';
    host.style.position = 'absolute';
    host.style.top = '8px';
    host.style.right = '8px';
    host.style.zIndex = '99999';
    host.style.pointerEvents = 'auto';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 12px; height: 12px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 0; }
        .thumb-btn {
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #f8fafc;
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 5px;
          padding: 4px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          opacity: 0.8;
          transition: all 0.2s ease;
          user-select: none;
        }
        .thumb-btn:hover {
          opacity: 1;
          background: rgba(2, 132, 199, 0.95);
          border-color: #38bdf8;
          box-shadow: 0 4px 16px rgba(56, 189, 248, 0.6);
        }
        .icon { width: 12px; height: 12px; fill: none; stroke: #38bdf8; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
        .thumb-btn:hover .icon { stroke: #ffffff; }
        .popover {
          position: absolute;
          top: 28px; right: 0;
          width: 250px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(16px);
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
        .popover.active { display: flex; }
        .popover-title {
          font-weight: 700; color: #38bdf8; font-size: 11px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 4px; margin-bottom: 3px;
        }
        .popover-content {
          max-height: 190px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 2px;
        }
        .format-item {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          padding: 6px 8px;
          cursor: pointer;
          display: flex; justify-content: space-between; align-items: center;
          transition: background 0.15s;
        }
        .format-item:hover { background: rgba(56, 189, 248, 0.3); border-color: #38bdf8; }
        .format-title { font-weight: 700; color: #f8fafc; }
        .format-badge { font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 5px; border-radius: 3px; }
        .status-text { font-size: 11px; color: #94a3b8; text-align: center; padding: 8px; }
      </style>
      <button class="thumb-btn">
        <svg class="icon" viewBox="0 0 24 24">
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

    const thumbBtn = shadow.querySelector('.thumb-btn');
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

    thumbBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      popover.classList.add('active');
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Searching for video formats...</span>
        </div>
      `;

      fetchMediaFormats(videoUrl, null, (res) => {
        if (res && res.formats && res.formats.length > 0) {
          renderFormatDropdown(content, res.formats, videoUrl, popover);
        } else {
          content.innerHTML = '<div class="status-text" style="color:#f87171;">No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span></div>';
        }
      });
    });

    containerEl.appendChild(host);
  }

  // --- GLOBAL CLICK INTERCEPTOR FOR DIRECT FILE DOWNLOADS ---
  function initGlobalClickInterceptor() {
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      try {
        let el = e.target;
        let depth = 0;
        while (el && el !== document.body && depth < 10) {
          if (el.tagName && (el.tagName.toUpperCase() === 'A' || el.tagName.toUpperCase() === 'SVG')) {
            let hrefStr = el.href || el.getAttribute('href') || '';
            if (hrefStr && typeof hrefStr === 'string') {
              const urlLower = hrefStr.toLowerCase();
              const isFileExt = urlLower.match(/\.(zip|rar|7z|exe|msi|iso|bin|mp4|mkv|avi|mp3|flac|wav|pdf|epub|mobi|apk|tar|gz|bz2)(\?.*)?$/i);
              const isDownloadAttr = el.hasAttribute && el.hasAttribute('download');
              
              if ((isFileExt || isDownloadAttr) && urlLower.startsWith('http')) {
                e.preventDefault();
                e.stopPropagation();
                
                let basename = '';
                try { basename = new URL(hrefStr).pathname.split('/').pop(); } catch(err) {}
                
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
      } catch (err) {}
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartDmOverlay);
  } else {
    initSmartDmOverlay();
  }
})();
