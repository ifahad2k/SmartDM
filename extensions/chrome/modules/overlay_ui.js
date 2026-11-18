// SmartDM Overlay UI Renderer
// Encapsulates Shadow DOM creation, button rendering, safe DOM construction (zero innerHTML for titles), and popovers

class OverlayUiRenderer {
  static icon(name) {
    const paths = {
      download: '<path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/>',
      arrow: '<path d="M12 4v16m-5-5 5 5 5-5"/>',
      film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4M17 8h4m-4 8h4"/>',
      audio: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
      grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>'
    };
    return `<svg class="smartdm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.download}</svg>`;
  }

  static headerMarkup() {
    return '<span>Download</span><span class="smartdm-brand">SmartDM</span>';
  }

  static sectionMarkup() {
    return `<div class="format-section">${this.icon('film')}<span>Video</span></div>`;
  }

  static bindAppearance(shadow) {
    if (typeof OverlayAppearance !== 'undefined') OverlayAppearance.apply(shadow.host);
  }

  static updateSize(row, item) {
    const label = row.querySelector('.format-size');
    if (!label) return;
    const display = () => {
      label.textContent = item.sizeBytes > 0 ? (item.sizeEstimated ? '≈ ' : '') + SmartDmUtils.formatSize(item.sizeBytes)
        : item.formatId === 'bestaudio/best' ? 'Size after conversion' : 'Size unknown';
    };
    display();
    const api = globalThis.chrome || globalThis.browser;
    if (item.sizeBytes > 0 || item.isStream || item.formatId === 'thumbnail' || item.formatId === 'bestaudio/best' || row._smartdm_size_pending || !api?.runtime?.sendMessage) return;
    row._smartdm_size_pending = true;
    label.textContent = 'Checking size…';
    try {
      api.runtime.sendMessage({type:'GET_MEDIA_SIZE',url:item.videoUrl || item.url,audioUrl:item.audioUrl,referer:item.referer}, response => {
        row._smartdm_size_pending = false;
        if (row.isConnected === false) return;
        if (row._formatData?.url !== item.url || row._formatData?.audioUrl !== item.audioUrl) { OverlayUiRenderer.updateSize(row, row._formatData); return; }
        const size = response?.fileSize;
        if (!api.runtime.lastError && response?.success && Number.isSafeInteger(size) && size > 0) {
          item.sizeBytes = size;
          if (row._formatData) row._formatData.sizeBytes = size;
        }
        display();
      });
    } catch (_) { row._smartdm_size_pending = false; display(); }
  }

  static makeDraggable(host, button, popover) {
    let pointer = null, suppressClick = false;
    button.title = 'Click for downloads. Drag to move, or use Alt + arrow keys when focused.';

    const place = () => {
      const position = host._smartdm_drag_position;
      if (!position) return false;
      position.left = Math.max(6, Math.min(position.left, window.innerWidth - position.width - 6));
      position.top = Math.max(6, Math.min(position.top, window.innerHeight - position.height - 6));
      Object.assign(host.style, { position: 'fixed', left: position.left + 'px', top: position.top + 'px',
        right: 'auto', bottom: 'auto', width: 'max-content', zIndex: '2147483647' });
      return true;
    };
    host._smartdm_apply_drag_position = place;

    const move = (left, top, rect) => {
      // Escape card overflow/transform containment while retaining the original media binding.
      const root = document.fullscreenElement || document.webkitFullscreenElement || document.body;
      if (host.parentNode !== root) {
        root.appendChild(host);
        if (pointer) {
          try { button.setPointerCapture(pointer.id); } catch (_) { /* Keep document tracking if capture is unavailable. */ }
        }
      }
      host._smartdm_drag_position = { left, top, width: rect.width, height: rect.height };
      popover.classList.remove('active');
      popover.style.position = 'fixed';
      host._smartdm_stop_poll?.();
      place();
    };
    const onMove = event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(dx, dy) < 5) return;
      pointer.moved = true;
      event.preventDefault();
      event.stopPropagation();
      move(pointer.rect.left + dx, pointer.rect.top + dy, pointer.rect);
    };
    const finish = event => {
      if (!pointer || (event && event.pointerId !== pointer.id)) return;
      suppressClick = pointer.moved;
      try { button.releasePointerCapture(pointer.id); } catch (_) { /* Capture may end on reparent/cancel. */ }
      pointer = null;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('blur', onBlur);
    };
    const onBlur = () => finish();
    const onDown = event => {
      if (event.button !== 0 || event.isPrimary === false || pointer) return;
      suppressClick = false;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        rect: button.getBoundingClientRect(), moved: false };
      event.stopPropagation();
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* Document listeners still track the drag. */ }
      document.addEventListener('pointermove', onMove, { capture: true, passive: false });
      document.addEventListener('pointerup', finish, true);
      document.addEventListener('pointercancel', finish, true);
      window.addEventListener('blur', onBlur);
    };
    const onClick = event => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onKey = event => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      move(rect.left + delta[0], rect.top + delta[1], rect);
    };
    button.addEventListener('pointerdown', onDown, true);
    button.addEventListener('click', onClick, true);
    button.addEventListener('keydown', onKey);
    return () => {
      finish();
      button.removeEventListener('pointerdown', onDown, true);
      button.removeEventListener('click', onClick, true);
      button.removeEventListener('keydown', onKey);
    };
  }

  static positionPopover(popover, rect, width, height) {
    const margin = 8, panelWidth = Math.min(312, Math.max(0, width - margin * 2));
    const panelHeight = Math.min(400, Math.max(0, height - margin * 2));
    popover.style.position = 'fixed';
    popover.style.left = Math.max(margin, Math.min(rect.right - panelWidth, width - panelWidth - margin)) + 'px';
    popover.style.top = Math.max(margin, Math.min(rect.bottom + 6, height - panelHeight - margin)) + 'px';
    popover.style.bottom = 'auto';
    popover.style.width = panelWidth + 'px';
    popover.style.maxHeight = panelHeight + 'px';
    popover.style.overflowY = 'auto';
  }

  static getStyles() {
    return `
      :host { color-scheme:light dark; --sdm-paper:light-dark(#ffffff,#252a30); --sdm-ink:light-dark(#252c35,#f0f3f6); --sdm-muted:light-dark(#4f5c69,#aeb9c5); --sdm-line:light-dark(#dfe5eb,#434d58); --sdm-accent:light-dark(#424d5a,#d0d8e1); --sdm-hover:light-dark(#eef1f4,#38414b); --sdm-menu-opacity:100%; --sdm-button-opacity:0%; }
      :host([data-smartdm-theme="light"]) { color-scheme:light; }
      :host([data-smartdm-theme="dark"]) { color-scheme:dark; }
      * { box-sizing:border-box; }
      .smartdm-icon { width:16px; height:16px; flex-shrink:0; }
      .banner-btn { display:flex; align-items:center; gap:6px; padding:7px 9px; border:0; border-radius:6px; background:var(--sdm-accent); background:color-mix(in srgb,var(--sdm-accent) var(--sdm-button-opacity),transparent); color:var(--sdm-button-foreground,var(--sdm-ink)); font:500 12px/1.4 'Segoe UI',Arial,sans-serif; cursor:grab; touch-action:none; user-select:none; backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); }
      .banner-btn:active { cursor:grabbing; }
      .banner-btn .smartdm-grip { width:9px; opacity:.65; }
      .thumb-btn { font-size:11px; padding:6px 8px; gap:5px; }
      .banner-btn.ytmusic-bar-btn, .banner-btn.ytmusic-playlist-header-btn { cursor:pointer; touch-action:auto; white-space:nowrap; }
      .ytmusic-svg-icon { width:16px; height:16px; fill:currentColor; flex-shrink:0; }
      .popover { position:fixed; width:290px; max-width:calc(100vw - 16px); background:var(--sdm-paper); background:color-mix(in srgb,var(--sdm-paper) var(--sdm-menu-opacity),transparent); backdrop-filter:blur(14px) saturate(1.1); -webkit-backdrop-filter:blur(14px) saturate(1.1); border:1px solid var(--sdm-line); border-radius:12px; padding:0; box-shadow:0 6px 18px #0000000c; display:none; flex-direction:column; color:var(--sdm-ink); font:400 13px/1.4 'Segoe UI',Arial,sans-serif; z-index:2147483647; }
      .popover.active { display:flex; }
      .popover-title { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px 10px; font-size:14px; font-weight:600; }
      .smartdm-brand { color:var(--sdm-muted); font-size:11px; font-weight:400; }
      .popover-content { max-height:380px; overflow-y:auto; display:flex; flex-direction:column; padding:0 5px 6px; scrollbar-width:thin; }
      .popover > .format-section { display:none; }
      .popover:has(.popover-content[data-has-video="true"]) > .format-section { display:flex; padding-left:14px; }
      .format-section { display:flex; align-items:center; gap:7px; color:var(--sdm-muted); font-size:12px; padding:2px 9px 6px; }
      .format-item { display:flex; align-items:center; gap:10px; flex-shrink:0; width:100%; min-height:34px; padding:8px 9px; border:0; border-radius:4px; background:transparent; color:var(--sdm-ink); font:400 13px/1.4 'Segoe UI',Arial,sans-serif; text-align:left; cursor:pointer; }
      .format-item:hover, .format-item:focus-visible { background:var(--sdm-hover); }
      .format-item[data-is-audio="true"] { border-top:1px solid var(--sdm-line); margin-top:5px; padding-top:10px; border-radius:0 0 4px 4px; }
      .format-info { flex:1; min-width:0; }
      .format-title { font-weight:500; overflow-wrap:anywhere; }
      .format-size { display:block; margin-top:2px; color:var(--sdm-muted); font-size:11px; font-weight:400; }
      .format-badge { margin-left:auto; color:var(--sdm-muted); font-size:11px; font-weight:400; white-space:nowrap; }
      .format-action { display:flex; color:var(--sdm-muted); }
      .format-action .smartdm-icon { width:15px; height:15px; }
      .format-kind { display:flex; color:var(--sdm-accent); }
      .status-text { font-size:12px; color:var(--sdm-muted); text-align:center; padding:12px; overflow-wrap:anywhere; }
      .status-text.success { color:var(--sdm-ink); }
      .status-text.error { color:light-dark(#b42318,#ffb4ab); }
      @keyframes spin { to { transform:rotate(360deg); } }
      .spinner { width:14px; height:14px; border:2px solid var(--sdm-line); border-top-color:var(--sdm-muted); border-radius:50%; animation:spin .8s linear infinite; display:inline-block; }
      .spinner-container, .smartdm-pending-notice { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px; color:var(--sdm-muted); font-size:12px; }
      @media(pointer:coarse) { .format-item, .banner-btn { min-height:44px; } }
      @media(prefers-reduced-motion:reduce) { .spinner { animation:none; } }
    `;
  }

  static renderFormatDropdown(container, formats, videoUrl, popover, mediaTitle = null, hasMorePending = false, onDownload = null) {
    if (!container || container._smartdm_downloading) return;
    container._smartdm_formats = formats;
    FormatRegistryEngine.drainStashedManifests();

    let authoritativeTitle = null;
    if (mediaTitle && !SmartDmUtils.isGenericTitle(mediaTitle)) {
      authoritativeTitle = mediaTitle.trim();
    }
    if (!authoritativeTitle) {
      const firstFmtWithTitle = (formats || []).find(f => (f.title || f.Title) && !SmartDmUtils.isGenericTitle(f.title || f.Title));
      if (firstFmtWithTitle) {
        authoritativeTitle = (firstFmtWithTitle.title || firstFmtWithTitle.Title).trim();
      }
    }
    if (!authoritativeTitle || SmartDmUtils.isGenericTitle(authoritativeTitle)) {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')));
      const isInsta = /(^|\.)instagram\.com$/.test(window.location.hostname) || (videoUrl && (videoUrl.includes('instagram.com') || videoUrl.includes('cdninstagram.com')));
      const isTwitter = /(^|\.)(x\.com|twitter\.com)$/i.test(window.location.hostname) || (videoUrl && (videoUrl.includes('x.com') || videoUrl.includes('twitter.com')));
      if (isFb) {
        const lateTitle = VisualMountDetector.extractFacebookMediaTitle(container._mediaEl, null);
        if (lateTitle && !SmartDmUtils.isGenericTitle(lateTitle)) {
          authoritativeTitle = lateTitle;
        }
      } else if (isInsta) {
        const lateTitle = VisualMountDetector.extractInstagramMediaTitle(container._mediaEl, null);
        if (lateTitle && !SmartDmUtils.isGenericTitle(lateTitle)) {
          authoritativeTitle = lateTitle;
        }
      } else if (isTwitter) {
        const lateTitle = VisualMountDetector.extractTwitterMediaTitle(container._mediaEl, null);
        if (lateTitle && !SmartDmUtils.isGenericTitle(lateTitle)) {
          authoritativeTitle = lateTitle;
        }
      }
    }
    if (!authoritativeTitle || SmartDmUtils.isGenericTitle(authoritativeTitle)) {
      const pageFn = SmartDmUtils.derivePageTitleFilename('mp4');
      const baseCandidate = pageFn.replace(/\.mp4$/i, '').trim();
      if (!SmartDmUtils.isGenericTitle(baseCandidate)) {
        authoritativeTitle = baseCandidate;
      } else {
        authoritativeTitle = 'video';
      }
    }

    if (authoritativeTitle && typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeCleanTitle) {
      const sanitized = SmartDmUtils.sanitizeCleanTitle(authoritativeTitle);
      if (sanitized && !SmartDmUtils.isGenericTitle(sanitized)) {
        authoritativeTitle = sanitized;
      }
    }

    const cleanBaseName = authoritativeTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?""<>|]/g, '_').trim();
    const finalBaseTitle = cleanBaseName.length > 0 ? cleanBaseName : 'video';

    container._smartdm_title = finalBaseTitle;
    const rawItems = [];

    (formats || []).forEach(fmt => {
      const isAud = fmt.isAudioOnly || fmt.IsAudioOnly;
      let resolution = fmt.resolution || fmt.Resolution || fmt.qualityLabel || (isAud ? 'Audio Only' : 'Video');
      let ext = (fmt.ext || fmt.Ext || 'MP4').toUpperCase();
      if (ext === 'M3U8') ext = 'MP4';

      let hVal = fmt.height || (parseInt(resolution, 10) || 0);
      if (hVal <= 0 && fmt.bandwidth > 0) {
        const bw = fmt.bandwidth;
        if (bw >= 3800000) hVal = 1080;
        else if (bw >= 1800000) hVal = 720;
        else if (bw >= 900000) hVal = 480;
        else if (bw >= 450000) hVal = 360;
        else hVal = 240;
      }
      if (hVal <= 0 && formats.length === 1 && container._mediaEl && container._mediaEl.videoHeight > 0) {
        hVal = container._mediaEl.videoHeight;
      }
      // Selected-player formats carry measured/declared dimensions. Do not
      // round a real 576p stream up to a fabricated 720p menu option.
      if (hVal > 0 && !String(fmt.formatId || '').startsWith('selected_')) {
        if (fmt.width && fmt.width > 0) {
          hVal = SmartDmUtils.normalizeVideoResolution(fmt.width, hVal);
        } else {
          hVal = SmartDmUtils.normalizeVideoResolution(0, hVal);
        }
      }

      let cleanTitle = resolution;
      const is60fps = !!(fmt.fps && fmt.fps > 30) || /\b(?:50|59\.94|60)\s*fps\b/i.test(resolution) || /\b(?:1080|720|1440|2160)p60\b/i.test(resolution);

      if (!isAud && fmt.formatId !== 'thumbnail') {
        if (hVal >= 2160 || resolution.startsWith('2160p') || resolution.includes('4K')) {
          cleanTitle = is60fps ? '2160p 4K UHD 60fps' : '2160p 4K UHD';
        } else if (hVal >= 1440 || resolution.startsWith('1440p') || resolution.includes('Quad HD') || resolution.includes('2K')) {
          cleanTitle = is60fps ? '1440p Quad HD 60fps' : '1440p Quad HD';
        } else if (hVal >= 1080 || resolution.startsWith('1080p')) {
          cleanTitle = is60fps ? '1080p Full HD 60fps' : '1080p Full HD';
        } else if (hVal >= 720 || resolution.startsWith('720p')) {
          cleanTitle = is60fps ? '720p HD 60fps' : '720p HD';
        } else if (hVal === 640 || resolution.startsWith('640p')) {
          cleanTitle = '640p';
        } else if (hVal === 540 || resolution.startsWith('540p')) {
          cleanTitle = '540p';
        } else if (hVal === 480 || resolution.startsWith('480p')) {
          cleanTitle = '480p SD';
        } else if (hVal === 360 || resolution.startsWith('360p')) {
          cleanTitle = '360p SD';
        } else if (hVal > 0) {
          cleanTitle = `${hVal}p`;
        } else {
          cleanTitle = 'Video Stream';
        }
      }

      if (!cleanTitle.toUpperCase().includes(ext) && !isAud && fmt.formatId !== 'thumbnail') {
        cleanTitle += ` (${ext})`;
      }
      cleanTitle = cleanTitle.replace(/\(([^)]+)\)\s*\(\1\)/gi, '($1)');

      const rawSize = Number(fmt.fileSize || fmt.FileSize || fmt.contentLength || 0);
      const fSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? rawSize : 0;
      const formattedSize = (fSize >= 1048576 || (isAud && fSize >= 102400)) ? SmartDmUtils.formatSize(fSize) : null;
      const sizeText = formattedSize ? formattedSize : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      let fmtTitle = fmt.title || fmt.Title;
      if (!fmtTitle || SmartDmUtils.isGenericTitle(fmtTitle)) {
        fmtTitle = finalBaseTitle;
      }
      let base = fmtTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?""<>|]/g, '_').trim();
      if (!base || SmartDmUtils.isGenericTitle(base)) base = finalBaseTitle;
      const itemFileName = `${base}.${ext.toLowerCase()}`;

      const streamUrl = fmt.directUrl || fmt.DirectUrl || fmt.url || fmt.Url || videoUrl;
      const fmtId = String(fmt.formatId || fmt.FormatId || '');

      rawItems.push({
        title: cleanTitle,
        badge: sizeText,
        url: streamUrl,
        videoUrl: streamUrl,
        audioUrl: fmt.audioUrl || fmt.AudioUrl || null,
        formatId: fmtId,
        fileName: itemFileName,
        height: isAud ? -1 : hVal,
        isAudio: isAud,
        sizeBytes: fSize,
        isStream: ['hls','dash'].includes(fmt.mediaKind || fmt.MediaKind) || !!(fmt.manifestText || fmt.ManifestText) || /\.(m3u8|mpd)(?:[?#]|$)/i.test(streamUrl || ''),
        sizeEstimated: !!(fmt.sizeIsEstimate || fmt.isEstimated || fmt.audioUrl || fmt.AudioUrl || ['hls','dash'].includes(fmt.mediaKind || fmt.MediaKind) || /\.(m3u8|mpd)(?:[?#]|$)/i.test(streamUrl || '')),
        referer: fmt.referer || fmt.Referer || null,
        origin: fmt.origin || fmt.Origin || null
      });
    });

    if (rawItems.length > 0 && !rawItems.some(item => item.title.includes('Audio Only') || item.title.includes('Audio (MP3)'))) {
      const firstItem = rawItems[0];
      rawItems.push({
        title: 'Audio (MP3 / High Quality)',
        badge: 'Audio Only',
        url: firstItem.url,
        videoUrl: firstItem.videoUrl || null,
        audioUrl: firstItem.audioUrl || null,
        formatId: 'bestaudio/best',
        fileName: `${finalBaseTitle}.mp3`,
        height: -1,
        isAudio: true
      });
    }

    if (rawItems.length > 0 && !rawItems.some(item => item.title.includes('Thumbnail'))) {
      const firstItem = rawItems[0];
      rawItems.push({
        title: 'Thumbnail (Cover Image / HD)',
        badge: 'Image (JPG)',
        url: firstItem.url,
        videoUrl: null,
        audioUrl: null,
        formatId: 'thumbnail',
        fileName: `${finalBaseTitle}.jpg`,
        height: -2,
        isAudio: false
      });
    }

    // Strict deduplication by normalized title and height
    const seenHeights = new Set();
    const seenTitles = new Set();
    let items = [];
    rawItems.forEach(item => {
      const normTitle = (item.title || '').trim().toLowerCase();
      if (!normTitle || seenTitles.has(normTitle)) {
        return; // Absolute invariant: never allow duplicate titles in the format dropdown!
      }
      if (item.formatId === 'thumbnail') {
        seenTitles.add(normTitle);
        items.push(item);
        return;
      }
      if (item.isAudio) {
        seenTitles.add(normTitle);
        items.push(item);
        return;
      }
      if (item.height > 0) {
        if (seenHeights.has(item.height)) return;
        seenHeights.add(item.height);
      }
      seenTitles.add(normTitle);
      items.push(item);
    });

    const hasExplicitRes = items.some(item => !item.isAudio && item.formatId !== 'thumbnail' && item.height > 0);
    if (hasExplicitRes) {
      const filtered = items.filter(item => item.isAudio || item.formatId === 'thumbnail' || item.height > 0);
      if (filtered.length > 0) items = filtered;
    }

    items.sort((a, b) => {
      const isThumbA = a.formatId === 'thumbnail';
      const isThumbB = b.formatId === 'thumbnail';
      if (isThumbA) return 1;
      if (isThumbB) return -1;
      if (a.isAudio && !b.isAudio) return 1;
      if (!a.isAudio && b.isAudio) return -1;
      return (b.height || 0) - (a.height || 0);
    });

    if (items.length === 0) {
      container.innerHTML = '<div class="status-text">No media formats detected.</div>';
      return;
    }
    container.setAttribute?.('data-has-video', String(items.some(item => !item.isAudio && item.formatId !== 'thumbnail')));

    const existingDomItems = Array.from(container.querySelectorAll('.format-item'));
    const isFirstRender = existingDomItems.length === 0;

    if (isFirstRender) {
      container.innerHTML = '';
    }

    const createItemElement = (item) => {
      const div = document.createElement('button');
      div.type = 'button';
      div._formatData = item;
      div.className = 'format-item';
      div.dataset.formatKey = item.title;
      div.dataset.height = String(item.height || 0);
      div.dataset.isAudio = item.isAudio ? 'true' : 'false';
      div.dataset.isThumb = (item.formatId === 'thumbnail') ? 'true' : 'false';

      // Safe DOM construction: zero innerHTML with dynamic user text
      const infoDiv = document.createElement('div');
      infoDiv.className = 'format-info';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'format-title';
      const isThumb = item.formatId === 'thumbnail';
      const displayTitle = isThumb ? 'Cover image' : item.isAudio ? 'Audio only'
        : item.height > 0 ? `${item.height}p${/60fps/.test(item.title) ? ' 60 fps' : ''}` : 'Video';
      titleSpan.textContent = displayTitle;
      titleSpan.setAttribute('title', item.title);
      div.setAttribute('aria-label', 'Download ' + item.title);
      infoDiv.appendChild(titleSpan);
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'format-size';
      infoDiv.appendChild(sizeSpan);

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'format-badge';
      badgeSpan.textContent = item.fileName.split('.').pop().toUpperCase();
      badgeSpan.setAttribute('title', item.badge);

      if (isThumb || item.isAudio) {
        const kind = document.createElement('span');
        kind.className = 'format-kind';
        kind.innerHTML = OverlayUiRenderer.icon(isThumb ? 'image' : 'audio');
        div.appendChild(kind);
      }
      div.appendChild(infoDiv);
      div.appendChild(badgeSpan);
      const action = document.createElement('span');
      action.className = 'format-action';
      action.innerHTML = OverlayUiRenderer.icon('arrow');
      div.appendChild(action);
      OverlayUiRenderer.updateSize(div, item);

      div.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        container._smartdm_downloading = true;
        container.innerHTML = '<div class="status-text">Opening SmartDM...</div>';

        const activeItem = div._formatData || item;
        if (typeof onDownload === 'function') {
          const showResult = (response) => {
            container._smartdm_downloading = false;
            const accepted = !!response && (response.success === true || response.status === 'ok');
            const status = document.createElement('div');
            status.className = 'status-text ' + (accepted ? 'success' : 'error');
            status.textContent = accepted
              ? 'Added to SmartDM.'
              : 'Could not send this video to SmartDM. Check that the desktop app is running.';
            container.replaceChildren(status);
            if (!accepted) {
              const retry = document.createElement('button');
              retry.className = 'format-item';
              retry.textContent = 'Show formats again';
              retry.addEventListener('click', () => {
                container.replaceChildren();
                OverlayUiRenderer.renderFormatDropdown(container, container._smartdm_formats || formats, videoUrl, popover, container._smartdm_title || mediaTitle, hasMorePending, onDownload);
              });
              container.appendChild(retry);
            }
          };
          try {
            onDownload(container._smartdm_formats || formats, activeItem, container._smartdm_title || finalBaseTitle, showResult);
          } catch (error) {
            showResult({ success: false, status: 'error' });
          }
        }
      }, true);

      return div;
    };

    if (isFirstRender) {
      items.forEach(item => {
        container.appendChild(createItemElement(item));
      });
    } else {
      items.forEach(item => {
        const existingEl = container.querySelector('.format-item[data-format-key="' + CSS.escape(item.title) + '"]');
        if (existingEl) {
          if (!item.sizeBytes && existingEl._formatData?.url === item.url && existingEl._formatData.audioUrl === item.audioUrl && existingEl._formatData.sizeBytes > 0) item.sizeBytes = existingEl._formatData.sizeBytes;
          existingEl._formatData = item;
          OverlayUiRenderer.updateSize(existingEl, item);
          const badgeEl = existingEl.querySelector('.format-badge');
          if (badgeEl) badgeEl.setAttribute('title', item.badge);
          return;
        }

        const div = createItemElement(item);

        const currentDom = Array.from(container.querySelectorAll('.format-item'));
        let insertBeforeEl = null;
        for (const cur of currentDom) {
          const curH = parseInt(cur.dataset.height || '-999', 10);
          const curIsAudio = cur.dataset.isAudio === 'true';
          const curIsThumb = cur.dataset.isThumb === 'true';

          if (!item.isAudio && item.formatId !== 'thumbnail') {
            if (curIsAudio || curIsThumb || curH < item.height) {
              insertBeforeEl = cur;
              break;
            }
          } else if (item.isAudio) {
            if (curIsThumb) {
              insertBeforeEl = cur;
              break;
            }
          }
        }

        if (insertBeforeEl) {
          container.insertBefore(div, insertBeforeEl);
        } else {
          const pendingEl = container.querySelector('.smartdm-pending-notice');
          if (pendingEl) {
            container.insertBefore(div, pendingEl);
          } else {
            container.appendChild(div);
          }
        }
      });
    }

    let notice = container.querySelector('.smartdm-pending-notice');
    if (hasMorePending) {
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'smartdm-pending-notice';
        notice.innerHTML = '<span class="spinner"></span> Checking for higher qualities...';
        container.appendChild(notice);
      }
    } else {
      if (notice) notice.remove();
    }
  }
}
