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

  function isGenericPageUrl(url) {
    if (!url) return true;
    try {
      const u = new URL(url);
      const p = u.pathname.replace(/\/+$/, '');
      return !p || p === '' || p === '/' || p === '/feed' || p === '/home' || p === '/reels';
    } catch(e) {
      return true;
    }
  }

  function getMediaCacheKey(videoUrl, mediaEl) {
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    // On Facebook feeds and carousels, always bind the cache key to the specific video element
    if (isFb && mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_fb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return (videoUrl && !isGenericPageUrl(videoUrl)) ? `${videoUrl}_${mediaEl._smartdm_uid}` : mediaEl._smartdm_uid;
    }
    // 1. Specific video URL (e.g. /watch?v=, /shorts/, /reel/) is unique per video and must never be shared
    if (videoUrl && !isGenericPageUrl(videoUrl)) {
      return videoUrl;
    }
    // 2. Only on generic feed pages where URLs match does mediaEl isolate cards
    if (mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return mediaEl._smartdm_uid;
    }
    return 'req_' + Math.random().toString(36).substring(2, 9);
  }

  // Track video element playback timestamps across feeds and reels
  ['play', 'playing', 'timeupdate', 'progress'].forEach(evt => {
    document.addEventListener(evt, (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        e.target._smartdm_play_time = Date.now();
      }
    }, true);
  });

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function isOpaqueTokenOrHash(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.replace(/\.[a-z0-9]+$/i, '').trim();
    if (!clean || clean.length < 3) return true;
    if (/^AQ[A-Za-z0-9_-]{10,}$/i.test(clean)) return true;
    if (clean.length >= 25 && !clean.includes(' ') && /^[A-Za-z0-9_.+=\/-]+$/.test(clean)) return true;
    if (/^[0-9a-f]{24,}$/i.test(clean)) return true;
    if (/^(seg|fragment|chunk|track|stream|video|audio)[_-]?\d+/i.test(clean)) return true;
    return false;
  }

  function sanitizeCleanTitle(str) {
    if (!str || typeof str !== 'string') return '';
    let clean = str.replace(/^\(\d+\)\s*/, '').trim();
    clean = clean.replace(/\s*[\-\|\:·•]\s*(Facebook|Pornhub\.com|Pornhub|YouTube Music|YouTube|Bilibili|TikTok|Vimeo|Instagram|Twitter|X|Reddit).*$/i, '').trim();
    if (clean.toLowerCase().endsWith(' - youtube')) clean = clean.substring(0, clean.length - 10).trim();
    if (clean.toLowerCase().endsWith(' | youtube')) clean = clean.substring(0, clean.length - 10).trim();
    if (clean.toLowerCase().endsWith(' youtube')) clean = clean.substring(0, clean.length - 8).trim();
    if (clean.toLowerCase().endsWith(' - pornhub.com')) clean = clean.substring(0, clean.length - 14).trim();
    if (clean.toLowerCase().endsWith(' - pornhub')) clean = clean.substring(0, clean.length - 10).trim();
    if (clean.toLowerCase().endsWith(' | pornhub')) clean = clean.substring(0, clean.length - 10).trim();
    if (clean.toLowerCase().endsWith(' - facebook')) clean = clean.substring(0, clean.length - 11).trim();
    clean = clean.replace(/[\\/:*?""<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return clean;
  }

  function isGenericTitle(t) {
    if (!t || typeof t !== 'string') return true;
    const clean = t.replace(/^\(\d+\)\s*/, '').trim().toLowerCase();
    return !clean ||
      clean === 'youtube' ||
      clean === 'youtube music' ||
      clean === 'home' ||
      clean === 'feed' ||
      clean === 'subscriptions' ||
      clean === 'library' ||
      clean === 'trending' ||
      clean === 'watch later' ||
      clean === 'video' ||
      clean === 'media stream' ||
      clean === 'download' ||
      clean === 'downloads' ||
      clean === 'facebook' ||
      clean === 'facebook_video' ||
      clean === 'facebook_reel' ||
      clean === 'facebook video' ||
      clean === 'facebook reel' ||
      clean === 'facebook reels' ||
      clean.startsWith('reels - video') ||
      clean.startsWith('reel - video') ||
      clean.startsWith('reels and short') ||
      clean === 'reels' ||
      clean === 'reel' ||
      clean.startsWith('facebook video') ||
      clean.startsWith('facebook reel') ||
      clean === 'pornhub' ||
      clean === 'pornhub.com' ||
      clean === 'video stream' ||
      clean === 'stream' ||
      clean.length < 2 ||
      isOpaqueTokenOrHash(clean);
  }

  function findActiveVideoElement() {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      if (videos.length === 0) return null;
      // 1. Playing and unpaused
      const playing = videos.find(v => !v.paused && !v.ended && v.currentTime > 0);
      if (playing) return playing;
      // 2. Has active HTTP stream src
      const withSrc = videos.find(v => (v.currentSrc || v.src) && !(v.currentSrc || v.src).startsWith('blob:'));
      if (withSrc) return withSrc;
      // 3. Largest video on the page
      videos.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
      return videos[0];
    } catch(e) {
      return null;
    }
  }

  function extractSemanticPageTitle() {
    try {
      // 1. OpenGraph meta title
      const ogTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
      if (ogTitle && ogTitle.content) {
        const t = ogTitle.content.trim();
        if (!isGenericTitle(t)) return sanitizeCleanTitle(t);
      }

      // 2. Twitter card title
      const twTitle = document.querySelector('meta[name="twitter:title"], meta[property="twitter:title"]');
      if (twTitle && twTitle.content) {
        const t = twTitle.content.trim();
        if (!isGenericTitle(t)) return sanitizeCleanTitle(t);
      }

      // 3. JSON-LD schema (VideoObject, NewsArticle, etc.)
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of ldScripts) {
        if (s.textContent && (s.textContent.includes('VideoObject') || s.textContent.includes('"name"') || s.textContent.includes('"headline"'))) {
          try {
            const data = JSON.parse(s.textContent);
            const item = Array.isArray(data) ? data[0] : (data['@graph'] ? data['@graph'].find(g => g.name || g.headline) : data);
            if (item) {
              const cand = item.name || item.headline;
              if (cand && typeof cand === 'string' && !isGenericTitle(cand)) {
                return sanitizeCleanTitle(cand);
              }
            }
          } catch(e) {}
        }
      }

      // 4. In-page semantic headings / social post captions
      const headingSelectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.title yt-formatted-string',
        'h1.title span',
        '.inlineFree',
        'h1.title',
        '[data-ad-preview]',
        '.userContent',
        'h1',
        'h2'
      ];
      for (const sel of headingSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && t.length >= 3 && !isGenericTitle(t)) {
            const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
            return sanitizeCleanTitle(shortT);
          }
        }
      }

      // 5. Cleaned document.title
      let rawTitle = document.title || '';
      if (window.top !== window.self) {
        try {
          if (window.top.document && window.top.document.title) {
            rawTitle = window.top.document.title;
          }
        } catch (e) {}
      }
      if (rawTitle) {
        const clean = sanitizeCleanTitle(rawTitle);
        if (!isGenericTitle(clean)) return clean;
      }
    } catch(e) {}
    return null;
  }

  function extractWatchPageTitle() {
    try {
      const selectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.title yt-formatted-string',
        'h1.title',
        'h1'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && !isGenericTitle(t)) return sanitizeCleanTitle(t);
        }
      }
    } catch (e) {}
    return extractSemanticPageTitle();
  }

  function findFacebookPostCard(el) {
    if (!el) return null;
    return el.closest(
      'div[role="article"], [data-pagelet^="FeedUnit_"], article, ' +
      '[data-testid="fbfeed_story"], [data-testid="post_container"]'
    );
  }

  function findFacebookReelCard(mediaEl) {
    if (!mediaEl) return null;
    try {
      // 1. Direct anchor containing /reel/
      const directAnchor = mediaEl.closest('a[href*="/reel/"]');
      if (directAnchor) return directAnchor;

      // 2. Nearest container with role="listitem" in a reels carousel
      const listItem = mediaEl.closest('[role="listitem"]');
      if (listItem) {
        const link = listItem.querySelector('a[href*="/reel/"]');
        if (link) return listItem;
      }
    } catch(e) {}
    return null;
  }

  function extractFacebookReelCardTitle(reelCard) {
    if (!reelCard) return null;
    try {
      const textEls = reelCard.querySelectorAll('span[dir="auto"], div[dir="auto"], span, a');
      const candidates = [];
      for (const el of textEls) {
        if (el.closest('h1, h2, h3, header, button, [role="button"], [role="toolbar"]')) continue;
        const txt = (el.textContent || '').trim();
        if (!txt || txt.length < 3 || isGenericTitle(txt)) continue;
        const lower = txt.toLowerCase();
        if (lower.startsWith('reels') || lower.startsWith('reel') || lower === 'follow' || lower.startsWith('original audio') || lower.includes('audio')) continue;
        if (/^\d+[\d.,KkMmbB\s]*(likes|comments|views|shares)?$/i.test(txt)) continue;
        candidates.push(txt);
      }
      if (candidates.length > 0) {
        const best = candidates.find(c => c.length >= 8 && (c.includes(' ') || c.length > 15)) || candidates[0];
        if (best && !isGenericTitle(best)) {
          return sanitizeCleanTitle(best.length > 90 ? best.substring(0, 90).trim() : best);
        }
      }
      const img = reelCard.querySelector('img[alt]');
      if (img && img.alt) {
        const alt = img.alt.trim();
        if (alt && alt.length >= 4 && !isGenericTitle(alt)) {
          return sanitizeCleanTitle(alt.length > 90 ? alt.substring(0, 90).trim() : alt);
        }
      }
      const a = reelCard.tagName === 'A' ? reelCard : reelCard.querySelector('a[href*="/reel/"]');
      if (a) {
        const aria = (a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
        if (aria && aria.length >= 4 && !isGenericTitle(aria)) {
          return sanitizeCleanTitle(aria.length > 90 ? aria.substring(0, 90).trim() : aria);
        }
        if (a.href) {
          const m = a.href.match(/\/reel\/(\d+)/);
          if (m && m[1]) return `Facebook_Reel_${m[1]}`;
        }
      }
    } catch(e) {}
    return null;
  }

  function extractFacebookPostVideoId(mediaEl) {
    if (!mediaEl) return null;
    try {
      // 1. Direct attribute on mediaEl or its parent
      const directId = mediaEl.getAttribute('data-video-id') || (mediaEl.parentElement && mediaEl.parentElement.getAttribute('data-video-id'));
      if (directId && /^\d+$/.test(directId)) return directId;

      // 2. Check if mediaEl is in a reel card first
      const reelCard = findFacebookReelCard(mediaEl);
      if (reelCard) {
        const reelLink = reelCard.tagName === 'A' ? reelCard : reelCard.querySelector('a[href*="/reel/"]');
        if (reelLink && reelLink.href) {
          const m = reelLink.href.match(/\/reel\/(\d+)/);
          if (m && m[1]) return m[1];
        }
      }

      // 3. Search strictly within the post card
      const card = findFacebookPostCard(mediaEl);
      if (card) {
        const ft = card.getAttribute('data-ft');
        if (ft) {
          const vMatch = ft.match(/"video_id":\s*"?(\d+)"?/) || ft.match(/"mf_story_key":\s*"?(\d+)"?/);
          if (vMatch) return vMatch[1];
        }
        const videoLinks = card.querySelectorAll('a[href*="/reel/"], a[href*="/videos/"], a[href*="/watch"], a[href*="fbid="], a[href*="video_id="]');
        for (const a of videoLinks) {
          const m = (a.href || '').match(/\/(?:reel|videos)\/(\d+)/) || (a.href || '').match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
          if (m && m[1]) return m[1];
        }
      }

      // 4. Check page URL if on /reel/ or /watch/
      if (window.location.pathname.includes('/reel/')) {
        const m = window.location.pathname.match(/\/reel\/(\d+)/);
        if (m) return m[1];
      }
      const urlMatch = window.location.href.match(/[?&]v=(\d+)/) || window.location.pathname.match(/\/videos\/(\d+)/);
      if (urlMatch) return urlMatch[1];
    } catch (e) {}
    return null;
  }

  function extractFacebookCaption(containerEl) {
    if (!containerEl) return null;
    try {
      // 1. Direct Facebook message preview attributes
      const msgSelectors = [
        '[data-ad-preview="message"]',
        '[data-ad-comet-preview="message"]',
        '[data-testid="post_message"]',
        'div[dir="auto"][style*="text-align"]',
        '.userContent'
      ];
      for (const sel of msgSelectors) {
        const el = containerEl.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && t.length >= 2 && !isGenericTitle(t)) {
            const shortT = t.length > 90 ? t.substring(0, 90).trim() : t;
            return sanitizeCleanTitle(shortT);
          }
        }
      }

      // 2. Scan [dir="auto"] elements inside this specific post card
      const textEls = containerEl.querySelectorAll('[dir="auto"]');
      const candidates = [];
      for (const el of textEls) {
        if (el.closest('h1, h2, h3, h4, header, [role="toolbar"], button, [role="button"], [aria-label*="Like"], [aria-label*="Comment"], [aria-label*="Share"], [aria-label*="Follow"], [role="navigation"], form, a[role="link"]')) {
          continue;
        }
        const text = (el.textContent || '').trim();
        if (!text || text.length < 2 || isGenericTitle(text)) continue;
        const lower = text.toLowerCase();
        if (lower === 'follow' || lower === 'sponsored' || lower === 'public' || lower === 'suggested for you' || lower.includes('original audio')) continue;
        if (/^\d+[\d.,KkMmbB\s]*(likes|comments|views|shares|reactions)?$/i.test(text)) continue;
        if (/^(just now|\d+\s*[smhdw]|yesterday|at \d+:\d+)/i.test(text)) continue;
        candidates.push(text);
      }

      if (candidates.length > 0) {
        const best = candidates.find(c => c.length > 10 && c.includes(' ')) || candidates[0];
        if (best) {
          const shortT = best.length > 90 ? best.substring(0, 90).trim() : best;
          return sanitizeCleanTitle(shortT);
        }
      }

      // 3. Fallback: Author Name from this specific card
      const authorEl = containerEl.querySelector('h2 a, h3 a, h4 a, strong a, [role="heading"] a, h2, h3, strong');
      if (authorEl) {
        const author = (authorEl.textContent || '').trim();
        if (author && author.length >= 2 && !isGenericTitle(author) && !author.toLowerCase().includes('reel')) {
          return sanitizeCleanTitle(author + ' - Video');
        }
      }
    } catch(e) {}
    return null;
  }

  function extractFacebookMediaTitle(mediaEl, cardContainer) {
    const isReels = window.location.pathname.includes('/reel/');
    try {
      // 1. For Reels: check DOM caption container in [role="main"] or active reel slide
      if (isReels) {
        const mainEl = (mediaEl && mediaEl.closest('[role="main"]')) || document.querySelector('[role="main"]') || document.body;
        if (mainEl) {
          const spans = mainEl.querySelectorAll('span[dir="auto"], div[dir="auto"]');
          const candidates = [];
          for (const s of spans) {
            if (s.closest('h1, h2, h3, h4, header, button, [role="button"], [role="toolbar"], a[href*="/audio/"], a[href*="/reel/"], a[href*="/watch"]')) continue;
            // Skip author profile links
            const anchor = s.closest('a');
            if (anchor && anchor.getAttribute('href') && !anchor.getAttribute('href').includes('hashtag')) continue;
            const txt = (s.textContent || '').trim();
            if (!txt || txt.length < 4 || isGenericTitle(txt)) continue;
            const lower = txt.toLowerCase();
            if (lower.startsWith('original audio') || lower.includes('audio') || lower === 'follow' || lower === 'sponsored' || lower === 'public') continue;
            if (/^\d+[\d.,KkMmbB\s]*(likes|comments|views|shares)?$/i.test(txt)) continue;
            candidates.push(txt);
          }
          if (candidates.length > 0) {
            const best = candidates.find(c => c.includes(' ') && c.length > 10) || candidates[0];
            return sanitizeCleanTitle(best.length > 90 ? best.substring(0, 90).trim() : best);
          }
        }

        const metaDesc = document.querySelector('meta[property="og:description"], meta[name="description"]');
        if (metaDesc && metaDesc.content) {
          let content = metaDesc.content.trim();
          const reelPrefix = content.match(/Facebook Reels from [^:]+:\s*(.*)/i);
          if (reelPrefix && reelPrefix[1]) content = reelPrefix[1].trim();
          if (content && content.length >= 5 && !isGenericTitle(content)) {
            return sanitizeCleanTitle(content.length > 90 ? content.substring(0, 90).trim() : content);
          }
        }

        let docTitle = document.title || '';
        docTitle = docTitle.replace(/\s*\|\s*Facebook.*$/i, '').trim();
        docTitle = docTitle.replace(/^[^\-—·•:]+[\-—·•:]\s*/i, '').trim();
        docTitle = docTitle.replace(/.*on Reels\s*$/i, '').trim();
        if (docTitle && docTitle.length >= 5 && !isGenericTitle(docTitle)) {
          return sanitizeCleanTitle(docTitle.length > 90 ? docTitle.substring(0, 90).trim() : docTitle);
        }
      }

      // 2. Check if mediaEl is in a Facebook Reels carousel card on the feed
      const reelCard = mediaEl ? findFacebookReelCard(mediaEl) : null;
      if (reelCard) {
        const reelTitle = extractFacebookReelCardTitle(reelCard);
        if (reelTitle && !isGenericTitle(reelTitle)) return reelTitle;
      }

      // 3. For Feed Posts: check inside the specific card
      const card = (cardContainer && cardContainer.closest && (cardContainer.matches('div[role="article"], [data-pagelet^="FeedUnit_"], article') ? cardContainer : cardContainer.closest('div[role="article"], [data-pagelet^="FeedUnit_"], article')))
        || (mediaEl ? findFacebookPostCard(mediaEl) : null);
      if (card) {
        const caption = extractFacebookCaption(card);
        if (caption && !isGenericTitle(caption)) return caption;
      }

      // 4. Check OpenGraph title ONLY on direct permalink pages
      const isPermalink = window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch') || window.location.pathname.includes('/posts/');
      if (isPermalink) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
          let t = ogTitle.content.trim().replace(/\s*\|\s*Facebook.*$/i, '').trim();
          if (t && t.length >= 5 && !isGenericTitle(t)) {
            return sanitizeCleanTitle(t.length > 90 ? t.substring(0, 90).trim() : t);
          }
        }
      }
    } catch (e) {}

    return (isReels || (mediaEl && findFacebookReelCard(mediaEl))) ? 'facebook_reel' : 'facebook_video';
  }

  function extractFacebookPermalink(cardEl) {
    if (!cardEl) return null;
    try {
      const linkSelectors = [
        'a[href*="/reel/"]',
        'a[href*="/videos/"]',
        'a[href*="/watch/"]',
        'a[href*="/watch?"]',
        'a[href*="/posts/"]',
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
          return getCanonicalUrl(el.href);
        }
      }

      // Check header timestamp permalinks
      const headerLinks = cardEl.querySelectorAll('header a[href], h2 ~ div a[href], h3 ~ div a[href], h4 ~ div a[href], [role="heading"] ~ div a[href]');
      for (const a of headerLinks) {
        const h = a.href || '';
        if (h && (h.includes('/posts/') || h.includes('/videos/') || h.includes('/reel/') || h.includes('story_fbid') || h.includes('fbid') || h.includes('/permalink'))) {
          return getCanonicalUrl(h);
        }
      }
    } catch(e) {}
    return null;
  }

  function extractCardTitle(containerEl) {
    if (!containerEl) return null;
    try {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
      if (isFb) {
        return extractFacebookMediaTitle(null, containerEl);
      }

      const card = containerEl.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-grid-video-renderer, yt-lockup-view-model, ytmusic-responsive-list-item-renderer, ' +
        'ytmusic-two-row-item-renderer, .videoBox, .ph-thumbnail, .thumbBlock, ' +
        '.videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb'
      ) || containerEl;

      if (isFb) {
        const fbCardCaption = extractFacebookCaption(card);
        if (fbCardCaption) return fbCardCaption;

        // If literally no text caption exists in the post/reel, use author + " - Video"
        const authorEl = card.querySelector('h2 a, h3 a, h2, h3, [role="link"]');
        if (authorEl) {
          const author = (authorEl.textContent || '').trim();
          if (author && !isGenericTitle(author)) {
            return sanitizeCleanTitle(author + ' - Video');
          }
        }
        return 'facebook_video';
      }

      const titleSelectors = [
        '#video-title',
        '#video-title-link',
        'yt-formatted-string#video-title',
        '.yt-lockup-metadata-view-model-wiz__title',
        'h3.ytd-rich-grid-media a',
        'h3 a#video-title-link',
        'a#video-title',
        'h3 a',
        'h3'
      ];
      for (const sel of titleSelectors) {
        const el = card.querySelector(sel);
        if (el) {
          const t = (el.getAttribute('title') || el.textContent || el.getAttribute('aria-label') || '').trim();
          if (t && !isGenericTitle(t)) return sanitizeCleanTitle(t);
        }
      }

      const img = card.querySelector('img[alt]');
      if (img) {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt && !isGenericTitle(alt)) return sanitizeCleanTitle(alt);
      }

      const link = card.querySelector('a[title]');
      if (link) {
        const t = (link.getAttribute('title') || '').trim();
        if (t && !isGenericTitle(t)) return sanitizeCleanTitle(t);
      }
    } catch (e) {}
    return null;
  }

  function extractYouTubeVideoId(url) {
    if (!url) return null;
    try {
      const u = (url.startsWith('//') ? 'https:' + url : url);
      const m = u.match(/[?&]v=([^&#]+)/) ||
                u.match(/youtu\.be\/([^?&#/]+)/) ||
                u.match(/\/(?:shorts|embed|v)\/([^?&#/]+)/);
      if (m && m[1] && m[1].length >= 5) return m[1];
    } catch(e) {}
    return null;
  }

  function getInstantYouTubeFormats(videoUrl, title = 'YouTube Video') {
    const vid = extractYouTubeVideoId(videoUrl);
    const thumbUrl = vid ? `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg` : null;
    const cleanTitle = (title && !isGenericTitle(title)) ? title.trim() : 'YouTube Video';

    return [
      {
        formatId: '1080p',
        resolution: '1080p Full HD',
        height: 1080,
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: cleanTitle,
        url: videoUrl,
        videoUrl: videoUrl,
        audioUrl: null
      },
      {
        formatId: '720p',
        resolution: '720p HD',
        height: 720,
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: cleanTitle,
        url: videoUrl,
        videoUrl: videoUrl,
        audioUrl: null
      },
      {
        formatId: '480p',
        resolution: '480p SD',
        height: 480,
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: cleanTitle,
        url: videoUrl,
        videoUrl: videoUrl,
        audioUrl: null
      },
      {
        formatId: '360p',
        resolution: '360p SD',
        height: 360,
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: cleanTitle,
        url: videoUrl,
        videoUrl: videoUrl,
        audioUrl: null
      },
      {
        formatId: 'bestaudio/best',
        resolution: 'Audio (MP3 / High Quality)',
        height: -1,
        ext: 'mp3',
        fileSize: 0,
        isAudioOnly: true,
        title: cleanTitle,
        url: videoUrl,
        videoUrl: null,
        audioUrl: videoUrl
      },
      {
        formatId: 'thumbnail',
        resolution: 'Thumbnail (Cover Image / HD)',
        height: -2,
        ext: 'jpg',
        fileSize: 0,
        isAudioOnly: false,
        title: cleanTitle,
        url: thumbUrl,
        videoUrl: null,
        audioUrl: null
      }
    ];
  }

  function derivePageTitleFilename(ext = 'mp4') {
    const semTitle = extractSemanticPageTitle();
    if (semTitle && !isGenericTitle(semTitle)) {
      const lowerExt = '.' + ext.toLowerCase();
      return semTitle.toLowerCase().endsWith(lowerExt) ? semTitle : `${semTitle}${lowerExt}`;
    }
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

  // --- FACEBOOK DOM & SCRIPT EXTRACTOR ---
  function extractDashManifestFromText(text, targetVideoId = null) {
    if (!text) return null;
    const markers = ['"dash_manifest"', '"video_dash_manifest"'];
    for (const marker of markers) {
      let idx = 0;
      while ((idx = text.indexOf(marker, idx)) !== -1) {
        if (targetVideoId) {
          const proxStart = Math.max(0, idx - 10000);
          const proxEnd = Math.min(text.length, idx + 10000);
          const chunk = text.substring(proxStart, proxEnd);
          if (!chunk.includes(targetVideoId)) {
            idx += marker.length;
            continue;
          }
        }
        
        const colonIdx = text.indexOf(':', idx);
        if (colonIdx === -1) { idx += marker.length; continue; }
        const quoteStart = text.indexOf('"', colonIdx);
        if (quoteStart === -1) { idx += marker.length; continue; }
        
        let quoteEnd = -1;
        for (let i = quoteStart + 1; i < text.length; i++) {
          if (text[i] === '"' && text[i - 1] !== '\\') {
            quoteEnd = i;
            break;
          }
        }
        if (quoteEnd > quoteStart) {
          let raw = text.substring(quoteStart + 1, quoteEnd);
          try {
            raw = JSON.parse('"' + raw + '"');
          } catch(e) {
            raw = raw.replace(/\\"/g, '"').replace(/\\\/+/g, '/').replace(/\\n/g, '\n').replace(/\\u0026/g, '&');
          }
          if (raw && (raw.includes('<MPD') || raw.includes('&lt;MPD'))) {
            return raw;
          }
        }
        idx += marker.length;
      }
    }
    return null;
  }

  function parseFacebookDashManifest(mpdText, baseUrl, pageTitle = 'facebook_video') {
    const formats = [];
    try {
      if (!mpdText || typeof mpdText !== 'string') return [];
      
      if (mpdText.includes('<ContentProtection') || mpdText.includes('&lt;ContentProtection')) {
        return [];
      }

      let cleanText = mpdText;
      if (cleanText.includes('&lt;MPD')) {
        cleanText = cleanText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      }

      let durationSec = 0;
      const durMatch = cleanText.match(/mediaPresentationDuration=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?["']/);
      if (durMatch) {
        const h = parseFloat(durMatch[1] || 0);
        const m = parseFloat(durMatch[2] || 0);
        const s = parseFloat(durMatch[3] || 0);
        durationSec = h * 3600 + m * 60 + s;
      }

      const adaptMatches = [...cleanText.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)];
      let audioUrl = null;
      let audioBw = 0;
      const videoReps = [];

      adaptMatches.forEach(aMatch => {
        const setAttrs = aMatch[1].toLowerCase();
        const setBody = aMatch[2];
        const isVideo = setAttrs.includes('video') || setAttrs.includes('mimetype="video') || setAttrs.includes("mimetype='video");
        const isAudio = setAttrs.includes('audio') || setAttrs.includes('mimetype="audio') || setAttrs.includes("mimetype='audio");

        const repMatches = [...setBody.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)];
        repMatches.forEach(rMatch => {
          const repAttrs = rMatch[1];
          const repBody = rMatch[2];

          const wMatch = repAttrs.match(/\bwidth=["'](\d+)["']/i);
          const hMatch = repAttrs.match(/\bheight=["'](\d+)["']/i);
          const bwMatch = repAttrs.match(/\bbandwidth=["'](\d+)["']/i);

          const width = wMatch ? parseInt(wMatch[1], 10) : 0;
          const height = hMatch ? parseInt(hMatch[1], 10) : 0;
          const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

          let mediaUrl = '';
          const urlMatch = repBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i) || setBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i);
          if (urlMatch) {
            mediaUrl = urlMatch[1].trim().replace(/&amp;/g, '&');
            if (!mediaUrl.startsWith('http') && baseUrl) {
              try { mediaUrl = new URL(mediaUrl, baseUrl).href; } catch(e) {}
            }
          }

          if (mediaUrl && mediaUrl.startsWith('http')) {
            mediaUrl = sanitizeStreamUrl(mediaUrl);
            if (isVideo) {
              const effH = (width > 0 && height > 0) ? Math.min(width, height) : (height || width);
              videoReps.push({ effectiveHeight: effH, width, height, bandwidth, url: mediaUrl });
            } else if (isAudio) {
              if (!audioUrl || bandwidth > audioBw) {
                audioUrl = mediaUrl;
                audioBw = bandwidth;
              }
            }
          }
        });
      });

      videoReps.sort((a, b) => b.effectiveHeight - a.effectiveHeight || b.bandwidth - a.bandwidth);
      const seenH = new Set();
      videoReps.forEach(v => {
        if (seenH.has(v.effectiveHeight)) return;
        seenH.add(v.effectiveHeight);

        let label = '';
        if (v.effectiveHeight >= 2160) label = '4K UHD (2160p) (MP4)';
        else if (v.effectiveHeight >= 1440) label = '1440p Quad HD (MP4)';
        else if (v.effectiveHeight >= 1080) label = '1080p Full HD (MP4)';
        else if (v.effectiveHeight >= 720) label = '720p HD (MP4)';
        else if (v.effectiveHeight === 640) label = '640p (MP4)';
        else if (v.effectiveHeight === 540) label = '540p (MP4)';
        else if (v.effectiveHeight === 480) label = '480p SD (MP4)';
        else if (v.effectiveHeight === 360) label = '360p SD (MP4)';
        else label = `${v.effectiveHeight}p (MP4)`;

        let estSize = 0;
        if (durationSec > 0 && v.bandwidth > 0) {
          estSize = Math.round(((v.bandwidth + (audioBw || 128000)) * durationSec) / 8);
        }

        formats.push({
          formatId: 'fb_' + v.effectiveHeight + 'p',
          resolution: label,
          title: pageTitle,
          url: v.url,
          videoUrl: v.url,
          audioUrl: audioUrl,
          height: v.effectiveHeight,
          bandwidth: v.bandwidth,
          ext: 'mp4',
          isAudioOnly: false,
          fileSize: estSize
        });
      });

      if (audioUrl) {
        formats.push({
          formatId: 'fb_audio',
          resolution: 'Audio (MP3 / High Quality)',
          title: pageTitle,
          url: audioUrl,
          videoUrl: null,
          audioUrl: audioUrl,
          height: -1,
          ext: 'mp3',
          isAudioOnly: true,
          fileSize: 0
        });
      }
    } catch(e) {
      console.warn('parseFacebookDashManifest error:', e);
    }
    return formats;
  }

  function detectFacebookMaxQualityFromPlayer(mediaEl) {
    let maxQuality = 0;
    try {
      const container = mediaEl ? (mediaEl.closest('[data-video-id], [role="article"], article, div[data-pagelet]') || mediaEl.parentElement) : null;
      const root = container || document;
      const elements = root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div, span');
      for (const el of elements) {
        const txt = el.textContent ? el.textContent.trim() : '';
        if (txt.length >= 3 && txt.length <= 10) {
          const m = txt.match(/^(\d{3,4})p$/i);
          if (m) {
            const q = parseInt(m[1], 10);
            if (q > maxQuality) maxQuality = q;
          }
        }
      }
    } catch(e) {}
    return maxQuality;
  }

  function extractFacebookMediaFromDOM(targetVideoId = null, pageTitle = 'facebook_video') {
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    if (!isFb) return null;

    // 1. Try extracting DASH manifest directly from in-page scripts (instant, 1440p-ready)
    try {
      const allScripts = Array.from(document.querySelectorAll('script'));
      for (const s of allScripts) {
        const text = s.textContent || '';
        if (text.includes('dash_manifest')) {
          const rawXml = extractDashManifestFromText(text, targetVideoId);
          if (rawXml) {
            const dashFormats = parseFacebookDashManifest(rawXml, window.location.href, pageTitle);
            if (dashFormats && dashFormats.length > 0) {
              return { success: true, status: 'ok', title: pageTitle, formats: dashFormats };
            }
          }
        }
      }
    } catch (e) {}

    // 2. Direct progressive extraction
    const formats = [];
    const seen = new Set();

    const addDirect = (url, quality, ext = 'mp4', audioUrl = null) => {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      let cleanUrl = sanitizeStreamUrl(url.replace(/\\\/+/g, '/').replace(/\\u0026/g, '&').replace(/\\/g, ''));
      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);

      formats.push({
        formatId: 'fb_' + (quality.toLowerCase().includes('hd') ? 'hd' : (quality.toLowerCase().includes('audio') ? 'audio' : 'sd')),
        resolution: quality.includes('(') ? quality : `${quality} (MP4)`,
        ext: ext,
        fileSize: 0,
        isAudioOnly: quality.toLowerCase().includes('audio'),
        title: pageTitle,
        url: cleanUrl,
        directUrl: cleanUrl,
        videoUrl: cleanUrl,
        audioUrl: audioUrl
      });
    };

    try {
      if (targetVideoId) {
        const allScripts = Array.from(document.querySelectorAll('script'));
        const candidateScripts = allScripts.filter(s => (s.textContent || '').includes(targetVideoId));

        for (const s of candidateScripts) {
          const text = s.textContent || '';
          if (!text || text.length < 30) continue;
          const hasFbMediaKeys = text.includes('playable_url') || text.includes('browser_native') || text.includes('hd_src') || text.includes('sd_src');
          if (!hasFbMediaKeys) continue;

          let idIndex = text.indexOf(targetVideoId);
          while (idIndex !== -1) {
            const windowStart = Math.max(0, idIndex - 4000);
            const windowEnd = Math.min(text.length, idIndex + 4000);
            const chunk = text.substring(windowStart, windowEnd);
            if (chunk.includes('playable_url') || chunk.includes('browser_native') || chunk.includes('hd_src') || chunk.includes('sd_src')) {
              const hdMatches = chunk.matchAll(/(?:"playable_url_quality_hd"|"browser_native_hd_url"|"hd_src"|"hd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
              for (const m of hdMatches) {
                addDirect(m[1], '1080p / 720p HD', 'mp4');
              }

              const sdMatches = chunk.matchAll(/(?:"playable_url"|"browser_native_sd_url"|"sd_src"|"sd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
              for (const m of sdMatches) {
                addDirect(m[1], 'Standard Definition (SD)', 'mp4');
              }
            }
            idIndex = text.indexOf(targetVideoId, idIndex + 1);
          }
        }
      }
    } catch (e) {}

    if (formats.length > 0) {
      const bestVideo = formats.find(f => !f.isAudioOnly) || formats[0];
      const isHd = formats.some(f => f.formatId === 'fb_hd');

      const ladderFormats = [];
      const ladder = [
        { id: '1440p', label: '1440p Quad HD (MP4)',  h: 1440 },
        { id: '1080p', label: '1080p Full HD (MP4)',  h: 1080 },
        { id: '720p',  label: '720p HD (MP4)',        h: 720 },
        { id: '640p',  label: '640p (MP4)',           h: 640 },
        { id: '540p',  label: '540p (MP4)',           h: 540 },
        { id: '480p',  label: '480p SD (MP4)',        h: 480 },
        { id: '360p',  label: '360p SD (MP4)',        h: 360 }
      ];

      const availableLadder = isHd ? ladder : ladder.filter(tier => tier.h <= 720);
      availableLadder.forEach(tier => {
        ladderFormats.push({
          formatId: 'fb_' + tier.id,
          resolution: tier.label,
          height: tier.h,
          ext: 'mp4',
          fileSize: 0,
          isAudioOnly: false,
          title: pageTitle,
          url: bestVideo.url,
          videoUrl: bestVideo.url,
          audioUrl: null
        });
      });

      ladderFormats.push({
        formatId: 'fb_audio',
        resolution: 'Audio (MP3 / High Quality)',
        height: -1,
        ext: 'mp3',
        fileSize: 0,
        isAudioOnly: true,
        title: pageTitle,
        url: bestVideo.url,
        videoUrl: null,
        audioUrl: bestVideo.url
      });

      return { success: true, status: 'ok', title: pageTitle, formats: ladderFormats };
    }
    return null;
  }

  // --- UNIVERSAL TUBE & HTML5 DOM PARSER ---
  function extractTubeFormatsFromDOM(pageTitle = 'video') {
    const formats = [];
    const seen = new Set();

    const addFormat = (url, quality, ext = 'mp4') => {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      if (seen.has(url)) return;
      seen.add(url);

      const isHls = ext === 'm3u8' || url.includes('.m3u8');
      let qStr = quality ? String(quality).trim() : '';
      if (qStr && !qStr.endsWith('p') && /^\d+$/.test(qStr)) qStr += 'p';
      let qLabel = qStr || (isHls ? 'Master' : 'Video');
      const hNum = parseInt(qLabel, 10);
      if (hNum >= 720 && !qLabel.includes('HD')) qLabel += ' HD';
      qLabel += ' (MP4)';

      formats.push({
        formatId: 'tube_' + (quality || formats.length),
        resolution: qLabel,
        height: hNum || (isHls ? 1080 : 720),
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: pageTitle,
        url: url
      });

    };

    try {
      // 1. Scan page scripts for embedded player definitions
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (!text || text.length < 30) continue;

        // A. Pornhub / MindGeek network (mediaDefinitions)
        if (text.includes('mediaDefinitions')) {
          const idx = text.indexOf('mediaDefinitions');
          const start = text.indexOf('[', idx);
          if (start >= 0) {
            let openCount = 0, last = -1;
            for (let i = start; i < text.length; i++) {
              if (text[i] === '[') openCount++;
              else if (text[i] === ']') {
                openCount--;
                if (openCount === 0) { last = i; break; }
              }
            }
            if (last > start) {
              try {
                const list = JSON.parse(text.substring(start, last + 1));
                if (Array.isArray(list)) {
                  list.forEach(item => {
                    if (item && item.videoUrl) {
                      addFormat(item.videoUrl, item.quality || (item.format === 'hls' ? 'Master' : '720p'), item.format);
                    }
                  });
                }
              } catch(e) {}
            }
          }
        }

        // B. XVideos / XNXX (html5player.setVideoUrlLow/High/HLS)
        if (text.includes('html5player.setVideo')) {
          const high = text.match(/html5player\.setVideoUrlHigh\(['"]([^'"]+)['"]\)/);
          if (high) addFormat(high[1], '720p', 'mp4');
          const low = text.match(/html5player\.setVideoUrlLow\(['"]([^'"]+)['"]\)/);
          if (low) addFormat(low[1], '360p', 'mp4');
          const hls = text.match(/html5player\.setVideoHLS\(['"]([^'"]+)['"]\)/);
          if (hls) addFormat(hls[1], 'Master', 'm3u8');
        }

        // C. SpankBang & Generic Tube: "720p": "https://..." or quality_720p
        const qMatches = text.matchAll(/["']?(?:quality_)?(2160p?|1440p?|1080p?|720p?|480p?|360p?|240p?|144p?)["']?\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/gi);
        for (const m of qMatches) {
          addFormat(m[2], m[1], m[2].includes('.m3u8') ? 'm3u8' : 'mp4');
        }

        // D. XHamster: sources: { ... } or xplayerSettings
        if (text.includes('xplayerSettings') || text.includes('sources')) {
          const srcMatches = text.matchAll(/["']?(2160p?|1440p?|1080p?|720p?|480p?|360p?|240p?|144p?|hls)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/gi);
          for (const m of srcMatches) {
            if (m[2].includes('http') && (m[2].includes('.mp4') || m[2].includes('.m3u8'))) {
              addFormat(m[2], m[1], m[2].includes('.m3u8') ? 'm3u8' : 'mp4');
            }
          }
        }
      }

      // 2. HTML5 Video Elements & Sources
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        const src = v.currentSrc || v.src;
        if (src && src.startsWith('http')) {
          const h = v.videoHeight || 720;
          addFormat(src, h + 'p', src.includes('.m3u8') ? 'm3u8' : 'mp4');
        }
        const sources = v.querySelectorAll('source');
        sources.forEach(s => {
          const sUrl = s.src || s.getAttribute('src');
          if (sUrl && sUrl.startsWith('http')) {
            const res = s.getAttribute('res') || s.getAttribute('size') || (v.videoHeight ? v.videoHeight + 'p' : '720p');
            addFormat(sUrl, res, sUrl.includes('.m3u8') ? 'm3u8' : 'mp4');
          }
        });
      });
    } catch(e) {}

    formats.sort((a, b) => (b.height || 0) - (a.height || 0));
    return formats;
  }

  // --- UNIVERSAL FALLBACK & INTENT SENSOR ---
  function buildFallbackFormats(videoUrl, mediaEl, callback) {
    try {
      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      if (!mediaEl) mediaEl = findActiveVideoElement();
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')));
      const pageTitle = isFb ? extractFacebookMediaTitle(mediaEl, null) : (extractSemanticPageTitle() || 'video');

      // 1. YouTube instant standard format ladder (< 1ms)
      const isYouTube = (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) || window.location.hostname.includes('youtube.com');
      if (isYouTube) {
        const ytInstant = getInstantYouTubeFormats(videoUrl, pageTitle);
        if (ytInstant && ytInstant.length > 0) {
          callback({ success: true, status: 'ok', title: pageTitle, formats: ytInstant });
          return;
        }
      }

      // 2. First check in-page Tube formats from DOM scripts (ONLY on non-Facebook, non-YouTube sites!)
      if (!isFb && !isYouTube) {
        const tubeFormats = extractTubeFormatsFromDOM(pageTitle);
        if (tubeFormats && tubeFormats.length > 0) {
          callback({ success: true, status: 'ok', title: pageTitle, formats: tubeFormats });
          return;
        }
      }

      // 2. For Facebook, extract video ID and check in-page DOM scripts first
      let fbTargetId = null;
      if (isFb) {
        fbTargetId = extractFacebookPostVideoId(mediaEl);
        if (!fbTargetId && videoUrl) {
          const m = videoUrl.match(/\/(?:reel|videos)\/(\d+)/) || videoUrl.match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
          if (m) fbTargetId = m[1];
        }

        const fbDomFormats = extractFacebookMediaFromDOM(fbTargetId, pageTitle);
        if (fbDomFormats && fbDomFormats.formats && fbDomFormats.formats.length > 0) {
          callback(fbDomFormats);
          return;
        }
      }

      // 3. Query detected network streams from background
      runtime.sendMessage({ type: 'GET_DETECTED_MEDIA' }, (netRes) => {
        if (runtime.lastError) {
          if (isFb) {
            const domFb = extractFacebookMediaFromDOM(fbTargetId, pageTitle);
            if (domFb && domFb.formats && domFb.formats.length > 0) {
              callback(domFb);
              return;
            }
          }
          callback({
            success: false,
            status: 'error',
            message: 'No media formats detected for this video.'
          });
          return;
        }
        const netMedia = (netRes && netRes.media) ? netRes.media : [];

        try {
          // Dedicated Facebook stream isolation & dual video+audio pairing
          if (isFb) {
            const fbStreams = (netMedia || []).filter(m => m.url && (
              m.url.includes('fbcdn.net') || m.url.includes('facebook.com') ||
              m.url.includes('fbsbx.com') || m.url.includes('facebook.net')
            ));
            const allVideoStreams = fbStreams.filter(m => !m.isAudio);
            const allAudioStreams = fbStreams.filter(m => m.isAudio);

            const isCarouselReel = !!(mediaEl && findFacebookReelCard(mediaEl));
            const isUnplayedCarousel = isCarouselReel && mediaEl && mediaEl.paused && (mediaEl.currentTime || 0) === 0;

            let relevantVideo = allVideoStreams;
            if (fbTargetId) {
              const matched = allVideoStreams.filter(m => m.fbVideoId === fbTargetId);
              if (matched.length > 0) {
                relevantVideo = matched;
              } else if (isUnplayedCarousel) {
                relevantVideo = [];
              }
            }

            // Fallback: If no fbStreams found yet, check any non-audio streams in netMedia
            if (relevantVideo.length === 0 && !isUnplayedCarousel) {
              const anyVideos = (netMedia || []).filter(m => !m.isAudio);
              if (anyVideos.length > 0) {
                relevantVideo = anyVideos;
              }
            }

            // Match video stream to mediaEl
            let primaryVideo = null;
            if (relevantVideo.length > 0) {
              if (mediaEl && mediaEl._smartdm_play_time) {
                primaryVideo = relevantVideo.reduce((prev, curr) => {
                  const diffPrev = Math.abs((prev.timestamp || 0) - mediaEl._smartdm_play_time);
                  const diffCurr = Math.abs((curr.timestamp || 0) - mediaEl._smartdm_play_time);
                  return diffCurr < diffPrev ? curr : prev;
                }, relevantVideo[0]);
              } else {
                primaryVideo = relevantVideo[0];
              }
            }

            // Direct DOM source fallback for HTML5 video element (if progressive src is on mediaEl)
            if (!primaryVideo && mediaEl) {
              const live = mediaEl.currentSrc || mediaEl.src;
              if (live && live.startsWith('http') && !live.startsWith('blob:')) {
                primaryVideo = {
                  url: live,
                  contentLength: 0,
                  timestamp: Date.now()
                };
              }
            }

            // Match audio stream strictly for primaryVideo
            let primaryAudio = null;
            if (primaryVideo) {
              // RULE 1: Exact fbVideoId asset match!
              // Video and audio DASH streams for the same Facebook media item always share the exact same asset video_id in efg.
              if (primaryVideo.fbVideoId) {
                const sameAssetAudio = allAudioStreams.filter(m => m.fbVideoId && m.fbVideoId === primaryVideo.fbVideoId);
                if (sameAssetAudio.length > 0) {
                  primaryAudio = sameAssetAudio[0];
                }
              }

              // RULE 2: If fbTargetId matches
              if (!primaryAudio && fbTargetId) {
                const targetAudio = allAudioStreams.filter(m => m.fbVideoId === fbTargetId);
                if (targetAudio.length > 0) {
                  primaryAudio = targetAudio[0];
                }
              }

              // RULE 3: Proximity match among eligible audio streams (never pick another known video's audio!)
              if (!primaryAudio && allAudioStreams.length > 0) {
                const eligibleAudio = allAudioStreams.filter(m => {
                  if (m.fbVideoId && primaryVideo.fbVideoId && m.fbVideoId !== primaryVideo.fbVideoId) return false;
                  return true;
                });
                const pool = eligibleAudio.length > 0 ? eligibleAudio : allAudioStreams;
                primaryAudio = pool.reduce((prev, curr) => {
                  const diffPrev = Math.abs((prev.timestamp || 0) - (primaryVideo.timestamp || 0));
                  const diffCurr = Math.abs((curr.timestamp || 0) - (primaryVideo.timestamp || 0));
                  return diffCurr < diffPrev ? curr : prev;
                }, pool[0]);
              }
            } else if (allAudioStreams.length > 0) {
              primaryAudio = allAudioStreams[0];
            }

            const fbFormats = [];

            if (primaryVideo) {
              const effVH = (mediaEl && mediaEl.videoWidth > 0 && mediaEl.videoHeight > 0)
                ? Math.min(mediaEl.videoWidth, mediaEl.videoHeight)
                : (mediaEl ? (mediaEl.videoHeight || 0) : 0);
              const playerMaxQ = detectFacebookMaxQualityFromPlayer(mediaEl);
              const sourceHeight = Math.max(effVH, playerMaxQ, 1080);
              const totalStreamSize = (primaryVideo.contentLength || 0) + (primaryAudio ? (primaryAudio.contentLength || 0) : 0);

              // Standard multi-format quality ladder (matching user expectation from yt-dlp)
              const ladder = [
                { id: '2160p', label: '4K UHD (2160p) (MP4)', h: 2160, scale: 2.2 },
                { id: '1440p', label: '1440p Quad HD (MP4)',  h: 1440, scale: 1.6 },
                { id: '1080p', label: '1080p Full HD (MP4)',  h: 1080, scale: 1.0 },
                { id: '720p',  label: '720p HD (MP4)',        h: 720,  scale: 0.65 },
                { id: '640p',  label: '640p (MP4)',           h: 640,  scale: 0.52 },
                { id: '540p',  label: '540p (MP4)',           h: 540,  scale: 0.45 },
                { id: '480p',  label: '480p SD (MP4)',        h: 480,  scale: 0.38 },
                { id: '360p',  label: '360p SD (MP4)',        h: 360,  scale: 0.25 }
              ];

              let availableLadder = ladder.filter(item => item.h <= Math.max(sourceHeight, 1080));
              if (availableLadder.length === 0) availableLadder = ladder;

              availableLadder.forEach(tier => {
                let estSize = 0;
                if (totalStreamSize > 0) {
                  estSize = Math.round(totalStreamSize * tier.scale);
                }
                fbFormats.push({
                  formatId: 'fb_' + tier.id,
                  resolution: tier.label,
                  height: tier.h,
                  ext: 'mp4',
                  fileSize: estSize,
                  isAudioOnly: false,
                  title: pageTitle,
                  url: primaryVideo.url,
                  videoUrl: primaryVideo.url,
                  audioUrl: primaryAudio ? primaryAudio.url : null
                });
              });
            }

            if (primaryAudio) {
              fbFormats.push({
                formatId: 'fb_audio',
                resolution: 'Audio (MP3 / High Quality)',
                ext: 'mp3',
                fileSize: primaryAudio.contentLength || 0,
                isAudioOnly: true,
                title: pageTitle,
                url: primaryAudio.url,
                videoUrl: null,
                audioUrl: primaryAudio.url
              });
            } else if (primaryVideo) {
              fbFormats.push({
                formatId: 'fb_audio',
                resolution: 'Audio (MP3 / High Quality)',
                ext: 'mp3',
                fileSize: 0,
                isAudioOnly: true,
                title: pageTitle,
                url: primaryVideo.url,
                videoUrl: null,
                audioUrl: primaryVideo.url
              });
            }

            if (fbFormats.length > 0) {
              callback({ success: true, status: 'ok', title: pageTitle, formats: fbFormats });
              return;
            }

            callback({
              success: false,
              status: 'error',
              message: 'No media formats detected for this video.'
            });
            return;
          }

          // Per-element stream prioritization: match mediaEl with its own stream
          let prioritizedMedia = netMedia;
          if (mediaEl && mediaEl._smartdm_assigned_stream) {
            prioritizedMedia = [mediaEl._smartdm_assigned_stream, ...netMedia.filter(m => m.url !== mediaEl._smartdm_assigned_stream.url)];
          } else if (mediaEl && mediaEl._smartdm_play_time && netMedia.length > 0) {
            const closest = netMedia.slice().sort((a, b) => {
              const diffA = Math.abs((a.timestamp || 0) - mediaEl._smartdm_play_time);
              const diffB = Math.abs((b.timestamp || 0) - mediaEl._smartdm_play_time);
              return diffA - diffB;
            })[0];
            if (closest) {
              mediaEl._smartdm_assigned_stream = closest;
              prioritizedMedia = [closest, ...netMedia.filter(m => m.url !== closest.url)];
            }
          }

          let liveSrc = mediaEl ? (mediaEl.currentSrc || mediaEl.src) : null;
          if (mediaEl && (!liveSrc || liveSrc.startsWith('blob:'))) {
            const sourceChild = mediaEl.querySelector('source');
            if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
              liveSrc = sourceChild.src;
            }
          }

          const formats = [];

          if (liveSrc && liveSrc.startsWith('http')) {
            const h = mediaEl ? (mediaEl.videoHeight || 0) : 0;
            const w = mediaEl ? (mediaEl.videoWidth || 0) : 0;
            let resText = 'Source Stream';
            if (h >= 1080) resText = '1080p Full HD';
            else if (h >= 720) resText = '720p HD';
            else if (h >= 480) resText = '480p SD';
            else if (h > 0) resText = `${h}p`;
            if (w > 0 && h > 0) resText += ` (${w}x${h})`;

            formats.push({
              formatId: 'live_stream',
              resolution: resText,
              ext: liveSrc.includes('.webm') ? 'webm' : 'mp4',
              fileSize: 0,
              isAudioOnly: false,
              title: pageTitle,
              url: liveSrc
            });
          }

          prioritizedMedia.forEach((m, idx) => {
            if (liveSrc && m.url === liveSrc) return;
            const isGv = m.url.includes('googlevideo.com') || m.url.includes('videoplayback');
            const ext = (m.filename && m.filename.includes('.') ? m.filename.substring(m.filename.lastIndexOf('.') + 1) : 'mp4').toLowerCase();
            const isAudio = (m.contentType && m.contentType.includes('audio/')) || m.url.includes('.m4a') || m.url.includes('.mp3');
            
            let resLabel = m.customTitle || '';
            if (isGv) {
              const itagMatch = m.url.match(/[?&]itag=(\d+)/);
              const itag = itagMatch ? itagMatch[1] : '';
              if (isAudio || itag === '140' || itag === '251') {
                resLabel = 'Audio Stream (High Quality)';
              } else if (itag === '137' || itag === '248' || itag === '399') {
                resLabel = '1080p Full HD (MP4)';
              } else if (itag === '22' || itag === '136' || itag === '247') {
                resLabel = '720p HD (MP4)';
              } else if (itag === '18' || itag === '135' || itag === '244') {
                resLabel = '480p / 360p (MP4)';
              } else {
                resLabel = m.height && m.height >= 720 ? `${m.height}p HD (MP4)` : (m.height ? `${m.height}p (MP4)` : (itag ? `Video Stream (itag ${itag})` : 'Video Stream (MP4)'));
              }
            } else {
              // If video element is rendering this or active, check videoHeight/videoWidth
              const vH = (m.height && m.height > 0) ? m.height : (mediaEl ? (mediaEl.videoHeight || 0) : 0);
              const isGeneric = !resLabel || isOpaqueTokenOrHash(resLabel) || 
                                resLabel === 'HLS Video Stream' || resLabel === 'Video Stream' || 
                                resLabel === 'Direct Video' || resLabel.includes('Video Stream (MP4)') || 
                                resLabel.includes('Video Stream (mp4)');

              if (isGeneric && !isAudio && vH > 0) {
                const outExt = ext === 'm3u8' ? 'MP4' : ext.toUpperCase();
                if (vH >= 2160) resLabel = `4K UHD (2160p) (${outExt})`;
                else if (vH >= 1440) resLabel = `2K QHD (1440p) (${outExt})`;
                else if (vH >= 1080) resLabel = `1080p Full HD (${outExt})`;
                else if (vH >= 720) resLabel = `720p HD (${outExt})`;
                else if (vH >= 480) resLabel = `480p SD (${outExt})`;
                else resLabel = `${vH}p (${outExt})`;
              } else if (isGeneric) {
                resLabel = isAudio ? `Audio Stream ${idx + 1} (${ext.toUpperCase()})` : `Video Stream ${idx + 1} (${ext === 'm3u8' ? 'MP4' : ext.toUpperCase()})`;
              }
            }

            formats.push({
              formatId: 'net_' + idx,
              resolution: resLabel,
              ext: ext === 'm3u8' ? 'mp4' : ext,
              fileSize: (m.contentLength && m.contentLength >= 1048576) ? m.contentLength : 0,
              isAudioOnly: isAudio,
              title: pageTitle,
              url: m.url,
              height: (m.height && m.height > 0) ? m.height : (vH || 0)
            });
          });

          if (formats.length > 0) {
            callback({ success: true, status: 'ok', title: pageTitle, formats: formats });
          } else {
            if (isFb) {
              const domFb = extractFacebookMediaFromDOM(fbTargetId, pageTitle);
              if (domFb && domFb.formats && domFb.formats.length > 0) {
                callback(domFb);
                return;
              }
            }
            callback({
              success: false,
              status: 'error',
              message: 'No media formats detected for this video.'
            });
          }
        } catch(e) {
          console.error('[SmartDM] Stream extraction error:', e);
          if (isFb) {
            const domFb = extractFacebookMediaFromDOM(fbTargetId, pageTitle);
            if (domFb && domFb.formats && domFb.formats.length > 0) {
              callback(domFb);
              return;
            }
          }
          callback({
            success: false,
            status: 'error',
            message: 'No media formats detected for this video.'
          });
        }
      });
    } catch(err) {
      console.error('[SmartDM] buildFallbackFormats error:', err);
      callback({
        success: false,
        status: 'error',
        message: 'No media formats detected.'
      });
    }
  }

  // --- DYNAMIC FORMAT EXTRACTION ENGINE (3 TIERS) ---
  function fetchMediaFormats(videoUrl, mediaEl, callback) {
    try {
      if (!videoUrl) videoUrl = window.location.href;

      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')));

      const cacheKey = getMediaCacheKey(videoUrl, mediaEl);

      if (mediaFormatCache[cacheKey] && mediaFormatCache[cacheKey].status === 'done') {
        callback(mediaFormatCache[cacheKey].data);
        return;
      }

      if (mediaFormatCache[cacheKey] && mediaFormatCache[cacheKey].status === 'loading') {
        const elapsed = Date.now() - (mediaFormatCache[cacheKey].startTime || 0);
        const maxLoadingAge = isYouTube ? 15000 : 2500;
        if (elapsed < maxLoadingAge) {
          mediaFormatCache[cacheKey].callbacks.push(callback);
          return;
        }
        delete mediaFormatCache[cacheKey];
      }

      mediaFormatCache[cacheKey] = { status: 'loading', callbacks: [callback], startTime: Date.now() };

      let isHandled = false;
      const notifyCallbacks = (result) => {
        if (isHandled) return;
        isHandled = true;
        const entry = mediaFormatCache[cacheKey];
        if (result && result.formats && result.formats.length > 0) {
          mediaFormatCache[cacheKey] = { status: 'done', data: result, callbacks: [] };
          if (entry && entry.callbacks) entry.callbacks.forEach(cb => { try { cb(result); } catch(e) {} });
        } else {
          delete mediaFormatCache[cacheKey];
          if (entry && entry.callbacks) entry.callbacks.forEach(cb => { try { cb(result); } catch(e) {} });
        }
      };

      // Safety timeout: 22s for YouTube deciphering, fast 2.5s for social/streaming sites
      const safetyTimeoutMs = isYouTube ? 22000 : 2500;
      setTimeout(() => {
        if (!isHandled) {
          if (isYouTube) {
            notifyCallbacks({
              success: false,
              status: 'error',
              message: 'Timeout connecting to SmartDM desktop app.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM is running.</span>'
            });
          } else {
            notifyCallbacks({
              success: false,
              status: 'error',
              message: 'No media formats detected for this video.'
            });
          }
        }
      }, safetyTimeoutMs);

      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

      const isSpecificFbUrl = isFb && videoUrl && (
        videoUrl.includes('/reel/') ||
        videoUrl.includes('/videos/') ||
        videoUrl.includes('/watch') ||
        videoUrl.includes('/posts/') ||
        videoUrl.includes('fbid=') ||
        videoUrl.includes('story_fbid=') ||
        videoUrl.includes('/permalink') ||
        videoUrl.includes('/share/')
      );

      const isExternalWatchUrl = !isFb && !isYouTube && videoUrl !== window.location.href && 
        (videoUrl.includes('/view_video.php') || videoUrl.includes('/video/') || videoUrl.includes('/videos/') || videoUrl.includes('/watch'));

      let instantDelivered = false;

      // STEP 1: INSTANT EXTRACTION (< 5ms)
      // Deliver the stream that is ALREADY loaded right now in the browser!
      buildFallbackFormats(videoUrl, mediaEl, (instantRes) => {
        if (instantRes && instantRes.formats && instantRes.formats.length > 0) {
          instantDelivered = true;
          const hasMore = !!(isSpecificFbUrl || isExternalWatchUrl || isYouTube);
          if (typeof callback === 'function') {
            callback(instantRes, hasMore);
          }
        }
      });

      // STEP 2: ASYNCHRONOUS REFINEMENT (in background)
      // Refine with full quality ladder without blocking the user interface
      if (isSpecificFbUrl || isExternalWatchUrl) {
        runtime.sendMessage({ type: 'GET_PAGE_MEDIA_FORMATS', url: videoUrl }, (pageRes) => {
          if (pageRes && (pageRes.success || pageRes.status === 'ok') && pageRes.formats && pageRes.formats.length > 0) {
            mediaFormatCache[cacheKey] = { status: 'done', data: pageRes, callbacks: [] };
            if (typeof callback === 'function') {
              callback(pageRes, false);
            }
            return;
          }
          if (instantDelivered) {
            if (typeof callback === 'function') callback(null, false);
          } else {
            buildFallbackFormats(videoUrl, mediaEl, (fallbackRes) => {
              notifyCallbacks(fallbackRes);
            });
          }
        });
        return;
      }

      if (isYouTube) {
        runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
          if (res && (res.success || res.status === 'ok') && res.formats && res.formats.length > 0) {
            mediaFormatCache[cacheKey] = { status: 'done', data: res, callbacks: [] };
            if (typeof callback === 'function') {
              callback(res, false);
            }
            return;
          }

          // Fast DOM Check ONLY on actual watch/shorts page when videoUrl matches
          const isOnWatchPage = window.location.pathname.includes('/watch') || window.location.pathname.includes('/shorts/');
          if (isOnWatchPage && window.location.href.includes(videoUrl)) {
            const domRes = parsePageMetadataFromDOM();
            if (domRes && domRes.formats && domRes.formats.length > 0) {
              notifyCallbacks(domRes);
              return;
            }
          }

          if (instantDelivered) {
            if (typeof callback === 'function') callback(null, false);
          } else {
            notifyCallbacks({
              success: false,
              status: 'error',
              message: 'Could not resolve YouTube formats.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>'
            });
          }
        });
        return;
      }

      // Non-YouTube, non-permalink: if instant not delivered, wait for fallback
      if (!instantDelivered) {
        buildFallbackFormats(videoUrl, mediaEl, (res) => {
          notifyCallbacks(res);
        });
      }
    } catch(err) {
      if (typeof callback === 'function') {
        callback({ success: false, status: 'error', message: 'No media formats detected.' }, false);
      }
    }
  }

  // --- RENDER DYNAMIC FORMAT DROPDOWN ITEMS ---
  function renderFormatDropdown(container, formats, videoUrl, popover, mediaTitle = null, hasMorePending = false) {
    if (!container) return;
    if (container._smartdm_downloading) return;
    const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

    // Determine the authoritative base title for all formats
    let authoritativeTitle = null;
    if (mediaTitle && !isGenericTitle(mediaTitle)) {
      authoritativeTitle = mediaTitle.trim();
    } else {
      const firstFmtWithTitle = (formats || []).find(f => (f.title || f.Title) && !isGenericTitle(f.title || f.Title));
      if (firstFmtWithTitle) {
        authoritativeTitle = (firstFmtWithTitle.title || firstFmtWithTitle.Title).trim();
      }
    }

    if (!authoritativeTitle || isGenericTitle(authoritativeTitle)) {
      const pageFn = derivePageTitleFilename('mp4');
      const baseCandidate = pageFn.replace(/\.mp4$/i, '').trim();
      if (!isGenericTitle(baseCandidate)) {
        authoritativeTitle = baseCandidate;
      } else {
        authoritativeTitle = 'video';
      }
    }

    const cleanBaseName = authoritativeTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?""<>|]/g, '_').trim();
    const finalBaseTitle = cleanBaseName.length > 0 ? cleanBaseName : 'video';

    const rawItems = [];

    (formats || []).forEach(fmt => {
      const isAud = fmt.isAudioOnly || fmt.IsAudioOnly;
      let resolution = fmt.resolution || fmt.Resolution || fmt.qualityLabel || (isAud ? 'Audio Only' : 'Video');
      if (resolution === '0' || resolution === '0p' || resolution.includes('0x0') || isOpaqueTokenOrHash(resolution)) {
        resolution = fmt.height ? `${fmt.height}p` : 'Video Stream';
      }
      let ext = (fmt.ext || fmt.Ext || 'MP4').toUpperCase();
      if (ext === 'M3U8') ext = 'MP4';

      let cleanTitle = resolution;
      const hVal = fmt.height || (parseInt(resolution, 10) || 0);
      const is60fps = (fmt.fps && fmt.fps > 30) || resolution.includes('60');

      // Standardize resolution labels across instant and background-resolved formats
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
        }
      }

      if (!cleanTitle.toUpperCase().includes(ext) && !isAud && fmt.formatId !== 'thumbnail') {
        cleanTitle += ` (${ext})`;
      }
      cleanTitle = cleanTitle.replace(/\(([^)]+)\)\s*\(\1\)/gi, '($1)');

      const fSize = fmt.fileSize || fmt.FileSize || 0;
      const formattedSize = (fSize >= 1048576 || (isAud && fSize >= 102400)) ? formatSize(fSize) : null;
      const sizeText = formattedSize ? formattedSize : (fmt.tbr > 0 ? '~' + Math.round(fmt.tbr) + ' kbps' : 'Download');

      let fmtTitle = fmt.title || fmt.Title;
      if (!fmtTitle || isGenericTitle(fmtTitle)) {
        fmtTitle = finalBaseTitle;
      }
      let base = fmtTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?""<>|]/g, '_').trim();
      if (!base || isGenericTitle(base)) base = finalBaseTitle;
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
        isAudio: isAud
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
        fileName: `${finalBaseTitle}.mp3`,
        height: -1,
        isAudio: true
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
        fileName: `${finalBaseTitle}.jpg`,
        height: -2,
        isAudio: false
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

    // Sort items: video items by height descending (2160p, 1440p, 1080p, 720p...), audio items next, thumbnail last
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

    function createItemElement(item) {
      const div = document.createElement('div');
      div._formatData = item;
      div.className = 'format-item';
      div.dataset.formatKey = item.title;
      div.dataset.height = String(item.height || 0);
      div.dataset.isAudio = item.isAudio ? 'true' : 'false';
      div.dataset.isThumb = (item.formatId === 'thumbnail') ? 'true' : 'false';
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
        container._smartdm_downloading = true;
        container.innerHTML = '<div class="status-text" style="color:#38bdf8; font-weight:bold;">Opening SmartDM...</div>';

        const activeItem = div._formatData || item;
        const isYt = (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) || window.location.hostname.includes('youtube.com');

        const dispatchDownload = (currentFmtList, targetItem) => {
          const effectiveFormats = (currentFmtList && currentFmtList.length > 0) ? currentFmtList : formats;

          // Find best audio URL and size
          let bestAudioUrl = null;
          let bestAudioSize = 0;
          (effectiveFormats || []).forEach(f => {
            const isAud = f.isAudioOnly || f.IsAudioOnly;
            const aUrl = f.directUrl || f.DirectUrl || f.url || f.Url;
            const fid = String(f.formatId || f.FormatId || '');
            if (isAud && aUrl && aUrl.startsWith('http')) {
              if (!bestAudioUrl || fid === '140') {
                bestAudioUrl = aUrl;
                bestAudioSize = f.fileSize || f.FileSize || 0;
              }
            }
          });

          // Prepare full formats array to transmit to SmartDM desktop app
          const formatsList = (effectiveFormats || []).map(f => {
            const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
            const fUrl = f.directUrl || f.DirectUrl || f.url || f.Url || f.videoUrl || f.VideoUrl || null;
            let fExt = (f.ext || f.Ext || 'mp4').toLowerCase();
            if (fExt === 'm3u8') fExt = 'mp4';
            return {
              formatId: String(f.formatId || f.FormatId || ''),
              resolution: f.resolution || f.Resolution || f.qualityLabel || (isAud ? 'Audio Only' : 'Video'),
              ext: fExt,
              fileSize: f.fileSize || f.FileSize || 0,
              isAudioOnly: isAud,
              title: finalBaseTitle,
              url: fUrl,
              directUrl: fUrl,
              audioUrl: f.audioUrl || f.AudioUrl || (!isAud ? bestAudioUrl : null)
            };
          });

          if (!formatsList.some(f => f.formatId === 'bestaudio/best' || (f.isAudioOnly && f.ext === 'mp3'))) {
            formatsList.push({
              formatId: 'bestaudio/best',
              resolution: 'Audio (MP3 / High Quality)',
              ext: 'mp3',
              fileSize: bestAudioSize,
              isAudioOnly: true,
              title: finalBaseTitle,
              url: bestAudioUrl || targetItem.audioUrl || targetItem.url || null,
              directUrl: bestAudioUrl || targetItem.audioUrl || targetItem.url || null,
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
              title: finalBaseTitle,
              url: thumbUrl,
              audioUrl: null
            });
          }

          let directDownloadUrl = null;
          if (targetItem.formatId === 'thumbnail') {
            directDownloadUrl = thumbUrl || targetItem.url || videoUrl;
          } else if (targetItem.formatId === 'bestaudio/best') {
            directDownloadUrl = bestAudioUrl || targetItem.audioUrl || targetItem.url || videoUrl;
          } else {
            directDownloadUrl = (targetItem.url && targetItem.url.startsWith('http') && targetItem.url !== videoUrl)
              ? targetItem.url
              : ((targetItem.videoUrl && targetItem.videoUrl.startsWith('http') && targetItem.videoUrl !== videoUrl) ? targetItem.videoUrl : videoUrl);
          }

          const audioUrlToSend = targetItem.audioUrl || (!targetItem.isAudioOnly && targetItem.formatId !== 'thumbnail' ? bestAudioUrl : null);

          runtime.sendMessage({
            type: 'START_MEDIA_DOWNLOAD',
            url: directDownloadUrl,
            videoUrl: targetItem.videoUrl,
            audioUrl: audioUrlToSend,
            formatId: targetItem.formatId,
            fileName: targetItem.fileName,
            title: finalBaseTitle,
            referer: videoUrl || window.location.href,
            pageUrl: window.location.href,
            formats: formatsList
          }, () => {
            setTimeout(() => popover.classList.remove('active'), 800);
          });
        };

        if (isYt && activeItem.formatId !== 'thumbnail' && (!activeItem.directUrl || activeItem.directUrl === videoUrl || activeItem.directUrl.includes('youtube.com'))) {
          let dispatched = false;
          const safetyTimer = setTimeout(() => {
            if (!dispatched) {
              dispatched = true;
              dispatchDownload(formats, activeItem);
            }
          }, 3500);

          fetchMediaFormats(videoUrl, null, (res) => {
            if (dispatched) return;
            if (res && res.formats && res.formats.length > 0) {
              dispatched = true;
              clearTimeout(safetyTimer);
              const matched = res.formats.find(f => {
                const fH = f.height || parseInt(f.resolution || f.Resolution || '0', 10);
                return fH > 0 && fH === activeItem.height;
              }) || res.formats[0];
              dispatchDownload(res.formats, matched || activeItem);
            }
          });
        } else {
          dispatchDownload(formats, activeItem);
        }
      }, true);

      return div;
    }

    if (isFirstRender) {
      items.forEach(item => {
        container.appendChild(createItemElement(item));
      });
    } else {
      // Seamless in-place insertion for background-resolved qualities
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

  // --- UNIVERSAL PLAYER OVERLAY INJECTOR ---
  function scanPlayers() {
    const mediaElements = document.querySelectorAll('video:not([' + ATTR_PLAYER_ATTACHED + ']), audio:not([' + ATTR_PLAYER_ATTACHED + '])');
    mediaElements.forEach(attachPlayerBanner);
  }

  function attachPlayerBanner(mediaEl) {
    if (mediaEl.getAttribute(ATTR_PLAYER_ATTACHED)) return;

    // Strict filtering: ignore preview videos on cards, hover clips, tiny audio/icon elements
    if (mediaEl.closest('.phimage, .thumbnailWrapper, .pcVideoListItem, .videoBox, [class*="preview"], ytd-thumbnail, .thumb, .card, article')) return;
    if (mediaEl.tagName === 'VIDEO') {
      const isMuted = mediaEl.muted || mediaEl.hasAttribute('muted');
      const isLoop = mediaEl.loop || mediaEl.hasAttribute('loop');
      const isShort = mediaEl.duration > 0 && mediaEl.duration < 25;
      if (isMuted && (isLoop || isShort)) {
        if (mediaEl.offsetWidth < 450 || mediaEl.offsetHeight < 300) return;
      }
    }

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
          width: 290px;
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

    let hasPrewarmedBanner = false;
    bannerBtn.addEventListener('mouseenter', () => {
      if (hasPrewarmedBanner) return;
      const isYt = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
      if (isYt) {
        hasPrewarmedBanner = true;
        fetchMediaFormats(getCanonicalUrl(window.location.href), mediaEl, () => {});
      }
    }, { passive: true });

    bannerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (mediaEl) {
        mediaEl._smartdm_play_time = Date.now();
      }

      let videoUrl = getCanonicalUrl(window.location.href);
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
      const isFbReels = isFb && window.location.pathname.includes('/reel/');
      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be') || (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')));
      let parentCard = null;
      let reelCard = null;
      if (isFb) {
        if (!isFbReels) {
          reelCard = findFacebookReelCard(mediaEl);
          if (reelCard) {
            parentCard = reelCard;
            const reelLink = reelCard.tagName === 'A' ? reelCard : reelCard.querySelector('a[href*="/reel/"]');
            if (reelLink && reelLink.href) {
              videoUrl = getCanonicalUrl(reelLink.href);
            }
          } else {
            parentCard = findFacebookPostCard(mediaEl);
            if (parentCard) {
              const postLink = extractFacebookPermalink(parentCard);
              if (postLink) {
                videoUrl = typeof postLink === 'string' ? postLink : getCanonicalUrl(postLink.href);
              }
            }
          }
        }
      } else {
        parentCard = mediaEl.closest('[role="article"], article, div[id*="feed_subtitle"]');
      }

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      content._smartdm_downloading = false;
      popover.classList.add('active');

      let cardTitle = null;
      if (isFb) {
        cardTitle = extractFacebookMediaTitle(mediaEl, parentCard);
      } else if (parentCard) {
        cardTitle = extractCardTitle(parentCard);
      }
      const fallbackTitle = isFb ? (isFbReels ? 'facebook_reel' : 'facebook_video') : extractWatchPageTitle();
      const pageTitle = (cardTitle && !isGenericTitle(cardTitle)) ? cardTitle : fallbackTitle;

      // Fast synchronous DOM/DASH extraction (< 1ms)
      let initialFormats = null;
      if (isFb) {
        const fbTargetId = extractFacebookPostVideoId(mediaEl);
        const domFb = extractFacebookMediaFromDOM(fbTargetId, pageTitle);
        if (domFb && domFb.formats && domFb.formats.length > 0) {
          initialFormats = domFb.formats;
        }
      } else if (isYouTube) {
        initialFormats = getInstantYouTubeFormats(videoUrl, pageTitle);
      }

      let currentFormats = [];
      if (initialFormats && initialFormats.length > 0) {
        currentFormats = [...initialFormats];
        renderFormatDropdown(content, currentFormats, videoUrl, popover, pageTitle, true);
      } else {
        content.innerHTML = `
          <div class="spinner-container">
            <div class="spinner"></div>
            <span class="status-text" style="padding:0;">Loading video options...</span>
          </div>
        `;
      }

      fetchMediaFormats(videoUrl, mediaEl, (res, hasMorePending) => {
        try {
          if (content._smartdm_downloading) return;
          const resolvedTitle = (cardTitle && !isGenericTitle(cardTitle)) ? cardTitle : ((res && res.title && !isGenericTitle(res.title)) ? res.title : pageTitle);
          if (res && res.formats && res.formats.length > 0) {
            const existingKeys = new Set(currentFormats.map(f => {
              const resStr = (f.resolution || f.Resolution || '').toLowerCase().trim();
              const fmtId = (f.formatId || f.FormatId || '').toLowerCase().trim();
              const h = f.height || 0;
              const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
              return `${resStr}_${fmtId}_${h}_${isAud}`;
            }));

            res.formats.forEach(f => {
              // Update matching existing formats with real directUrl/audioUrl/fileSize
              const match = currentFormats.find(cur => {
                const fH = f.height || parseInt(f.resolution || f.Resolution || '0', 10);
                const curH = cur.height || parseInt(cur.resolution || cur.Resolution || '0', 10);
                if (fH > 0 && curH > 0 && fH === curH) return true;
                const fFmtId = String(f.formatId || f.FormatId || '').toLowerCase();
                const curFmtId = String(cur.formatId || cur.FormatId || '').toLowerCase();
                if (fFmtId && curFmtId && (fFmtId === curFmtId || fFmtId.startsWith(curFmtId) || curFmtId.startsWith(fFmtId))) return true;
                return false;
              });
              if (match) {
                if (f.directUrl || f.DirectUrl) match.directUrl = f.directUrl || f.DirectUrl;
                if (f.url || f.Url) match.url = f.url || f.Url;
                if (f.audioUrl || f.AudioUrl) match.audioUrl = f.audioUrl || f.AudioUrl;
                if ((f.fileSize || f.FileSize) > 0) match.fileSize = f.fileSize || f.FileSize;
              }

              const resStr = (f.resolution || f.Resolution || '').toLowerCase().trim();
              const fmtId = (f.formatId || f.FormatId || '').toLowerCase().trim();
              const h = f.height || 0;
              const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
              const key = `${resStr}_${fmtId}_${h}_${isAud}`;
              if (!existingKeys.has(key)) {
                existingKeys.add(key);
                currentFormats.push(f);
              }
            });

            renderFormatDropdown(content, currentFormats, videoUrl, popover, resolvedTitle, hasMorePending);
          } else if (!res && hasMorePending === false) {
            const notice = content.querySelector('.smartdm-pending-notice');
            if (notice) notice.remove();
          } else if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' + 
              ((res && res.message) ? res.message : 'No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>') + 
              '</div>';
          }
        } catch (uiErr) {
          console.error('[SmartDM] Format dropdown error:', uiErr);
          if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' +
              ((res && res.message) ? res.message : 'Error rendering formats.<br><span style="font-size:10px; color:#94a3b8;">No stream detected.</span>') +
              '</div>';
          }
        }
      });
    });

    document.body.appendChild(host);
  }

  // --- UNIVERSAL VISUAL THUMBNAIL MOUNT RESOLVER ---
  function findVisualThumbnailMount(cardContainer) {
    if (!cardContainer) return null;

    // If cardContainer itself is an image or video tag
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
      // Exclude elements that are clearly avatars, channel logos, user badges, or icons
      if (el.closest('[class*="avatar"], [class*="channel"], [class*="author"], [class*="badge"], [class*="icon"], [class*="user"], [class*="profile"], [class*="meta"], [class*="detail"], [id*="title"], h1, h2, h3, h4')) {
        continue;
      }

      const r = el.getBoundingClientRect();
      const w = r.width || el.offsetWidth || (el.naturalWidth ? Math.min(el.naturalWidth, 400) : 0);
      const h = r.height || el.offsetHeight || (el.naturalHeight ? Math.min(el.naturalHeight, 300) : 0);

      // Must be a reasonable size for a video thumbnail preview (minimum 60x35 px)
      if (w < 60 || h < 35) continue;

      // Filter out circular or square avatars that might lack avatar classes
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

      // Walk up ancestors from bestThumbMedia:
      // Find the highest ancestor that still wraps ONLY the visual media,
      // and does NOT expand to include card metadata / titles!
      let curr = bestThumbMedia.parentElement || bestThumbMedia;

      while (curr && curr !== cardContainer && curr !== document.body) {
        const parent = curr.parentElement;
        if (!parent || parent === cardContainer || parent === document.body) break;

        // If parent contains text metadata / title elements that are not inside curr, STOP!
        const titleEl = parent.querySelector('[id*="title"], h1, h2, h3, h4, [class*="title"], [class*="metadata"], [id*="metadata"], [class*="detail"], [id*="detail"], [class*="meta"], [id*="meta"]');
        if (titleEl && !curr.contains(titleEl)) {
          break;
        }

        const pRect = parent.getBoundingClientRect();
        const pW = pRect.width || parent.offsetWidth || 0;
        const pH = pRect.height || parent.offsetHeight || 0;

        // If parent width is significantly wider than the media (> 25% wider),
        // it means parent is a horizontal flex/grid row encompassing the text side!
        if (pW > 0 && mW > 0 && pW > mW * 1.25) {
          break;
        }

        // If parent height is significantly taller than the media (> 35% taller),
        // it means parent is a vertical card encompassing text below!
        if (pH > 0 && mH > 0 && pH > mH * 1.35) {
          break;
        }

        curr = parent;
      }

      return curr;
    }

    // Fallback: If no distinct media element found, check if cardContainer has any child element
    // occupying only the left portion of a horizontal card, or any element matching visual/thumb patterns
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
      '.phimage',
      '.thumbnailWrapper',
      '.ph-thumbnail',
      '.videoBox',
      '.videoCard',
      '.video-card',
      '.thumb',
      '[class*="thumbnail"]'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    elements.forEach((el) => {
      const cardContainer = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, .videoBox, .ph-thumbnail, .thumbBlock, .videoCard, .video-card, .video-item, .bili-video-card, article, li, .card, .thumb') || el;
      
      const rect = cardContainer.getBoundingClientRect();
      if (rect.height < 40) return;

      if (cardContainer.getAttribute(ATTR_THUMB_ATTACHED) || cardContainer.closest('[' + ATTR_THUMB_ATTACHED + ']')) return;
      if (cardContainer.querySelector('.smartdm-thumb-host')) return;

      let videoUrl = null;
      const link = cardContainer.querySelector('a[href*="/watch?v="], a[href*="/watch/"], a[href*="/shorts/"], a[href*="/video/"], a[href*="/view_video.php"]') || (cardContainer.tagName === 'A' ? cardContainer : null);
      if (link && link.href) {
        videoUrl = link.href;
      } else if (cardContainer.tagName === 'A' && cardContainer.href) {
        videoUrl = cardContainer.href;
      }

      if (!videoUrl) return;

      // Universally resolve the exact visual thumbnail mount element (never cardContainer on horizontal cards)
      const targetMount = findVisualThumbnailMount(cardContainer);
      if (!targetMount) return;

      if (targetMount.getAttribute(ATTR_THUMB_ATTACHED) || targetMount.querySelector('.smartdm-thumb-host')) return;

      cardContainer.setAttribute(ATTR_THUMB_ATTACHED, 'true');
      targetMount.setAttribute(ATTR_THUMB_ATTACHED, 'true');

      if (window.getComputedStyle(targetMount).position === 'static') {
        targetMount.style.position = 'relative';
      }
      targetMount.style.overflow = 'visible';

      const cardTitle = extractCardTitle(cardContainer);
      attachThumbnailBadge(targetMount, getCanonicalUrl(videoUrl), cardTitle);
    });
  }

  function attachThumbnailBadge(containerEl, videoUrl, cardTitle = null) {
    if (window.getComputedStyle(containerEl).position === 'static') {
      containerEl.style.position = 'relative';
    }

    const host = document.createElement('div');
    host.className = 'smartdm-thumb-host';
    host.style.position = 'absolute';
    host.style.top = '6px';
    host.style.right = '6px';
    host.style.zIndex = '99999';
    host.style.pointerEvents = 'auto';

    // Prevent any clicks inside the host from bubbling up and triggering card navigation
    host.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 12px; height: 12px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        .spinner-container { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 0; }
        .thumb-btn {
          background: rgba(15, 23, 42, 0.82);
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
          opacity: 0.85;
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
          position: fixed;
          width: 290px;
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
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
          z-index: 2147483647;
        }
        .popover.active { display: flex; }
        .popover-title {
          font-weight: 700; color: #38bdf8; font-size: 11px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 4px; margin-bottom: 3px;
        }
        .popover-content {
          max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 2px;
        }
        @keyframes smartdmFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
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

    const positionPopover = () => {
      const btnRect = thumbBtn.getBoundingClientRect();
      const pHeight = popover.offsetHeight || 220;
      let top = btnRect.bottom + 4;
      if (top + pHeight > window.innerHeight && btnRect.top > pHeight + 10) {
        top = Math.max(10, btnRect.top - pHeight - 4);
      }
      popover.style.top = top + 'px';
      let left = btnRect.right - 290;
      if (left < 10) left = 10;
      if (left + 290 > window.innerWidth - 10) left = window.innerWidth - 300;
      popover.style.left = left + 'px';
    };

    document.addEventListener('click', (e) => {
      if (popover.classList.contains('active')) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(host) && !host.contains(e.target)) {
          popover.classList.remove('active');
        }
      }
    }, true);

    const onScrollOrResize = () => {
      if (popover.classList.contains('active')) {
        const r = thumbBtn.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) {
          popover.classList.remove('active');
        } else {
          positionPopover();
        }
      }
    };
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    let hasPrewarmed = false;
    const prewarm = () => {
      if (hasPrewarmed) return;
      hasPrewarmed = true;
      const isYt = videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'));
      if (isYt) {
        fetchMediaFormats(videoUrl, null, () => {});
      }
    };
    thumbBtn.addEventListener('mouseenter', prewarm, { passive: true });
    containerEl.addEventListener('mouseenter', prewarm, { passive: true });

    thumbBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const isActive = popover.classList.contains('active');
      if (isActive) {
        popover.classList.remove('active');
        return;
      }

      content._smartdm_downloading = false;
      popover.classList.add('active');
      positionPopover();

      const isYt = videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'));
      const fallbackTitle = isYt ? 'YouTube Video' : 'video';
      const resolvedTitle = (cardTitle && !isGenericTitle(cardTitle)) ? cardTitle : (extractCardTitle(containerEl) || fallbackTitle);

      let initialFormats = null;
      if (isYt) {
        initialFormats = getInstantYouTubeFormats(videoUrl, resolvedTitle);
      }

      let currentFormats = [];
      if (initialFormats && initialFormats.length > 0) {
        currentFormats = [...initialFormats];
        renderFormatDropdown(content, currentFormats, videoUrl, popover, resolvedTitle, true);
      } else {
        content.innerHTML = `
          <div class="spinner-container">
            <div class="spinner"></div>
            <span class="status-text" style="padding:0;">Loading video options...</span>
          </div>
        `;
      }

      fetchMediaFormats(videoUrl, null, (res, hasMorePending) => {
        try {
          if (content._smartdm_downloading) return;
          const finalTitle = (res && res.title && !isGenericTitle(res.title)) ? res.title : resolvedTitle;
          if (res && res.formats && res.formats.length > 0) {
            const existingKeys = new Set(currentFormats.map(f => {
              const resStr = (f.resolution || f.Resolution || '').toLowerCase().trim();
              const fmtId = (f.formatId || f.FormatId || '').toLowerCase().trim();
              const h = f.height || 0;
              const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
              return `${resStr}_${fmtId}_${h}_${isAud}`;
            }));

            res.formats.forEach(f => {
              // Update matching existing formats with real directUrl/audioUrl/fileSize
              const match = currentFormats.find(cur => {
                const fH = f.height || parseInt(f.resolution || f.Resolution || '0', 10);
                const curH = cur.height || parseInt(cur.resolution || cur.Resolution || '0', 10);
                if (fH > 0 && curH > 0 && fH === curH) return true;
                const fFmtId = String(f.formatId || f.FormatId || '').toLowerCase();
                const curFmtId = String(cur.formatId || cur.FormatId || '').toLowerCase();
                if (fFmtId && curFmtId && (fFmtId === curFmtId || fFmtId.startsWith(curFmtId) || curFmtId.startsWith(fFmtId))) return true;
                return false;
              });
              if (match) {
                if (f.directUrl || f.DirectUrl) match.directUrl = f.directUrl || f.DirectUrl;
                if (f.url || f.Url) match.url = f.url || f.Url;
                if (f.audioUrl || f.AudioUrl) match.audioUrl = f.audioUrl || f.AudioUrl;
                if ((f.fileSize || f.FileSize) > 0) match.fileSize = f.fileSize || f.FileSize;
              }

              const resStr = (f.resolution || f.Resolution || '').toLowerCase().trim();
              const fmtId = (f.formatId || f.FormatId || '').toLowerCase().trim();
              const h = f.height || 0;
              const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
              const key = `${resStr}_${fmtId}_${h}_${isAud}`;
              if (!existingKeys.has(key)) {
                existingKeys.add(key);
                currentFormats.push(f);
              }
            });

            renderFormatDropdown(content, currentFormats, videoUrl, popover, finalTitle, hasMorePending);
          } else if (!res && hasMorePending === false) {
            const notice = content.querySelector('.smartdm-pending-notice');
            if (notice) notice.remove();
          } else if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">' + 
              ((res && res.message) ? res.message : 'No media formats detected.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>') + 
              '</div>';
          }
        } catch (uiErr) {
          console.error('[SmartDM] Format dropdown error:', uiErr);
          if (currentFormats.length === 0) {
            content.innerHTML = '<div class="status-text" style="color:#f87171;">Error rendering formats.</div>';
          }
        }
      });
    }, true);

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
