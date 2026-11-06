// SmartDM Overlay UI Renderer
// Encapsulates Shadow DOM creation, button rendering, safe DOM construction (zero innerHTML for titles), and popovers

class OverlayUiRenderer {
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
      @keyframes spin { to { transform: rotate(360deg); } }
      .spinner { width: 14px; height: 14px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
      .spinner-container { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 0; }
      .banner-btn {
        background: rgba(15, 23, 42, 0.72);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: rgba(248, 250, 252, 0.95);
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
        position: fixed;
        width: 290px;
        box-sizing: border-box;
        max-width: calc(100vw - 16px);
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
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
        max-height: 380px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-right: 4px;
      }
      .popover-content::-webkit-scrollbar { width: 4px; }
      .popover-content::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.5); border-radius: 4px; }
      @keyframes smartdmFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
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
      .format-info { display: flex; flex-direction: column; gap: 2px; }
      .format-title { font-weight: 700; color: #f8fafc; }
      .format-badge {
        font-size: 10px; font-weight: 700;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        padding: 2px 6px; border-radius: 4px;
      }
      .status-text { font-size: 11px; color: #94a3b8; text-align: center; padding: 8px; }
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
      if (isFb) {
        const lateTitle = VisualMountDetector.extractFacebookMediaTitle(container._mediaEl, null);
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
      if (hVal > 0) {
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

      const fSize = fmt.fileSize || fmt.FileSize || 0;
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

    const existingDomItems = Array.from(container.querySelectorAll('.format-item'));
    const isFirstRender = existingDomItems.length === 0;

    if (isFirstRender) {
      container.innerHTML = '';
    }

    const createItemElement = (item) => {
      const div = document.createElement('div');
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
      titleSpan.textContent = item.title;
      titleSpan.setAttribute('title', item.title);
      infoDiv.appendChild(titleSpan);

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'format-badge';
      badgeSpan.textContent = item.badge;

      div.appendChild(infoDiv);
      div.appendChild(badgeSpan);

      div.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        container._smartdm_downloading = true;
        container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';

        const activeItem = div._formatData || item;
        if (typeof onDownload === 'function') {
          const showResult = (response) => {
            container._smartdm_downloading = false;
            const accepted = !!response && (response.success === true || response.status === 'ok');
            const status = document.createElement('div');
            status.className = 'status-text';
            status.textContent = accepted
              ? 'Added to SmartDM.'
              : 'Could not send this video to SmartDM. Check that the desktop app is running.';
            status.style.color = accepted ? '#38bdf8' : '#f87171';
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
          existingEl._formatData = item;
          const badgeEl = existingEl.querySelector('.format-badge');
          if (badgeEl && item.badge && item.badge !== 'Download' && badgeEl.textContent === 'Download') {
            badgeEl.textContent = item.badge;
          }
          return;
        }

        const div = createItemElement(item);
        div.style.animation = 'smartdmFadeIn 0.25s ease-out';

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
        notice.style.cssText = 'padding: 6px 12px; font-size: 10px; color: #64748b; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; gap: 6px;';
        notice.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border:2px solid #38bdf8; border-top-color:transparent; border-radius:50%; animation: spin 0.8s linear infinite;"></span> Checking for higher qualities...';
        container.appendChild(notice);
      }
    } else {
      if (notice) notice.remove();
    }
  }
}
