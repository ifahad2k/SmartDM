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

function sanitizeStreamUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    // Remove only transport byte hints, preserving every other signed byte.
    const match = String(rawUrl).match(/^([^?#]*)(?:\?([^#]*))?(#.*)?$/);
    if (!match || match[2] === undefined) return rawUrl;
    const parts = match[2].split('&');
    const kept = parts.filter(p => !/^(?:(?:bytestart|byteend)=\d+|range=\d+(?:-\d+)?)$/i.test(p));
    if (kept.length === parts.length) return rawUrl;
    return match[1] + (kept.length ? '?' + kept.join('&') : '') + (match[3] || '');
}

function parseFacebookEfg(rawUrl) {
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

function normalizeVideoResolution(width, height) {
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

function extractResolutionNumber(url, title = '') {
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

  // 1. Explicit dimensions (e.g. 1920x1080, 1920x800, 1280x720, 1280x534, 3840x2160, 2560x1440, 854x480, 640x360, 640x266)
  const dimMatch = str.match(/(?:^|[^0-9a-z])(\d{3,4})x(\d{3,4})(?=[^0-9a-z]|$)/i);
  if (dimMatch) {
    const norm = normalizeVideoResolution(dimMatch[1], dimMatch[2]);
    if (norm > 0) return norm;
  }

  // 2. Explicit pixel heights with p suffix (e.g. 2160p, 1440p, 1080p, 720p, 540p, 480p, 360p, 240p)
  const pMatch = str.match(/(?:^|[^0-9a-z])(2160|1440|1080|720|540|480|360|240)p(?=[^0-9a-z]|$)/i);
  if (pMatch) {
    return normalizeVideoResolution(0, pMatch[1]);
  }

  // 3. Named parameters or tags: quality=1080, res=720, height=1080, q=720, label=1080
  const paramMatch = str.match(/[?&/_\-.](?:quality|res|resolution|height|h|q)[=_/\-]?(\d{3,4})\b/i);
  if (paramMatch) {
    const h = parseInt(paramMatch[1], 10);
    const norm = normalizeVideoResolution(0, h);
    if (norm > 0) return norm;
  }

  // 4. Isolated path/filename components: /1080/, /720/, _1080., -1080., .1080.
  const pathNumMatch = str.match(/[/\-_](2160|1440|1080|720|540|480|360|240)(?=[/\-_.]|$)/);
  if (pathNumMatch) {
    return normalizeVideoResolution(0, pathNumMatch[1]);
  }

  // 5. Look for standalone resolution words
  if (/\b(?:4k|uhd)\b/i.test(str)) return 2160;
  if (/\b(?:2k|qhd)\b/i.test(str)) return 1440;
  if (/\b(?:1080|fhd|full[\s_.-]?hd)\b/i.test(str)) return 1080;
  if (/\b(?:720|hd)\b/i.test(str) && !str.includes('full hd') && !str.includes('full-hd') && !str.includes('full_hd')) return 720;
  if (/\b(?:480|sd)\b/i.test(str)) return 480;
  if (/\b360\b/i.test(str)) return 360;

  // 6. Common CDN format tier indices (e.g. index-f1.m3u8, stream-f2, video_f1, /f1.m3u8, etc.)
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

function getResolutionLabel(height, ext = 'MP4', isAudio = false) {
  if (isAudio) return `Audio Stream (${ext.toUpperCase()})`;
  const normH = normalizeVideoResolution(0, height) || height;
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

function sanitizeCleanTitle(str) {
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
  clean = clean.replace(/\s*[\-\|\•\—]\s*(?:Watch\s+(?:Free\s+)?Online.*|Watch\s+on\s+.*|Watch\s+Online.*|Watch\s*.*|Full\s+Movie.*|(?:English\s+)?(?:Subbed|Sub|Dubbed|Dub)(?:\s+at\s+.*)?|AnimePahe|HiAnime(?:\.to)?|123movies(?:\.[a-z]+)?|67movies(?:\.[a-z]+)?|(?:Server\s+)?VidQueen(?:\s*\d*K?)?|(?:Server\s+)?VidSrc(?:\.[a-z]+)?|2embed(?:\.[a-z]+)?|AutoEmbed(?:\.[a-z]+)?|SuperEmbed(?:\.[a-z]+)?|StreamEmbed(?:\.[a-z]+)?|SolarMovie|FMovies|Crunchyroll|Funimation|YouTube\s*Music|YouTube|Pornhub(?:\.com)?|Facebook|Bilibili(?:\s*TV|\s*Global)?|TikTok|Vimeo|Instagram|Twitter|X|Reddit|Dailymotion).*$/i, '').trim();
  clean = clean.replace(/\s*[\-\|\•\—_]\s*(?:哔哩哔哩|_?bilibili(?:\.tv)?).*$/i, '').trim();
  clean = clean.replace(/_哔哩哔哩(?:_bilibili)?$/i, '').replace(/[_\-\|\•\—]\s*(?:哔哩哔哩|bilibili(?:\.tv)?)$/i, '').trim();

  // Strip "online Free on <Domain>" or "at <Domain>" or "on <Domain>"
  clean = clean.replace(/\s+(?:online\s+free\s+(?:on|at)\s+[a-z0-9.-]+|free\s+online|watch\s+free\s+online|full\s+movie\s+online\s+free|watch\s+full\s+movie\s+online|watch\s+online\s+free|full\s+movie|(?:online\s+)?sub\/(?:dub|subbed)|(?:english\s+)?subbed\s+online|(?:english\s+)?(?:subbed|sub|dubbed|dub)\b)\b.*$/i, '').trim();
  clean = clean.replace(/\s+(?:at|on)\s+[a-z0-9.-]+\.[a-z]{2,}\b.*$/i, '').trim();
  clean = clean.replace(/\s+(?:on|at)\s+(?:67movies|vidqueen|vidsrc|2embed|autoembed|superembed|streamembed)\b.*$/i, '').trim();

  // Strip trailing " - Watch", " - Free", " - Online" etc if left behind
  clean = clean.replace(/\s*[\-\|\•\—]\s*(?:watch|free|online|stream|download)$/i, '').trim();

  // Clean trailing delimiters
  clean = clean.replace(/[\s\-\|\:\•\—]+$/, '').trim();

  // Clean invalid filesystem characters
  clean = clean.replace(/[\\/:*?""<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return clean;
}

function isGenericTitle(t) {
  if (!t || typeof t !== 'string') return true;
  let clean = t.trim();
  clean = clean.replace(/\.[a-z0-9]+$/i, '').trim();
  clean = clean.replace(/^\(\d+\)\s*/, '').replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
  if (!clean || clean.length < 2) return true;

  const genericExact = new Set([
    'instagram', 'instagram video', 'instagram reel', 'instagram reels', 'instagram_video', 'instagram_reel',
    'tiktok', 'x', 'home _ x', 'home / x',
    'youtube', 'youtube music', 'home', 'feed', 'subscriptions', 'library',
    'trending', 'watch later', 'video', 'media stream', 'download', 'downloads',
    'bilibili', 'bilibili tv', 'bilibili global', '哔哩哔哩',
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

  // File 12345 or File 12345 - MegaPlay or File_12345 or any file followed by digits
  if (/^file[\s_-]*\d+/i.test(clean)) return true;

  // Generic player embed titles like "MegaPlay - Player", "Kwik Player", etc.
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

  // Single word player tokens
  if (/^(?:strm|stream|video|master|playlist|manifest|index|chunklist|seg|fragment|chunk|track|audio|play|player|embed|iframe)[_\-\d]*$/i.test(clean)) return true;

  return isOpaqueTokenOrHash(clean);
}

// Read only bounded player data. Never execute page JavaScript or treat an
// embedded player document as a video file.
