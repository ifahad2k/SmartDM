// SmartDM Universal Visual Mount Detector
// Resolves preview box boundaries on cards and video players without site-specific hardcoding.

class VisualMountDetector {
  static findVisualThumbnailMount(cardContainer) {
    if (!cardContainer) return null;

    if (cardContainer.tagName === 'IMG' || cardContainer.tagName === 'VIDEO') {
      return cardContainer.parentElement || cardContainer;
    }

    // 1. Gather all potential visual media elements in the card (images, videos, canvases)
    const mediaList = Array.from(
      cardContainer.querySelectorAll('img, video, canvas, [style*="background-image"]')
    );

    let bestThumbMedia = null;
    let maxArea = 0;

    for (const el of mediaList) {
      if (el.closest('[class*="avatar"], [class*="channel"], [class*="author"], [class*="badge"], [class*="icon"], [class*="user"], [class*="profile"], [class*="meta"], [class*="detail"], [id*="title"], h1, h2, h3, h4')) {
        continue;
      }

      const r = el.getBoundingClientRect();
      const w = r.width || el.offsetWidth || (el.naturalWidth ? Math.min(el.naturalWidth, 400) : 0);
      const h = r.height || el.offsetHeight || (el.naturalHeight ? Math.min(el.naturalHeight, 300) : 0);

      if (w < 60 || h < 35) continue;

      const aspect = w / (h || 1);
      if (aspect > 0.85 && aspect < 1.15 && w < 100) continue;

      const area = w * h;
      if (area > maxArea) {
        maxArea = area;
        bestThumbMedia = el;
      }
    }

    if (bestThumbMedia) {
      const mediaRect = bestThumbMedia.getBoundingClientRect();
      const mW = mediaRect.width || bestThumbMedia.offsetWidth || 100;
      const mH = mediaRect.height || bestThumbMedia.offsetHeight || 56;

      let curr = bestThumbMedia.parentElement || bestThumbMedia;

      while (curr && curr !== cardContainer && curr !== document.body) {
        const parent = curr.parentElement;
        if (!parent || parent === cardContainer || parent === document.body) break;

        const titleEl = parent.querySelector('[id*="title"], h1, h2, h3, h4, [class*="title"], [class*="metadata"], [id*="metadata"], [class*="detail"], [id*="detail"], [class*="meta"], [id*="meta"]');
        if (titleEl && !curr.contains(titleEl)) {
          break;
        }

        const pRect = parent.getBoundingClientRect();
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

      return curr;
    }

    const visualElement = cardContainer.querySelector(
      '[class*="visual"], [class*="thumbnail"], [class*="thumb"], [id*="thumbnail"], [id*="thumb"], [class*="preview"], [class*="cover"], [class*="poster"], [class*="media"]'
    );
    if (visualElement && visualElement !== cardContainer) {
      const vRect = visualElement.getBoundingClientRect();
      const cRect = cardContainer.getBoundingClientRect();
      const vW = vRect.width || visualElement.offsetWidth || 0;
      const cW = cRect.width || cardContainer.offsetWidth || 0;
      if (vW > 0 && cW > 0) {
        if (vW < cW * 0.85) return visualElement;
      } else {
        return visualElement;
      }
    }

    return cardContainer;
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
}
