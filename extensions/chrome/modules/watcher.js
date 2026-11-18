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
  static onDownloadHandler = null;
  static onBatchDownloadHandler = null;
  static youtubePrefetchTargets = new WeakMap();
  static youtubePrefetchQueue = new Map();
  static youtubePrefetchActive = 0;
  static youtubePrefetchTimer = null;
  static childOverlayFrames = new WeakSet();
  static frameOwnershipInstalled = false;

  static announceFrameOwnership() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({type: 'SMARTDM_OVERLAY_OWNER', active: this.activePlayers.size > 0}, '*');
    }
  }

  static requestFrameOwnership(frame) {
    frame.contentWindow?.postMessage({type: 'SMARTDM_OVERLAY_OWNER_QUERY'}, '*');
  }

  static initFrameOwnership() {
    if (this.frameOwnershipInstalled) return;
    this.frameOwnershipInstalled = true;
    window.addEventListener('message', event => {
      if (event.data?.type === 'SMARTDM_OVERLAY_OWNER_QUERY' && event.source === window.parent && window.parent !== window) {
        this.announceFrameOwnership();
        return;
      }
      if (event.data?.type !== 'SMARTDM_OVERLAY_OWNER' || typeof event.data.active !== 'boolean' || !event.source) return;
      // Only the window belonging to this exact mounted iframe may suppress its fallback.
      for (const [frame, item] of this.activePlayers) {
        if (frame.tagName !== 'IFRAME' || frame.contentWindow !== event.source) continue;
        if (event.data.active) {
          this.childOverlayFrames.add(frame);
          item.host.shadowRoot?.querySelector('.popover')?.classList.remove('active');
          item.host._smartdm_stop_poll?.();
        } else this.childOverlayFrames.delete(frame);
        item.syncPos();
      }
    });
    window.addEventListener('pagehide', () => {
      if (window.parent && window.parent !== window)
        window.parent.postMessage({type: 'SMARTDM_OVERLAY_OWNER', active: false}, '*');
    });
    window.addEventListener('pageshow', () => this.announceFrameOwnership());
  }

  static queueYouTubePrefetch(target, priority = false) {
    const item = this.youtubePrefetchTargets.get(target);
    if (!item || target.isConnected === false || document.visibilityState === 'hidden') return;
    const url = item.getUrl();
    if (!FormatRegistryEngine.youTubeCacheKey(url) || FormatRegistryEngine.getInstantYouTubeFormats(url).length) return;
    this.youtubePrefetchQueue.delete(target);
    if (priority) this.youtubePrefetchQueue = new Map([[target, item], ...this.youtubePrefetchQueue]);
    else this.youtubePrefetchQueue.set(target, item);
    // Infinite shelves must not retain an unbounded queue of DOM closures.
    while (this.youtubePrefetchQueue.size > 8) {
      const last = Array.from(this.youtubePrefetchQueue.keys()).pop();
      this.youtubePrefetchQueue.delete(last);
    }
    if (!this.youtubePrefetchTimer) this.youtubePrefetchTimer = setTimeout(() => {
      this.youtubePrefetchTimer = null;
      this.drainYouTubePrefetch();
    }, 150);
  }

  static drainYouTubePrefetch() {
    if (document.visibilityState === 'hidden') { this.youtubePrefetchQueue.clear(); return; }
    while (this.youtubePrefetchActive < 2 && this.youtubePrefetchQueue.size) {
      const [target, item] = this.youtubePrefetchQueue.entries().next().value;
      this.youtubePrefetchQueue.delete(target);
      if (target.isConnected === false || this.youtubePrefetchTargets.get(target) !== item || !item.visible) continue;
      // SPA players can change video while queued; read their URL at dispatch.
      const url = item.getUrl();
      if (!FormatRegistryEngine.youTubeCacheKey(url)) continue;
      this.youtubePrefetchActive++;
      FormatRegistryEngine.fetchYouTubeFormats(url, () => {
        this.youtubePrefetchActive--;
        this.drainYouTubePrefetch();
      });
    }
  }

  static observeYouTubeFormats(target, getUrl) {
    if (typeof FormatRegistryEngine === 'undefined' || !FormatRegistryEngine.youTubeCacheKey?.(getUrl())) return () => {};
    const item = {getUrl, visible: false};
    this.youtubePrefetchTargets.set(target, item);
    const intent = () => { item.visible = true; this.queueYouTubePrefetch(target, true); };
    target.addEventListener?.('pointerenter', intent, {passive: true});
    target.addEventListener?.('focusin', intent, {passive: true});
    if (typeof IntersectionObserver !== 'undefined') {
      if (!this.youtubePrefetchObserver) this.youtubePrefetchObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const state = this.youtubePrefetchTargets.get(entry.target);
          if (!state) continue;
          state.visible = entry.isIntersecting && (entry.intersectionRatio ?? 1) >= 0.25;
          if (state.visible) this.queueYouTubePrefetch(entry.target);
          else this.youtubePrefetchQueue.delete(entry.target);
        }
      }, {threshold: 0.25});
      this.youtubePrefetchObserver.observe(target);
    }
    return () => {
      this.youtubePrefetchObserver?.unobserve(target);
      this.youtubePrefetchTargets.delete(target);
      this.youtubePrefetchQueue.delete(target);
      target.removeEventListener?.('pointerenter', intent);
      target.removeEventListener?.('focusin', intent);
    };
  }

  static styleMarkup(shadow) {
    OverlayUiRenderer.bindAppearance?.(shadow);
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

  static init(onDownloadHandler, onBatchDownloadHandler = null) {
    this.onDownloadHandler = onDownloadHandler;
    this.onBatchDownloadHandler = onBatchDownloadHandler;
    this.initFrameOwnership();

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
      this.spaScanTimers = [150, 500, 1000, 2000].map(delay => setTimeout(() => this.scanAll(), delay));
    };

    const spaEvents = ['yt-navigate-finish', 'yt-page-data-updated', 'ytmusic-page-data-updated', 'ytmusic-navigate-finish', 'yt-navigate-start', 'popstate'];
    spaEvents.forEach(evt => {
      window.addEventListener(evt, onSpaNavigate, { passive: true });
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener(evt, onSpaNavigate, { passive: true });
      }
    });

    if (typeof history !== 'undefined' && history.pushState && !history._smartdm_patched) {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function(...args) {
        const res = origPush.apply(this, args);
        onSpaNavigate();
        return res;
      };
      history.replaceState = function(...args) {
        const res = origReplace.apply(this, args);
        onSpaNavigate();
        return res;
      };
      history._smartdm_patched = true;
    }

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
              const tag = (node.tagName || '').toUpperCase();
              if (tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME' || tag.startsWith('YTMUSIC-') || tag.startsWith('YTD-') || tag.startsWith('YT-') ||
                  (node.querySelector && node.querySelector('video, audio, iframe, ytd-thumbnail, yt-thumbnail-view-model, yt-lockup-view-model, ytmusic-player-bar, ytmusic-header-renderer, ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-editable-playlist-detail-header-renderer, ytmusic-responsive-list-item-renderer, .action-buttons, #top-level-buttons-computed, #top-level-buttons, .middle-controls, .middle-controls-buttons, a[href*="/watch"], a[href*="/reel/"], a[href*="/shorts/"], a[href*="/live/"]'))) {
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
      const frameOwnsOverlay = this.childOverlayFrames.has(item.mediaEl);
      item.host.style.display = frameOwnsOverlay ? 'none' : '';
      if (frameOwnsOverlay) continue;
      if ((singleReel && selected?.item !== item) || r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerH) {
        item.host.style.opacity = '0';
        item.host.style.pointerEvents = 'none';
      } else {
        item.host.style.opacity = '1';
        item.host.style.pointerEvents = 'auto';
        if (!item.host._smartdm_apply_drag_position?.()) {
          item.host.style.top = (r.top + 16) + 'px';
          item.host.style.left = Math.max(8, Math.min(window.innerWidth - 145, r.right - 145)) + 'px';
        }
      }
    }
  }

  static pruneDisconnectedThumbnails() {
    for (const [mount, host] of this.thumbnailHosts.entries()) {
      if (!mount.isConnected) {
        if (host._smartdm_stop_poll) host._smartdm_stop_poll();
        host._smartdm_drag_cleanup?.();
        host._smartdm_prefetch_cleanup?.();
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
    if (!mount || !mount.parentElement) return false;
    let depth = 0;
    for (let parent = mount.parentElement; parent && depth < 6; parent = parent.parentElement, depth++) {
      if (parent === document.body || parent === document.documentElement) break;
      const overflow = parent.style ? (parent.style.overflow || parent.style.overflowX || parent.style.overflowY || '') : '';
      let isClipper = /hidden|clip|auto|scroll/.test(overflow);
      if (!isClipper && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try {
          const style = window.getComputedStyle(parent);
          isClipper = style && /hidden|clip|auto|scroll/.test(style.overflowX || style.overflowY || style.overflow || '');
        } catch (_) {}
      }
      if (!isClipper) continue;
      if (typeof parent.getBoundingClientRect !== 'function') continue;
      const bounds = parent.getBoundingClientRect();
      if (!bounds) continue;
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
      this.childOverlayFrames.delete(mediaEl);
      mediaEl.removeAttribute?.(this.ATTR_PLAYER_ATTACHED);
      this.announceFrameOwnership();
    }
  }

  static scanAll() {
    this.syncVisibleThumbnails();
    this.scanYouTubeMusic();
    this.scanPlayers();
    this.scanThumbnails();
  }

  static scanYouTubeMusic() {
    if (typeof window === 'undefined' || !window.location || !window.location.hostname.includes('music.youtube.com')) return;

    // 1. Single Music Player Bar
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      const existingHost = playerBar.querySelector?.('.smartdm-ytmusic-host') ||
                           playerBar.shadowRoot?.querySelector?.('.smartdm-ytmusic-host');
      if (!playerBar.getAttribute('data-smartdm-mounted') || !existingHost || !existingHost.isConnected) {
        this.attachYouTubeMusicPlayerBar(playerBar);
      }
    }

    // 2. Playlist / Album Page Header
    const isPlaylistOrAlbum = window.location.pathname.includes('/playlist') ||
                              window.location.pathname.includes('/browse/MPREb') ||
                              window.location.pathname.includes('/browse/VL') ||
                              window.location.pathname.includes('/browse/FEmusic_library') ||
                              window.location.pathname.includes('/channel/') ||
                              window.location.search.includes('list=') ||
                              (typeof document !== 'undefined' && !!document.querySelector('ytmusic-responsive-list-item-renderer'));
    if (isPlaylistOrAlbum) {
      let headers = [];
      try {
        headers = Array.from(document.querySelectorAll(
          'ytmusic-editable-playlist-detail-header-renderer, ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-header-renderer'
        ));
      } catch (_) {}
      if (headers.length === 0) {
        const h = document.querySelector?.(
          'ytmusic-editable-playlist-detail-header-renderer, ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-header-renderer'
        );
        if (h) headers = [h];
      }

      // Filter to prefer visible/active headers (avoid attaching to stale hidden SPA headers)
      const visibleHeaders = headers.filter(h => {
        if (!h) return false;
        if (h.hasAttribute?.('hidden') || h.closest?.('[hidden]')) return false;
        if (typeof h.offsetParent !== 'undefined' && h.offsetParent === null && h.offsetWidth === 0 && h.offsetHeight === 0) {
          return false;
        }
        return true;
      });
      const candidateHeaders = visibleHeaders.length > 0 ? visibleHeaders : headers;

      for (const header of candidateHeaders) {
        const existingHost = header.querySelector?.('.smartdm-ytmusic-playlist-host') ||
                             header.shadowRoot?.querySelector?.('.smartdm-ytmusic-playlist-host');
        if (existingHost && existingHost.isConnected) continue;

        const outerHeader = header.parentElement?.closest?.(
          'ytmusic-editable-playlist-detail-header-renderer, ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-header-renderer'
        );
        if (outerHeader) {
          const outerExisting = outerHeader.querySelector?.('.smartdm-ytmusic-playlist-host') ||
                                outerHeader.shadowRoot?.querySelector?.('.smartdm-ytmusic-playlist-host');
          if (outerExisting && outerExisting.isConnected) continue;
        }

        this.attachYouTubeMusicPlaylistHeader(header);
        break;
      }
    }
  }

  static attachYouTubeMusicPlayerBar(playerBar) {
    if (!playerBar) return;
    const existingHost = playerBar.querySelector?.('.smartdm-ytmusic-host') ||
                         playerBar.shadowRoot?.querySelector?.('.smartdm-ytmusic-host');
    if (existingHost && existingHost.isConnected) return;
    playerBar.setAttribute('data-smartdm-mounted', 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-ytmusic-host smartdm-player-host';
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    host.style.margin = '0 6px';
    host.style.flexShrink = '0';
    host.style.zIndex = '100';

    // Place cleanly in player bar action buttons area:
    // 1. In .middle-controls immediately adjacent to three-dots menu (⋮) or like/dislike buttons
    // 2. Or in .right-controls-buttons next to volume/queue controls
    const root = playerBar.shadowRoot || playerBar;
    const middleControls = root.querySelector?.('.middle-controls') || playerBar.querySelector?.('.middle-controls');
    const menuEl = middleControls?.querySelector?.('ytmusic-menu-renderer, .menu') ||
                   middleControls?.querySelector?.('ytmusic-like-button-renderer');
    const mcButtons = middleControls?.querySelector?.('.middle-controls-buttons, #middle-controls-buttons');
    const rightControls = root.querySelector?.('.right-controls-buttons, #right-controls-buttons, .right-controls, #right-controls') ||
                          playerBar.querySelector?.('.right-controls-buttons, #right-controls-buttons, .right-controls, #right-controls');

    if (menuEl && menuEl.parentNode) {
      if (menuEl.nextSibling && typeof menuEl.parentNode.insertBefore === 'function') {
        menuEl.parentNode.insertBefore(host, menuEl.nextSibling);
      } else if (typeof menuEl.parentNode.appendChild === 'function') {
        menuEl.parentNode.appendChild(host);
      }
    } else if (mcButtons && typeof mcButtons.appendChild === 'function') {
      mcButtons.appendChild(host);
    } else if (middleControls && typeof middleControls.appendChild === 'function') {
      middleControls.appendChild(host);
    } else if (rightControls && typeof rightControls.appendChild === 'function') {
      rightControls.appendChild(host);
    } else if (typeof playerBar.appendChild === 'function') {
      playerBar.appendChild(host);
    }

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
      <button class="banner-btn ytmusic-bar-btn" title="Download current track with SmartDM">
        <svg class="ytmusic-svg-icon" viewBox="0 0 24 24">
          <path d="M17 18v1H6v-1h11zm-.5-6.6-.7-.7-3.8 3.7V4h-1v10.4l-3.8-3.8-.7.7 5 5 5-5z"/>
        </svg>
        <span>Download</span>
      </button>
      <div class="popover">
        <div class="popover-title">${OverlayUiRenderer.headerMarkup ? OverlayUiRenderer.headerMarkup() : 'Download'}</div>
        ${OverlayUiRenderer.sectionMarkup ? OverlayUiRenderer.sectionMarkup() : ''}
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.banner-btn');
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

    btn.addEventListener('click', (e) => {
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
      content._mediaEl = null;

      const rect = btn.getBoundingClientRect();
      const popoverWidth = 290;
      let left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, rect.left + (rect.width - popoverWidth) / 2));
      popover.style.position = 'fixed';
      popover.style.left = left + 'px';
      popover.style.bottom = Math.max(10, window.innerHeight - rect.top + 8) + 'px';
      popover.style.top = 'auto';
      popover.classList.add('active');

      const meta = (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractYouTubeMusicTrackMetadata) ?
        VisualMountDetector.extractYouTubeMusicTrackMetadata(playerBar) : null;
      const trackUrl = meta?.trackUrl || SmartDmUtils.getCanonicalUrl(window.location.href);
      const trackTitle = meta?.fullTitle || (meta?.title ? (meta.artist ? `${meta.title} - ${meta.artist}` : meta.title) : SmartDmUtils.extractWatchPageTitle()) || 'YouTube Music Track';

      let currentFormats = [];
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Loading track options...</span>
        </div>
      `;

      const updateFormatsFromFetch = (res, hasMorePending) => {
        try {
          if (!popover.classList.contains('active')) return;
          if (content._smartdm_downloading) return;
          const resolvedTitle = (res?.title && !SmartDmUtils.isGenericTitle(res.title) && res.title !== 'YouTube Video') ?
            res.title : trackTitle;
          if (res && res.formats && res.formats.length > 0) {
            currentFormats = FormatRegistryEngine.mergeFormatLists(currentFormats, res.formats);
            OverlayUiRenderer.renderFormatDropdown(content, currentFormats, trackUrl, popover, resolvedTitle, hasMorePending, this.onDownloadHandler);

            const hasPlaylist = window.location.search.includes('list=') ||
                                (meta && meta.playlistId) ||
                                (typeof document !== 'undefined' && !!document.querySelector('ytmusic-responsive-list-item-renderer'));
            if (hasPlaylist && !content.querySelector('.smartdm-playlist-quick-btn')) {
              const playlistBtn = document.createElement('button');
              playlistBtn.className = 'format-item smartdm-playlist-quick-btn';
              playlistBtn.style.marginTop = '6px';
              playlistBtn.style.background = 'rgba(56, 189, 248, 0.15)';
              playlistBtn.style.borderColor = 'rgba(56, 189, 248, 0.4)';
              playlistBtn.innerHTML = `
                <div class="format-info">
                  <span class="format-title" style="color:#38bdf8;">Download Full Playlist</span>
                  <span style="font-size:10px; color:#94a3b8;">Queue all playlist tracks</span>
                </div>
                <span class="format-badge">Playlist</span>
              `;
              playlistBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                MediaWatcher.triggerYouTubeMusicPlaylistDownload(content, popover, this.onDownloadHandler, this.onBatchDownloadHandler);
              });
              content.appendChild(playlistBtn);
            }
          } else if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' +
              ((res && res.message) ? res.message : 'No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Play track briefly or ensure SmartDM desktop app is running.</span>') +
              '</div>';
          }
        } catch(uiErr) {
          if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">Error rendering formats.</div>';
          }
        }
      };

      const refreshActivePopover = () => {
        if (!popover.classList.contains('active') || content._smartdm_downloading || !host.isConnected) {
          stopPolling();
          return;
        }
        FormatRegistryEngine.fetchMediaFormats(trackUrl, null, updateFormatsFromFetch, true);
      };
      popover._smartdm_refresh = refreshActivePopover;

      stopPolling();
      pollTimer = setInterval(refreshActivePopover, 1400);
      if (typeof pollTimer?.unref === 'function') pollTimer.unref();
      FormatRegistryEngine.fetchMediaFormats(trackUrl, null, updateFormatsFromFetch);
    });
  }

  static attachYouTubeMusicPlaylistHeader(header) {
    if (!header) return;
    const innerHeader = header.querySelector?.('ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer') ||
                        header.shadowRoot?.querySelector?.('ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer');
    const targetHeader = innerHeader || header;

    const existingHost = targetHeader.querySelector?.('.smartdm-ytmusic-playlist-host') ||
                         targetHeader.shadowRoot?.querySelector?.('.smartdm-ytmusic-playlist-host') ||
                         header.querySelector?.('.smartdm-ytmusic-playlist-host') ||
                         header.shadowRoot?.querySelector?.('.smartdm-ytmusic-playlist-host');
    if (existingHost && existingHost.isConnected) return;
    header.setAttribute('data-smartdm-playlist-mounted', 'true');
    if (targetHeader !== header) {
      targetHeader.setAttribute('data-smartdm-playlist-mounted', 'true');
    }

    const host = document.createElement('div');
    host.className = 'smartdm-ytmusic-playlist-host smartdm-player-host';
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    host.style.margin = '4px 6px';
    host.style.zIndex = '9999';

    // Find action button targets: .action-buttons, #top-level-buttons-computed, .buttons, or immediately adjacent to play/menu
    const findInTarget = (sel) => {
      return targetHeader.querySelector?.(sel) ||
             targetHeader.shadowRoot?.querySelector?.(sel) ||
             header.querySelector?.(sel) ||
             header.shadowRoot?.querySelector?.(sel) ||
             null;
    };

    const menuEl = findInTarget('ytmusic-menu-renderer, .menu');
    const playEl = findInTarget('ytmusic-play-button-renderer, #play-button');
    const buttonsContainer = findInTarget(
      '.action-buttons, #top-level-buttons-computed, #top-level-buttons, .top-level-buttons, .buttons, #buttons, [slot="buttons"], #actions, .actions'
    );

    if (menuEl && menuEl.parentNode && typeof menuEl.parentNode.insertBefore === 'function') {
      menuEl.parentNode.insertBefore(host, menuEl);
    } else if (playEl && playEl.parentNode) {
      if (playEl.nextSibling && typeof playEl.parentNode.insertBefore === 'function') {
        playEl.parentNode.insertBefore(host, playEl.nextSibling);
      } else if (typeof playEl.parentNode.appendChild === 'function') {
        playEl.parentNode.appendChild(host);
      }
    } else if (buttonsContainer && typeof buttonsContainer.appendChild === 'function') {
      buttonsContainer.appendChild(host);
    } else if (typeof targetHeader.appendChild === 'function') {
      targetHeader.appendChild(host);
    } else if (typeof header.appendChild === 'function') {
      header.appendChild(host);
    }

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
      <button class="banner-btn ytmusic-playlist-header-btn" title="Download all tracks in this playlist">
        <svg class="ytmusic-svg-icon" viewBox="0 0 24 24">
          <path d="M17 18v1H6v-1h11zm-.5-6.6-.7-.7-3.8 3.7V4h-1v10.4l-3.8-3.8-.7.7 5 5 5-5z"/>
        </svg>
        <span>Download Playlist</span>
      </button>
      <div class="popover">
        <div class="popover-title">${OverlayUiRenderer.headerMarkup ? OverlayUiRenderer.headerMarkup() : 'Download'}</div>
        ${OverlayUiRenderer.sectionMarkup ? OverlayUiRenderer.sectionMarkup() : ''}
        <div class="popover-content">
          <div class="status-text">Scanning playlist tracks...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.banner-btn');
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

      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
        if (h !== host && h.shadowRoot) {
          const p = h.shadowRoot.querySelector('.popover');
          if (p) p.classList.remove('active');
          if (h._smartdm_stop_poll) h._smartdm_stop_poll();
        }
      });

      content._smartdm_downloading = false;
      if (OverlayUiRenderer.positionPopover) {
        OverlayUiRenderer.positionPopover(popover, btn.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      }
      popover.classList.add('active');

      MediaWatcher.triggerYouTubeMusicPlaylistDownload(content, popover, this.onDownloadHandler, this.onBatchDownloadHandler);
    });
  }

  static triggerYouTubeMusicPlaylistDownload(content, popover, onDownloadHandler = null, onBatchDownloadHandler = null) {
    if (!content) return;
    const playlistMeta = (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractYouTubeMusicPlaylistMetadata) ?
      VisualMountDetector.extractYouTubeMusicPlaylistMetadata() : null;

    if (!playlistMeta || !playlistMeta.tracks || playlistMeta.tracks.length === 0) {
      content.innerHTML = `
        <div class="status-text" style="color:#f87171;">
          No playlist tracks detected.<br>
          <span style="font-size:10px; color:#94a3b8;">Navigate to a playlist page or scroll down to load tracks.</span>
        </div>
      `;
      return;
    }

    const count = playlistMeta.tracks.length;
    const title = playlistMeta.title || 'Playlist';

    content.innerHTML = `
      <div style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">${SmartDmUtils.sanitizeCleanTitle(title)}</span>
        <span style="font-size:10px; color:#38bdf8; font-weight:normal;">${count} track${count === 1 ? '' : 's'}</span>
      </div>
      <button class="format-item download-playlist-audio" style="margin-bottom:4px; width:100%;">
        <div class="format-info">
          <span class="format-title">Download All as Audio</span>
          <span style="font-size:10px; color:#94a3b8;">Queue ${count} tracks as MP3 High Quality</span>
        </div>
        <span class="format-badge">MP3 Audio</span>
      </button>
      <button class="format-item download-playlist-video" style="margin-bottom:6px; width:100%;">
        <div class="format-info">
          <span class="format-title">Download All as Video</span>
          <span style="font-size:10px; color:#94a3b8;">Queue ${count} tracks as MP4 Video</span>
        </div>
        <span class="format-badge">MP4 Video</span>
      </button>
      <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; margin-top:4px; margin-bottom:2px;">Track list:</div>
      <div class="playlist-preview-list" style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; padding-right:2px; font-size:11px;">
        ${playlistMeta.tracks.slice(0, 100).map((t, i) => `
          <div style="display:flex; justify-content:space-between; color:#cbd5e1; padding:2px 4px; background:rgba(255,255,255,0.03); border-radius:3px;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">${i + 1}. ${t.fullTitle}</span>
            <span style="color:#64748b; font-size:10px; margin-left:4px;">${t.duration || ''}</span>
          </div>
        `).join('')}
      </div>
    `;

    const queueTracks = (isAudio) => {
      content._smartdm_downloading = true;
      content.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="status-text" style="padding:0;">Queueing ${count} tracks to SmartDM...</span>
        </div>
      `;

      let queued = 0;
      const batchHandler = onBatchDownloadHandler || MediaWatcher.onBatchDownloadHandler;
      const singleHandler = onDownloadHandler || MediaWatcher.onDownloadHandler;
      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);

      const items = [];
      playlistMeta.tracks.forEach((track, index) => {
        const ext = isAudio ? 'mp3' : 'mp4';
        const formatId = isAudio ? 'bestaudio/best' : '1080p';
        const targetUrl = track.trackUrl || (track.videoId ? `https://music.youtube.com/watch?v=${track.videoId}` : null);
        if (!targetUrl) return;

        items.push({
          url: targetUrl,
          directUrl: targetUrl,
          title: track.fullTitle,
          fileName: `${track.fullTitle}.${ext}`,
          formatId: formatId,
          ext: ext,
          isAudioOnly: isAudio,
          referer: window.location.href,
          pageUrl: window.location.href
        });
      });

      queued = items.length;

      const batchPayload = {
        type: 'ADD_MEDIA_BATCH',
        batchTitle: playlistMeta.title || 'Playlist',
        playlistTitle: playlistMeta.title || 'Playlist',
        playlistId: playlistMeta.playlistId || null,
        isAudio: isAudio,
        referer: window.location.href,
        pageUrl: window.location.href,
        items: items
      };

      if (typeof batchHandler === 'function') {
        batchHandler(batchPayload);
      } else if (typeof singleHandler === 'function') {
        items.forEach(item => {
          singleHandler([item], item, item.title);
        });
      } else if (runtime && runtime.sendMessage) {
        runtime.sendMessage(batchPayload);
      }

      const fbTimer = setTimeout(() => {
        content.innerHTML = `
          <div class="status-text" style="color:#38bdf8; font-weight:700; font-size:12px;">
            ✓ Queued ${queued} tracks to SmartDM!
          </div>
          <div class="status-text" style="font-size:10px; color:#94a3b8;">
            Check your SmartDM download queue.
          </div>
        `;
        const cTimer = setTimeout(() => {
          popover.classList.remove('active');
        }, 2200);
        if (typeof cTimer?.unref === 'function') cTimer.unref();
      }, 500);
      if (typeof fbTimer?.unref === 'function') fbTimer.unref();
    };

    const audioBtn = content.querySelector('.download-playlist-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        queueTracks(true);
      });
    }

    const videoBtn = content.querySelector('.download-playlist-video');
    if (videoBtn) {
      videoBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        queueTracks(false);
      });
    }
  }

  static isPlayerIframe(el) {
    if (!el || el.tagName !== 'IFRAME') return false;

    // Filter out hidden, miniature, ad or tracking iframes
    const w = el.clientWidth || el.offsetWidth || parseInt(el.width, 10) || 0;
    const h = el.clientHeight || el.offsetHeight || parseInt(el.height, 10) || 0;
    if ((w > 0 && w < 280) || (h > 0 && h < 140)) return false;

    const src = (el.src || el.getAttribute('src') || el.getAttribute('data-src') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();

    // Ignore known ads/analytics/captchas
    if (src.includes('google') || src.includes('doubleclick') || src.includes('recaptcha') ||
        src.includes('hcaptcha') || src.includes('analytics') || src.includes('disqus') ||
        src.includes('facebook.com/plugins') || src.includes('twitter.com/widgets') ||
        id.includes('ad-') || cls.includes('ad-') || id.includes('banner') || cls.includes('banner')) {
      return false;
    }

    // Direct player host patterns or streaming embed indicators
    const playerKeywords = /stream|embed|player|video|movie|watch|vidqueen|vidsrc|2embed|autoembed|superembed|streamembed|cloud|tape|filemoon|dood|mixdrop|voe|streamtape|rabbitstream|megacloud|streamwish|mp4upload|upstream|play|kwik|megap|sunwave|owocdn|shiora|vplayer|nexus|anizone|miruro|animesuge|animepahe|wmovies|111movies|jabroni|goldenkite|stellar/i;
    if (playerKeywords.test(src) || playerKeywords.test(id) || playerKeywords.test(cls) || playerKeywords.test(title)) {
      return true;
    }

    if (el.matches?.('#player, #vplayer, .player-container, #player-container, iframe[src*="kwik"], iframe[src*="megap"], iframe[src*="sunwave"], iframe[src*="shiora"], iframe[src*="owocdn"], iframe[src*="anizone"], iframe[src*="vplayer"], iframe[src*="nexus"], iframe[src*="jabroni"], iframe[src*="goldenkite"], iframe[src*="111movies"], iframe[src*="wmovies"]')) {
      return true;
    }

    // Check parent container for player id/class (e.g. #player, .player-wrapper)
    const container = el.closest ? el.closest('#player, #vplayer, #player-wrapper, #player-holder, #iframe-player, .player, .player-container, .embed-responsive, [class*="player" i]') : null;
    if (container) return true;

    // Check iframe allow attribute (e.g. allow="autoplay; fullscreen; encrypted-media")
    const allow = (el.getAttribute('allow') || '').toLowerCase();
    if (allow.includes('fullscreen') || allow.includes('autoplay') || allow.includes('encrypted-media')) {
      if (w >= 300 || h >= 180 || el.getAttribute('allowfullscreen') !== null) {
        return true;
      }
    }

    // On movie / watch pages, any sufficiently large iframe without local video is likely a player
    const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
    const isWatchPage = path.includes('/watch') || path.includes('/movie') || path.includes('/film') || path.includes('/episode') || path.includes('/play') || path.includes('/series') || path.includes('/tv') || path.includes('/show') || path.includes('/view');
    if (isWatchPage && (w >= 400 || h >= 250 || el.getAttribute('allowfullscreen') !== null)) {
      return true;
    }

    return false;
  }

  static scanPlayers() {
    for (const [el] of this.activePlayers.entries()) {
      if (!el.isConnected) {
        this.cleanupPlayer(el);
      }
    }
    const mediaElements = document.querySelectorAll('video:not([' + this.ATTR_PLAYER_ATTACHED + ']), audio:not([' + this.ATTR_PLAYER_ATTACHED + '])');
    mediaElements.forEach(el => this.attachPlayerBanner(el));

    // Recursively scan open shadow roots for video/audio and player iframes
    const findShadowMediaAndIframes = (root) => {
      if (!root || !root.querySelectorAll) return;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          const videos = el.shadowRoot.querySelectorAll('video:not([' + this.ATTR_PLAYER_ATTACHED + ']), audio:not([' + this.ATTR_PLAYER_ATTACHED + '])');
          videos.forEach(v => this.attachPlayerBanner(v));
          const ifrs = el.shadowRoot.querySelectorAll('iframe:not([' + this.ATTR_PLAYER_ATTACHED + '])');
          ifrs.forEach(ifr => {
            if (this.isPlayerIframe(ifr)) this.attachPlayerBanner(ifr);
          });
          findShadowMediaAndIframes(el.shadowRoot);
        }
      }
    };
    try { findShadowMediaAndIframes(document); } catch (_) {}

    // Support anime dedicated player containers and iframe embeds
    const animeContainers = document.querySelectorAll(
      '#player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#vplayer:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.player-container:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#player-container:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.player-wrapper:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#player-wrapper:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#embed-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#anime-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.anime-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#video-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.video-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#play-wrapper:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#play-area:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.play-area:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#player-holder:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.watch-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#watch-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#watch-holder:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.watch-holder:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.player-box:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#player-box:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '.play-box:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      '#play-box:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="kwik"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="megap"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="sunwave"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="shiora"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="owocdn"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="anizone"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="vplayer"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
      'iframe[src*="nexus"]:not([' + this.ATTR_PLAYER_ATTACHED + '])'
    );
    animeContainers.forEach(container => {
      const v = container.querySelector('video') || (container.shadowRoot ? container.shadowRoot.querySelector('video') : null);
      const ifr = container.tagName === 'IFRAME' ? container : container.querySelector('iframe');
      const target = v || ifr || container;
      if (target && !target.getAttribute(this.ATTR_PLAYER_ATTACHED)) {
        this.attachPlayerBanner(target);
        container.setAttribute(this.ATTR_PLAYER_ATTACHED, 'true');
      }
    });

    // Support Bilibili dedicated player containers
    const isBili = typeof window !== 'undefined' && window.location?.hostname &&
      (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));
    if (isBili) {
      const biliContainers = document.querySelectorAll(
        '.bstar-web-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
        '.bpx-player-container:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
        'div[class*="bstar-web-player"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
        'div[class*="bpx-player"]:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
        '#bilibili-player:not([' + this.ATTR_PLAYER_ATTACHED + ']), ' +
        '#bofqi:not([' + this.ATTR_PLAYER_ATTACHED + '])'
      );
      biliContainers.forEach(container => {
        const v = container.querySelector('video') || (container.shadowRoot ? container.shadowRoot.querySelector('video') : null);
        if (v) {
          if (!v.getAttribute(this.ATTR_PLAYER_ATTACHED)) {
            this.attachPlayerBanner(v);
          }
          container.setAttribute(this.ATTR_PLAYER_ATTACHED, 'true');
        }
      });
    }

    if (typeof window !== 'undefined' && window.top === window.self) {
      const iframes = document.querySelectorAll('iframe:not([' + this.ATTR_PLAYER_ATTACHED + '])');
      iframes.forEach(iframe => {
        if (this.isPlayerIframe(iframe)) {
          this.attachPlayerBanner(iframe);
        }
      });
    }
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

    // Dedicated main video player detection for YouTube and YouTube Music
    const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
    if (isYouTube) {
      if (mediaEl.closest('ytd-inline-preview-player, ytd-thumbnail, #inline-preview-player')) {
        return true;
      }
      if (mediaEl.closest('#movie_player, .html5-video-player, ytd-watch-flexy, ytd-shorts, #shorts-player, ytmusic-player, #player, ytmusic-player-page') ||
          (window.location.hostname.includes('music.youtube.com') && (mediaEl.closest('ytmusic-player-bar') || mediaEl.classList?.contains('html5-main-video')))) {
        return false;
      }
    }

    // Dedicated main video player detection for Bilibili
    const isBilibili = typeof window !== 'undefined' && window.location?.hostname &&
      (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));
    if (isBilibili) {
      if (mediaEl.closest('[class*="video-card"], [class*="bstar-video-card"], [class*="bili-video-card"], [class*="recommend"], aside, [class*="related"], [class*="feed"], [class*="list-item"]')) {
        return true;
      }
      if (mediaEl.closest('.bstar-web-player, .bpx-player-container, #bilibili-player, #bofqi, .bilibili-player, div[class*="bstar-web-player"], div[class*="bpx-player"], div[class*="player-container"], div[class*="player-wrap"], div[class*="video-wrap"], .bstar-player-wrap') ||
          mediaEl.classList?.contains('bpx-player-video-wrap')) {
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
      const isDedicatedWatch = (window.location.pathname.includes('/watch') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/shorts/') || window.location.pathname.includes('/play/') || window.location.pathname.includes('/video/')) &&
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
    const isTwitter = typeof window !== 'undefined' && /(^|\.)(x\.com|twitter\.com)$/i.test(window.location.hostname);
    if (isTwitter && mediaEl.closest?.('[data-testid="videoPlayer"], [data-testid="videoComponent"], article[data-testid="tweet"], article')) {
      return false;
    }
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

    // A wrapper and its actual media are one player; prefer the innermost owner.
    for (const [existing] of this.activePlayers) {
      if (mediaEl.contains?.(existing)) return;
    }

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

    for (const [existing] of this.activePlayers) {
      if (existing.contains?.(mediaEl)) this.cleanupPlayer(existing);
    }

    // Mark element only after confirmed main video player
    mediaEl.setAttribute(this.ATTR_PLAYER_ATTACHED, 'true');

    const host = document.createElement('div');
    host.className = 'smartdm-player-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';

    const syncPos = () => {
      const frameOwnsOverlay = this.childOverlayFrames.has(mediaEl);
      host.style.display = frameOwnsOverlay ? 'none' : '';
      if (frameOwnsOverlay) return;
      const r = mediaEl.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) {
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
      } else {
        host.style.opacity = '1';
        host.style.pointerEvents = 'auto';
        if (!host._smartdm_apply_drag_position?.()) {
          host.style.top = (r.top + 16) + 'px';
          const clampedLeft = Math.max(10, Math.min(window.innerWidth - 145, r.right - 145));
          host.style.left = clampedLeft + 'px';
        }
      }
    };

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
      <button type="button" class="banner-btn">
        ${OverlayUiRenderer.icon ? `<span class="smartdm-grip">${OverlayUiRenderer.icon('grip')}</span>${OverlayUiRenderer.icon('download')}` : '<span class="play-icon"></span>'}
        <span>Download</span>
      </button>
      <div class="popover">
        <div class="popover-title">${OverlayUiRenderer.headerMarkup ? OverlayUiRenderer.headerMarkup() : 'Download'}</div>
        ${OverlayUiRenderer.sectionMarkup ? OverlayUiRenderer.sectionMarkup() : ''}
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const bannerBtn = shadow.querySelector('.banner-btn');
    const popover = shadow.querySelector('.popover');
    const content = shadow.querySelector('.popover-content');
    host._smartdm_drag_cleanup = OverlayUiRenderer.makeDraggable?.(host, bannerBtn, popover);

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
        if (!FormatRegistryEngine.youTubeCacheKey?.(window.location.href)) {
          delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
          delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getCanonicalUrl(window.location.href)];
        }
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
      if (!FormatRegistryEngine.youTubeCacheKey?.(window.location.href)) {
        delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
      }
      mediaEl._smartdm_uid = 'vid_fb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      mediaEl._smartdm_active_time = Date.now();
      for (const attr of ['data-smartdm-bound-src', 'data-smartdm-video-url', 'data-smartdm-audio-url', 'data-smartdm-separate-audio']) mediaEl.removeAttribute?.(attr);
    };
    const onLoadStart = () => {
      mediaEl._smartdm_active_time = Date.now();
      this.queueYouTubePrefetch(mediaEl, true);
    };
    const isTwitterHost = typeof window !== 'undefined' && /(^|\.)(x\.com|twitter\.com)$/i.test(window.location.hostname);
    const mediaListeners = [
      ['play', trackActivePlayback], ['playing', trackActivePlayback], ['timeupdate', trackActivePlayback],
      ['emptied', onEmptied], ['loadstart', onLoadStart], ['resize', onVideoDimensionChange],
      ['loadedmetadata', onVideoDimensionChange], ['playing', onVideoDimensionChange], ['mouseenter', syncPos]
    ];
    if (mediaEl.tagName === 'IFRAME') {
      mediaListeners.push(['load', () => {
        this.childOverlayFrames.delete(mediaEl);
        syncPos();
        this.requestFrameOwnership(mediaEl);
      }]);
    }
    if (isTwitterHost) {
      mediaListeners.push(['volumechange', syncPos]);
    }

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
      const isInsta = typeof window !== 'undefined' && /(^|\.)instagram\.com$/.test(window.location.hostname);
      const isTwitter = typeof window !== 'undefined' && /(^|\.)(x\.com|twitter\.com)$/i.test(window.location.hostname);

      let parentCard = null;
      let reelCard = null;
      if (isFb) {
        if (isFbReels) {
          parentCard = VisualMountDetector.findFacebookReelCard(mediaEl) || VisualMountDetector.findFacebookPostCard(mediaEl);
        } else {
          parentCard = VisualMountDetector.findFacebookPostCard(mediaEl);
        }
      } else if (isInsta) {
        parentCard = VisualMountDetector.findInstagramPostCard(mediaEl);
      } else if (isTwitter) {
        parentCard = VisualMountDetector.findTwitterPostCard(mediaEl);
      }

      let cardTitle = null;
      if (isFb) {
        cardTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, parentCard);
      } else if (isInsta) {
        cardTitle = VisualMountDetector.extractInstagramMediaTitle(mediaEl, parentCard);
      } else if (isTwitter) {
        cardTitle = VisualMountDetector.extractTwitterMediaTitle(mediaEl, parentCard);
      } else if (parentCard) {
        cardTitle = VisualMountDetector.extractCardTitle(parentCard);
      }
      const fallbackTitle = isFb ? (isFbReels ? 'facebook_reel' : 'facebook_video') : (isInsta ? 'Instagram Video' : (isTwitter ? 'Twitter Video' : SmartDmUtils.extractWatchPageTitle()));
      const pageTitle = (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : fallbackTitle;

      let initialFormats = null;
      let videoUrl = SmartDmUtils.getCanonicalUrl(window.location.href);
      if (typeof window !== 'undefined' && window.location?.hostname?.includes('music.youtube.com')) {
        const ytMusicMeta = typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractYouTubeMusicTrackMetadata ?
          VisualMountDetector.extractYouTubeMusicTrackMetadata() : null;
        if (ytMusicMeta && ytMusicMeta.trackUrl) {
          videoUrl = ytMusicMeta.trackUrl;
        }
      }
      if (isYouTube) {
        initialFormats = FormatRegistryEngine.getInstantYouTubeFormats(videoUrl, pageTitle);
      }

      let currentFormats = [];
      if (initialFormats && initialFormats.some(f => !f.isAudioOnly)) {
        currentFormats = [...initialFormats];
        OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, pageTitle, !isFb && !isYouTube, this.onDownloadHandler);
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
          const resolvedTitle = (FormatRegistryEngine.isSocialFeed?.() && res?.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : ((res && res.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : pageTitle);
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
        if (!popover.classList.contains('active') || content._smartdm_downloading || !host.isConnected) {
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

    const cleanupPrefetch = this.observeYouTubeFormats(mediaEl, () => window.location.href);
    const playerItem = {
      host: host,
      mediaEl: mediaEl,
      syncPos: syncPos,
      isVisible: true,
      cleanup: () => {
        stopPolling();
        host._smartdm_drag_cleanup?.();
        cleanupPrefetch();
        mediaListeners.forEach(([event, listener]) => mediaEl.removeEventListener(event, listener));
        if (!FormatRegistryEngine.youTubeCacheKey?.(window.location.href)) {
          delete FormatRegistryEngine.mediaFormatCache[SmartDmUtils.getMediaCacheKey(window.location.href, mediaEl)];
        }
        if (document.removeEventListener) {
          document.removeEventListener('fullscreenchange', onFullscreen);
          document.removeEventListener('webkitfullscreenchange', onFullscreen);
        }
      }
    };
    this.activePlayers.set(mediaEl, playerItem);
    this.announceFrameOwnership();
    if (mediaEl.tagName === 'IFRAME') this.requestFrameOwnership(mediaEl);

    if (this.viewportObserver) {
      this.viewportObserver.observe(mediaEl);
    }

    syncPos();
    if (/(^|\.)(instagram\.com|tiktok\.com)$/.test(window.location.hostname)) this.syncVisiblePlayers();
  }

  static scanThumbnails() {
    // Sub-frame iframes are embed viewers or ads; thumbnail browsing shelves only exist in the top frame
    if (window.top !== window.self) return;

    const isAction = (el) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.isActionElement && VisualMountDetector.isActionElement(el);
    const isPill = (el, url) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.isCategoryOrTagPill && VisualMountDetector.isCategoryOrTagPill(el, url);
    const isAnime = (el, url) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.isAnimeCatalogOrEpisode && VisualMountDetector.isAnimeCatalogOrEpisode(el, url);
    const isFbCarousel = (el) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.isFacebookCarouselOrShelf && VisualMountDetector.isFacebookCarouselOrShelf(el);
    const isLegit = (card, el) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.isLegitimateThumbnailCard ? VisualMountDetector.isLegitimateThumbnailCard(card, el) : true;
    const findMount = (card) => typeof VisualMountDetector !== 'undefined' && VisualMountDetector.findVisualThumbnailMount ? VisualMountDetector.findVisualThumbnailMount(card) : card;

    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    const isDedicatedReelViewer = isFb && window.location.pathname.includes('/reel/');
    if (isDedicatedReelViewer) return; // Dedicated /reel/ page uses the full-screen player banner

    if (isFb) {
      // In Facebook Feed, scan standalone Reel cards, excluding carousels, trays, shelves, and nav links
      const reelLinks = document.querySelectorAll('a[href*="/reel/"]');
      reelLinks.forEach((el) => {
        if (el.closest('div[role="dialog"]')) return;
        if (el.getAttribute(this.ATTR_THUMB_ATTACHED)) return;

        // Never mount on buttons, tag/category pills, or navigation
        if (isAction(el)) return;
        if (isPill(el)) return;
        if (isFbCarousel(el)) return;

        const cardContainer = el.closest('div[role="listitem"], div[role="gridcell"], div[data-pagelet*="Reels"], div[aria-label*="Reels"], article, li') || el;
        if (cardContainer.getAttribute(this.ATTR_THUMB_ATTACHED)) return;
        if (isAction(cardContainer)) return;
        if (isPill(cardContainer)) return;
        if (isFbCarousel(cardContainer)) return;

        const videoUrl = SmartDmUtils.getCanonicalUrl(el.href);
        if (!videoUrl || !videoUrl.includes('/reel/')) return;

        if (!isLegit(cardContainer, el)) return;

        const rect = cardContainer.getBoundingClientRect();
        if (rect.height < 60 || rect.width < 50) return;

        // The anchor is the identity of one Reel.
        el.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');

        const cardTitle = typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractFacebookMediaTitle ? VisualMountDetector.extractFacebookMediaTitle(null, cardContainer) : null;
        this.attachThumbnailBadge(el, videoUrl, cardTitle);
      });
      return;
    }
    const selectors = [
      'ytd-thumbnail',
      'yt-thumbnail-view-model',
      'ytd-compact-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-rich-grid-media',
      'ytd-rich-item-renderer[is-shorts]',
      'ytd-video-card-renderer',
      'ytd-playlist-video-renderer',
      'ytd-playlist-panel-video-renderer',
      'yt-lockup-view-model',
      'ytmusic-responsive-list-item-renderer',
      'ytmusic-two-row-item-renderer',
      '.bili-video-card',
      '.bstar-video-card',
      'div[class*="bstar-video-card"]',
      'a[href*="/video/BV"]',
      'a[href*="/video/"]',
      'a[href*="/play/"]',
      'a[href*="/view_video.php"]',
      'a[href*="/watch?v="]',
      'a[href*="/shorts/"]',
      'a[href*="/live/"]',
      'a[href*="youtu.be/"]',
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
      // Exclude action buttons, category/tag suggestion pills, and anime catalog/episode items
      if (isAction(el)) return;
      if (isPill(el)) return;
      if (isAnime(el)) return;

      const cardContainer = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-rich-grid-media, yt-lockup-view-model, ytm-shorts-lockup-view-model, yt-shorts-lockup-view-model, [class*="shortsLockupViewModelHost"], ytd-video-card-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, .videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb') || el;

      const existingHost = cardContainer.querySelector?.('.smartdm-thumb-host') || this.thumbnailHosts.get(cardContainer);
      if (existingHost && existingHost.isConnected) return;
      const enclosingCard = cardContainer.parentElement?.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, yt-shorts-lockup-view-model, [class*="shortsLockupViewModelHost"], ytd-video-card-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, .videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb');
      if (enclosingCard && ((enclosingCard.querySelector?.('.smartdm-thumb-host') || this.thumbnailHosts.get(enclosingCard))?.isConnected)) return;

      if (isAction(cardContainer)) return;
      if (isPill(cardContainer)) return;
      if (isAnime(cardContainer)) return;

      if (cardContainer.clientHeight > 0 && cardContainer.clientHeight < 40) return;

      let videoUrl = null;
      const link = cardContainer.querySelector(
        'a#thumbnail[href], a#video-title[href], a#video-title-link[href], a[id*="thumbnail"][href], a[class*="thumbnail"][href], ' +
        'a.yt-simple-endpoint[href*="watch?v="], a.yt-simple-endpoint[href*="/shorts/"], a.yt-simple-endpoint[href*="/live/"], ' +
        'a[href*="watch?v="], a[href*="/shorts/"], a[href*="/live/"], a[href*="youtu.be/"], a[href*="/video/BV"], a[href*="/view_video.php"], ' +
        'a[href*="/watch/"], a[href*="/video/"], a[href*="/videos/"], a[href*="/v/"]'
      ) || (cardContainer.tagName === 'A' ? cardContainer : null);
      if (link && link.href) {
        videoUrl = link.href;
      } else if (cardContainer.tagName === 'A' && cardContainer.href) {
        videoUrl = cardContainer.href;
      }
      if (videoUrl && typeof videoUrl === 'string' && !videoUrl.startsWith('http')) {
        try { videoUrl = new URL(videoUrl, window.location.href).href; } catch(_) {}
      }

      if (!videoUrl) return;
      if (isPill(link || el, videoUrl)) return;
      if (isAnime(link || el, videoUrl)) return;

      if (!isLegit(cardContainer, link || el)) return;

      const targetMount = findMount(cardContainer);
      if (!targetMount) return;
      if (isAction(targetMount)) return;
      if (isPill(targetMount, videoUrl)) return;
      if (isAnime(targetMount, videoUrl)) return;

      if ((targetMount.querySelector?.('.smartdm-thumb-host') || this.thumbnailHosts.get(targetMount))?.isConnected) return;

      cardContainer.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');
      targetMount.setAttribute(this.ATTR_THUMB_ATTACHED, 'true');

      const mountStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(targetMount) : null;
      if (mountStyle && mountStyle.position === 'static') {
        targetMount.style.position = 'relative';
      }

      const cardTitle = typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractCardTitle ? VisualMountDetector.extractCardTitle(cardContainer) : null;
      this.attachThumbnailBadge(targetMount, SmartDmUtils.getCanonicalUrl(videoUrl), cardTitle);
    });
  }

  static attachThumbnailBadge(containerEl, videoUrl, cardTitle = null) {
    if (!containerEl) return;
    const enclosingAnchor = containerEl.tagName === 'A' ? containerEl : containerEl.closest?.('a');
    if (enclosingAnchor && enclosingAnchor.parentElement) {
      containerEl = enclosingAnchor.parentElement;
    }
    const existing = this.thumbnailHosts.get(containerEl);
    if (existing && existing.isConnected) return;
    if (existing && !existing.isConnected) {
      this.thumbnailHosts.delete(containerEl);
    }
    if (typeof VisualMountDetector !== 'undefined') {
      if (VisualMountDetector.isActionElement && VisualMountDetector.isActionElement(containerEl)) return;
      if (VisualMountDetector.isCategoryOrTagPill && VisualMountDetector.isCategoryOrTagPill(containerEl, videoUrl)) return;
      if (VisualMountDetector.isAnimeCatalogOrEpisode && VisualMountDetector.isAnimeCatalogOrEpisode(containerEl, videoUrl)) return;
      if (VisualMountDetector.isFacebookCarouselOrShelf && VisualMountDetector.isFacebookCarouselOrShelf(containerEl)) return;
    }

    const isFb = videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch'));
    const isFbReel = (videoUrl && videoUrl.includes('/reel/')) || (isFb && !containerEl.closest?.('ytd-thumbnail'));

    const host = document.createElement('div');
    host.className = 'smartdm-thumb-host';

    const isShorts = (videoUrl && videoUrl.includes('/shorts/')) ||
      (containerEl.tagName === 'YTD-REEL-ITEM-RENDERER') ||
      (containerEl.matches && containerEl.matches('ytd-reel-item-renderer, [is-shorts], [class*="shortsLockupViewModel"]')) ||
      (containerEl.closest && containerEl.closest('ytd-reel-item-renderer, [is-shorts], [class*="shortsLockupViewModel"]'));
    const isDetachedThumb = isFbReel || isShorts;

    if (isDetachedThumb) {
      // Detached thumbnail badges (Facebook Reels, YouTube Shorts):
      // These cards are links inside clipped, transformed carousels/cards.
      // Mount the control at the document root so the link cannot swallow clicks
      // and the fixed popover is not clipped by card layout/paint containment.
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'auto';

      const syncPos = () => {
        if (!containerEl.getBoundingClientRect) return;
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
      const containerStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(containerEl) : null;
      if (containerStyle && containerStyle.position === 'static') {
        containerEl.style.position = 'relative';
      }
      host.style.position = 'absolute';
      host.style.top = '6px';
      host.style.right = '6px';
      host.style.zIndex = '99999';
      host.style.pointerEvents = 'auto';
    }

    const stopPropagationAndDefault = (e) => {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    // Trap events bubbling out of host to prevent surrounding anchor tags or Polymer handlers from triggering navigation
    host.addEventListener('pointerdown', stopPropagationAndDefault);
    host.addEventListener('pointerup', stopPropagationAndDefault);
    host.addEventListener('mousedown', stopPropagationAndDefault);
    host.addEventListener('mouseup', stopPropagationAndDefault);
    host.addEventListener('click', stopPropagationAndDefault);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      ${this.styleMarkup(shadow)}
      <button type="button" class="banner-btn thumb-btn" title="Download this video with SmartDM">
        ${OverlayUiRenderer.icon ? OverlayUiRenderer.icon('download') : '<span class="download-icon"></span>'}
        <span>Download</span>
      </button>
      <div class="popover">
        <div class="popover-title">${OverlayUiRenderer.headerMarkup ? OverlayUiRenderer.headerMarkup() : 'Download'}</div>
        ${OverlayUiRenderer.sectionMarkup ? OverlayUiRenderer.sectionMarkup() : ''}
        <div class="popover-content">
          <div class="status-text">Fetching formats...</div>
        </div>
      </div>
    `;

    const btn = shadow.querySelector('.thumb-btn');
    const popover = shadow.querySelector('.popover');
    // Inline positioning also wins over an adopted stylesheet's source order.
    popover.style.position = isDetachedThumb ? 'absolute' : 'fixed';
    const content = shadow.querySelector('.popover-content');
    host._smartdm_drag_cleanup = OverlayUiRenderer.makeDraggable?.(host, btn, popover);
    const originalSyncPos = host._smartdm_sync_pos;
    host._smartdm_sync_pos = () => {
      if (!host._smartdm_apply_drag_position?.()) { originalSyncPos?.(); return; }
      const rect = containerEl.getBoundingClientRect();
      host.style.display = rect.width && rect.height && rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth ? 'block' : 'none';
    };

    const closePopover = () => {
      popover.classList.remove('active');
    };

    const stopButtonAction = (e) => {
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    const stopButtonPointer = (e) => {
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    btn.addEventListener('pointerdown', stopButtonPointer);
    btn.addEventListener('pointerup', stopButtonPointer);
    btn.addEventListener('mousedown', stopButtonPointer);
    btn.addEventListener('mouseup', stopButtonPointer);

    const onBtnClick = (e) => {
      stopButtonAction(e);

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

      if (host._smartdm_drag_position) {
        OverlayUiRenderer.positionPopover(popover, btn.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      } else if (isDetachedThumb) {
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
      content._mediaEl = containerEl.querySelector?.('video') || containerEl;
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
        OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, pageTitle, false, this.onDownloadHandler);
      } else {
        content.innerHTML = `
          <div class="spinner-container">
            <div class="spinner"></div>
            <span class="status-text" style="padding:0;">Loading video options...</span>
          </div>
        `;
      }

      FormatRegistryEngine.fetchMediaFormats(videoUrl, isYouTube ? containerEl.querySelector?.('video') || null : null, (res, hasMorePending) => {
        try {
          if (this.thumbnailHosts.get(containerEl) !== host || !popover.classList.contains('active')) return;
          if (content._smartdm_downloading) return;
          const resolvedTitle = (FormatRegistryEngine.isSocialFeed?.() && res?.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : (cardTitle && !SmartDmUtils.isGenericTitle(cardTitle)) ? cardTitle : ((res && res.title && !SmartDmUtils.isGenericTitle(res.title)) ? res.title : pageTitle);
          if (res && res.formats && res.formats.length > 0) {
            currentFormats = FormatRegistryEngine.isSocialFeed?.() ? res.formats.slice() : FormatRegistryEngine.mergeFormatLists(currentFormats, res.formats);
            OverlayUiRenderer.renderFormatDropdown(content, currentFormats, videoUrl, popover, resolvedTitle, hasMorePending, this.onDownloadHandler);
          } else if (hasMorePending === false && currentFormats.length > 0) {
            content.querySelector('.smartdm-pending-notice')?.remove();
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
      }, false, {fromThumbnail: true});
    };
    btn.addEventListener('click', onBtnClick);

    if (isDetachedThumb) {
      document.body.appendChild(host);
      this.thumbnailHosts.set(containerEl, host);
      host._smartdm_sync_pos();
    } else {
      containerEl.appendChild(host);
      this.thumbnailHosts.set(containerEl, host);
    }
    host._smartdm_prefetch_cleanup = this.observeYouTubeFormats(containerEl, () => videoUrl);
  }
}
