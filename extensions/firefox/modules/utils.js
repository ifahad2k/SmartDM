// SmartDM Universal Utilities (Stateless pure functions)
// Encapsulates URL parsing, title sanitization, resolution calculation, and token detection

class SmartDmUtils {
  static getCanonicalUrl(rawUrl) {
    if (!rawUrl) return (typeof window !== 'undefined' && window.location?.href) || '';
    try {
      if (typeof rawUrl === 'string' && rawUrl.startsWith('blob:') && typeof window !== 'undefined' && window.location?.href) {
        rawUrl = window.location.href;
      }
      const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://www.bilibili.tv';
      const u = new URL(rawUrl, origin);
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        const v = u.searchParams.get('v');
        if (v) return 'https://www.youtube.com/watch?v=' + v;
        if (u.pathname.includes('/watch')) {
          const m = u.search.match(/[?&]v=([^&#]+)/);
          if (m) return 'https://www.youtube.com/watch?v=' + m[1];
        } else if (u.pathname.includes('/shorts/')) {
          const shortId = u.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
          return 'https://www.youtube.com/shorts/' + shortId;
        }
      } else if (u.hostname.includes('bilibili.com') || u.hostname.includes('bilibili.tv')) {
        if (u.pathname.includes('/video/')) {
          const bvId = u.pathname.split('/video/')[1].split('/')[0].split('?')[0];
          return `${u.origin}/video/${bvId}`;
        } else if (u.pathname.includes('/play/')) {
          return `${u.origin}${u.pathname}`;
        }
      }
      return u.href;
    } catch (e) {
      return (typeof window !== 'undefined' && window.location?.href) || '';
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
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || window.location.hostname.includes('instagram.com');
    const canonical = (videoUrl && typeof this.getCanonicalUrl === 'function') ? this.getCanonicalUrl(videoUrl) : videoUrl;
    if (isFb && mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_fb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return (canonical && !this.isGenericPageUrl(canonical)) ? `${canonical}_${mediaEl._smartdm_uid}` : mediaEl._smartdm_uid;
    }
    if (canonical && !this.isGenericPageUrl(canonical)) {
      return canonical;
    }
    if (mediaEl) {
      if (!mediaEl._smartdm_uid) {
        mediaEl._smartdm_uid = 'vid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      }
      return mediaEl._smartdm_uid;
    }
    return (canonical && !this.isGenericPageUrl(canonical)) ? canonical : (window.location.origin + window.location.pathname);
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

    // Strip trailing video/audio extension if present
    clean = clean.replace(/\.(?:mp4|mkv|webm|avi|mov|ts|m4v|mp3|m4a|aac|wav|flac)$/i, '').trim();

    // Strip leading action verbs: Watch, Streaming, Stream, Play, Download
    clean = clean.replace(/^(?:watch|streaming|stream|play|download)\s+/i, '').trim();
    // Only strip leading "Free" if followed by SEO verbs/words, preserving legitimate titles like "Free Guy"
    clean = clean.replace(/^free\s+(?:watch|streaming|stream|download|movie|movies|hd|online|full)\s+/i, '').trim();

    // Strip leading site brands (e.g. "67movies - ", "123movies | ", "ramoflix", "hydrahd", "goojara", "wmovies")
    clean = clean.replace(/^(?:67movies(?:\.[a-z]+)?|123movies(?:\.[a-z]+)?|solarmovie|fmovies|ramoflix(?:\.[a-z]+)?|hydrahd(?:\.[a-z]+)?|goojara(?:\.[a-z]+)?|wmovies(?:\.[a-z]+)?|miruro(?:\.[a-z]+)?|anime(?:\.|\s*)nexus|animesuge(?:\.[a-z]+)?|anizone(?:\.[a-z]+)?)\s*[\-\|\•\—:\s]\s*/i, '').trim();

    // Strip resolution brackets like [1080p], [720p], (1080p), [1080p HD], [Full HD]
    clean = clean.replace(/\[\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\]/gi, '').trim();
    clean = clean.replace(/\(\s*(?:2160p?|1440p?|1080p?|720p?|480p?|360p?|4k|uhd|full\s*hd|hd)\s*\)/gi, '').trim();

    // Strip site suffixes separated by :: (e.g. " :: AnimePahe")
    clean = clean.replace(/\s*::\s*.*$/, '').trim();

    // Strip site/brand suffixes separated by - or | or • or —
    clean = clean.replace(/\s*[\/\-\|\•\—]\s*(?:X|Twitter)(?:\s*[\/\-\|\•\—].*)?$/i, '').trim();
    clean = clean.replace(/\s*[\-\|\•\—]\s*(?:Watch\s+(?:Free\s+)?Online.*|Watch\s+on\s+.*|Watch\s+Online.*|Watch\s*.*|Full\s+Movie.*|Unlimited\s+Movies.*|Online\s+Free.*|RamoFlix.*|HydraHD.*|Goojara.*|WMovies.*|111Movies.*|Free\s+Online.*|(?:English\s+)?(?:Subbed|Sub|Dubbed|Dub)(?:\s+at\s+.*)?|AnimePahe(?:\.pw|\.org)?|Miruro(?:\.to|\.online)?|Anime(?:\.|\s*)Nexus|AnimeSuge(?:\.tv|\.to)?|AniZone(?:\.to)?|HiAnime(?:\.to)?|123movies(?:\.[a-z]+)?|67movies(?:\.[a-z]+)?|(?:Server\s+)?VidQueen(?:\s*\d*K?)?|(?:Server\s+)?VidSrc(?:\.[a-z]+)?|2embed(?:\.[a-z]+)?|AutoEmbed(?:\.[a-z]+)?|SuperEmbed(?:\.[a-z]+)?|StreamEmbed(?:\.[a-z]+)?|SolarMovie|FMovies|Crunchyroll|Funimation|YouTube\s*Music|YouTube|Pornhub(?:\.com)?|Facebook|Bilibili(?:\s*TV|\s*Global)?|TikTok|Vimeo|Instagram|Twitter|X|Reddit|Dailymotion).*$/i, '').trim();
    clean = clean.replace(/\s*[\-\|\•\—_]\s*(?:哔哩哔哩|_?bilibili(?:\.tv)?).*$/i, '').trim();
    clean = clean.replace(/_哔哩哔哩(?:_bilibili)?$/i, '').replace(/[_\-\|\•\—]\s*(?:哔哩哔哩|bilibili(?:\.tv)?)$/i, '').trim();

    // Strip Twitter / X author prefixes (e.g. "User on X: ", "User (@handle) on X: \"...")
    clean = clean.replace(/^.*?\s+on\s+(?:X|Twitter):\s*["“]?/i, '').trim();
    clean = clean.replace(/^["“]|["”]$/g, '').trim();

    // Strip "online Free on <Domain>" or "at <Domain>" or "on <Domain>" and trailing SEO junk
    clean = clean.replace(/\s+(?:online\s+free\s+watch\s+full\s+(?:now\s+)?hd|online\s+free\s+watch\s+full|watch\s+full\s+now\s+hd|unlimited\s+movies\s*(?:&|and)\s*tv\s*shows\s*online|watch\s+full\s+movie\s+hd|watch\s+free\s+online\s+hd|online\s+free\s+(?:on|at)\s+[a-z0-9.-]+|free\s+online|watch\s+free\s+online|full\s+movie\s+online\s+free|watch\s+full\s+movie\s+online|watch\s+online\s+free|full\s+movie|(?:online\s+)?sub\/(?:dub|subbed)|(?:english\s+)?subbed\s+online|(?:english\s+)?(?:subbed|sub|dubbed|dub)\b)\b.*$/i, '').trim();
    clean = clean.replace(/\s+(?:at|on)\s+[a-z0-9.-]+\.[a-z]{2,}\b.*$/i, '').trim();
    clean = clean.replace(/\s+(?:on|at)\s+(?:67movies|ramoflix|hydrahd|goojara|wmovies|vidqueen|vidsrc|2embed|autoembed|superembed|streamembed|miruro|animesuge|animepahe|anizone|nexus)\b.*$/i, '').trim();

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
      'instagram', 'instagram video', 'instagram reel', 'instagram reels', 'instagram_video', 'instagram_reel',
      'tiktok', 'x', 'home _ x', 'home / x', 'notifications / x', 'explore / x', 'bookmarks / x', 'lists / x',
      'twitter', 'twitter video', 'twitter_video', 'x video', 'x_video',
      'youtube', 'youtube music', 'home', 'feed', 'subscriptions', 'library',
      'trending', 'watch later', 'video', 'media stream', 'download', 'downloads',
      'bilibili', 'bilibili tv', 'bilibili global', '哔哩哔哩', '哔哩哔哩动画', 'bilibili 哔哩哔哩',
      'facebook', 'facebook_video', 'facebook_reel', 'facebook video', 'facebook reel', 'facebook reels',
      'notifications', 'notification', 'chats', 'messages', 'menu', 'shortcuts', 'your shortcuts',
      'contacts', 'explore', 'settings', 'search', 'news feed', 'newsfeed', 'stories',
      'pornhub', 'pornhub.com', 'video stream', 'stream', 'hls video stream', 'dash video stream',
      'reels', 'reel', 'player', 'embed', 'kwik', 'megaplay', 'streamwish', 'vidcloud', 'upcloud',
      'mp4upload', 'filemoon', 'doodstream', 'streamtape', 'mixdrop', 'luluvdo', 'voe',
      'vidqueen', 'vidsrc', '2embed', 'autoembed', 'superembed', 'streamembed', 'rabbitstream', 'megacloud',
      'watch', 'play', 'index', 'untitled', 'html5 player', 'video player', 'just now', 'now',
      'strm', 'master', 'playlist', 'manifest', 'chunklist', 'media', 'main', 'track', 'segment', 'segment-0',
      'video-0', 'stream-0', 'stream-1', 'init', 'audio', 'audio-0'
    ]);
    if (genericExact.has(clean)) return true;
    if (/^(?:\d{3,4}p|[248]k)\s*(?:(?:full|ultra|quad)\s*)?(?:hd|sd|uhd)?\s*(?:\((?:mp4|webm|mkv)\))?$/.test(clean) ||
        /^playing quality\s*(?:\((?:mp4|webm|mkv)\))?$/.test(clean)) return true;

    const noBullets = clean.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
    if (/^\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i.test(noBullets)) return true;
    if (/^[a-z0-9_.]+\s*[•·\s\-–—|]\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i.test(clean)) return true;
    if (/^\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?\s*[-–—|]\s*instagram\s*video$/i.test(clean)) return true;

    if (clean.startsWith('reels - video') || clean.startsWith('reel - video') ||
        clean.startsWith('reels and short') || clean.startsWith('facebook video') ||
        clean.startsWith('facebook reel') || clean.startsWith('instagram video') ||
        clean.startsWith('instagram reel')) {
      return true;
    }

    if (/^file[\s_-]*\d+/i.test(clean)) return true;

    if (/^(?:kwik|megaplay|streamwish|vidcloud|upcloud|filemoon|doodstream|streamtape|mp4upload|vidqueen|vidsrc|2embed|autoembed|superembed|streamembed)\s*(?:[-_:]\s*)?(?:player|embed|stream|video)?$/i.test(clean)) return true;
    if (/^(?:vidqueen|vidsrc|2embed|autoembed|superembed|streamembed|vidcloud|server)\s*(?:4k|\d+p)?$/i.test(clean)) return true;

    if (clean.includes('megaplay') || clean.includes('kwik') || clean.includes('streamwish') ||
        clean.includes('vidcloud') || clean.includes('upcloud') || clean.includes('filemoon') ||
        clean.includes('doodstream') || clean.includes('streamtape') || clean.includes('mp4upload') ||
        clean.includes('vidqueen') || clean.includes('vidsrc')) {
      if (clean.startsWith('file') || clean.startsWith('player') || clean.startsWith('embed') || clean.startsWith('video') || clean.startsWith('server') || /^(?:server|player|embed)\b/i.test(clean) || clean === 'megaplay' || clean === 'kwik' || clean === 'vidqueen') {
        return true;
      }
    }

    if (/^(?:strm|stream|video|master|playlist|manifest|index|chunklist|seg|fragment|chunk|track|audio|play|player|embed|iframe)[_\-\d]*$/i.test(clean)) return true;

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

    // Bilibili quality codes and stream IDs (e.g. 30080 -> 1080p, 30064 -> 720p, 30032 -> 480p, 30016 -> 360p)
    if (/(?:bilibili|bilivideo|upos|akamaized|byteoversea|\bqn\b)/i.test(str) || /300(?:01|06|16|32|64|74|80)|301(?:12|16|20|25|26|27|44)/.test(str)) {
      if (/30127\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?127\b/.test(str)) return 4320;
      if (/(?:30120|30125|30126)\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?(?:120|125|126)\b/.test(str)) return 2160;
      if (/(?:30116|30112|30080)\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?(?:80|112|116)\b/.test(str)) return 1080;
      if (/(?:30064|30074)\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?(?:64|74)\b/.test(str)) return 720;
      if (/30032\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?32\b/.test(str)) return 480;
      if (/30016\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?16\b/.test(str)) return 360;
      if (/30006\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?6\b/.test(str)) return 240;
      if (/(?:30001|30144)\b|(?:^|[?&_/\s\-:])(?:qn|quality)[:=]?(?:1|144)\b/.test(str)) return 144;

      const mStreamId = str.match(/(?:video|stream|[_\-\/])(?:300|301)?(127|126|125|120|116|112|80|74|64|32|16|6|1|144)(?:[_\-\.]|$)/);
      if (mStreamId) {
        const idNum = parseInt(mStreamId[1], 10);
        if (idNum === 144 || idNum === 1) return 144;
        if (idNum === 127) return 4320;
        if (idNum >= 120) return 2160;
        if (idNum >= 80) return 1080;
        if (idNum >= 64) return 720;
        if (idNum === 32) return 480;
        if (idNum === 16) return 360;
        if (idNum === 6) return 240;
      }
    }

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
      if (document.querySelectorAll) {
        try {
          const allEls = document.querySelectorAll('*');
          for (let i = 0; i < allEls.length; i++) {
            const root = allEls[i].shadowRoot;
            if (root && root.querySelectorAll) {
              const shadowVideos = root.querySelectorAll('video');
              for (let j = 0; j < shadowVideos.length; j++) {
                videos.push(shadowVideos[j]);
              }
            }
          }
        } catch(_) {}
      }
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

  static extractAnimeTitle(doc = (typeof document !== 'undefined' ? document : null), loc = (typeof window !== 'undefined' ? window.location : null)) {
    if (!doc && !loc) return null;
    try {
      const hostname = (loc?.hostname || '').toLowerCase();
      const pathname = (loc?.pathname || '').toLowerCase();
      const search = loc?.search || '';
      const isAnimeDomain = /(?:anime|aniwave|9anime|hianime|zoro|gogoanime|animesaturn|animixplay|kissanime|kickassanime|allanime|aniwatch|kaido|miruro|anizone|animepahe|animesuge|nexus)/i.test(hostname);
      const isWatchPath = /(?:\/watch\/|\/anime\/|\/play\/|\/episode\/|\/stream\/)/i.test(pathname);

      if (!isAnimeDomain && !isWatchPath) {
        const hasAnimeEl = doc?.querySelector?.('[class*="anime-title"], [class*="film-name"], .theatre-info, [class*="episode-title"], #episodes, .episodes-list');
        if (!hasAnimeEl) return null;
      }

      // 1. Extract Anime Series Main Title
      let seriesTitle = '';
      const seriesSelectors = [
        '.anisc-detail .film-name',
        'h1.film-name',
        'h2.film-name',
        '.film-name a',
        '.film-name',
        'h1.anime-title',
        '.anime-title',
        '[class*="anime-title"]',
        '[class*="anime_title"]',
        '[id*="anime-title"]',
        '.theatre-info h1 a',
        '.theatre-info h1',
        '.theatre-info',
        'h1.heading-name',
        '.detail-title',
        'h1.title',
        'h1'
      ];

      for (const sel of seriesSelectors) {
        const el = doc?.querySelector?.(sel);
        if (el) {
          const t = (el.getAttribute?.('title') || el.textContent || '').trim();
          if (t && t.length >= 2) {
            const cleaned = this.sanitizeCleanTitle(t);
            if (cleaned && !this.isGenericTitle(cleaned)) {
              seriesTitle = cleaned;
              break;
            }
          }
        }
      }

      // Meta tags fallback for series title
      if (!seriesTitle) {
        const ogTitle = doc?.querySelector?.('meta[property="og:title"], meta[name="twitter:title"]');
        if (ogTitle && ogTitle.content) {
          const cleaned = this.sanitizeCleanTitle(ogTitle.content);
          if (cleaned && !this.isGenericTitle(cleaned)) {
            seriesTitle = cleaned;
          }
        }
      }

      // URL slug fallback for series title (e.g. /watch/xyz/kuroneko-to-majo-no-kyoushitsu or /anime/kuroneko-to-majo-no-kyoushitsu)
      if (!seriesTitle && pathname) {
        const slugMatch = pathname.match(/(?:\/watch\/[^/]+\/|\/anime\/|\/play\/|\/series\/)([a-zA-Z0-9_\-]+)/i) ||
                          pathname.match(/\/([a-zA-Z0-9_\-]+)\/(?:ep-\d+|\d+)(?:[/?#]|$)/i);
        if (slugMatch && slugMatch[1] && slugMatch[1].length >= 3 && !/^(?:watch|anime|play|video|stream)$/i.test(slugMatch[1])) {
          const words = slugMatch[1].replace(/[-_]+/g, ' ').trim();
          if (words && !this.isGenericTitle(words)) {
            seriesTitle = words.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }

      // 2. Extract Episode Title / Number
      let epNumber = '';
      let epSubTitle = '';

      // Check query param e.g. ?ep=24
      const urlParams = loc ? new URLSearchParams(search) : null;
      const qEp = urlParams ? (urlParams.get('ep') || urlParams.get('episode')) : null;
      if (qEp && /^\d+$/.test(qEp)) {
        epNumber = qEp;
      }

      // Check path e.g. /ep-1 or /episode-1 or /1
      if (!epNumber && pathname) {
        const pEpMatch = pathname.match(/(?:ep|episode)-(\d+)/i) || pathname.match(/\/(\d+)(?:\/?$|\?)/);
        if (pEpMatch) {
          epNumber = pEpMatch[1];
        }
      }

      // Check active episode element in page DOM
      const epSelectors = [
        '.ep-item.active',
        '.episode-item.active',
        '[class*="episode"][class*="active"]',
        '[class*="ep"][class*="active"]',
        '.theatre-info h2',
        '[class*="episode-title"]',
        '[class*="ep-title"]',
        '[id*="episode-title"]',
        '[id*="ep-title"]',
        '#episodeMenu',
        'button[id*="episode"].active'
      ];

      for (const sel of epSelectors) {
        const el = doc?.querySelector?.(sel);
        if (el) {
          const rawText = (el.getAttribute?.('title') || el.textContent || '').trim();
          if (rawText && rawText.length >= 1) {
            const numNameMatch = rawText.match(/^(?:ep(?:isode)?\.?\s*)?(\d+)\s*[\.:\-–—]\s*(.+)$/i);
            if (numNameMatch) {
              if (!epNumber) epNumber = numNameMatch[1];
              epSubTitle = numNameMatch[2].trim();
              break;
            }
            const justNumMatch = rawText.match(/^(?:ep(?:isode)?\.?\s*)?(\d+)$/i);
            if (justNumMatch) {
              if (!epNumber) epNumber = justNumMatch[1];
              break;
            }
            if (!epSubTitle && !/^(?:sub|dub|hd)$/i.test(rawText)) {
              epSubTitle = rawText;
            }
          }
        }
      }

      if (epSubTitle) {
        epSubTitle = this.sanitizeCleanTitle(epSubTitle);
        if (this.isGenericTitle(epSubTitle) || /^(?:ep|episode)\s*\d+$/i.test(epSubTitle)) {
          epSubTitle = '';
        }
      }

      if (!seriesTitle) return null;

      if (/\b(?:ep|episode)\s*\d+\b/i.test(seriesTitle)) {
        if (epSubTitle && !seriesTitle.toLowerCase().includes(epSubTitle.toLowerCase())) {
          return `${seriesTitle} - ${epSubTitle}`;
        }
        return seriesTitle;
      }

      let epFormatted = '';
      if (epNumber) {
        epFormatted = `EP ${epNumber}`;
      }

      if (epFormatted && epSubTitle) {
        return `${seriesTitle} - ${epFormatted} - ${epSubTitle}`;
      } else if (epFormatted) {
        return `${seriesTitle} - ${epFormatted}`;
      } else if (epSubTitle) {
        return `${seriesTitle} - ${epSubTitle}`;
      }

      return seriesTitle;
    } catch (_) {
      return null;
    }
  }

  static extractSemanticPageTitle() {
    try {
      // 0. Dedicated Anime Title & Episode Extraction
      const animeTitle = this.extractAnimeTitle();
      if (animeTitle && !this.isGenericTitle(animeTitle)) {
        return animeTitle;
      }

      const tryAppendYear = (cleanTitle) => {
        if (!cleanTitle || /\b(?:19|20)\d{2}\b/.test(cleanTitle)) return cleanTitle;
        try {
          if (typeof document !== 'undefined') {
            const yearEl = document.querySelector('.year, .release-year, [class*="year"], .meta-year, .film-year, [itemprop="dateCreated"], [itemprop="copyrightYear"], a[href*="/year/"], a[href*="/release/"], .jt-info, .movie-info, .meta span, .film-info, span.date, span.year');
            if (yearEl) {
              const yMatch = (yearEl.textContent || '').match(/\b(19\d\d|20\d\d)\b/);
              if (yMatch) return `${cleanTitle} (${yMatch[1]})`;
            }
          }
          if (typeof window !== 'undefined' && window.location && window.location.pathname) {
            const urlMatch = window.location.pathname.match(/\b(19\d\d|20\d\d)\b/);
            if (urlMatch) return `${cleanTitle} (${urlMatch[1]})`;
          }
        } catch (_) {}
        return cleanTitle;
      };

      // 1. JSON-LD Structured Data
      const jsonLdScripts = typeof document !== 'undefined' ? document.querySelectorAll('script[type="application/ld+json"]') : [];
      for (const s of jsonLdScripts) {
        try {
          const data = JSON.parse(s.textContent);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item && (item['@type'] === 'VideoObject' || item['@type'] === 'Movie' || item['@type'] === 'TVEpisode' || item['@type'] === 'TVSeries')) {
              let name = item.name;
              if (name && typeof name === 'string') {
                const year = item.datePublished || item.dateCreated || item.releaseYear;
                let yearStr = '';
                if (year) {
                  const yMatch = String(year).match(/\b(19\d\d|20\d\d)\b/);
                  if (yMatch) yearStr = ` (${yMatch[1]})`;
                }
                let clean = this.sanitizeCleanTitle(name);
                if (yearStr && !clean.includes('(') && !clean.includes(yearStr.trim())) {
                  clean += yearStr;
                }
                clean = tryAppendYear(clean);
                if (!this.isGenericTitle(clean)) return clean;
              }
            }
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
        const el = typeof document !== 'undefined' ? document.querySelector(sel) : null;
        if (el && el.content) {
          const clean = tryAppendYear(this.sanitizeCleanTitle(el.content));
          if (!this.isGenericTitle(clean)) return clean;
        }
      }

      // 3. In-page semantic headings / social captions
      const headingSelectors = [
        'h1.media-info__title',
        '.media-info__title',
        'h1.bstar-meta__title',
        '.bstar-meta__title',
        'h1.video-title',
        '.video-title',
        '.video-info-detail-title',
        '.bpx-player-top-title',
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
        'h1',
        '[data-ad-preview]',
        '.userContent'
      ];
      for (const sel of headingSelectors) {
        const el = typeof document !== 'undefined' ? document.querySelector(sel) : null;
        if (el) {
          const t = (el.textContent || '').trim();
          if (t && t.length >= 3) {
            let clean = tryAppendYear(this.sanitizeCleanTitle(t));
            if (!this.isGenericTitle(clean)) {
              return clean.length > 90 ? clean.substring(0, 90).trim() : clean;
            }
          }
        }
      }

      // 4. Cleaned document.title / parent tab title
      if (typeof window !== 'undefined' && window.top !== window.self && window._smartdm_cached_tab_title && !this.isGenericTitle(window._smartdm_cached_tab_title)) {
        return tryAppendYear(window._smartdm_cached_tab_title);
      }
      let rawTitle = typeof document !== 'undefined' ? (document.title || '') : '';
      if (typeof window !== 'undefined' && window.top !== window.self) {
        try {
          if (window.top.document && window.top.document.title) {
            rawTitle = window.top.document.title;
          }
        } catch (e) {}
      }
      if (rawTitle) {
        const clean = tryAppendYear(this.sanitizeCleanTitle(rawTitle));
        if (!this.isGenericTitle(clean)) return clean;
      }
    } catch(e) {}
    return null;
  }

  static extractWatchPageTitle() {
    try {
      const animeTitle = this.extractAnimeTitle();
      if (animeTitle && !this.isGenericTitle(animeTitle)) {
        return animeTitle;
      }

      if (typeof window !== 'undefined' && window.location?.hostname?.includes('music.youtube.com')) {
        if (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractYouTubeMusicTrackMetadata) {
          const meta = VisualMountDetector.extractYouTubeMusicTrackMetadata();
          if (meta && meta.fullTitle && !this.isGenericTitle(meta.fullTitle)) {
            return this.sanitizeCleanTitle(meta.fullTitle);
          }
        }
      }
      if (typeof window !== 'undefined' && (window.location?.hostname?.includes('bilibili.tv') || window.location?.hostname?.includes('bilibili.com'))) {
        const biliSelectors = [
          'h1.media-info__title',
          '.media-info__title',
          '[class*="media-info__title"]',
          'h1.bstar-meta__title',
          '.bstar-meta__title',
          '[class*="bstar-meta__title"]',
          'h1.video-title',
          '.video-title',
          '[class*="video-title"]',
          '.video-info-detail-title',
          '.bpx-player-top-title',
          '[class*="bpx-player-top-title"]',
          'h1'
        ];
        for (const sel of biliSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const t = (el.getAttribute?.('title') || el.textContent || '').trim();
            if (t && !this.isGenericTitle(t)) {
              const clean = this.sanitizeCleanTitle(t);
              if (clean && !this.isGenericTitle(clean)) return clean;
            }
          }
        }
      }
      const selectors = [
        'ytmusic-player-bar .title',
        'ytmusic-player-bar [class*="title"]',
        'ytmusic-header-renderer .title',
        'ytmusic-responsive-header-renderer .title',
        'h1.ytd-watch-metadata yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.title yt-formatted-string',
        'h1.title'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.getAttribute?.('title') || el.textContent || '').trim();
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
    if (!rawUrl) return rawUrl;
    // Remove only transport byte hints, preserving every other signed byte.
    const match = String(rawUrl).match(/^([^?#]*)(?:\?([^#]*))?(#.*)?$/);
    if (!match || match[2] === undefined) return rawUrl;
    const parts = match[2].split('&');
    const kept = parts.filter(p => !/^(?:(?:bytestart|byteend)=\d+|range=\d+(?:-\d+)?)$/i.test(p));
    if (kept.length === parts.length) return rawUrl;
    return match[1] + (kept.length ? '?' + kept.join('&') : '') + (match[3] || '');
  }

  static inheritQueryTokens(targetUrl, sourceUrl) {
    if (!targetUrl || !sourceUrl || !sourceUrl.includes('?')) return targetUrl;
    try {
      const targetParsed = new URL(targetUrl);
      const sourceParsed = new URL(sourceUrl);
      if (!targetParsed.search) {
        targetParsed.search = sourceParsed.search;
        return targetParsed.href;
      }
      for (const [k, v] of sourceParsed.searchParams.entries()) {
        if (!targetParsed.searchParams.has(k)) {
          targetParsed.searchParams.set(k, v);
        }
      }
      return targetParsed.href;
    } catch (e) {
      return targetUrl;
    }
  }
}
