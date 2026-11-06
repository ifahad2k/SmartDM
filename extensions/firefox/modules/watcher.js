// SmartDM Media Watcher
// High-efficiency DOM observer, IntersectionObserver position tracker, and lifecycle manager

class MediaWatcher {
  static ATTR_PLAYER_ATTACHED = 'data-smartdm-player-attached';
  static ATTR_THUMB_ATTACHED = 'data-smartdm-thumb-attached';

  static activePlayers = new Map(); // mediaEl -> { host, observer, cleanup, syncPos, isVisible }
  static thumbnailHosts = new Map(); // mount -> fixed host outside clickable cards
  static mutationDebounceTimer = null;
  static scrollThrottleTimer = null;
  static scrollEndTimer = null;
  static pendingPlayers = new WeakMap();
  static sharedStyles = null;
  static spaScanTimers = [];

  static styleMarkup(shadow) {
    // One parsed stylesheet per document, rather than a full CSS copy per card.
    try {
      if ('adoptedStyleSheets' in shadow && typeof CSSStyleSheet !== 'undefined') {
        if (!this.sharedStyles) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(OverlayUiRenderer.getStyles());
          this.sharedStyles = sheet;
        }
        shadow.adoptedStyleSheets = [this.sharedStyles];
        return '';
      }
    } catch (_) { /* Older browsers keep the existing inline stylesheet. */ }
    return `<style>${OverlayUiRenderer.getStyles()}</style>`;
  }

  static init(onDownloadHandler) {
    this.onDownloadHandler = onDownloadHandler;

    // 1. Initialize IntersectionObserver for player viewports
    this.viewportObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const item = this.activePlayers.get(entry.target);
        if (item && item.syncPos) {
          if (entry.isIntersecting) {
            item.isVisible = true;
            item.syncPos();
          } else {
            item.isVisible = false;
            if (item.host) {
              item.host.style.opacity = '0';
              item.host.style.pointerEvents = 'none';
            }
          }
        }
      });
    }, { threshold: 0.05 });

    // 2. Centralized outside-click dismiss listener (ONE listener for all player & thumbnail popovers)
    document.addEventListener('click', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(host => {
        if (host.shadowRoot) {
          const popover = host.shadowRoot.querySelector('.popover.active');
          if (popover && !path.includes(host) && !host.contains(e.target)) {
            popover.classList.remove('active');
            if (host._smartdm_stop_poll) {
              host._smartdm_stop_poll();
            }
          }
        }
      });
    }, true);

    // 3. High-efficiency scroll and resize handlers (zero layout thrashing during scrolling)
    const onViewportChange = () => {
      // Dismiss active popovers on scroll
      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(host => {
        if (host.shadowRoot) {
          const popover = host.shadowRoot.querySelector('.popover.active');
          if (popover) {
            popover.classList.remove('active');
            if (host._smartdm_stop_poll) host._smartdm_stop_poll();
          }
        }
      });

      // Throttle updates during active scrolling: at most once every 180ms
      if (!this.scrollThrottleTimer) {
        this.scrollThrottleTimer = setTimeout(() => {
          this.scrollThrottleTimer = null;
          this.syncVisiblePlayers();
        }, 180);
      }

      // Debounced final reposition when scrolling stops
      if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
      this.scrollEndTimer = setTimeout(() => {
        this.syncVisiblePlayers();
      }, 120);
    };

    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', () => this.syncVisiblePlayers(), { passive: true });
    }

    // 5. YouTube & SPA navigation hooks
    const onSpaNavigate = () => {
      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(host => {
        if (host.shadowRoot) {
          const popover = host.shadowRoot.querySelector('.popover.active');
          if (popover) {
            popover.classList.remove('active');
            if (host._smartdm_stop_poll) host._smartdm_stop_poll();
          }
        }
      });
      this.spaScanTimers.forEach(clearTimeout);
      this.spaScanTimers = [150, 600].map(delay => setTimeout(() => this.scanAll(), delay));
    };

    window.addEventListener('yt-navigate-finish', onSpaNavigate, { passive: true });
    window.addEventListener('yt-page-data-updated', onSpaNavigate, { passive: true });
    window.addEventListener('popstate', onSpaNavigate, { passive: true });

    // 4. Lightweight Debounced MutationObserver (zero removed-subtree recursion)
    this.domObserver = new MutationObserver((mutations) => {
      let hasAddedElements = false;
      let hasRemovedElements = false;
      for (const m of mutations) {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node.nodeType === 1) { hasRemovedElements = true; break; }
          }
        }
        if (!hasAddedElements && m.addedNodes && m.addedNodes.length > 0) {
          for (let i = 0; i < m.addedNodes.length; i++) {
            const node = m.addedNodes[i];
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Ignore our own injected UI hosts to avoid self-triggering loops
              if (node.classList && (node.classList.contains('smartdm-player-host') || node.classList.contains('smartdm-thumb-host'))) {
                continue;
              }
              // Only trigger a scan if the added subtree actually contains media elements or video card links
              const tag = node.tagName;
              if (tag === 'VIDEO' || tag === 'AUDIO' ||
                  (node.querySelector && node.querySelector('video, audio, ytd-thumbnail, yt-lockup-view-model, a[href*="/watch"], a[href*="/reel/"], a[href*="/shorts/"]'))) {
                hasAddedElements = true;
                break;
              }
            }
          }
        }
      }

      // Removing an entire post must also release nested players. A removal-only
      // mutation used to retain them until the next scroll or media insertion.
      if (hasRemovedElements) {
        for (const [el] of this.activePlayers) {
          if (!el.isConnected) this.cleanupPlayer(el);
        }
        this.pruneDisconnectedThumbnails();
      }

      if (hasAddedElements) {
        if (this.mutationDebounceTimer) clearTimeout(this.mutationDebounceTimer);
        this.mutationDebounceTimer = setTimeout(() => {
          this.mutationDebounceTimer = null;
          this.scanAll();
        }, 250);
      }
    });

    if (document.body) {
      this.domObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          this.domObserver.observe(document.body, { childList: true, subtree: true });
        }
      });
    }

    this.scanAll();
  }

  static syncVisiblePlayers() {
    this.syncVisibleThumbnails();
    if (this.activePlayers.size === 0) return;

    // Prune disconnected media elements
    for (const [el] of this.activePlayers.entries()) {
      if (!el.isConnected) {
        this.cleanupPlayer(el);
      }
    }

    // Phase 1: Batch read rects for all visible players (NO DOM writes here)
    const updates = [];
    const innerH = window.innerHeight;
    for (const [mediaEl, item] of this.activePlayers.entries()) {
      if (!item.isVisible || !item.host) continue;
      const r = mediaEl.getBoundingClientRect();
      updates.push({ item, r });
    }

    const singleReel = /(^|\.)(instagram\.com|tiktok\.com)$/.test(window.location.hostname);
    const area = r => Math.max(0, Math.min(r.bottom, innerH) - Math.max(r.top, 0)) *
      Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
    const selected = singleReel ? updates.reduce((best, next) => !best || area(next.r) > area(best.r) ? next : best, null) : null;

    // Phase 2: Batch write styles in a single pass (NO DOM reads here -> ZERO layout thrashing)
    for (const { item, r } of updates) {
      if ((singleReel && selected?.item !== item) || r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerH) {
        item.host.style.opacity = '0';
        item.host.style.pointerEvents = 'none';
      } else {
        item.host.style.opacity = '1';
        item.host.style.pointerEvents = 'auto';
        item.host.style.top = (r.top + 16) + 'px';
        item.host.style.left = Math.max(8, Math.min(window.innerWidth - 145, r.right - 145)) + 'px';
      }
    }
  }

  static pruneDisconnectedThumbnails() {
    for (const [mount, host] of this.thumbnailHosts.entries()) {
      if (!mount.isConnected) {
        if (host._smartdm_stop_poll) host._smartdm_stop_poll();
        host.remove();
        this.thumbnailHosts.delete(mount);
      }
    }
  }

  static syncVisibleThumbnails() {
    this.pruneDisconnectedThumbnails();
    for (const host of this.thumbnailHosts.values()) {
      if (host._smartdm_sync_pos) host._smartdm_sync_pos();
    }
  }

  static isBadgeClipped(mount, badgeRect) {
    let depth = 0;
    for (let parent = mount.parentElement; parent && depth < 6; parent = parent.parentElement, depth++) {
      if (parent === document.body || parent === document.documentElement) break;
      const overflow = parent.style ? (parent.style.overflow || parent.style.overflowX || parent.style.overflowY || '') : '';
      let isClipper = /hidden|clip|auto|scroll/.test(overflow);
      if (!isClipper) {
        const style = window.getComputedStyle(parent);
        isClipper = /hidden|clip|auto|scroll/.test(style.overflowX || style.overflowY || style.overflow || '');
      }
      if (!isClipper) continue;
      const bounds = parent.getBoundingClientRect();
      if ((badgeRect.left < bounds.left - 2 || badgeRect.right > bounds.right + 2) ||
          (badgeRect.top < bounds.top - 2 || badgeRect.bottom > bounds.bottom + 2)) return true;
    }
    return false;
  }

  static cleanupPlayer(mediaEl) {
    const item = this.activePlayers.get(mediaEl);
    if (item) {
      if (item.cleanup) {
        try { item.cleanup(); } catch(e) {}
      }
      if (item.host) {
        if (item.host._smartdm_stop_poll) {
          item.host._smartdm_stop_poll();
        }
        if (item.host.parentNode) {
          item.host.parentNode.removeChild(item.host);
        }
      }
      if (this.viewportObserver) {
        this.viewportObserver.unobserve(mediaEl);
      }
      this.activePlayers.delete(mediaEl);
      mediaEl.removeAttribute?.(this.ATTR_PLAYER_ATTACHED);
    }
  }

  static scanAll() {
    this.syncVisibleThumbnails();
    this.scanPlayers();
    this.scanThumbnails();
  }

  static scanPlayers() {
    for (const [el] of this.activePlayers.entries()) {
      if (!el.isConnected) {
        this.cleanupPlayer(el);
      }
    }
    const mediaElements = document.querySelectorAll('video:not([' + this.ATTR_PLAYER_ATTACHED + ']), audio:not([' + this.ATTR_PLAYER_ATTACHED + '])');
    mediaElements.forEach(el => this.attachPlayerBanner(el));
  }

  static isThumbnailOrPreviewMedia(mediaEl) {
    if (!mediaEl || mediaEl.tagName !== 'VIDEO') return false;

    // In embed subframes, this is a dedicated video player container.
    // There are no feed trays or browsing carousels in embed frames.
    if (window.top !== window.self) {
      const r = mediaEl.getBoundingClientRect();
      const w = r.width || mediaEl.offsetWidth || 0;
      const h = r.height || mediaEl.offsetHeight || 0;
      if ((w <= 300 && h <= 150) && mediaEl.readyState < 1) return 'unrendered';
      if (w > 0 && w < 80) return true;
      if (h > 0 && h < 60) return true;
      return false;
    }

    // Dedicated main video player detection for YouTube
    const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
    if (isYouTube) {
      if (mediaEl.closest('ytd-inline-preview-player, ytd-thumbnail, #inline-preview-player')) {
        return true;
      }
      if (mediaEl.closest('#movie_player, .html5-video-player, ytd-watch-flexy, ytd-shorts, #shorts-player')) {
        return false;
      }
    }

    // 1. Explicit thumbnail, preview, or carousel shelf container
    const thumbContainer = mediaEl.closest(
      '[class*="thumbnail" i], [class*="thumb" i], [id*="thumbnail" i], ' +
      '[class*="preview" i], [aria-label*="thumbnail" i], ' +
      'ytd-thumbnail, .phimage, .thumbnailWrapper, .pcVideoListItem, .videoBox, ' +
      '[aria-label*="Reels" i], [data-pagelet*="Reels" i], [role="region"][aria-label*="Reel" i], ' +
      '[class*="carousel" i], [class*="tray" i], [class*="shelf" i], [class*="slider" i], ' +
      '[role="gridcell"], [role="listitem"] [aria-label*="Reel" i]'
    );
    if (thumbContainer) {
      const isDedicatedViewer = (window.location.pathname.includes('/reel/') || mediaEl.closest('div[role="dialog"]')) &&
                                (mediaEl.offsetHeight > 500 || mediaEl.clientHeight > 500);
      if (!isDedicatedViewer) {
        return true;
      }
    }

    // 2. Clickable link card (where clicking the video card navigates to video/reel URL)
    const parentAnchor = mediaEl.closest('a[href*="/reel/"], a[href*="/shorts/"], a[href*="/watch"], a[href*="/video/"], a[href*="/videos/"]');
    if (parentAnchor) {
      const isDedicatedWatch = (window.location.pathname.includes('/watch') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/shorts/')) &&
                               !parentAnchor.href.includes('/reel/');
      if (!isDedicatedWatch) {
        return true;
      }
    }

    // 3. Dimensional bounds (Site-Agnostic):
    const r = mediaEl.getBoundingClientRect();
    const w = r.width || mediaEl.offsetWidth || 0;
    const h = r.height || mediaEl.offsetHeight || 0;

    // Hidden or not laid out yet: return 'unrendered' so caller can retry when metadata/layout is available
    if (w === 0 && h === 0) return 'unrendered';

    // If the video element hasn't loaded metadata yet and is at HTML default dimensions (300x150), wait for it
    if ((w <= 300 && h <= 150) && mediaEl.readyState < 1) {
      return 'unrendered';
    }

    // Tiny avatar or icon video
    if (w > 0 && w < 80) return true;
    if (h > 0 && h < 60) return true;

    // Narrow thumbnail in feed trays or carousels (e.g. 150px - 320px)
    const isReelPageViewer = window.location.pathname.includes('/reel/') && h >= 500;
    if (w > 0 && w < 340 && !isReelPageViewer) {
      return true;
    }

    // Micro-player or feed thumbnail height
    if (h > 0 && h < 200 && !isReelPageViewer) {
      return true;
    }

    // 4. Muted / auto-looping / short preview video
    const isMuted = mediaEl.muted || mediaEl.hasAttribute('muted');
    const isLoop = mediaEl.loop || mediaEl.hasAttribute('loop');
    const isShort = mediaEl.duration > 0 && mediaEl.duration < 30;
    if (isMuted && (isLoop || isShort) && (w < 450 || h < 320) && !isReelPageViewer) {
      return true;
    }

    return false;
  }

  static attachPlayerBanner(mediaEl) {
    if (mediaEl.getAttribute(this.ATTR_PLAYER_ATTACHED)) return;

    const previewCheck = this.isThumbnailOrPreviewMedia(mediaEl);
    if (previewCheck === 'unrendered') {
      if (this.pendingPlayers.has(mediaEl)) return;
      const onReady = () => {
        mediaEl.removeEventListener('loadedmetadata', onReady);
        mediaEl.removeEventListener('playing', onReady);
        mediaEl.removeEventListener('canplay', onReady);
        mediaEl.removeEventListener('resize', onReady);
        this.pendingPlayers.delete(mediaEl);
        if (!mediaEl.getAttribute(MediaWatcher.ATTR_PLAYER_ATTACHED)) {
          MediaWatcher.attachPlayerBanner(mediaEl);
        }
      };
      this.pendingPlayers.set(mediaEl, onReady);
      mediaEl.addEventListener('loadedmetadata', onReady, { once: true });
      mediaEl.addEventListener('playing', onReady, { once: true });
      mediaEl.addEventListener('canplay', onReady, { once: true });
      mediaEl.addEventListener('resize', onReady, { once: true });
      return;
    }

    if (previewCheck === true) {
      mediaEl.setAttribute(this.ATTR_PLAYER_ATTACHED, 'true');
      return;
    }

    // Mark element only after confirmed main video player
    mediaEl.setAttribute(this.ATTR_PLAYER_ATTACHED, 'true');

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
        const clampedLeft = Math.max(10, Math.min(window.innerWidth - 145, r.right - 145));
        host.style.left = clampedLeft + 'px';
      }
    };

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
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

    let pollTimer = null;
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    host._smartdm_stop_poll = stopPolling;

    let lastKnownHeight = mediaEl ? (mediaEl.videoHeight || 0) : 0;
    const onVideoDimensionChange = () => {
      const curH = mediaEl ? (mediaEl.videoHeight || 0) : 0;
      if (curH > 0 && curH !== lastKnownHeight) {
        lastKnownHeight = curH;
        delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
        delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getCanonicalUrl(window.location.href)];
        if (popover.classList.contains('active') && popover._smartdm_refresh) {
          popover._smartdm_refresh();
        }
      }
      syncPos();
    };

    const trackActivePlayback = () => {
      if (mediaEl) {
        mediaEl._smartdm_active_time = Date.now();
      }
    };

    const onEmptied = () => {
      delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
      mediaEl._smartdm_uid = 'vid_fb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      mediaEl._smartdm_active_time = Date.now();
      for (const attr of ['data-smartdm-bound-src', 'data-smartdm-video-url', 'data-smartdm-audio-url', 'data-smartdm-separate-audio']) mediaEl.removeAttribute?.(attr);
    };
    const onLoadStart = () => { mediaEl._smartdm_active_time = Date.now(); };
    const mediaListeners = [
      ['play', trackActivePlayback], ['playing', trackActivePlayback], ['timeupdate', trackActivePlayback],
      ['emptied', onEmptied], ['loadstart', onLoadStart], ['resize', onVideoDimensionChange],
      ['loadedmetadata', onVideoDimensionChange], ['playing', onVideoDimensionChange], ['mouseenter', syncPos]
    ];

    if (mediaEl) {
      mediaListeners.forEach(([event, listener]) => mediaEl.addEventListener(event, listener, { passive: true }));
    }

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        stopPolling();
        return;
      }

      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
        if (h !== host && h.shadowRoot) {
          const p = h.shadowRoot.querySelector('.popover');
          if (p) p.classList.remove('active');
          if (h._smartdm_stop_poll) h._smartdm_stop_poll();
        }
      });

      content._smartdm_downloading = false;
      content._mediaEl = mediaEl;
      if (OverlayUiRenderer.positionPopover) OverlayUiRenderer.positionPopover(popover, bannerBtn.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      popover.classList.add('active');

      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
      const isFbReels = isFb && (window.location.pathname.includes('/reel/') || mediaEl.closest('div[role="dialog"]'));

      let parentCard = null;
      let reelCard = null;
      if (isFb) {
        if (isFbReels) {
          parentCard = VisualMountDetector.findFacebookReelCard(mediaEl) || VisualMountDetector.findFacebookPostCard(mediaEl);
        } else {
          parentCard = VisualMountDetector.findFacebookPostCard(mediaEl);
        }
      }

      let cardTitle = null;
      if (isFb) {
        cardTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, parentCard);
      } else if (parentCard) {
        cardTitle = VisualMountDetector.extractCardTitle(parentCard);
      }
      const fallbackTitle = isFb ? (isFbReels ? 'facebook_reel' : 'facebook_video') : SmartDmUtils.extractWatchPageTitle();
      const pageTitle = (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : fallbackTitle;

      let initialFormats = null;
      const videoUrl = SmartDmUtils.getCanonicalUrl(window.location.href);
      if (isYouTube) {
        initialFormats = FormatRegistryEngine.getInstantYouTubeFormats(videoUrl, pageTitle);
      }

      let currentFormats = [];
      if (initialFormats && initialFormats.some(f => !f.isAudioOnly)) {
        currentFormats = [...initialFormats];
        OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, pageTitle, !isFb, this.onDownloadHandler);
      } else {
        content.innerHTML = `
          <div class="spinner-container">
            <div class="spinner"></div>
            <span class="status-text" style="padding:0;">Loading video options...</span>
          </div>
        `;
      }

      const updateFormatsFromFetch = (res, hasMorePending) => {
        try {
          if (this.activePlayers.get(mediaEl)?.host !== host || !popover.classList.contains('active')) return;
          if (content._smartdm_downloading) return;
          const resolvedTitle = FormatRegistryEngine.isSocialFeed?.() && res?.title ? res.title : (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : ((res && res.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : pageTitle);
          if (res && res.formats && res.formats.length > 0) {
            currentFormats = FormatRegistryEngine.isSocialFeed?.() ? res.formats.slice() : FormatRegistryEngine.mergeFormatLists(currentFormats, res.formats);
            OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, resolvedTitle, hasMorePending, this.onDownloadHandler);
          } else if (!res && hasMorePending === false) {
            const notice = content.querySelector('.smartdm-pending-notice');
            if (notice) notice.remove();
          } else if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' +
              ((res && res.message) ? res.message : 'No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>') +
              '</div>';
          }
        } catch (uiErr) {
          if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">Error rendering formats.</div>';
          }
        }
      };

      const refreshActivePopover = () => {
        if (!popover.classList.contains('active') || content._smartdm_downloading) {
          stopPolling();
          return;
        }
        FormatRegistryEngine.fetchMediaFormats(videoUrl, mediaEl, updateFormatsFromFetch, true);
      };

      popover._smartdm_refresh = refreshActivePopover;

      stopPolling();
      if (!isFb) pollTimer = setInterval(refreshActivePopover, 1400);

      FormatRegistryEngine.fetchMediaFormats(videoUrl, mediaEl, updateFormatsFromFetch);
    });

    const onFullscreen = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        if (!fsEl.contains(host)) {
          fsEl.appendChild(host);
        }
      } else {
        if (document.body && !document.body.contains(host)) {
          document.body.appendChild(host);
        }
      }
      syncPos();
    };
    if (document.addEventListener) {
      document.addEventListener('fullscreenchange', onFullscreen);
      document.addEventListener('webkitfullscreenchange', onFullscreen);
    }

    document.body.appendChild(host);

    const playerItem = {
      host: host,
      syncPos: syncPos,
      isVisible: true,
      cleanup: () => {
        stopPolling();
        mediaListeners.forEach(([event, listener]) => mediaEl.removeEventListener(event, listener));
        delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
        if (document.removeEventListener) {
          document.removeEventListener('fullscreenchange', onFullscreen);
          document.removeEventListener('webkitfullscreenchange', onFullscreen);
        }
      }
    };
    this.activePlayers.set(mediaEl, playerItem);

    if (this.viewportObserver) {
      this.viewportObserver.observe(mediaEl);
    }

    syncPos();
    if (/(^|\.)(instagram\.com|tiktok\.com)$/.test(window.location.hostname)) this.syncVisiblePlayers();
  }

  static scanThumbnails() {
    // Sub-frame iframes are embed viewers or ads; thumbnail browsing shelves only exist in the top frame
    if (window.top !== window.self) return;

    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    const isDedicatedReelViewer = isFb && window.location.pathname.includes('/reel/');
    if (isDedicatedReelViewer) return; // Dedicated /reel/ page uses the full-screen player banner

    if (isFb) {
      // In Facebook Feed, scan Reel carousel and shelf cards (a[href*="/reel/"])
      const reelLinks = document.querySelectorAll('a[href*="/reel/"]');
      reelLinks.forEach((el) => {
        if (el.closest('div[role="dialog"]')) return;
        if (el.getAttribute(this.ATTR_THUMB_ATTACHED)) return;

        const cardContainer = el.closest('div[role="listitem"], div[role="gridcell"], div[data-pagelet*="Reels"], div[aria-label*="Reels"], article, li') || el;
        if (cardContainer.getAttribute(this.ATTR_THUMB_ATTACHED)) return;

        const videoUrl = SmartDmUtils.getCanonicalUrl(el.href);
        if (!videoUrl || !videoUrl.includes('/reel/')) return;

        const rect = cardContainer.getBoundingClientRect();
        if (rect.height < 60 || rect.width < 50) return;

        // The anchor is the identity of one Reel. A broad article or carousel
        // wrapper may contain many Reel links and must never own their badges.
        el.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');

        const cardTitle = VisualMountDetector.extractFacebookMediaTitle(null, cardContainer);
        this.attachThumbnailBadge(el, videoUrl, cardTitle);
      });
      return;
    }
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
      '.phimage',
      '.thumbnailWrapper',
      '.pcVideoListItem',
      '.videoBox',
      '.thumbBlock',
      '.videoCard',
      '.video-card',
      '.video-item'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    elements.forEach((el) => {
      const cardContainer = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, .videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb') || el;

      if (cardContainer.getAttribute(this.ATTR_THUMB_ATTACHED)) return;
      if (cardContainer.closest('[' + this.ATTR_THUMB_ATTACHED + ']')) return;

      if (cardContainer.clientHeight > 0 && cardContainer.clientHeight < 40) return;

      let videoUrl = null;
      const link = cardContainer.querySelector('a[href*="/watch?v="], a[href*="/watch/"], a[href*="/shorts/"], a[href*="/video/"], a[href*="/view_video.php"]') || (cardContainer.tagName === 'A' ? cardContainer : null);
      if (link && link.href) {
        videoUrl = link.href;
      } else if (cardContainer.tagName === 'A' && cardContainer.href) {
        videoUrl = cardContainer.href;
      }

      if (!videoUrl) return;

      const targetMount = VisualMountDetector.findVisualThumbnailMount(cardContainer);
      if (!targetMount) return;

      if (targetMount.getAttribute(this.ATTR_THUMB_ATTACHED) && targetMount.querySelector('.smartdm-thumb-host')) return;

      cardContainer.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');
      targetMount.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');

      if (window.getComputedStyle(targetMount).position === 'static') {
        targetMount.style.position = 'relative';
      }

      const cardTitle = VisualMountDetector.extractCardTitle(cardContainer);
      this.attachThumbnailBadge(targetMount, SmartDmUtils.getCanonicalUrl(videoUrl), cardTitle);
    });
  }

  static attachThumbnailBadge(containerEl, videoUrl, cardTitle = null) {
    if (this.thumbnailHosts.has(containerEl)) return;

    const isFb = videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch'));
    const isFbReel = (videoUrl && videoUrl.includes('/reel/')) || (isFb && !containerEl.closest?.('ytd-thumbnail'));

    const host = document.createElement('div');
    host.className = 'smartdm-thumb-host';

    if (isFbReel) {
      // Facebook Reel cards are links inside clipped, transformed carousels.
      // Mount the control at the document root so the link cannot swallow clicks
      // and the fixed popover is not clipped by the card.
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'auto';

      const syncPos = () => {
        const rect = containerEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.bottom <= 0 ||
            rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
          host.style.display = 'none';
          return;
        }

        const badgeRect = { left: rect.right - 105, right: rect.right,
          top: rect.top + 6, bottom: rect.top + 38 };
        const visible = !this.isBadgeClipped(containerEl, badgeRect);
        host.style.display = visible ? 'block' : 'none';
        if (visible) {
          host.style.top = Math.max(6, rect.top + 6) + 'px';
          host.style.left = Math.max(6, Math.min(window.innerWidth - 105, rect.right - 105)) + 'px';
        }
      };
      host._smartdm_sync_pos = syncPos;
    } else {
      // Standard video cards (YouTube, Bilibili, etc.):
      // Mount directly inside containerEl with absolute positioning.
      // Moves naturally with scroll; zero JS reflow overhead.
      if (window.getComputedStyle(containerEl).position === 'static') {
        containerEl.style.position = 'relative';
      }
      host.style.position = 'absolute';
      host.style.top = '6px';
      host.style.right = '6px';
      host.style.zIndex = '99999';
      host.style.pointerEvents = 'auto';
    }

    host.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
      <button class="thumb-btn">
        <span class="download-icon"></span>
        <span>SmartDM</span>
      </button>
      <div class="popover">
        <div class="popover-title">SmartDM Video Download</div>
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.thumb-btn');
    const popover = shadow.querySelector('.popover');
    // Inline positioning also wins over an adopted stylesheet's source order.
    popover.style.position = isFbReel ? 'absolute' : 'fixed';
    const content = shadow.querySelector('.popover-content');

    const closePopover = () => {
      popover.classList.remove('active');
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        closePopover();
        return;
      }

      document.querySelectorAll('.smartdm-thumb-host, .smartdm-player-host').forEach(h => {
        if (h !== host && h.shadowRoot) {
          const p = h.shadowRoot.querySelector('.popover');
          if (p) p.classList.remove('active');
          if (h._smartdm_stop_poll) h._smartdm_stop_poll();
        }
      });

      const rect = host.getBoundingClientRect();
      const popoverWidth = 290;
      let left = rect.right - popoverWidth;
      if (left < 10) left = 10;
      if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
      }

      if (isFbReel) {
        // The popover is positioned inside the fixed badge host, so use
        // coordinates relative to that host rather than viewport coordinates.
        popover.style.left = (left - rect.left) + 'px';
        const popoverTop = rect.bottom + 6;
        if (popoverTop + 380 > window.innerHeight && rect.top > 390) {
          popover.style.top = 'auto';
          popover.style.bottom = (rect.height + 6) + 'px';
        } else {
          popover.style.top = (rect.height + 6) + 'px';
          popover.style.bottom = 'auto';
        }
      } else {
        // Standard popover is positioned fixed relative to viewport
        popover.style.left = left + 'px';
        const popoverTop = rect.bottom + 6;
        if (popoverTop + 380 > window.innerHeight && rect.top > 390) {
          popover.style.top = 'auto';
          popover.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        } else {
          popover.style.top = popoverTop + 'px';
          popover.style.bottom = 'auto';
        }
      }

      content._smartdm_downloading = false;
      content._mediaEl = null;
      popover.classList.add('active');

      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
      const isFbUrl = videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch');
      const pageTitle = (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : (isYouTube ? 'YouTube Video' : (isFbUrl ? 'facebook_video' : 'video'));

      if (isFbUrl) {
        // A feed thumbnail has no player-bound stream identity. Fetching the
        // whole Facebook page can return another Reel and stalls busy feeds.
        content.innerHTML = '<div class="status-text">Open this Reel, play it briefly, then use Download Video on the player.</div>';
        const openReel = document.createElement('button');
        openReel.className = 'format-item';
        openReel.textContent = 'Open Reel';
        openReel.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(videoUrl);
        });
        content.appendChild(openReel);
        return;
      }

      let currentFormats = [];
      let instantFormats = null;
      if (isYouTube) {
        instantFormats = FormatRegistryEngine.getInstantYouTubeFormats(videoUrl, pageTitle);
      }

      if (instantFormats && instantFormats.length > 0) {
        currentFormats = [...instantFormats];
        OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, pageTitle, true, this.onDownloadHandler);
      } else {
        content.innerHTML = `
          <div class="spinner-container">
            <div class="spinner"></div>
            <span class="status-text" style="padding:0;">Loading video options...</span>
          </div>
        `;
      }

      FormatRegistryEngine.fetchMediaFormats(videoUrl, null, (res, hasMorePending) => {
        try {
          if (this.thumbnailHosts.get(containerEl) !== host || !popover.classList.contains('active')) return;
          if (content._smartdm_downloading) return;
          const resolvedTitle = FormatRegistryEngine.isSocialFeed?.() && res?.title ? res.title : (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : ((res && res.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : pageTitle);
          if (res && res.formats && res.formats.length > 0) {
            currentFormats = FormatRegistryEngine.isSocialFeed?.() ? res.formats.slice() : FormatRegistryEngine.mergeFormatLists(currentFormats, res.formats);
            OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, resolvedTitle, hasMorePending, this.onDownloadHandler);
          } else if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' +
              ((res && res.message) ? res.message : 'No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>') +
              '</div>';
          }
        } catch(uiErr) {
          if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">Error rendering formats.</div>';
          }
        }
      });
    });

    if (isFbReel) {
      document.body.appendChild(host);
      this.thumbnailHosts.set(containerEl, host);
      host._smartdm_sync_pos();
    } else {
      containerEl.appendChild(host);
      this.thumbnailHosts.set(containerEl, host);
    }
  }
}
