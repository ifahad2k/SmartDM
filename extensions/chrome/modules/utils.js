// SmartDM Universal Utilities (Stateless pure functions)
// Encapsulates URL parsing, title sanitization, resolution calculation, and token detection

class SmartDmUtils {
  static getCanonicalUrl(rawUrl) {
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

  static parseFacebookEfg(rawUrl) {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl);
      let efg = u.searchParams.get('efg');
      if (!efg) return null;
      efg = decodeURIComponent(efg).replace(/ /g, '+');
      while (efg.length % 4 !== 0) efg += '=';
      let jsonStr = '';
      if (typeof atob !== 'undefined') {
        jsonStr = atob(efg);
      } else if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(efg, 'base64').toString('utf8');
      }
      if (jsonStr && jsonStr.startsWith('{')) {
        return JSON.parse(jsonStr);
      }
    } catch (e) {}
    return null;
  }

  static isFacebookAudioStream(url, contentType = '', isAudioFlag = false) {
    if (isAudioFlag === true) return true;
    const u = (url || '').toLowerCase();
    if (u.includes('mime=audio') || u.includes('/audio/') || u.includes('dash_a') || u.includes('audiocodecs') || u.includes('frag_2_audio') || u.includes('.m4a') || u.includes('.mp3')) return true;
    if (contentType && contentType.toLowerCase().includes('audio/')) return true;
    const fbEfg = this.parseFacebookEfg(url);
    if (fbEfg) {
      const vTag = (fbEfg.vencode_tag || fbEfg.encode_tag || '').toLowerCase();
      const aTag = (fbEfg.audio_tag || '').toLowerCase();
      if (vTag.includes('audio') || vTag.includes('heaac') || vTag.includes('aac') || vTag.includes('opus')) return true;
      if (aTag.includes('audio') || aTag.includes('heaac') || aTag.includes('aac') || aTag.includes('opus')) return true;
      if (vTag.includes('dash_a') || aTag.includes('dash_a')) return true;
      if (fbEfg.bitrate && fbEfg.bitrate < 150000 && !vTag.includes('video') && !vTag.includes('dash_v')) return true;
    }
    return false;
  }

  static isFacebookVideoStream(url, contentType = '', isVideoFlag = false) {
    if (this.isFacebookAudioStream(url, contentType, false)) return false;
    if (isVideoFlag === true) return true;
    const u = (url || '').toLowerCase();
    if (u.includes('dash_v') || u.includes('mime=video') || u.includes('frag_1_video') || u.includes('videocodecs')) return true;
    const fbEfg = this.parseFacebookEfg(url);
    if (fbEfg) {
      const vTag = (fbEfg.vencode_tag || fbEfg.encode_tag || '').toLowerCase();
      if (vTag.includes('video') || vTag.includes('dash_v') || vTag.includes('vp9') || vTag.includes('avc') ||
          vTag.includes('h264') || vTag.includes('hevc') || vTag.includes('av01') || vTag.includes('baseline') ||
          vTag.includes('main') || vTag.includes('high') || vTag.includes('720p') || vTag.includes('1080p') ||
          vTag.includes('480p') || vTag.includes('360p') || vTag.includes('inline')) {
        return true;
      }
    }
    if (contentType && contentType.toLowerCase().includes('video/')) return true;
    return false;
  }

  static isGenericPageUrl(url) {
    if (!url) return true;
    try {
      const u = new URL(url);
      const p = u.pathname.replace(/\/+$/, '');
      return !p || p === '' || p === '/' || p === '/feed' || p === '/home' || p === '/reels';
    } catch(e) {
      return true;
    }
  }

  static getMediaCacheKey(videoUrl, mediaEl) {
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    if (isFb && mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_fb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return (videoUrl && !this.isGenericPageUrl(videoUrl)) ? `${videoUrl}_${mediaEl._smartdm_uid}` : mediaEl._smartdm_uid;
    }
    if (videoUrl && !this.isGenericPageUrl(videoUrl)) {
      return videoUrl;
    }
    if (mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return mediaEl._smartdm_uid;
    }
    return (videoUrl && !this.isGenericPageUrl(videoUrl)) ? videoUrl : (window.location.origin + window.location.pathname);
  }

  static formatSize(bytes) {
    if (!bytes || bytes <= 0) return null;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static isOpaqueTokenOrHash(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.replace(/\.[a-z0-9]+$/i, '').trim();
    if (!clean || clean.length < 3) return true;
    if (/^AQ[A-Za-z0-9_-]{10,}$/i.test(clean)) return true;
    if (clean.length >= 25 && !clean.includes(' ') && /^[A-Za-z0-9_.+=\/-]+$/.test(clean)) return true;
    if (/^[0-9a-f]{24,}$/i.test(clean)) return true;
    if (/^(seg|fragment|chunk|track|stream|video|audio)[_-]?\d+/i.test(clean)) return true;
    return false;
  }

  static sanitizeCleanTitle(str) {
    if (!str || typeof str !== 'string') return '';
    let clean = str.replace(/^\(\d+\)\s*/, '').trim();

    // Strip leading action verbs: Watch, Streaming, Play, Download, Free
    clean = clean.replace(/^(?:watch|streaming|play|download|free)\s+/i, '').trim();

    // Strip resolution brackets like [1080p], [720p], (1080p), [1080p HD], [Full HD]
    clean = clean.replace(/\[\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\]/gi, '').trim();
    clean = clean.replace(/\(\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\)/gi, '').trim();

    // Strip site suffixes separated by :: (e.g. " :: AnimePahe")
    clean = clean.replace(/\s*::\s*.*$/, '').trim();

    // Strip site/brand suffixes separated by - or | or • or —
    clean = clean.replace(/\s*[\-\|\•\—]\s*(?:Watch\s+(?:Free\s+)?Online.*|Watch\s+on\s+.*|Watch\s+Online.*|Watch\s*.*|Full\s+Movie.*|(?:English\s+)?(?:Subbed|Sub|Dubbed|Dub)(?:\s+at\s+.*)?|AnimePahe|HiAnime(?:\.to)?|123movies(?:\.[a-z]+)?|SolarMovie|FMovies|Crunchyroll|Funimation|YouTube\s*Music|YouTube|Pornhub(?:\.com)?|Facebook|Bilibili|TikTok|Vimeo|Instagram|Twitter|X|Reddit|Dailymotion).*$/i, '').trim();

    // Strip "online Free on <Domain>" or "at <Domain>" or "on <Domain>"
    clean = clean.replace(/\s+(?:online\s+free\s+(?:on|at)\s+[a-z0-9.-]+|free\s+online|watch\s+free\s+online|full\s+movie\s+online\s+free|watch\s+full\s+movie\s+online|watch\s+online\s+free|full\s+movie|(?:online\s+)?sub\/(?:dub|subbed)|(?:english\s+)?subbed\s+online|(?:english\s+)?(?:subbed|sub|dubbed|dub)\b)\b.*$/i, '').trim();
    clean = clean.replace(/\s+(?:at|on)\s+[a-z0-9.-]+\.[a-z]{2,}\b.*$/i, '').trim();

    // Strip trailing " - Watch", " - Free", " - Online" etc if left behind
    clean = clean.replace(/\s*[\-\|\•\—]\s*(?:watch|free|online|stream|download)$/i, '').trim();

    // Clean trailing delimiters
    clean = clean.replace(/[\s\-\|\:\•\—]+$/, '').trim();

    // Clean invalid filesystem characters
    clean = clean.replace(/[\\/:*?""<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return clean;
  }

  static isGenericTitle(t) {
    if (!t || typeof t !== 'string') return true;
    let clean = t.replace(/\.[a-z0-9]+$/i, '').trim();
    clean = clean.replace(/^\(\d+\)\s*/, '').replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
    if (!clean || clean.length < 2) return true;

    const genericExact = new Set([
      'instagram', 'tiktok', 'x', 'home _ x', 'home / x', 'youtube', 'youtube music', 'home', 'feed', 'subscriptions', 'library',
      'trending', 'watch later', 'video', 'media stream', 'download', 'downloads',
      'facebook', 'facebook_video', 'facebook_reel', 'facebook video', 'facebook reel', 'facebook reels',
      'notifications', 'notification', 'chats', 'messages', 'menu', 'shortcuts', 'your shortcuts',
      'contacts', 'explore', 'settings', 'search', 'news feed', 'newsfeed', 'stories',
      'pornhub', 'pornhub.com', 'video stream', 'stream', 'hls video stream', 'dash video stream',
      'reels', 'reel', 'player', 'embed', 'kwik', 'megaplay', 'streamwish', 'vidcloud', 'upcloud',
      'mp4upload', 'filemoon', 'doodstream', 'streamtape', 'mixdrop', 'luluvdo', 'voe',
      'watch', 'play', 'index', 'untitled', 'html5 player', 'video player'
    ]);
    if (genericExact.has(clean)) return true;

    if (clean.startsWith('reels - video') || clean.startsWith('reel - video') ||
        clean.startsWith('reels and short') || clean.startsWith('facebook video') ||
        clean.startsWith('facebook reel')) {
      return true;
    }

    if (/^file[\s_-]*\d+/i.test(clean)) return true;

    if (/^(?:kwik|megaplay|streamwish|vidcloud|upcloud|filemoon|doodstream|streamtape|mp4upload)\s*(?:[-_:]\s*)?(?:player|embed|stream|video)?$/i.test(clean)) return true;

    if (clean.includes('megaplay') || clean.includes('kwik') || clean.includes('streamwish') ||
        clean.includes('vidcloud') || clean.includes('upcloud') || clean.includes('filemoon') ||
        clean.includes('doodstream') || clean.includes('streamtape') || clean.includes('mp4upload')) {
      if (clean.startsWith('file') || clean.startsWith('player') || clean.startsWith('embed') || clean.startsWith('video') || clean.includes('server') || clean === 'megaplay' || clean === 'kwik') {
        return true;
      }
    }

    if (/^(?:player|embed|iframe|video)[\s_-]*\d*$/i.test(clean)) return true;

    return this.isOpaqueTokenOrHash(clean);
  }

  static normalizeVideoResolution(width, height) {
    let w = parseInt(width, 10) || 0;
    let h = parseInt(height, 10) || 0;
    if (w > 0 && h > 0 && w < h) {
      const tmp = w; w = h; h = tmp;
    }
    let normW = 0;
    if (w > 0) {
      if (w >= 3400) normW = 2160;
      else if (w >= 2300) normW = 1440;
      else if (w >= 1700) normW = 1080;
      else if (w >= 1100) normW = 720;
      else if (w >= 780) normW = 480;
      else if (w >= 540) normW = 360;
      else if (w >= 360) normW = 240;
      else normW = 144;
    }
    let normH = 0;
    if (h > 0) {
      if (h >= 1800) normH = 2160;
      else if (h >= 1300) normH = 1440;
      else if (h >= 760) normH = 1080;
      else if (h >= 500) normH = 720;
      else if (h >= 400) normH = 480;
      else if (h >= 260) normH = 360;
      else if (h >= 160) normH = 240;
      else normH = 144;
    }
    return Math.max(normW, normH);
  }

  static extractResolutionNumber(url, title = '') {
    if (!url && !title) return 0;
    const str = `${title || ''} ${url || ''}`.toLowerCase();

    // 1. Explicit dimensions (e.g. 1920x1080)
    const dimMatch = str.match(/(?:^|[^0-9a-z])(\d{3,4})x(\d{3,4})(?=[^0-9a-z]|$)/i);
    if (dimMatch) {
      const norm = this.normalizeVideoResolution(dimMatch[1], dimMatch[2]);
      if (norm > 0) return norm;
    }

    // 2. Explicit pixel heights with p suffix (e.g. 1080p, 720p)
    const pMatch = str.match(/(?:^|[^0-9a-z])(2160|1440|1080|720|540|480|360|240)p(?=[^0-9a-z]|$)/i);
    if (pMatch) {
      return this.normalizeVideoResolution(0, pMatch[1]);
    }

    // 3. Named parameters or tags: quality=1080, res=720
    const paramMatch = str.match(/[?&/_\-.](?:quality|res|resolution|height|h|q)[=_/\-]?(\d{3,4})\b/i);
    if (paramMatch) {
      const h = parseInt(paramMatch[1], 10);
      const norm = this.normalizeVideoResolution(0, h);
      if (norm > 0) return norm;
    }

    // 4. Isolated path/filename components: /1080/, /720/, _1080.
    const pathNumMatch = str.match(/[/\-_](2160|1440|1080|720|540|480|360|240)(?=[/\-_.]|$)/);
    if (pathNumMatch) {
      return this.normalizeVideoResolution(0, pathNumMatch[1]);
    }

    // 5. Look for standalone keywords
    if (/\b(?:4k|uhd)\b/i.test(str)) return 2160;
    if (/\b(?:2k|qhd)\b/i.test(str)) return 1440;
    if (/\b(?:1080|fhd|full[\s_.-]?hd)\b/i.test(str)) return 1080;
    if (/\b(?:720|hd)\b/i.test(str) && !str.includes('full hd') && !str.includes('full-hd') && !str.includes('full_hd')) return 720;
    if (/\b(?:480|sd)\b/i.test(str)) return 480;
    if (/\b360\b/i.test(str)) return 360;

    // 6. Common CDN format tier indices
    const tierMatch = str.match(/[/\-_](?:index|stream|video|track)?[-_]?f([1-5])(?:\.m3u8|\b)/i);
    if (tierMatch) {
      const tier = parseInt(tierMatch[1], 10);
      if (tier === 1) return 1080;
      if (tier === 2) return 720;
      if (tier === 3) return 480;
      if (tier === 4) return 360;
      if (tier === 5) return 240;
    }

    return 0;
  }

  static getResolutionLabel(height, ext = 'MP4', isAudio = false) {
    if (isAudio) return `Audio Stream (${ext.toUpperCase()})`;
    const normH = this.normalizeVideoResolution(0, height) || height;
    const outExt = ext.toUpperCase() === 'M3U8' ? 'MP4' : ext.toUpperCase();
    if (normH >= 2160) return `4K UHD (2160p) (${outExt})`;
    if (normH >= 1440) return `2K QHD (1440p) (${outExt})`;
    if (normH >= 1080) return `1080p Full HD (${outExt})`;
    if (normH >= 720) return `720p HD (${outExt})`;
    if (normH === 640) return `640p (${outExt})`;
    if (normH === 540) return `540p (${outExt})`;
    if (normH >= 480) return `480p SD (${outExt})`;
    if (normH >= 360) return `360p SD (${outExt})`;
    if (normH > 0) return `${normH}p (${outExt})`;
    return `Video Stream (${outExt})`;
  }

  static findActiveVideoElement() {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      if (videos.length === 0) return null;
      // 1. Currently playing video
      const playing = videos.find(v => !v.paused && !v.ended && v.currentTime > 0);
      if (playing) return playing;
      // 2. Video with recent download button interaction
      const recentlyActive = videos.find(v => v._smartdm_play_time && (Date.now() - v._smartdm_play_time < 30000));
      if (recentlyActive) return recentlyActive;
      // 3. Video visible in viewport
      const inViewport = videos.find(v => {
        const r = v.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0 && r.width > 80 && r.height > 60;
      });
      if (inViewport) return inViewport;
      // 4. Video with explicit non-blob source
      const withSrc = videos.find(v => (v.currentSrc || v.src) && !(v.currentSrc || v.src).startsWith('blob:'));
      if (withSrc) return withSrc;
      return videos[0];
    } catch(e) {
      return null;
    }
  }

  static extractSemanticPageTitle() {
    try {
      // 1. JSON-LD Structured Data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of jsonLdScripts) {
        try {
          const data = JSON.parse(s.textContent);
          const item = Array.isArray(data) ? data.find(d => d['@type'] === 'VideoObject') : data;
          if (item && item.name && typeof item.name === 'string') {
            const clean = this.sanitizeCleanTitle(item.name);
            if (!this.isGenericTitle(clean)) return clean;
          }
        } catch (e) {}
      }

      // 2. OpenGraph / Twitter metadata tags
      const metaTags = [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[property="og:video:title"]',
        'meta[name="title"]'
      ];
      for (const sel of metaTags) {
        const el = document.querySelector(sel);
        if (el && el.content) {
          const clean = this.sanitizeCleanTitle(el.content);
          if (!this.isGenericTitle(clean)) return clean;
        }
      }

      // 3. In-page semantic headings / social captions
      const headingSelectors = [
        '.theatre-info h1',
        '.theatre-info',
        '.anisc-detail .film-name',
        'h2.film-name',
        'h1.heading-name',
        '.detail-title',
        'h1.ytd-watch-metadata yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.title yt-formatted-string',
        'h1.title span',
        '[class*="episode-title"]',
        '[class*="anime-title"]',
        '[class*="film-name"]',
        '[class*="theatre-info"]',
        '[class*="player-title"]',
        '[id*="episode-title"]',
        '[id*="anime-title"]',
        '.inlineFree',
        'h1.title',
        '[data-ad-preview]',
        '.userContent'
      ];
      for (const sel of headingSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && t.length >= 3) {
            const clean = this.sanitizeCleanTitle(t);
            if (!this.isGenericTitle(clean)) {
              return clean.length > 90 ? clean.substring(0, 90).trim() : clean;
            }
          }
        }
      }

      // 4. Cleaned document.title / parent tab title
      if (window.top !== window.self && window._smartdm_cached_tab_title && !this.isGenericTitle(window._smartdm_cached_tab_title)) {
        return window._smartdm_cached_tab_title;
      }
      let rawTitle = document.title || '';
      if (window.top !== window.self) {
        try {
          if (window.top.document && window.top.document.title) {
            rawTitle = window.top.document.title;
          }
        } catch (e) {}
      }
      if (rawTitle) {
        const clean = this.sanitizeCleanTitle(rawTitle);
        if (!this.isGenericTitle(clean)) return clean;
      }
    } catch(e) {}
    return null;
  }

  static extractWatchPageTitle() {
    try {
      const selectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.title yt-formatted-string',
        'h1.title'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && !this.isGenericTitle(t)) return this.sanitizeCleanTitle(t);
        }
      }
    } catch (e) {}
    return this.extractSemanticPageTitle();
  }

  static derivePageTitleFilename(ext = 'mp4') {
    const semTitle = this.extractSemanticPageTitle();
    if (semTitle && !this.isGenericTitle(semTitle)) {
      const lowerExt = '.' + ext.toLowerCase();
      return semTitle.toLowerCase().endsWith(lowerExt) ? semTitle : `${semTitle}${lowerExt}`;
    }
    return 'video.' + ext.toLowerCase();
  }

  static sanitizeStreamUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      if (u.searchParams.has('bytestart')) u.searchParams.delete('bytestart');
      if (u.searchParams.has('byteend')) u.searchParams.delete('byteend');
      if (u.searchParams.has('range')) u.searchParams.delete('range');
      return u.href;
    } catch(e) {
      return rawUrl;
    }
  }
}
