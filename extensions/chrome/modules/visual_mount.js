// SmartDM Universal Visual Mount Detector
// Resolves preview box boundaries on cards and video players without site-specific hardcoding.

class VisualMountDetector {
  static isActionElement(el) {
    if (!el || typeof el !== 'object') return false;
    try {
      const tag = (el.tagName || '').toUpperCase();
      const role = (el.getAttribute?.('role') || '').toLowerCase();
      const isButtonLike = tag === 'BUTTON' || role === 'button' ||
        (tag === 'INPUT' && /^(?:button|submit|reset)$/i.test(el.type || ''));

      // 1. Any direct button tag or role
      if (isButtonLike) return true;

      // 2. Anything enclosed inside a button
      if (el.closest?.('button, [role="button"], input[type="button"], input[type="submit"]')) {
        return true;
      }

      // 3. Action classes
      const className = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') || '');
      const isActionClass = /(?:^|[\s_-])(?:btn|button|play-btn|watch-btn|play-now|watch-now|hero-btn|hero-cta|cta-btn|action-btn|cta|btn-primary|btn-secondary|btn-watch|btn-play|watch-button|play-button|btn-danger|btn-info|btn-success)(?:[\s_-]|$)/i.test(className);

      // 4. CTA and Action text patterns
      const rawText = (el.textContent || '').trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
      const isExactActionText = /^(?:play|play now|watch|watch now|start watching|stream now|view now|watch episode(?:\s*\d+)?|watch movie|watch online|continue watching|resume|watch trailer|trailer|preview|download|subscribe|sign up|read more|view all|see all|click here|load more|explore now|read manga|read now|watch free|play free|watch here|play video|watch video)$/i.test(rawText);

      if (isExactActionText) return true;
      if (isActionClass && (rawText.length <= 40 || !el.querySelector?.('img, video'))) return true;
      if (rawText.length <= 35 && /^(?:play|watch|stream|start watching|continue watching|watch online|watch now|play now)\b/i.test(rawText) && !el.querySelector?.('img, video')) {
        return true;
      }

      // 5. Parent action button check
      const btnParent = el.closest?.('a.btn, a[class*="play-now" i], a[class*="watch-now" i], a[class*="btn-" i], a[class*="btn " i], a[class*="cta" i]');
      if (btnParent) {
        const pText = (btnParent.textContent || '').trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
        if (/^(?:play|play now|watch|watch now|start watching|stream now|view now|watch episode(?:\s*\d+)?|watch movie|watch online|watch free|play free|watch video)$/i.test(pText)) {
          return true;
        }
        if (!btnParent.querySelector?.('img, video') && pText.length <= 40) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  static isCategoryOrTagPill(el, urlStr = '') {
    try {
      const href = (urlStr || el?.getAttribute?.('href') || el?.href || '').toLowerCase();
      if (href) {
        if (/[?&](?:search|q|query|keyword|search_query)=/i.test(href) || /\/search(?:\/|\?|$)/i.test(href)) {
          return true;
        }
        if (/[?&](?:c|cat|category|tag|tags|filter|sort|order|page|p|o|genre)=/i.test(href)) {
          return true;
        }
        if (/\/(?:category|categories|tags|tag|genres|genre|channels|channel|models|model|pornstar|pornstars|filter|filters|nav|browse)(?:\/|\?|$)/i.test(href)) {
          return true;
        }
        if (/\/(?:trending|popular|recommended|recent|latest|explore|feed|top|new|history)(?:\/|\?|$)/i.test(href)) {
          return true;
        }
        if (/^https?:\/\/[^\/]+\/(?:video|videos|watch|shorts|home)?\/?$/i.test(href)) {
          return true;
        }
        if (/^(?:#|javascript:)/i.test(href)) {
          return true;
        }
      }

      if (!el || typeof el !== 'object') return false;

      const role = (el.getAttribute?.('role') || '').toLowerCase();
      if (/^(?:tab|menuitem|navigation|search|breadcrumb)$/.test(role)) return true;

      if (el.closest?.('nav, header, footer, aside, [role="navigation"], [role="search"], [role="tab"], [role="tablist"], [role="menu"], [role="menubar"], [role="menuitem"], [role="breadcrumb"]')) {
        return true;
      }

      const className = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') || '');
      if (/\b(?:tag|tags|pill|pills|chip|chips|badge-tag|category-pill|category-chip|suggestion-item|search-item|search-pill|keyword|filter-pill|filter-item|tag-item)\b/i.test(className)) {
        return true;
      }

      // Check if el is inside a dedicated tag cloud / search suggestion wrapper
      const tagCloudContainer = el.closest?.(
        '.tagsWrapper, .tagWrapper, .searchSuggestions, [class*="search-suggest" i], [class*="search_suggest" i], ' +
        '[class*="tag-cloud" i], [class*="tags-cloud" i], [id*="searchSuggestions" i], [id*="search-suggest" i], ' +
        'ul.tags, div.tags, [class*="pills" i], [class*="chips" i]'
      );
      if (tagCloudContainer) {
        return true;
      }

      // If el is an anchor or button inside a category/suggestion container with no video thumbnail
      const catContainer = el.closest?.('[class*="category" i], [class*="categories" i], [class*="filter" i], [class*="suggestion" i]');
      if (catContainer && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'SPAN')) {
        const hasThumb = el.querySelector?.('img, video') || el.closest?.('ytd-thumbnail, .phimage, .videoBox, .bili-video-card');
        const textLen = (el.textContent || '').trim().length;
        if (!hasThumb && textLen <= 40) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  static isAnimeCatalogOrEpisode(el, urlStr = '') {
    try {
      const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname.toLowerCase() : '';
      const isAnimeHost = /(?:anime|aniwave|9anime|hianime|zoro|gogoanime|animesaturn|animixplay|kissanime|kickassanime|allanime|aniwatch|kaido|miruro|yugenanime)/i.test(host);

      const hasPlayerIframe = typeof document !== 'undefined' && !!document.querySelector?.(
        'iframe[src*="stream"], iframe[src*="embed"], iframe[src*="player"], iframe[src*="megaplay"], iframe[src*="vidstream"], iframe[src*="mp4upload"], iframe[src*="cloud"], iframe[src*="tape"], #player, #player-wrapper'
      );

      const isAnimeContext = isAnimeHost || (hasPlayerIframe && typeof window !== 'undefined' && window.top === window.self);

      if (!el || typeof el !== 'object') {
        return isAnimeHost;
      }

      // 1. Episode lists and server lists (never mount on episode numbers / servers)
      if (el.closest?.('#episodes, .episodes, .episodes-list, [class*="episode" i], [id*="episode" i], [class*="server" i], [id*="server" i], [class*="ss-list" i], [class*="ep-item" i], [class*="eps" i], [data-ep-id], [data-number]')) {
        return true;
      }

      const text = (el.textContent || '').trim();
      if (/^(?:ep(?:\s*\.?)?\s*\d+|\d{1,4}|episode\s*\d+|sub|dub)$/i.test(text)) {
        return true;
      }

      // 2. Anime catalog items, sidebars, and series posters
      if (isAnimeContext) {
        if (el.closest?.('.top-anime, .recently-updated, [class*="sidebar" i], [class*="catalog" i], [class*="film-list" i], [class*="film_list" i], [class*="animes-list" i], [class*="top-view" i], [class*="widget-body" i], [class*="ranking" i], [class*="trending" i], [class*="grid" i], .items, .item, .poster, .film-poster')) {
          return true;
        }

        if (this.isActionElement(el)) {
          return true;
        }

        const href = (urlStr || el.getAttribute?.('href') || el.href || '').toLowerCase();
        if (/\/watch\//i.test(href) && typeof window !== 'undefined' && window.top === window.self && isAnimeHost) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  static isFacebookCarouselOrShelf(el) {
    if (!el || typeof el !== 'object') return false;
    try {
      const isFb = typeof window !== 'undefined' && window.location?.hostname &&
        (window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch'));
      if (!isFb) return false;

      // 1. Explicit carousel containers
      if (el.closest?.(
        '[aria-label*="Reels" i], [data-pagelet*="Reels" i], [class*="carousel" i], ' +
        '[class*="tray" i], [class*="shelf" i], [class*="slider" i], [role="region"][aria-label*="Reel" i], ' +
        '[aria-roledescription="carousel" i]'
      )) {
        return true;
      }

      // 2. Header / navigation / sidebar
      if (el.closest?.('header, nav, [role="navigation"], [data-pagelet*="LeftRail"], [role="banner"], [role="menubar"], [role="tablist"]')) {
        return true;
      }

      // 3. Multi-reel check within a single feed post / unit
      const postUnit = el.closest?.('[role="article"], [data-pagelet*="FeedUnit"], [role="region"]');
      if (postUnit) {
        const reelLinks = postUnit.querySelectorAll ? postUnit.querySelectorAll('a[href*="/reel/"]') : [];
        if (reelLinks.length > 1) {
          return true;
        }
      } else {
        // Fallback for markup without role="article": traverse parents stopping at feed/main
        let curr = el.parentElement;
        for (let depth = 0; depth < 6 && curr && curr !== document.body; depth++) {
          const role = (curr.getAttribute?.('role') || '').toLowerCase();
          if (role === 'feed' || role === 'main') break;
          const pagelet = (curr.getAttribute?.('data-pagelet') || '').toLowerCase();
          if (pagelet.includes('feed')) break;

          const reelCount = curr.querySelectorAll ? curr.querySelectorAll('a[href*="/reel/"]').length : 0;
          if (reelCount > 1) {
            return true;
          }
          curr = curr.parentElement;
        }
      }
    } catch (_) {}
    return false;
  }

  static isLegitimateThumbnailCard(cardContainer, linkEl = null) {
    if (!cardContainer || typeof cardContainer !== 'object') return false;
    try {
      if (this.isActionElement(cardContainer) || (linkEl && this.isActionElement(linkEl))) {
        return false;
      }

      if (this.isCategoryOrTagPill(cardContainer) || (linkEl && this.isCategoryOrTagPill(linkEl))) {
        return false;
      }

      if (this.isFacebookCarouselOrShelf(cardContainer) || (linkEl && this.isFacebookCarouselOrShelf(linkEl))) {
        return false;
      }

      if (this.isAnimeCatalogOrEpisode(cardContainer) || (linkEl && this.isAnimeCatalogOrEpisode(linkEl))) {
        return false;
      }

      const href = (linkEl?.href || linkEl?.getAttribute?.('href') ||
                    cardContainer.getAttribute?.('href') || cardContainer.href ||
                    cardContainer.querySelector?.('a[href]')?.getAttribute?.('href') || '').toLowerCase().trim();

      if (!href || href === '#' || href.startsWith('javascript:')) return false;

      if (this.isCategoryOrTagPill(null, href)) return false;

      // Platform-specific watch URL enforcement
      const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname.toLowerCase() : '';
      if (host.includes('pornhub.com')) {
        if (!href.includes('view_video.php') || !href.includes('viewkey=')) {
          return false;
        }
      }

      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        if (!href.includes('watch?v=') && !href.includes('/shorts/') && !href.includes('youtu.be/')) {
          return false;
        }
      }

      // Check for duration badge (strong signal of genuine video card)
      const hasDuration = !!cardContainer.querySelector?.(
        '[class*="duration" i], [class*="time-status" i], var.duration, span.duration, .badge-shape, ytd-thumbnail-overlay-time-status-renderer'
      );

      const isKnownThumbnailContainer = cardContainer.tagName === 'YTD-THUMBNAIL' ||
        cardContainer.classList?.contains?.('phimage') ||
        cardContainer.classList?.contains?.('thumbnailWrapper') ||
        cardContainer.classList?.contains?.('bili-video-card');

      const mediaList = Array.from(
        cardContainer.querySelectorAll ? cardContainer.querySelectorAll('img, video, canvas, [style*="background-image"]') : []
      );

      let hasValidMedia = isKnownThumbnailContainer;
      for (const m of mediaList) {
        if (m.closest?.('[class*="avatar"], [class*="channel"], [class*="author"], [class*="badge"], [class*="icon"], [class*="user"], [class*="profile"], [class*="logo"], [class*="meta"]')) {
          continue;
        }
        const mClass = typeof m.className === 'string' ? m.className : (m.getAttribute?.('class') || '');
        if (/\b(?:icon|logo|avatar|channel-img|arrow|badge)\b/i.test(mClass)) {
          continue;
        }

        const r = m.getBoundingClientRect ? m.getBoundingClientRect() : { width: 0, height: 0 };
        const w = r.width || m.offsetWidth || m.naturalWidth || (m.getAttribute?.('width') ? parseInt(m.getAttribute('width'), 10) : 0);
        const h = r.height || m.offsetHeight || m.naturalHeight || (m.getAttribute?.('height') ? parseInt(m.getAttribute('height'), 10) : 0);

        if (w > 0 || h > 0) {
          // Standard landscape: w >= 60, h >= 35
          // Portrait (Reels/Shorts/TikTok): w >= 50, h >= 70
          if ((w >= 60 && h >= 35) || (w >= 50 && h >= 70)) {
            hasValidMedia = true;
            break;
          }
        } else if (m.tagName === 'IMG' || m.tagName === 'VIDEO') {
          // In headless tests or before layout, check image attributes
          const src = m.getAttribute?.('src') || m.src || '';
          const isIcon = /\b(?:icon|logo|avatar|search|arrow|svg)\b/i.test(src);
          if (src && !isIcon) {
            hasValidMedia = true;
            break;
          }
        }
      }

      if (!hasValidMedia && !hasDuration) {
        return false;
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  static findMountContainer(cardContainer) {
    return this.findVisualThumbnailMount(cardContainer);
  }

  static findVisualThumbnailMount(cardContainer) {
    if (!cardContainer) return null;

    if (!this.isLegitimateThumbnailCard(cardContainer)) return null;

    if (cardContainer.tagName === 'IMG' || cardContainer.tagName === 'VIDEO') {
      return cardContainer.parentElement || cardContainer;
    }

    const mediaList = Array.from(
      cardContainer.querySelectorAll ? cardContainer.querySelectorAll('img, video, canvas, [style*="background-image"]') : []
    );

    let bestThumbMedia = null;
    let maxArea = 0;

    for (const el of mediaList) {
      if (el.closest?.('[class*="avatar"], [class*="channel"], [class*="author"], [class*="badge"], [class*="icon"], [class*="user"], [class*="profile"], [class*="logo"], [class*="meta"], [class*="detail"], [id*="title"], h1, h2, h3, h4')) {
        continue;
      }

      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      const w = r.width || el.offsetWidth || el.naturalWidth || (el.getAttribute?.('width') ? parseInt(el.getAttribute('width'), 10) : 0);
      const h = r.height || el.offsetHeight || el.naturalHeight || (el.getAttribute?.('height') ? parseInt(el.getAttribute('height'), 10) : 0);

      if ((w > 0 && w < 50) || (h > 0 && h < 35)) continue;

      const aspect = w / (h || 1);
      if (aspect > 0.85 && aspect < 1.15 && w < 100 && w > 0) continue;

      const area = (w || 100) * (h || 56);
      if (area > maxArea) {
        maxArea = area;
        bestThumbMedia = el;
      }
    }

    if (bestThumbMedia) {
      const mediaRect = bestThumbMedia.getBoundingClientRect ? bestThumbMedia.getBoundingClientRect() : { width: 0, height: 0 };
      const mW = mediaRect.width || bestThumbMedia.offsetWidth || 100;
      const mH = mediaRect.height || bestThumbMedia.offsetHeight || 56;

      let curr = bestThumbMedia.parentElement || bestThumbMedia;

      while (curr && curr !== cardContainer && curr !== document.body) {
        const parent = curr.parentElement;
        if (!parent || parent === cardContainer || parent === document.body) break;

        const titleEl = parent.querySelector ? parent.querySelector('[id*="title"], h1, h2, h3, h4, [class*="title"], [class*="metadata"], [id*="metadata"], [class*="detail"], [id*="detail"], [class*="meta"], [id*="meta"]') : null;
        if (titleEl && !curr.contains(titleEl)) {
          break;
        }

        const pRect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { width: 0, height: 0 };
        const pW = pRect.width || parent.offsetWidth || 0;
        const pH = pRect.height || parent.offsetHeight || 0;

        if (pW > 0 && mW > 0 && pW > mW * 1.25) {
          break;
        }

        if (pH > 0 && mH > 0 && pH > mH * 1.35) {
          break;
        }

        curr = parent;
      }

      if (curr && !this.isActionElement(curr) && !this.isCategoryOrTagPill(curr)) {
        return curr;
      }
    }

    const visualElement = cardContainer.querySelector ? cardContainer.querySelector(
      'ytd-thumbnail, .phimage, .thumbnailWrapper, [class*="visual"], [class*="thumbnail"], [class*="thumb"], [id*="thumbnail"], [id*="thumb"], [class*="preview"], [class*="cover"], [class*="poster"], [class*="media"]'
    ) : null;
    if (visualElement && visualElement !== cardContainer) {
      if (!this.isActionElement(visualElement) && !this.isCategoryOrTagPill(visualElement)) {
        return visualElement;
      }
    }

    if (cardContainer.tagName === 'YTD-THUMBNAIL' || cardContainer.classList?.contains?.('phimage') || cardContainer.classList?.contains?.('thumbnailWrapper')) {
      return cardContainer;
    }

    if (bestThumbMedia && !this.isActionElement(cardContainer) && !this.isCategoryOrTagPill(cardContainer)) {
      return cardContainer;
    }

    return null;
  }

  static extractTextWithEmojis(el) {
    if (!el) return '';
    try {
      const clone = el.cloneNode(true);
      const emojiImgs = clone.querySelectorAll('img[alt]');
      emojiImgs.forEach(img => {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt) {
          const txt = document.createTextNode(' ' + alt + ' ');
          img.parentNode.replaceChild(txt, img);
        }
      });
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    } catch(e) {
      return (el.textContent || '').trim();
    }
  }

  static isFacebookMetadataString(text) {
    if (!text || typeof text !== 'string') return true;
    const lower = text.toLowerCase().trim();
    if (lower === 'follow' || lower === 'sponsored' || lower === 'public' || lower === 'suggested for you' ||
        lower === 'see more' || lower === 'see less' || lower.includes('original audio') || lower === 'reels' ||
        lower === 'reel' || lower === 'write a comment...' || lower === 'most relevant' || lower === 'notifications' ||
        lower.includes('comment') || lower.includes('share') || lower.includes('like') || lower === 'messages' ||
        lower === 'menu' || lower === 'shortcuts' || lower === 'chats') {
      return true;
    }
    if (/^\d+[\d.,KkMmbB\s]*(?:likes?|comments?|views?|shares?|reactions?|replies?)?$/i.test(lower)) return true;
    if (/^(?:just now|\d+\s*[smhdw]|yesterday|at \d+:\d+|\d+\s*hrs?|\d+\s*mins?)/i.test(lower)) return true;
    return false;
  }

  static findFacebookPostCard(el) {
    if (!el) return null;
    try {
      // 1. Direct dialog / theater modal container (e.g. video theater view)
      const dialog = el.closest('div[role="dialog"]');
      if (dialog && dialog.querySelectorAll('video').length <= 1) return dialog;

      // 2. Direct child of div[role="feed"]
      // In Facebook Comet feed, each post is an immediate direct child of div[role="feed"]
      let curr = el;
      while (curr && curr.parentElement && curr !== document.body) {
        if (curr.parentElement.getAttribute('role') === 'feed') {
          // If this feed unit contains multiple videos (e.g. horizontal Reels shelf with 5 videos),
          // don't return the entire multi-video shelf! Return the specific card enclosing el!
          if (curr.querySelectorAll('video').length > 1) {
            const specificItem = el.closest('div[role="listitem"], div[role="gridcell"], a[href*="/reel/"]') || el.parentElement;
            if (specificItem) return specificItem;
          }
          return curr;
        }
        curr = curr.parentElement;
      }

      // 3. Post article or feed unit wrapper
      const article = el.closest('div[role="article"], [data-pagelet^="FeedUnit_"], article, [data-testid="fbfeed_story"], [data-testid="post_container"]');
      if (article && article !== document.body && article.getAttribute('role') !== 'main' && article.getAttribute('role') !== 'feed') {
        if (article.querySelectorAll('video').length > 1) {
          const specificItem = el.closest('div[role="listitem"], div[role="gridcell"], a[href*="/reel/"]') || el.parentElement;
          if (specificItem) return specificItem;
        }
        return article;
      }

      // 4. Dedicated Watch / Tahoe single-video container (ONLY on watch/video permalink pages, NEVER in feed)
      const isWatchPermalink = window.location.pathname.includes('/watch') || window.location.pathname.includes('/videos/');
      if (isWatchPermalink) {
        const tahoe = el.closest('[data-pagelet*="Tahoe"], [data-pagelet*="Watch"]');
        if (tahoe && tahoe !== document.body && tahoe.getAttribute('role') !== 'feed') return tahoe;
      }

      // 5. Ascend parents strictly stopping before feed or main containers
      curr = el.parentElement;
      while (curr && curr !== document.body) {
        const role = curr.getAttribute('role');
        if (role === 'feed' || role === 'main') break;
        if (curr.querySelectorAll('video').length > 1) break;

        if (curr.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]') ||
            (curr.querySelector('header, h2, h3, h4, [role="heading"]') && curr.querySelector('form, [role="toolbar"], button, [role="button"]'))) {
          return curr;
        }
        curr = curr.parentElement;
      }
    } catch(e) {}
    return null;
  }

  static findFacebookReelCard(mediaEl) {
    if (!mediaEl) return null;
    try {
      // 1. Direct anchor containing /reel/
      const directAnchor = mediaEl.closest('a[href*="/reel/"]');
      if (directAnchor && directAnchor.querySelectorAll('video').length <= 1) return directAnchor;

      // 2. Direct dialog / theater modal container (e.g. reel full view modal)
      const dialog = mediaEl.closest('div[role="dialog"]');
      if (dialog && dialog.querySelectorAll('video').length <= 1 && (dialog.querySelector('a[href*="/reel/"]') || dialog.querySelector('[aria-label*="Reel" i]'))) {
        return dialog;
      }

      // 3. Dedicated Reel unit or shelf
      const reelUnit = mediaEl.closest('[aria-label*="Reels" i], [data-pagelet*="Reels" i], [role="region"][aria-label*="Reel" i]');
      if (reelUnit) {
        const item = mediaEl.closest('a[href*="/reel/"], div[role="listitem"], div[role="gridcell"]') || mediaEl.parentElement;
        if (item) return item;
      }

      // 4. On dedicated /reel/ URL
      if (window.location.pathname.includes('/reel/')) {
        const postCard = this.findFacebookPostCard(mediaEl);
        if (postCard) return postCard;
        const main = mediaEl.closest('div[role="dialog"], div[role="main"], div[data-pagelet*="Reel"]') || mediaEl.parentElement;
        if (main) return main;
      }
    } catch(e) {}
    return null;
  }

  static extractFacebookCaption(containerEl, mediaEl = null) {
    if (!containerEl) return null;
    // Guard against multi-post feed or page-level main containers
    if (containerEl === document.body ||
        containerEl.getAttribute('role') === 'feed' ||
        containerEl.getAttribute('role') === 'main') {
      return null;
    }
    // Verify container actually encloses the targeted mediaEl
    if (mediaEl && !containerEl.contains(mediaEl)) {
      return null;
    }

    // If containerEl contains multiple videos, it is an outer wrapper spanning multiple posts.
    // Constrain containerEl to the specific post unit enclosing mediaEl!
    if (mediaEl && containerEl.querySelectorAll('video').length > 1) {
      const specificCard = this.findFacebookPostCard(mediaEl);
      if (specificCard && specificCard.contains(mediaEl) && specificCard.querySelectorAll('video').length <= 1) {
        containerEl = specificCard;
      } else {
        return null;
      }
    }

    try {
      // 0. If containerEl is a direct Reel anchor or has an explicit aria-label with caption
      const cardAria = containerEl.getAttribute ? containerEl.getAttribute('aria-label') : null;
      if (cardAria && cardAria.length >= 3 && !SmartDmUtils.isGenericTitle(cardAria) && !this.isFacebookMetadataString(cardAria)) {
        const lowerAria = cardAria.toLowerCase();
        if (!lowerAria.startsWith('reels') && !lowerAria.startsWith('reel') && !lowerAria.includes('suggested for you')) {
          const shortAria = cardAria.length > 90 ? cardAria.substring(0, 90).trim() : cardAria;
          return SmartDmUtils.sanitizeCleanTitle(shortAria);
        }
      }

      // 1. Explicit post message selectors (highest reliability)
      const msgSelectors = [
        '[data-ad-preview="message"]',
        '[data-ad-comet-preview="message"]',
        '[data-testid="post_message"]',
        'div[dir="auto"][style*="text-align"]',
        'div[class*="x11i5rnm"][dir="auto"]',
        'div[class*="xat24cr"][dir="auto"]',
        '.userContent'
      ];

      // Pass 1: Prefer message preceding video (standard feed posts where caption is above video)
      for (const sel of msgSelectors) {
        const matches = Array.from(containerEl.querySelectorAll(sel));
        for (const el of matches) {
          if (mediaEl && (mediaEl.contains(el) || el.contains(mediaEl))) continue;
          if (el.closest('ul, ol, form, [aria-label*="comment" i], [aria-label*="reply" i], div[role="textbox"]')) continue;
          if (mediaEl && (mediaEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) continue;
          const t = this.extractTextWithEmojis(el);
          if (t && t.length >= 2 && !SmartDmUtils.isGenericTitle(t) && !this.isFacebookMetadataString(t)) {
            const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
            return SmartDmUtils.sanitizeCleanTitle(shortT);
          }
        }
      }

      // Pass 2: For Reels and overlay cards where caption follows video in DOM order
      for (const sel of msgSelectors) {
        const matches = Array.from(containerEl.querySelectorAll(sel));
        for (const el of matches) {
          if (mediaEl && (mediaEl.contains(el) || el.contains(mediaEl))) continue;
          if (el.closest('ul, ol, form, [aria-label*="comment" i], [aria-label*="reply" i], div[role="textbox"], [aria-label*="share" i], [aria-label*="like" i]')) continue;
          const t = this.extractTextWithEmojis(el);
          if (t && t.length >= 2 && !SmartDmUtils.isGenericTitle(t) && !this.isFacebookMetadataString(t)) {
            const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
            return SmartDmUtils.sanitizeCleanTitle(shortT);
          }
        }
      }

      // 2. Look for post caption right below author heading / header
      const heading = containerEl.querySelector('header, h2, h3, h4, [role="heading"]');
      if (heading) {
        let walker = heading.parentElement;
        for (let depth = 0; depth < 5 && walker && walker !== containerEl; depth++) {
          const dirEls = walker.querySelectorAll('div[dir="auto"], span[dir="auto"]');
          for (const el of dirEls) {
            if (heading.contains(el)) continue;
            if (el.closest('header, h1, h2, h3, h4, [role="heading"], button, [role="button"], time, abbr, ul, ol, form, [aria-label*="comment" i], [aria-label*="reply" i], div[role="textbox"]')) continue;
            if (mediaEl && (mediaEl.contains(el) || el.contains(mediaEl))) continue;
            const t = this.extractTextWithEmojis(el);
            if (t && t.length >= 2 && !SmartDmUtils.isGenericTitle(t) && !this.isFacebookMetadataString(t)) {
              const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
              return SmartDmUtils.sanitizeCleanTitle(shortT);
            }
          }
          walker = walker.parentElement;
        }
      }

      // 3. Scan all dir="auto" elements located in the single post card (e.g. Reel overlay caption)
      const textEls = Array.from(containerEl.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
      for (const el of textEls) {
        if (mediaEl && (mediaEl.contains(el) || el.contains(mediaEl))) continue;
        if (el.closest('ul, ol, form, [aria-label*="comment" i], [aria-label*="reply" i], div[role="textbox"], [aria-label*="share" i], [aria-label*="like" i]')) continue;
        if (el.closest('h1, h2, h3, h4, header, [role="heading"], [role="toolbar"], button, [role="button"], [role="navigation"]')) continue;

        const link = el.closest('a');
        if (link) {
          const href = link.getAttribute('href') || '';
          if (!href.includes('hashtag') && !href.includes('/reel/')) continue;
        }

        const t = this.extractTextWithEmojis(el);
        if (!t || t.length < 2 || SmartDmUtils.isGenericTitle(t) || this.isFacebookMetadataString(t)) continue;

        const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
        return SmartDmUtils.sanitizeCleanTitle(shortT);
      }

      // 4. Fallback to Author Name + " - Video"
      const authorEl = containerEl.querySelector('h2 a, h3 a, h4 a, strong a, [role="heading"] a, h2, h3, strong');
      if (authorEl) {
        const author = this.extractTextWithEmojis(authorEl);
        if (author && author.length >= 2 && !SmartDmUtils.isGenericTitle(author) && !author.toLowerCase().includes('reel')) {
          return SmartDmUtils.sanitizeCleanTitle(author + ' - Video');
        }
      }
    } catch(e) {}
    return null;
  }

  static findInstagramPostCard(mediaEl) {
    if (!mediaEl) return null;
    let card = mediaEl.closest?.('article, [role="dialog"]');
    if (card && (card.querySelector?.('header a, h2 a, a[role="link"][tabindex="0"]') || card.querySelector?.('header, a[href*="/p/"], a[href*="/reel/"]') || card.querySelector?.('[aria-label*="Like" i]'))) {
      return card;
    }
    let curr = mediaEl.parentElement;
    let candidate = null;
    const docBody = typeof document !== 'undefined' ? document.body : null;
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;
    for (let i = 0; i < 30 && curr && curr !== docBody && curr !== docEl; i++) {
      const role = curr.getAttribute?.('role');
      if (role === 'feed' || role === 'main' || curr.tagName === 'MAIN') break;
      const articles = curr.querySelectorAll ? curr.querySelectorAll('article') : [];
      if (articles.length > 1 && candidate) break;
      const vids = curr.querySelectorAll ? curr.querySelectorAll('video') : [];
      if (vids.length > 1 && candidate) break;
      const headers = curr.querySelectorAll ? curr.querySelectorAll('header') : [];
      if (headers.length > 1 && candidate) break;
      const postLinks = curr.querySelectorAll ? curr.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]') : [];
      if (postLinks.length > 0 && candidate) {
        const postCodes = new Set();
        for (const a of postLinks) {
          const m = (a.getAttribute?.('href') || a.href || '').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
          if (m) postCodes.add(m[1]);
        }
        if (postCodes.size > 1) break;
      }

      const hasHeader = curr.querySelector?.('header, [role="heading"], a[role="link"][tabindex="0"], a[href*="/p/"], a[href*="/reel/"]');
      const hasActions = curr.querySelector?.('[aria-label*="Like" i], [aria-label*="Comment" i], [aria-label*="Share" i]');
      const hasCaption = curr.querySelector?.('h1, [data-testid="post-caption"], div[class*="_a9zs"], span[class*="_a9zs"], div[dir="auto"], span[dir="auto"]');
      const hasComment = curr.querySelector?.('form, [aria-label*="comment" i], textarea, a[href*="/p/"], a[href*="/reel/"]');

      if ((hasHeader && (hasActions || hasCaption || hasComment)) || (hasActions && (hasCaption || hasComment))) {
        return curr;
      }

      if (hasHeader || hasActions || hasCaption) {
        candidate = curr;
      }

      if (curr.parentElement && (curr.parentElement.getAttribute?.('role') === 'feed' || curr.parentElement.getAttribute?.('role') === 'main' || curr.parentElement.tagName === 'MAIN')) {
        return candidate || curr;
      }

      curr = curr.parentElement;
    }
    return candidate;
  }

  static extractInstagramMediaTitle(mediaEl, cardContainer) {
    try {
      const card = cardContainer || this.findInstagramPostCard(mediaEl);
      let author = '';
      let caption = '';

      const isCompactTimestampText = (txt) => {
        if (!txt || typeof txt !== 'string') return false;
        const clean = txt.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
        if (/^\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i.test(clean)) return true;
        if (/^[a-z0-9_.]+\s*[•·\s\-–—|]\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i.test(clean)) return true;
        if (/^\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?\s*[-–—|]\s*instagram\s*video$/i.test(clean)) return true;
        return false;
      };

      const isTimestampNode = (node) => {
        if (!node) return false;
        if (node.tagName === 'TIME') return true;
        if (node.closest?.('time')) return true;
        if (node.tagName === 'A' && node.querySelector?.('time')) {
          const txt = (node.textContent || '').trim();
          if (!txt || isCompactTimestampText(txt)) return true;
        }
        if (node.closest?.('a')?.querySelector?.('time')) {
          const a = node.closest('a');
          const txt = (a.textContent || '').trim();
          if (!txt || isCompactTimestampText(txt)) return true;
        }
        return false;
      };

      const isHeaderNode = (node) => {
        if (!node) return false;
        if (node.tagName === 'HEADER' || node.closest?.('header')) return true;
        if (node.closest?.('[role="heading"], [data-testid="post-header"], [class*="header" i]')) return true;
        if (mediaEl && mediaEl.compareDocumentPosition && (mediaEl.compareDocumentPosition(node) & 2 /* Node.DOCUMENT_POSITION_PRECEDING */)) {
          return true;
        }
        return false;
      };

      const getNodeCleanText = (node) => {
        if (!node) return '';
        let text = '';
        if (node.querySelector && node.querySelector('time') && node.cloneNode) {
          try {
            const clone = node.cloneNode(true);
            const times = clone.querySelectorAll ? clone.querySelectorAll('time') : [];
            for (const t of times) t.remove?.();
            text = (clone.innerText || clone.textContent || '').trim();
          } catch (_) {
            text = (node.innerText || node.textContent || '').trim();
          }
        } else {
          text = (node.innerText || node.textContent || '').trim();
        }
        return text;
      };

      if (card) {
        let authorLinks = card.querySelectorAll ? Array.from(card.querySelectorAll('header a, h2 a, a[role="link"][tabindex="0"], a[role="link"], a[href^="/"], a[href*="instagram.com/"]')) : [];
        if (!authorLinks.length && card.querySelector) {
          const single = card.querySelector('header a, h2 a, a[role="link"][tabindex="0"], a[role="link"], a[href^="/"], a[href*="instagram.com/"]');
          if (single) authorLinks = [single];
        }
        for (const a of authorLinks) {
          if (mediaEl && (mediaEl === a || mediaEl.contains?.(a))) continue;
          if (isTimestampNode(a)) continue;
          let path = a.getAttribute?.('href') || a.href || '';
          path = path.replace(/[?#].*$/, '');
          try {
            if (path.startsWith('http')) path = new URL(path).pathname;
          } catch (_) {}
          path = path.replace(/\/+$/, '');
          const m = path.match(/^\/([A-Za-z0-9_.]+)$/);
          if (m && !/^(explore|reels|stories|direct|p|reel|accounts|about|legal|terms|privacy|developer)/i.test(m[1])) {
            let raw = (a.textContent || '').trim();
            raw = raw.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
            raw = raw.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
            if (raw && !SmartDmUtils.isGenericTitle(raw) && !isCompactTimestampText(raw) && !/^(follow|following|sponsored|suggested)/i.test(raw)) {
              author = raw;
              break;
            } else if (!author && m[1] && !SmartDmUtils.isGenericTitle(m[1]) && !isCompactTimestampText(m[1])) {
              author = m[1];
            }
          }
        }
        if (!author || SmartDmUtils.isGenericTitle(author) || isCompactTimestampText(author)) {
          const img = card.querySelector?.('header img[alt], [role="heading"] img[alt], img[alt*="profile picture" i]');
          const alt = img?.getAttribute?.('alt') || '';
          const mAlt = alt.match(/^([A-Za-z0-9_.]+)'s profile picture/i);
          if (mAlt && !SmartDmUtils.isGenericTitle(mAlt[1]) && !isCompactTimestampText(mAlt[1])) author = mAlt[1];
        }
        if (author) {
          author = author.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
          author = author.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
          if (SmartDmUtils.isGenericTitle(author) || isCompactTimestampText(author)) {
            author = '';
          }
        }

        const isSkipNode = (node, txt) => {
          if (!txt || txt.length < 2) return true;
          if (mediaEl && (mediaEl.contains?.(node) || node.contains?.(mediaEl))) return true;
          if (isTimestampNode(node)) return true;
          if (isCompactTimestampText(txt)) return true;
          if (isHeaderNode(node)) return true;
          if (node.closest?.('form, div[role="textbox"], [aria-label*="comment" i], [aria-label*="reply" i]')) return true;
          if (node.closest?.('button, [role="button"]') && !node.querySelector?.('span, p')) return true;
          if (node.closest?.('a[href*="/audio/"], a[href*="/music/"], a[href*="/sound/"], [class*="audio" i], [aria-label*="audio" i], [class*="music" i]')) return true;
          if (node.closest?.('a[href*="/explore/locations/"]')) return true;
          if (/^(?:instagram|home|likes?|views?|comments?|original audio|more|share|photo|video)$/i.test(txt)) return true;
          if (/^(?:follow|following|sponsored|suggested for you)$/i.test(txt)) return true;
          if (/^\d+[\d.,KkMmbB\s]*(?:likes?|views?|comments?|shares?|いいね|件|reproducciones|j’aime|gefällt)$/i.test(txt)) return true;
          if (/^(?:liked by\b|be the first to like|les gusta a|aimé par|piace a|curtido por|нравится|いいね|他.*人)/i.test(txt)) return true;
          if (/^(?:view (?:all )?[\d,.]*\s*comments?|add a comment(?:\.{3}|…)?|reply$|ver los|afficher les|alle.*kommentare|コメント.*件|返信)/i.test(txt)) return true;
          if (/^(?:original audio|audio track|sonido original|audio original|originaler ton|son original|オリジナル音源)$/i.test(txt)) return true;
          if (/^(?:♫|♬|\b[\w\s.-]+(?:•|·)\s*(?:original audio|audio\b|オリジナル音源))/i.test(txt)) return true;
          if (/^(?:see translation|ver traducción|voir la traduction|übersetzung anzeigen|翻訳を見る|查看翻译)$/i.test(txt)) return true;
          if (/^(?:more|…\s*more|\.\.\.\s*more|続きを読む|その他|más|plus|mehr)$/i.test(txt)) return true;
          if (author && txt.toLowerCase() === author.toLowerCase()) return true;
          if (SmartDmUtils.isGenericTitle(txt)) return true;
          return false;
        };

        const cleanCandidateText = (rawTxt) => {
          if (!rawTxt) return '';
          let txt = rawTxt.trim();
          txt = txt.replace(/^[•·\s\-–—|]+/, '').trim();
          txt = txt.replace(/(?:\s*[\r\n\s]+)?(?:see translation|ver traducción|voir la traduction|übersetzung anzeigen|翻訳を見る|查看翻译)$/i, '').trim();
          txt = txt.replace(/(?:\.\.\.|…)?\s*(?:more|続きを読む|その他|más|plus|mehr)$/i, '').trim();
          txt = txt.replace(/(?:\s*[\r\n\s]+)?(?:see translation|ver traducción|voir la traduction|übersetzung anzeigen|翻訳を見る|查看翻译)$/i, '').trim();
          txt = txt.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
          if (author) {
            const low = txt.toLowerCase();
            const aLow = author.toLowerCase();
            if (low.startsWith(aLow)) {
              txt = txt.slice(author.length).trim();
            } else if (low.startsWith('@' + aLow)) {
              txt = txt.slice(author.length + 1).trim();
            }
            txt = txt.replace(/^[:\-—•·~|\s]+/, '').trim();
          }
          txt = txt.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
          txt = txt.replace(/(?:\s*[\r\n\s]+)?(?:see translation|ver traducción|voir la traduction|übersetzung anzeigen|翻訳を見る|查看翻译)$/i, '').trim();
          txt = txt.replace(/(?:\.\.\.|…)?\s*(?:more|続きを読む|その他|más|plus|mehr)$/i, '').trim();
          txt = txt.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
          txt = txt.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
          return txt;
        };

        // Priority 1: Semantic caption containers
        const captionSelectors = [
          '[data-testid="post-caption"]',
          'div[class*="_a9zs"]',
          'span[class*="_a9zs"]',
          'h1',
          '[class*="caption" i]'
        ];
        for (const sel of captionSelectors) {
          const nodes = card.querySelectorAll ? card.querySelectorAll(sel) : [];
          for (const node of nodes) {
            if (isHeaderNode(node) || isTimestampNode(node)) continue;
            const raw = getNodeCleanText(node);
            if (isSkipNode(node, raw)) continue;
            const cleaned = cleanCandidateText(raw);
            if (cleaned.length >= 2 && !SmartDmUtils.isGenericTitle(cleaned) && !isCompactTimestampText(cleaned)) {
              caption = cleaned;
              break;
            }
          }
          if (caption) break;
        }

        // Priority 2: Post body container enclosing author link (outside header & outside mediaEl)
        if (!caption && author) {
          const authorLinksInBody = card.querySelectorAll ? card.querySelectorAll(`a[href*="/${author}"], a[role="link"]`) : [];
          for (const a of authorLinksInBody) {
            if (isHeaderNode(a) || isTimestampNode(a)) continue;
            if (mediaEl && (a.closest?.(mediaEl.tagName) || mediaEl.contains?.(a))) continue;
            const aText = (a.textContent || '').trim();
            let aHref = a.getAttribute?.('href') || a.href || '';
            aHref = aHref.replace(/[?#].*$/, '').replace(/\/+$/, '');
            if (aText.toLowerCase() !== author.toLowerCase() && !aHref.toLowerCase().endsWith('/' + author.toLowerCase())) continue;

            let p = a.parentElement;
            for (let k = 0; k < 4 && p && p !== card; k++) {
              if (isHeaderNode(p)) break;
              if (p.closest?.('form, div[role="textbox"], [aria-label*="comment" i]')) break;
              const raw = getNodeCleanText(p);
              if (raw.length > author.length + 2 && !isSkipNode(p, raw)) {
                const cleaned = cleanCandidateText(raw);
                if (cleaned.length >= 2 && !SmartDmUtils.isGenericTitle(cleaned) && !isCompactTimestampText(cleaned)) {
                  caption = cleaned;
                  break;
                }
              }
              p = p.parentElement;
            }
            if (caption) break;
          }
        }

        // Priority 3: General text nodes with dir="auto" or p
        if (!caption) {
          for (const sel of ['span[dir="auto"]', 'div[dir="auto"]', 'p']) {
            const nodes = card.querySelectorAll ? card.querySelectorAll(sel) : [];
            for (const node of nodes) {
              if (isHeaderNode(node) || isTimestampNode(node)) continue;
              const raw = getNodeCleanText(node);
              if (isSkipNode(node, raw)) continue;
              const cleaned = cleanCandidateText(raw);
              if (cleaned.length >= 2 && !SmartDmUtils.isGenericTitle(cleaned) && !isCompactTimestampText(cleaned)) {
                caption = cleaned;
                break;
              }
            }
            if (caption) break;
          }
        }

        // Priority 4: Image alt
        if (!caption) {
          const img = card.querySelector?.('img[alt]');
          const alt = img?.getAttribute?.('alt')?.trim();
          if (alt && alt.length > 5 && !/^(instagram|profile picture|photo by)/i.test(alt) && !SmartDmUtils.isGenericTitle(alt) && !isCompactTimestampText(alt)) {
            caption = alt;
          }
        }
      }

      if (caption && !SmartDmUtils.isGenericTitle(caption) && !isCompactTimestampText(caption)) {
        return SmartDmUtils.sanitizeCleanTitle(caption).slice(0, 160);
      }
      if (author && !SmartDmUtils.isGenericTitle(author) && !isCompactTimestampText(author)) {
        return `${author} - Instagram Video`;
      }
      const permalinkLink = card?.querySelector?.('a[href*="/p/"], a[href*="/reel/"]');
      if (permalinkLink) {
        const m = (permalinkLink.getAttribute?.('href') || '').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return `Instagram_${m[1]}`;
      }
      if (typeof window !== 'undefined' && window.location?.pathname) {
        const m = window.location.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return `Instagram_${m[1]}`;
      }
      const pageT = SmartDmUtils.extractWatchPageTitle();
      if (pageT && !SmartDmUtils.isGenericTitle(pageT) && !isCompactTimestampText(pageT)) {
        return SmartDmUtils.sanitizeCleanTitle(pageT);
      }
      return 'Instagram Video';
    } catch (e) {
      return 'Instagram Video';
    }
  }

  static extractFacebookMediaTitle(mediaEl, cardContainer) {
    try {
      let card = cardContainer;
      if (!card && mediaEl) {
        const isReelUrl = window.location.pathname.includes('/reel/');
        card = isReelUrl
          ? (this.findFacebookReelCard(mediaEl) || this.findFacebookPostCard(mediaEl))
          : (this.findFacebookPostCard(mediaEl) || this.findFacebookReelCard(mediaEl));
      }
      if (card && card.closest) {
        const isReelItem = card.tagName === 'A' || card.getAttribute('role') === 'listitem' || card.getAttribute('role') === 'gridcell' || card.closest('a[href*="/reel/"]');
        if (!isReelItem) {
          const article = card.closest('div[role="dialog"], div[role="article"], [data-pagelet^="FeedUnit_"], article');
          if (article && article !== document.body && article.getAttribute('role') !== 'main' && article.getAttribute('role') !== 'feed' && article.querySelectorAll('video').length <= 1) {
            card = article;
          }
        }
      }
      if (!card && mediaEl) {
        card = mediaEl.closest('div[role="dialog"]') || mediaEl.parentElement;
      }

      if (card) {
        // Pass 1: Semantic caption extraction from post card
        const caption = this.extractFacebookCaption(card, mediaEl);
        if (caption && !SmartDmUtils.isGenericTitle(caption)) return caption;

        // Pass 2: Reel/video overlay text strictly inside this specific card
        const textEls = card.querySelectorAll('span[dir="auto"], div[dir="auto"], span, a');
        const candidates = [];
        for (const el of textEls) {
          if (el.closest('h1, h2, h3, header, button, [role="button"], [role="toolbar"], form, ul, ol')) continue;
          if (mediaEl && (mediaEl.contains(el) || el.contains(mediaEl))) continue;
          const txt = this.extractTextWithEmojis(el);
          if (!txt || txt.length < 3 || SmartDmUtils.isGenericTitle(txt) || this.isFacebookMetadataString(txt)) continue;
          const lower = txt.toLowerCase();
          if (lower.startsWith('reels') || lower.startsWith('reel') || lower === 'follow' || lower.startsWith('original audio') || lower.includes('audio') || lower === 'suggested for you' || lower === 'sponsored') continue;
          candidates.push(txt);
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.length - a.length);
          const best = candidates.find(c => c.length >= 8 && (c.includes(' ') || c.length > 15)) || candidates[0];
          if (best && !SmartDmUtils.isGenericTitle(best)) {
            return SmartDmUtils.sanitizeCleanTitle(best.length > 90 ? best.substring(0, 90).trim() : best);
          }
        }
      }

      // Check single-video permalink page ONLY if there is at most 1 video on the whole page!
      const totalVideos = document.querySelectorAll('video').length;
      const isSingleVideoPage = totalVideos <= 1 && (window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch') || window.location.pathname.includes('/posts/'));
      if (isSingleVideoPage) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
          let t = ogTitle.content.trim().replace(/\s*\|\s*Facebook.*$/i, '').trim();
          if (t && t.length >= 3 && !SmartDmUtils.isGenericTitle(t)) {
            return SmartDmUtils.sanitizeCleanTitle(t.length > 90 ? t.substring(0, 90).trim() : t);
          }
        }
        const ogDesc = document.querySelector('meta[property="og:description"], meta[name="description"]');
        if (ogDesc && ogDesc.content) {
          let t = ogDesc.content.trim();
          if (t && t.length >= 3 && !SmartDmUtils.isGenericTitle(t)) {
            return SmartDmUtils.sanitizeCleanTitle(t.length > 90 ? t.substring(0, 90).trim() : t);
          }
        }
        const watchHeading = document.querySelector('div[role="main"] h1[dir="auto"], div[role="main"] div[dir="auto"][style*="text-align"]');
        if (watchHeading) {
          const t = (watchHeading.textContent || '').trim();
          if (t && t.length >= 3 && !SmartDmUtils.isGenericTitle(t)) {
            return SmartDmUtils.sanitizeCleanTitle(t.length > 90 ? t.substring(0, 90).trim() : t);
          }
        }
      }
    } catch (e) {}

    const isReels = window.location.pathname.includes('/reel/') || (mediaEl && this.findFacebookReelCard(mediaEl));
    return isReels ? 'facebook_reel' : 'facebook_video';
  }

  static extractFacebookPermalink(cardEl) {
    if (!cardEl) return null;
    try {
      // 1. Check header timestamp links (canonical Facebook post permalink under author heading)
      const headerLinks = cardEl.querySelectorAll('header a[href], [role="heading"] ~ div a[href], h2 ~ div a[href], h3 ~ div a[href], h4 ~ div a[href]');
      for (const a of headerLinks) {
        const h = a.href || '';
        if (h && (h.includes('/posts/') || h.includes('/videos/') || h.includes('/watch') || h.includes('/reel/') || h.includes('story_fbid') || h.includes('fbid') || h.includes('/permalink') || h.includes('/share/'))) {
          return SmartDmUtils.getCanonicalUrl(h);
        }
      }

      // 2. Direct Reel link on Reel cards / anchors
      if (cardEl.tagName === 'A' && cardEl.href && cardEl.href.includes('/reel/')) {
        return SmartDmUtils.getCanonicalUrl(cardEl.href);
      }
      const directReel = cardEl.querySelector('a[href*="/reel/"]');
      if (directReel && directReel.href && (cardEl.getAttribute('aria-label')?.toLowerCase().includes('reel') || cardEl.closest('[aria-label*="Reels" i], [data-pagelet*="Reels" i]'))) {
        return SmartDmUtils.getCanonicalUrl(directReel.href);
      }

      // 3. Post / Video permalink selectors (preferring /videos/, /watch/, /posts/ over /reel/ for feed posts)
      const linkSelectors = [
        'a[href*="/videos/"]',
        'a[href*="/watch/"]',
        'a[href*="/watch?"]',
        'a[href*="/posts/"]',
        'a[href*="/reel/"]',
        'a[href*="/permalink/"]',
        'a[href*="/share/p/"]',
        'a[href*="/share/v/"]',
        'a[href*="/permalink.php"]',
        'a[href*="/story.php"]',
        'a[href*="fbid="]',
        'a[href*="story_fbid="]',
        'a[href*="video_id="]'
      ];
      for (const sel of linkSelectors) {
        const el = cardEl.querySelector(sel);
        if (el && el.href) {
          return SmartDmUtils.getCanonicalUrl(el.href);
        }
      }
    } catch(e) {}
    return null;
  }

  static extractFacebookPostVideoId(mediaEl, cardContainer = null) {
    if (!mediaEl && !cardContainer) return null;
    try {
      if (mediaEl) {
        // 1. Direct attribute or dataset check
        const directId = mediaEl.getAttribute('data-video-id') || mediaEl.dataset?.videoId || (mediaEl.parentElement && (mediaEl.parentElement.getAttribute('data-video-id') || mediaEl.parentElement.dataset?.videoId));
        if (directId && /^\d+$/.test(directId)) return directId;

        // 2. Ancestor container attributes
        const idEl = mediaEl.closest('[data-video-id], [id*="video_"], [data-fbid], [data-pagelet*="Video"]');
        if (idEl) {
          const vAttr = idEl.getAttribute('data-video-id') || idEl.getAttribute('data-fbid') || idEl.dataset?.videoId;
          if (vAttr && /^\d+$/.test(vAttr)) return vAttr;
          const idStr = idEl.id || '';
          const m = idStr.match(/video_(\d+)/);
          if (m) return m[1];
        }

        // 3. React Fiber & Props inspection (instant, in-memory, zero DOM churn)
        let curr = mediaEl;
        for (let step = 0; step < 8 && curr; step++) {
          const keys = Object.keys(curr);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$')) {
              const node = curr[k];
              if (node) {
                const checkObj = (o) => {
                  if (!o || typeof o !== 'object') return null;
                  const vid = o.videoId || o.video_id || o.targetVideoId || o.fbid || (o.videoData && (o.videoData.id || o.videoData.videoId));
                  if (vid && /^\d+$/.test(String(vid))) return String(vid);
                  return null;
                };
                let found = checkObj(node.memoizedProps) || checkObj(node.props) || checkObj(node);
                if (found) return found;
              }
            }
          }
          curr = curr.parentElement;
        }
      }

      if (window.location.pathname.includes('/reel/')) {
        const m = window.location.pathname.match(/\/reel\/(\d+)/);
        if (m) return m[1];
      }

      const isReelUrl = window.location.pathname.includes('/reel/');
      let card = cardContainer;
      if (!card && mediaEl) {
        card = isReelUrl
          ? (this.findFacebookReelCard(mediaEl) || this.findFacebookPostCard(mediaEl))
          : (this.findFacebookPostCard(mediaEl) || this.findFacebookReelCard(mediaEl));
      }

      if (card && card !== document.body && card.querySelectorAll('video').length <= 1) {
        // 1. Check data-ft on the card
        const ft = card.getAttribute('data-ft');
        if (ft) {
          const vMatch = ft.match(/"video_id":\s*"?(\d+)"?/) || ft.match(/"mf_story_key":\s*"?(\d+)"?/);
          if (vMatch) return vMatch[1];
        }

        // 2. Check canonical header timestamp link on this card
        const headerLinks = card.querySelectorAll('header a[href], [role="heading"] ~ div a[href], h2 ~ div a[href], h3 ~ div a[href], h4 ~ div a[href]');
        for (const a of headerLinks) {
          const h = a.href || '';
          const m = h.match(/\/(?:videos|reel)\/(\d+)/) || h.match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
          if (m && m[1]) return m[1];
        }

        // 3. Check video player anchor links directly wrapping or adjacent to mediaEl
        if (mediaEl) {
          const playerAnchor = mediaEl.closest('a[href]');
          if (playerAnchor && playerAnchor.href) {
            const m = playerAnchor.href.match(/\/(?:videos|reel)\/(\d+)/) || playerAnchor.href.match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
            if (m && m[1]) return m[1];
          }
        }

        // 4. Check video links within the single card (prioritizing /videos/ and /watch/ over /reel/ for feed posts)
        const videoLinks = card.querySelectorAll('a[href*="/videos/"], a[href*="/watch"], a[href*="fbid="], a[href*="video_id="], a[href*="/reel/"]');
        for (const a of videoLinks) {
          const m = (a.href || '').match(/\/(?:videos|reel)\/(\d+)/) || (a.href || '').match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
          if (m && m[1]) return m[1];
        }
      }

      const urlMatch = window.location.href.match(/[?&]v=(\d+)/) || window.location.pathname.match(/\/videos\/(\d+)/);
      if (urlMatch) return urlMatch[1];
    } catch(e) {}
    return null;
  }

  static extractCardTitle(containerEl) {
    if (!containerEl) return null;
    try {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
      if (isFb) {
        return this.extractFacebookMediaTitle(null, containerEl);
      }
      const isInsta = typeof window !== 'undefined' && /(^|\.)instagram\.com$/.test(window.location.hostname);
      if (isInsta) {
        return this.extractInstagramMediaTitle(null, containerEl);
      }
      const isYtMusic = typeof window !== 'undefined' && window.location?.hostname?.includes('music.youtube.com');
      if (isYtMusic) {
        const item = containerEl.closest ? (containerEl.closest('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer') || containerEl) : containerEl;
        const titleEl = item.querySelector?.('.title a, yt-formatted-string.title a, yt-formatted-string.title, [class*="title-column"] a, .title');
        const bylineEl = item.querySelector?.('.byline a, yt-formatted-string.byline a, yt-formatted-string.byline, [class*="byline"] a, [class*="secondary-flex-columns"] a, .subtitle');
        const songTitle = titleEl ? (titleEl.getAttribute?.('title') || titleEl.textContent || '').trim() : '';
        let artist = bylineEl ? (bylineEl.getAttribute?.('title') || bylineEl.textContent || '').trim() : '';
        if (artist && artist.includes('•')) {
          artist = artist.split('•')[0].trim();
        }
        if (songTitle && artist && !songTitle.toLowerCase().includes(artist.toLowerCase())) {
          return SmartDmUtils.sanitizeCleanTitle(`${songTitle} - ${artist}`);
        }
        if (songTitle && !SmartDmUtils.isGenericTitle(songTitle)) {
          return SmartDmUtils.sanitizeCleanTitle(songTitle);
        }
      }

      const card = containerEl.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-grid-video-renderer, yt-lockup-view-model, ytmusic-responsive-list-item-renderer, ' +
        'ytmusic-two-row-item-renderer, .videoBox, .ph-thumbnail, .thumbBlock, ' +
        '.videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb'
      ) || containerEl;

      const titleSelectors = [
        '#video-title',
        '#video-title-link',
        'yt-formatted-string#video-title',
        '.yt-lockup-metadata-view-model-wiz__title',
        'h3.ytd-rich-grid-media a',
        'h3 a#video-title-link',
        'h3 a',
        'h3',
        '.ph-thumbnail-title a',
        '.title a',
        'a.title',
        '.bili-video-card__info--tit a',
        'a[title]',
        '[aria-label]'
      ];

      for (const sel of titleSelectors) {
        const el = card.querySelector(sel);
        if (el) {
          const t = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim();
          if (t && t.length >= 3 && !SmartDmUtils.isGenericTitle(t)) {
            return SmartDmUtils.sanitizeCleanTitle(t);
          }
        }
      }
    } catch(e) {}
    return null;
  }

  static extractYouTubeMusicTrackMetadata(playerBarEl = null) {
    try {
      const playerBar = playerBarEl || (typeof document !== 'undefined' ? document.querySelector('ytmusic-player-bar') : null);

      // 1. Title
      let rawTitle = '';
      const titleEl = playerBar?.querySelector?.('.title, [class*="title"]') ||
                      (typeof document !== 'undefined' ? document.querySelector('ytmusic-player .title, h1.title') : null);
      if (titleEl) {
        rawTitle = (titleEl.getAttribute?.('title') || titleEl.textContent || '').trim();
      }
      if (!rawTitle && typeof document !== 'undefined' && document.title) {
        const docTitle = document.title.replace(/\s*-\s*YouTube Music.*$/i, '').trim();
        if (docTitle && typeof SmartDmUtils !== 'undefined' && !SmartDmUtils.isGenericTitle(docTitle)) {
          rawTitle = docTitle;
        }
      }

      // 2. Byline (Artist, Album)
      const bylineEl = playerBar?.querySelector?.('.byline, [class*="byline"], .subtitle');
      let artist = '';
      let album = '';
      if (bylineEl) {
        const rawByline = (bylineEl.getAttribute?.('title') || bylineEl.textContent || '').trim();
        if (rawByline && rawByline.includes('•')) {
          const parts = rawByline.split('•').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) artist = parts[0];
          if (parts.length > 1) album = parts[1];
        } else {
          const links = Array.from(bylineEl.querySelectorAll ? bylineEl.querySelectorAll('a') : []);
          if (links.length > 0) {
            artist = (links[0].textContent || '').trim();
            if (links.length > 1) {
              album = (links[1].textContent || '').trim();
            }
          } else if (rawByline) {
            artist = rawByline;
          }
        }
      }

      // 3. Duration
      let duration = '';
      const timeInfoEl = playerBar?.querySelector?.('.time-info, [class*="time-info"]');
      if (timeInfoEl) {
        const timeText = (timeInfoEl.textContent || '').trim();
        if (timeText.includes('/')) {
          duration = timeText.split('/')[1].trim();
        } else {
          duration = timeText;
        }
      }

      // 4. Video ID and Track URL
      let videoId = null;
      let playlistId = null;
      const root = playerBar?.shadowRoot || playerBar;
      const linkEl = root?.querySelector?.('a[href*="watch?v="], a[href*="/watch"], [href*="watch?v="]');
      if (linkEl) {
        const href = linkEl.getAttribute?.('href') || linkEl.href || '';
        const m = href.match(/[?&]v=([^&#]+)/) || href.match(/\/watch\/([^?&#]+)/);
        if (m) videoId = m[1];
        const pMatch = href.match(/[?&]list=([^&#]+)/) || href.match(/\/browse\/(VL[^&#?/]+)/);
        if (pMatch) playlistId = pMatch[1];
      }
      if (!videoId && typeof window !== 'undefined' && window.location) {
        const m = window.location.href.match(/[?&]v=([^&#]+)/) || window.location.href.match(/\/watch\/([^?&#]+)/);
        if (m) videoId = m[1];
        const pMatch = window.location.href.match(/[?&]list=([^&#]+)/) || window.location.href.match(/\/browse\/(VL[^&#?/]+)/);
        if (pMatch) playlistId = pMatch[1];
      }
      if (!videoId && typeof document !== 'undefined') {
        const videoEl = document.querySelector('ytmusic-player video, video');
        if (videoEl) {
          videoId = videoEl.getAttribute?.('data-video-id') || videoEl.dataset?.videoId || null;
        }
        if (!videoId) {
          const btnWithId = playerBar?.querySelector?.('[data-video-id], [video-id]');
          if (btnWithId) {
            videoId = btnWithId.getAttribute('data-video-id') || btnWithId.getAttribute('video-id');
          }
        }
      }

      const trackUrl = videoId ? `https://music.youtube.com/watch?v=${videoId}` : null;

      // 5. Build proper composite title (Song title + Artist)
      let fullTitle = rawTitle;
      if (rawTitle && artist) {
        if (!rawTitle.toLowerCase().includes(artist.toLowerCase())) {
          fullTitle = `${rawTitle} - ${artist}`;
        }
      } else if (!fullTitle && artist) {
        fullTitle = artist;
      }
      if (fullTitle && typeof SmartDmUtils !== 'undefined') {
        fullTitle = SmartDmUtils.sanitizeCleanTitle(fullTitle);
      }
      if (!fullTitle || (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.isGenericTitle(fullTitle))) {
        fullTitle = 'YouTube Music Track';
      }

      return {
        title: rawTitle,
        artist,
        album,
        duration,
        videoId,
        trackUrl,
        playlistId,
        fullTitle
      };
    } catch(e) {
      return null;
    }
  }

  static extractYouTubeMusicPlaylistMetadata(headerEl = null) {
    try {
      const header = headerEl || (typeof document !== 'undefined' ?
        document.querySelector('ytmusic-editable-playlist-detail-header-renderer, ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-header-renderer') : null);

      // 1. Playlist / Album Title
      let title = '';
      const titleEl = header?.querySelector?.('.title, h1, yt-formatted-string.title, [class*="title"]') ||
                      (typeof document !== 'undefined' ? document.querySelector('ytmusic-editable-playlist-detail-header-renderer .title, ytmusic-responsive-header-renderer .title, h1.title, .heading-name') : null);
      if (titleEl) {
        title = (titleEl.getAttribute?.('title') || titleEl.textContent || '').trim();
      }
      if (!title && typeof document !== 'undefined' && document.title) {
        title = document.title.replace(/\s*-\s*YouTube Music.*$/i, '').trim();
      }

      // 2. Subtitle / Track count / Year
      const subEl = header?.querySelector?.('.subtitle, .strapline-text, .byline, [slot="subtitle"]');
      const subtitle = subEl ? (subEl.textContent || '').trim() : '';

      // 3. Playlist ID
      let playlistId = null;
      if (typeof window !== 'undefined' && window.location) {
        const m = window.location.href.match(/[?&]list=([^&#]+)/) ||
                  window.location.href.match(/\/browse\/(VL[^&#?/]+)/) ||
                  window.location.href.match(/\/browse\/(MPREb[^&#?/]+)/);
        if (m) playlistId = m[1];
      }
      if (!playlistId && header) {
        const link = header.querySelector?.('a[href*="list="], a[href*="/browse/VL"], a[href*="/browse/MPREb"]');
        if (link) {
          const href = link.getAttribute?.('href') || link.href || '';
          const m = href.match(/[?&]list=([^&#]+)/) ||
                    href.match(/\/browse\/(VL[^&#?/]+)/) ||
                    href.match(/\/browse\/(MPREb[^&#?/]+)/);
          if (m) playlistId = m[1];
        }
      }

      // 4. Extract tracks from list items (prefer playlist containers, exclude queue)
      const tracks = [];
      let itemEls = [];
      if (typeof document !== 'undefined') {
        const playlistContainer = document.querySelector('ytmusic-playlist-shelf-renderer #contents, ytmusic-shelf-renderer #contents, #contents.ytmusic-playlist-shelf-renderer, ytmusic-section-list-renderer #contents');
        if (playlistContainer) {
          itemEls = Array.from(playlistContainer.querySelectorAll('ytmusic-responsive-list-item-renderer'));
        }
        if (itemEls.length === 0) {
          itemEls = Array.from(document.querySelectorAll('ytmusic-responsive-list-item-renderer')).filter(el => {
            return !el.closest?.('#queue, ytmusic-player-page, [page-type="queue"]');
          });
        }
      }

      itemEls.forEach((itemEl, index) => {
        const tEl = itemEl.querySelector?.('.title a, yt-formatted-string.title a, yt-formatted-string.title, [class*="title-column"] a, .title');
        const songTitle = tEl ? (tEl.getAttribute?.('title') || tEl.textContent || '').trim() : '';

        const bylineGeneric = itemEl.querySelector?.('.byline, [class*="byline"], .subtitle');
        const rawByline = bylineGeneric ? (bylineGeneric.getAttribute?.('title') || bylineGeneric.textContent || '').trim() : '';
        let artist = '';
        let album = '';

        if (rawByline && rawByline.includes('•')) {
          const parts = rawByline.split('•').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) artist = parts[0];
          if (parts.length > 1) album = parts[1];
        } else {
          const bylineLinks = Array.from(itemEl.querySelectorAll ? itemEl.querySelectorAll('.byline a, yt-formatted-string.byline a, [class*="secondary-flex-columns"] a') : []);
          if (bylineLinks.length > 0) {
            artist = (bylineLinks[0].textContent || '').trim();
            if (bylineLinks.length > 1) album = (bylineLinks[1].textContent || '').trim();
          } else if (rawByline) {
            artist = rawByline;
          }
        }

        const dEl = itemEl.querySelector?.('.fixed-column, span.duration, [class*="duration"], yt-formatted-string.fixed-columns');
        const duration = dEl ? (dEl.textContent || '').trim() : '';

        const linkEl = itemEl.querySelector?.('a[href*="watch?v="], a[href*="v="], [href*="watch?v="], a[href*="/watch"], ytmusic-play-button-renderer [href*="watch"]');
        let videoId = null;
        if (linkEl) {
          const href = linkEl.getAttribute?.('href') || linkEl.href || '';
          const m = href.match(/[?&]v=([^&#]+)/) || href.match(/\/watch\/([^?&#]+)/);
          if (m) videoId = m[1];
        }
        if (!videoId) {
          videoId = itemEl.getAttribute?.('data-video-id') || itemEl.getAttribute?.('video-id') ||
                    itemEl.querySelector?.('[data-video-id]')?.getAttribute?.('data-video-id') || null;
        }

        const trackUrl = videoId ? `https://music.youtube.com/watch?v=${videoId}` : null;

        let fullTitle = songTitle;
        if (songTitle && artist && !songTitle.toLowerCase().includes(artist.toLowerCase())) {
          fullTitle = `${songTitle} - ${artist}`;
        }
        if (fullTitle && typeof SmartDmUtils !== 'undefined') {
          fullTitle = SmartDmUtils.sanitizeCleanTitle(fullTitle);
        }
        if (!fullTitle) {
          fullTitle = `Track ${index + 1}`;
        }

        tracks.push({
          index: index + 1,
          title: songTitle,
          artist,
          album,
          duration,
          videoId,
          trackUrl,
          fullTitle
        });
      });

      let cleanTitle = title;
      if (cleanTitle && typeof SmartDmUtils !== 'undefined') {
        cleanTitle = SmartDmUtils.sanitizeCleanTitle(cleanTitle);
      }
      if (!cleanTitle || (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.isGenericTitle(cleanTitle))) {
        cleanTitle = 'YouTube Music Playlist';
      }

      return {
        title: cleanTitle,
        subtitle,
        playlistId,
        trackCount: tracks.length,
        tracks
      };
    } catch(e) {
      return null;
    }
  }
}
