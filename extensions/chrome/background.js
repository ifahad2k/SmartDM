const NATIVE_HOST_NAME = 'io.smartdm.host';
const detectedMediaMap = new Map(); // tabId -> Array<{ url, type, contentType, contentLength }>
const tabUrlMap = new Map(); // tabId -> url
const tabTitleMap = new Map(); // tabId -> title
const probedM3u8Urls = new Set(); // url -> boolean (prevents duplicate manifest probing loops)
function shouldProbeM3u8(url) {
  if (!url || probedM3u8Urls.has(url)) return false;
  probedM3u8Urls.add(url);
  if (probedM3u8Urls.size > 200) {
    const first = probedM3u8Urls.keys().next().value;
    probedM3u8Urls.delete(first);
  }
  return true;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'download-link',
    title: 'Download with SmartDM',
    contexts: ['link', 'page', 'video', 'audio', 'image']
  });
});

let lastActiveTabId = null;
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo && activeInfo.tabId) {
      lastActiveTabId = activeInfo.tabId;
    }
  });
}

if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab && tab.url) {
      const oldUrl = tabUrlMap.get(tabId);
      tabUrlMap.set(tabId, tab.url);
      if (oldUrl && tab.url !== oldUrl) {
        try {
          const oldU = new URL(oldUrl);
          const newU = new URL(tab.url);
          if (oldU.origin !== newU.origin || (oldU.pathname !== newU.pathname && !tab.url.includes('facebook.com') && !oldUrl.includes('facebook.com'))) {
            detectedMediaMap.delete(tabId);
          }
        } catch(e) {}
      }
    }
    if (tab && tab.title) {
      tabTitleMap.set(tabId, tab.title);
    }
  });
}

// Clean up tab media and tracked URL on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  detectedMediaMap.delete(tabId);
  tabUrlMap.delete(tabId);
  tabTitleMap.delete(tabId);
  if (broadcastDebounceTimers.has(tabId)) {
    clearTimeout(broadcastDebounceTimers.get(tabId));
    broadcastDebounceTimers.delete(tabId);
  }
});

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
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    if (u.searchParams.has('bytestart')) u.searchParams.delete('bytestart');
    if (u.searchParams.has('byteend')) u.searchParams.delete('byteend');
    if (u.searchParams.has('range')) {
      u.searchParams.delete('range');
    }

    return u.href;
  } catch (e) {
    return rawUrl;
  }
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

const broadcastDebounceTimers = new Map();
function broadcastNewMedia(tabId, mediaList) {
  if (!tabId || tabId <= 0) return;
  if (broadcastDebounceTimers.has(tabId)) {
    clearTimeout(broadcastDebounceTimers.get(tabId));
  }
  broadcastDebounceTimers.set(tabId, setTimeout(() => {
    broadcastDebounceTimers.delete(tabId);
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'SMARTDM_MEDIA_DETECTED',
        tabId: tabId,
        mediaList: mediaList || []
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (e) {}
  }, 250));
}

async function fetchM3u8Text(url, referrer, initiator = null) {
  if (!url) return null;
  // Strategy 1: try with iframe initiator (e.g. https://megaplay.xyz/) which matches CDN anti-hotlink check
  if (initiator && initiator.startsWith('http')) {
    try {
      const initRef = initiator.endsWith('/') ? initiator : initiator + '/';
      const res = await fetch(url, { referrer: initRef });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('#EXTM3U')) return text;
      }
    } catch(e) {}
  }

  // Strategy 2: try with tab referrer
  if (referrer && referrer.startsWith('http') && !referrer.startsWith('chrome') && !referrer.startsWith('moz')) {
    try {
      const res = await fetch(url, { referrer: referrer });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('#EXTM3U')) return text;
      }
    } catch (e) {}
  }

  // Strategy 3: try with no-referrer
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes('#EXTM3U')) return text;
    }
  } catch (e) {}

  // Strategy 4: plain default fetch (extension background host_permissions grants cross-origin access)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes('#EXTM3U')) return text;
    }
  } catch (e) {}

  return null;
}

function inheritQueryTokens(targetUrl, sourceUrl) {
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

// Universal stream directory token cache: maps host+path directory to latest security tokens / query string
const streamTokenCache = new Map();

function getStreamDirectoryKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = new URL(rawUrl);
    const lastSlash = u.pathname.lastIndexOf('/');
    const dirPath = lastSlash >= 0 ? u.pathname.substring(0, lastSlash + 1) : u.pathname;
    return `${u.hostname}${dirPath}`.toLowerCase();
  } catch(e) {
    return '';
  }
}

function parseM3u8Formats(m3u8Text, baseUrl) {
  const lines = m3u8Text.split('\n');
  const formats = [];
  let currentInfo = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      currentInfo = {};
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
      if (resMatch) currentInfo.resolution = resMatch[1];
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      if (bwMatch) currentInfo.bandwidth = parseInt(bwMatch[1], 10);
      const nameMatch = line.match(/NAME="([^"]+)"/i);
      if (nameMatch) currentInfo.name = nameMatch[1];
    } else if (line && !line.startsWith('#') && currentInfo) {
      let streamUrl = line;
      if (!streamUrl.startsWith('http')) {
        try {
          const resolved = new URL(streamUrl, baseUrl);
          streamUrl = resolved.href;
        } catch (e) {}
      }
      streamUrl = inheritQueryTokens(streamUrl, baseUrl);
      
      let height = 0;
      if (currentInfo.resolution) {
        const parts = currentInfo.resolution.split('x');
        if (parts.length === 2) height = normalizeVideoResolution(parts[0], parts[1]);
      }
      if (height === 0) {
        height = extractResolutionNumber(streamUrl, currentInfo.name || '');
      }
      if (height === 0 && currentInfo.bandwidth > 0) {
        const bw = currentInfo.bandwidth;
        if (bw >= 3800000) height = 1080;
        else if (bw >= 1800000) height = 720;
        else if (bw >= 900000) height = 480;
        else if (bw >= 450000) height = 360;
        else height = 240;
      }

      let label = getResolutionLabel(height, 'MP4');
      if (!label || label.startsWith('Video Stream')) {
        label = currentInfo.name || (height > 0 ? `${height}p HD (MP4)` : 'Video (MP4)');
      }
      
      let badge = height > 0 ? `${height}p` : 'Stream';
      if (currentInfo.bandwidth && height <= 0) {
        const kbps = Math.round(currentInfo.bandwidth / 1000);
        badge = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
      }

      formats.push({
        formatId: height > 0 ? `m3u8_${height}p` : `m3u8_stream_${formats.length}`,
        title: label,
        resolution: label,
        ext: 'mp4',
        badge: badge,
        url: streamUrl,
        directUrl: streamUrl,
        height: height,
        bandwidth: currentInfo.bandwidth || 0,
        isAudioOnly: false
      });
      currentInfo = null;
    }
  }

  formats.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));

  // Deduplicate by height keeping highest bandwidth variant
  const uniqueFormats = [];
  const seenH = new Set();
  for (const f of formats) {
    if (f.height > 0) {
      if (!seenH.has(f.height)) {
        seenH.add(f.height);
        uniqueFormats.push(f);
      }
    } else {
      uniqueFormats.push(f);
    }
  }
  return uniqueFormats;
}

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

function parseMpdFormats(mpdText, baseUrl) {
  const formats = [];
  try {
    if (!mpdText || typeof mpdText !== 'string') return [];
    
    // Check DRM / ContentProtection - if present, return empty (encrypted)
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
            const effH = normalizeVideoResolution(width, height) || ((width > 0 && height > 0) ? Math.min(width, height) : (height || width));
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

      const kbps = Math.round(v.bandwidth / 1000);
      const badge = estSize >= 1048576 ? formatSize(estSize) : (kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps');

      formats.push({
        formatId: 'fb_' + v.effectiveHeight + 'p',
        resolution: label,
        title: label,
        badge: badge,
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
        title: 'Audio (MP3 / High Quality)',
        badge: 'Audio Only',
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
    console.warn('parseMpdFormats error:', e);
  }
  return formats;
}

// Universal cache of authentic browser request headers for stream URLs and domains
const streamHeadersCache = new Map(); // url -> { referer, origin, userAgent, cookie }
const domainHeadersCache = new Map(); // domain -> { referer, origin, userAgent, cookie }

function getCachedStreamHeaders(url) {
  if (!url) return null;
  if (streamHeadersCache.has(url)) return streamHeadersCache.get(url);
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname;
    if (domainHeadersCache.has(domain)) return domainHeadersCache.get(domain);
    const parts = domain.split('.');
    if (parts.length > 2) {
      const rootDomain = parts.slice(-2).join('.');
      if (domainHeadersCache.has(rootDomain)) return domainHeadersCache.get(rootDomain);
    }
  } catch(e) {}
  return null;
}

if (chrome.webRequest && chrome.webRequest.onSendHeaders) {
  const onSendHandler = (details) => {
    try {
      const u = details.url;
      if (!u || !u.startsWith('http')) return;

      // Fast-path filter out static web assets that have no relevance to media headers
      if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|eot|map|json)(\?|$)/i.test(u) || u.includes('/rsrc.php/')) {
        return;
      }

      let referer = null;
      let origin = null;
      let userAgent = null;
      let cookie = null;

      if (details.requestHeaders) {
        for (const h of details.requestHeaders) {
          const n = h.name.toLowerCase();
          if (n === 'referer') referer = h.value;
          else if (n === 'origin') origin = h.value;
          else if (n === 'user-agent') userAgent = h.value;
          else if (n === 'cookie') cookie = h.value;
        }
      }

      if (!referer && details.initiator && details.initiator.startsWith('http')) {
        referer = details.initiator.endsWith('/') ? details.initiator : details.initiator + '/';
      }
      if (!origin && referer) {
        try { origin = new URL(referer).origin; } catch(e) {}
      }

      if (referer || origin || cookie) {
        const headerData = { referer, origin, userAgent, cookie };
        streamHeadersCache.set(u, headerData);
        if (streamHeadersCache.size > 200) {
          const firstKey = streamHeadersCache.keys().next().value;
          streamHeadersCache.delete(firstKey);
        }

        try {
          const parsed = new URL(u);
          const domain = parsed.hostname;
          domainHeadersCache.set(domain, headerData);
          const parts = domain.split('.');
          if (parts.length > 2) {
            domainHeadersCache.set(parts.slice(-2).join('.'), headerData);
          }
          if (domainHeadersCache.size > 100) {
            const firstKey = domainHeadersCache.keys().next().value;
            domainHeadersCache.delete(firstKey);
          }
        } catch(e) {}
      }
    } catch(e) {}
  };

  try {
    chrome.webRequest.onSendHeaders.addListener(
      onSendHandler,
      { urls: ['<all_urls>'] },
      ['requestHeaders', 'extraHeaders']
    );
  } catch(e) {
    try {
      chrome.webRequest.onSendHeaders.addListener(
        onSendHandler,
        { urls: ['<all_urls>'] },
        ['requestHeaders']
      );
    } catch(e2) {}
  }
}

function pushToMediaList(mediaList, newItem) {
  if (!mediaList || !newItem || !newItem.url) return;
  const isNewAudio = !!newItem.isAudio || (newItem.contentType && newItem.contentType.includes('audio/'));
  const isFb = !!newItem.fbVideoId || (newItem.url && (newItem.url.includes('fbcdn.net') || newItem.url.includes('facebook.com') || newItem.url.includes('fbsbx.com')));
  const isHls = (newItem.contentType && newItem.contentType.includes('mpegurl')) || (newItem.url && newItem.url.includes('.m3u8'));

  const existingIdx = mediaList.findIndex((m) => {
    if (m.url === newItem.url) return true;
    const isMAudio = !!m.isAudio || (m.contentType && m.contentType.includes('audio/'));
    if (isNewAudio !== isMAudio) return false;

    // For Facebook media: deduplicate only if exact same fbVideoId and same audio/video track role
    if (isFb && newItem.fbVideoId && m.fbVideoId) {
      return m.fbVideoId === newItem.fbVideoId;
    }

    // For HLS manifests: only consolidate unknown variant child manifests belonging to same playlist
    if (isHls && (m.contentType?.includes('mpegurl') || m.url?.includes('.m3u8'))) {
      if ((!newItem.height || newItem.height <= 0) && (!m.height || m.height <= 0)) {
        return true;
      }
    }
    return false;
  });

  if (existingIdx >= 0) {
    const existing = mediaList[existingIdx];
    if (newItem.height > 0 && (!existing.height || existing.height <= 0)) {
      existing.height = newItem.height;
      existing.customBadge = newItem.customBadge || `${newItem.height}p`;
    }
    if (newItem.url && existing.url !== newItem.url) {
      if (newItem.height > (existing.height || 0)) {
        existing.url = newItem.url;
        existing.height = newItem.height;
        existing.customBadge = newItem.customBadge || `${newItem.height}p`;
      }
    }
    if (newItem.contentLength > 0 && (!existing.contentLength || existing.contentLength <= 0)) {
      existing.contentLength = newItem.contentLength;
    }
    if (newItem.fbVideoId && !existing.fbVideoId) {
      existing.fbVideoId = newItem.fbVideoId;
    }
    if (newItem.pageReelId && !existing.pageReelId) {
      existing.pageReelId = newItem.pageReelId;
    }
    if (newItem.customTitle && (!existing.customTitle || isGenericTitle(existing.customTitle))) {
      existing.customTitle = newItem.customTitle;
      existing.filename = newItem.filename;
    }
    if (newItem.referer && !existing.referer) existing.referer = newItem.referer;
    if (newItem.origin && !existing.origin) existing.origin = newItem.origin;
    existing.timestamp = Date.now();
    return;
  }

  // Only drop unresolvable child manifests if we already have explicit HLS resolutions for this playlist
  if (isHls && !isNewAudio && (!newItem.height || newItem.height <= 0)) {
    const hasExplicit = mediaList.some(m => !m.isAudio && m.height > 0 && (m.contentType?.includes('mpegurl') || m.url?.includes('.m3u8')));
    if (hasExplicit) return;
  }

  const maxItems = 40;
  if (mediaList.length >= maxItems) {
    let evictIdx = mediaList.findIndex((m) => !m.contentType?.includes('mpegurl') && (!m.height || m.height <= 0) && !m.fbVideoId);
    if (evictIdx < 0) {
      evictIdx = mediaList.findIndex((m) => !m.contentType?.includes('mpegurl'));
    }
    if (evictIdx < 0) {
      evictIdx = 0;
    }
    mediaList.splice(evictIdx, 1);
  }
  mediaList.push(newItem);
}

// Intercept network requests for video/audio streams
if (chrome.webRequest && chrome.webRequest.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      let targetTabId = details.tabId;
      if (!targetTabId || targetTabId <= 0) {
        targetTabId = lastActiveTabId;
      }
      if (!targetTabId || targetTabId <= 0) return;

      const headers = details.responseHeaders || [];
      let contentType = '';
      let contentLength = 0;
      let contentRangeTotal = 0;

      headers.forEach((h) => {
        const name = h.name.toLowerCase();
        if (name === 'content-type') contentType = h.value.toLowerCase();
        if (name === 'content-length') contentLength = parseInt(h.value, 10) || 0;
        if (name === 'content-range') {
          const m = h.value.match(/\/(\d+)/);
          if (m) contentRangeTotal = parseInt(m[1], 10) || 0;
        }
      });

      if (contentRangeTotal > 0 && (!contentLength || contentLength < contentRangeTotal)) {
        contentLength = contentRangeTotal;
      }

      const url = details.url.toLowerCase();

      // Explicitly ignore Netflix and DRM content so Netflix displays "No media formats detected"
      if (url.includes('netflix.com') || url.includes('nflxvideo.net') || url.includes('widevine') || url.includes('pssh')) {
        return;
      }

      // Explicitly ignore Facebook static assets (scripts, styles, wasm, UI icons)
      if (url.includes('static.xx.fbcdn.net') || url.includes('/rsrc.php/')) {
        return;
      }

      // Exclude web assets, images, scripts, stylesheets, fonts, archives, torrents, executables, wasm
      if (contentType.includes('image/') || contentType.includes('wasm') || contentType.includes('javascript') || contentType.includes('text/css')) return;
      const isNonMediaAsset = url.includes('.js') || url.includes('.css') || url.includes('.jpg') ||
                              url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') ||
                              url.includes('.svg') || url.includes('.webp') || url.includes('.avif') ||
                              url.includes('.json') || url.includes('.woff') || url.includes('.woff2') ||
                              url.includes('.html') || url.includes('.ico') || url.includes('.webmanifest') ||
                              url.includes('.wasm') || url.includes('.map') ||
                              url.includes('.torrent') || url.includes('.rar') ||
                              url.includes('.zip') || url.includes('.7z') || url.includes('.tar') ||
                              url.includes('.gz') || url.includes('.iso') || url.includes('.exe') ||
                              url.includes('.msi') || url.includes('.pdf') || contentType.includes('bittorrent') ||
                              contentType.includes('zip') || contentType.includes('x-rar');
      if (isNonMediaAsset) return;

      // Filter out tiny video tracking beacons, range probes, and init fragments (< 64KB)
      // Never drop Facebook media chunks since Facebook audio init fragments and DASH chunks can be < 64KB
      const isFbMedia = url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('fbsbx.com') || url.includes('facebook.net');
      if (!isFbMedia && contentType.includes('video/') && contentLength > 0 && contentLength < 65536 && !contentRangeTotal) {
        return;
      }

      // Ignore small UI sound effects (< 300KB or audio files named success/failure/no_input/open)
      if (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg')) {
        if (contentLength > 0 && contentLength < 300 * 1024) return;
        if (url.includes('success') || url.includes('failure') || url.includes('no_input') || url.includes('open') || url.includes('sound')) return;
      }

      // Filter out HLS/DASH segment chunks (preserve full stream URLs)
      const isGoogleVideo = url.includes('videoplayback') || url.includes('googlevideo.com');
      const isM3u8OrMpd = url.includes('.m3u8') || url.includes('.mpd');
      const isSegmentChunk = !isGoogleVideo && !isM3u8OrMpd && !isFbMedia && (
        /\.ts(\?|$)/i.test(url) ||
        /\.m4s(\?|$)/i.test(url) ||
        /\.f4m(\?|$)/i.test(url) ||
        /\.f4f(\?|$)/i.test(url) ||
        contentType.includes('video/mp2t') ||
        contentType.includes('video/iso.segment') ||
        contentType.includes('audio/mp4a-latm') ||
        url.includes('/seg-') ||
        url.includes('/segment') ||
        url.includes('/chunk') ||
        url.includes('/fragment') ||
        url.includes('sq/') ||
        url.includes('/init.mp4') ||
        url.includes('-init.mp4') ||
        url.includes('/cmfv') ||
        url.includes('/cmfa')
      );
      if (isSegmentChunk) return;

      // Filter out subtitle files, captions, and DRM/key files
      if (url.includes('.vtt') || url.includes('.srt') || url.includes('.key') || url.includes('/sub/') || url.includes('/subs/') || url.includes('subtitle')) return;

      let targetUrl = sanitizeStreamUrl(details.url);

      // Maintain directory-level token cache across variant streams & segment manifests
      const dirKey = getStreamDirectoryKey(targetUrl);
      if (dirKey) {
        if (targetUrl.includes('?') && (targetUrl.includes('token=') || targetUrl.includes('sig=') || targetUrl.includes('auth=') || targetUrl.includes('h=') || targetUrl.includes('expires=') || targetUrl.length > 40)) {
          try {
            const u = new URL(targetUrl);
            if (u.search && u.search.length > 1) {
              streamTokenCache.set(dirKey, u.search);
              if (streamTokenCache.size > 100) {
                const firstKey = streamTokenCache.keys().next().value;
                streamTokenCache.delete(firstKey);
              }
            }
          } catch(e) {}
        } else if (!targetUrl.includes('?')) {
          const cachedToken = streamTokenCache.get(dirKey);
          if (cachedToken) {
            targetUrl += cachedToken;
          }
        }
      }

      if (isGoogleVideo) {
        if (!contentLength || contentLength === 0) {
          const clenMatch = targetUrl.match(/[?&]clen=(\d+)/);
          if (clenMatch) contentLength = parseInt(clenMatch[1], 10);
        }
      }

      const isMediaMime = contentType.includes('video/') || 
                          contentType.includes('audio/') || 
                          contentType.includes('application/x-mpegurl') || 
                          contentType.includes('application/vnd.apple.mpegurl') || 
                          contentType.includes('application/dash+xml');
      
      const isMediaExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd') ||
                         url.includes('.webm') || url.includes('.mp3') || url.includes('.m4a') ||
                         url.includes('.flv') || url.includes('.mov') || url.includes('.m4v') ||
                         url.includes('.avi') || url.includes('.mkv');

      const isFbStream = isFbMedia && !url.includes('static.xx.fbcdn.net') && !url.includes('/rsrc.php/') && !url.includes('.wasm') && (
        contentType.includes('video/') ||
        contentType.includes('audio/') ||
        url.includes('.mp4') ||
        url.includes('.m4a') ||
        url.includes('.webm') ||
        url.includes('.m3u8') ||
        url.includes('.mpd') ||
        ((url.includes('video.') || url.includes('video-') || url.includes('/v/t')) && (url.includes('bytestart') || url.includes('.mp4') || contentType.startsWith('video/')))
      );

      if (isMediaMime || isMediaExt || isGoogleVideo || isFbStream) {
        if (!detectedMediaMap.has(targetTabId)) {
          detectedMediaMap.set(targetTabId, []);
        }
        const mediaList = detectedMediaMap.get(targetTabId);

        const initiatorUrl = details.initiator || null;
        const tabUrl = tabUrlMap.get(targetTabId) || initiatorUrl || null;
        const fetchOpts = {};
        if (tabUrl && !tabUrl.startsWith('chrome') && !tabUrl.startsWith('moz')) {
          fetchOpts.referrer = tabUrl;
        }

        // If this is an m3u8 playlist, fetch and parse variants BEFORE adding to mediaList
        if (targetUrl.includes('.m3u8')) {
          if (!shouldProbeM3u8(targetUrl)) return;
          (async () => {
            const cachedH = getCachedStreamHeaders(targetUrl);
            const itemReferer = (cachedH && cachedH.referer) || initiatorUrl || tabUrl || null;
            const itemOrigin = (cachedH && cachedH.origin) || (itemReferer ? new URL(itemReferer).origin : null);

            const rawTabTitle = targetTabId ? tabTitleMap.get(targetTabId) : null;
            const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
            const authoritativeTabTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;

            let text = await fetchM3u8Text(targetUrl, tabUrl, itemReferer || initiatorUrl);

            // If this is a child playlist (media playlist with chunks) or initial fetch was empty,
            // probe parent path or master.m3u8 in same folder
            if ((text && !text.includes('#EXT-X-STREAM-INF') && text.includes('#EXTINF')) || !text) {
              const candidates = [];
              const addCand = (cand) => {
                if (cand && cand !== targetUrl && !candidates.includes(cand)) {
                  candidates.push(cand);
                }
              };
              // Sibling candidates in same folder
              addCand(targetUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
              addCand(targetUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
              addCand(targetUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
              // Stripping format slugs (e.g. index-f1.m3u8 -> index.m3u8)
              addCand(targetUrl.replace(/[-_]?(?:f\d+|v\d+|a\d+|\d+p|\d+)(?=\.m3u8)/i, ''));
              // Parent directory candidates (guard against stripping tokenized paths)
              const parentMatch = targetUrl.match(/\/([^\/?#]+)\/[^\/?#]+\.m3u8(?:\?[^#]*)?$/i);
              if (parentMatch) {
                const parentDir = parentMatch[1];
                const isSecurityToken = parentDir.length > 16 || (parentDir.length >= 8 && /^[a-f0-9]{8,}$|^[a-zA-Z0-9_\-]{20,}$/i.test(parentDir));
                if (!isSecurityToken) {
                  addCand(targetUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
                  addCand(targetUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
                  addCand(targetUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
                }
              }

              for (const candUrl of candidates) {
                const parentText = await fetchM3u8Text(candUrl, tabUrl, itemReferer || initiatorUrl);
                if (parentText && parentText.includes('#EXT-X-STREAM-INF')) {
                  text = parentText;
                  targetUrl = candUrl;
                  break;
                }
              }
            }

            // If in-extension fetch did not yield master variants (e.g. cross-origin referrer blocked by browser),
            // query SmartDM Desktop App IPC which has full C# HttpClient capabilities with 0 CORS restrictions
            if (!text || !text.includes('#EXT-X-STREAM-INF')) {
              try {
                const desktopRes = await postToDesktopApp({
                  type: 'RESOLVE_M3U8_VARIANTS',
                  url: targetUrl,
                  referer: itemReferer || initiatorUrl,
                  userAgent: navigator.userAgent
                });
                if (desktopRes && (desktopRes.status === 'ok' || desktopRes.success) && desktopRes.formats && desktopRes.formats.length > 0) {
                  let addedAny = false;
                  desktopRes.formats.forEach((v) => {
                    const finalTitle = (!v.title || isGenericTitle(v.title)) ? (authoritativeTabTitle || v.title || 'Video') : v.title;
                    const vUrl = v.url || v.directUrl;
                    const existing = mediaList.find((m) => m.url === vUrl);
                    const vH = v.height || extractResolutionNumber(v.resolution || vUrl) || 0;
                    if (!existing) {
                      pushToMediaList(mediaList, {
                        url: vUrl,
                        contentType: 'application/x-mpegurl',
                        contentLength: 0,
                        filename: finalTitle + '.mp4',
                        customTitle: finalTitle,
                        customBadge: v.badge || (vH > 0 ? `${vH}p` : 'Stream'),
                        height: vH,
                        bandwidth: v.bandwidth || 0,
                        referer: itemReferer,
                        origin: itemOrigin,
                        timestamp: Date.now()
                      });
                      addedAny = true;
                    }
                  });
                  if (addedAny) {
                    broadcastNewMedia(targetTabId, mediaList);
                    return;
                  }
                }
              } catch(e) {}
            }

            if (text && text.includes('#EXT-X-STREAM-INF')) {
              const variants = parseM3u8Formats(text, targetUrl);
              let addedAny = false;
              variants.forEach((v) => {
                v.referer = itemReferer;
                v.origin = itemOrigin;
                const finalTitle = (!v.title || isGenericTitle(v.title)) ? (authoritativeTabTitle || v.title || 'Video') : v.title;
                const existing = mediaList.find((m) => m.url === v.url);
                if (!existing) {
                  pushToMediaList(mediaList, {
                    url: v.url,
                    contentType: 'application/x-mpegurl',
                    contentLength: 0,
                    filename: finalTitle + '.mp4',
                    customTitle: finalTitle,
                    customBadge: v.badge || (v.height > 0 ? `${v.height}p` : 'Stream'),
                    height: v.height || 0,
                    bandwidth: v.bandwidth || 0,
                    referer: itemReferer,
                    origin: itemOrigin,
                    timestamp: Date.now()
                  });
                  addedAny = true;
                } else {
                  if (v.height > 0 && (!existing.height || existing.height <= 0)) {
                    existing.height = v.height;
                    existing.customBadge = v.badge || `${v.height}p`;
                    addedAny = true;
                  }
                  if (authoritativeTabTitle && (!existing.customTitle || isGenericTitle(existing.customTitle))) {
                    existing.customTitle = authoritativeTabTitle;
                    existing.filename = authoritativeTabTitle + '.mp4';
                    addedAny = true;
                  }
                  if (itemReferer && !existing.referer) existing.referer = itemReferer;
                  if (itemOrigin && !existing.origin) existing.origin = itemOrigin;
                  existing.timestamp = Date.now();
                }
              });
              if (addedAny) broadcastNewMedia(targetTabId, mediaList);
            } else {
              const resH = extractResolutionNumber(targetUrl);
              const singleTitle = authoritativeTabTitle || (resH > 0 ? getResolutionLabel(resH, 'MP4') : 'HLS Video Stream');
              const singleFilename = (authoritativeTabTitle || getFilenameFromUrl(targetUrl)) + (authoritativeTabTitle ? '.mp4' : '');
              const existing = mediaList.find((m) => m.url === targetUrl);
              if (!existing) {
                pushToMediaList(mediaList, {
                  url: targetUrl,
                  contentType: 'application/x-mpegurl',
                  contentLength: contentLength,
                  filename: singleFilename,
                  customTitle: singleTitle,
                  customBadge: resH > 0 ? `${resH}p` : 'HLS Stream',
                  height: resH,
                  referer: itemReferer,
                  origin: itemOrigin,
                  timestamp: Date.now()
                });
                broadcastNewMedia(targetTabId, mediaList);
              } else {
                if (resH > 0 && (!existing.height || existing.height <= 0)) {
                  existing.height = resH;
                  existing.customBadge = `${resH}p`;
                  broadcastNewMedia(targetTabId, mediaList);
                }
                if (authoritativeTabTitle && (!existing.customTitle || isGenericTitle(existing.customTitle))) {
                  existing.customTitle = authoritativeTabTitle;
                  existing.filename = authoritativeTabTitle + '.mp4';
                  broadcastNewMedia(targetTabId, mediaList);
                }
                if (itemReferer && !existing.referer) existing.referer = itemReferer;
                if (itemOrigin && !existing.origin) existing.origin = itemOrigin;
                existing.timestamp = Date.now();
              }

              // Delegate in-page probing to active tab's content script where cookies & referer are authentic
              if (targetTabId && targetTabId > 0 && shouldProbeM3u8(targetUrl)) {
                if (details.frameId && details.frameId > 0) {
                  try {
                    chrome.tabs.sendMessage(targetTabId, {
                      type: 'PROBE_M3U8_MANIFEST',
                      url: targetUrl
                    }, { frameId: details.frameId }, () => { if (chrome.runtime.lastError) {} });
                  } catch(e) {}
                }
                try {
                  chrome.tabs.sendMessage(targetTabId, {
                    type: 'PROBE_M3U8_MANIFEST',
                    url: targetUrl
                  }, { frameId: 0 }, () => { if (chrome.runtime.lastError) {} });
                } catch(e) {}
              }
            }
          })().catch(() => {
            const cachedH = getCachedStreamHeaders(targetUrl);
            const itemReferer = (cachedH && cachedH.referer) || initiatorUrl || tabUrl || null;
            const itemOrigin = (cachedH && cachedH.origin) || (itemReferer ? new URL(itemReferer).origin : null);
            const resH = extractResolutionNumber(targetUrl);
            const rawTabTitle = targetTabId ? tabTitleMap.get(targetTabId) : null;
            const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
            const authoritativeTabTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;
            const singleTitle = authoritativeTabTitle || (resH > 0 ? getResolutionLabel(resH, 'MP4') : 'HLS Video Stream');
            const singleFilename = (authoritativeTabTitle || getFilenameFromUrl(targetUrl)) + (authoritativeTabTitle ? '.mp4' : '');
            const existing = mediaList.find((m) => m.url === targetUrl);
            if (!existing) {
              pushToMediaList(mediaList, {
                url: targetUrl,
                contentType: 'application/x-mpegurl',
                contentLength: contentLength,
                filename: singleFilename,
                customTitle: singleTitle,
                customBadge: resH > 0 ? `${resH}p` : 'HLS Stream',
                height: resH,
                referer: itemReferer,
                origin: itemOrigin,
                timestamp: Date.now()
              });
              broadcastNewMedia(targetTabId, mediaList);
            }

            if (targetTabId && targetTabId > 0 && shouldProbeM3u8(targetUrl)) {
              if (details.frameId && details.frameId > 0) {
                try {
                  chrome.tabs.sendMessage(targetTabId, {
                    type: 'PROBE_M3U8_MANIFEST',
                    url: targetUrl
                  }, { frameId: details.frameId }, () => { if (chrome.runtime.lastError) {} });
                } catch(e) {}
              }
              try {
                chrome.tabs.sendMessage(targetTabId, {
                  type: 'PROBE_M3U8_MANIFEST',
                  url: targetUrl
                }, { frameId: 0 }, () => { if (chrome.runtime.lastError) {} });
              } catch(e) {}
            }
          });
          return;
        }

        // If this is an mpd manifest, fetch and parse representations BEFORE adding
        if (targetUrl.includes('.mpd')) {
          fetch(targetUrl, fetchOpts)
            .then((r) => r.text())
            .then((text) => {
              const mpdFormats = parseMpdFormats(text, targetUrl);
              if (mpdFormats.length > 0) {
                let addedAny = false;
                mpdFormats.forEach((f) => {
                  if (!mediaList.some((m) => m.url === f.url)) {
                    pushToMediaList(mediaList, {
                      url: f.url,
                      videoUrl: f.videoUrl,
                      audioUrl: f.audioUrl,
                      contentType: 'video/mp4',
                      contentLength: 0,
                      filename: f.title + '.mp4',
                      customTitle: f.title,
                      customBadge: f.badge,
                      height: f.height || 0,
                      bandwidth: f.bandwidth || 0,
                      timestamp: Date.now()
                    });
                    addedAny = true;
                  }
                });
                if (addedAny) broadcastNewMedia(targetTabId, mediaList);
              }
            })
            .catch(() => {
              const existing = mediaList.find((m) => m.url === targetUrl);
              if (!existing) {
                pushToMediaList(mediaList, {
                  url: targetUrl,
                  contentType: 'application/dash+xml',
                  contentLength: contentLength,
                  filename: getFilenameFromUrl(targetUrl),
                  customTitle: 'DASH Video Stream',
                  customBadge: 'DASH Stream',
                  timestamp: Date.now()
                });
                broadcastNewMedia(targetTabId, mediaList);
              }
            });
          return;
        }

        // Standard direct media URL (mp4, webm, mp3, m4a, etc.)
        const resH = extractResolutionNumber(targetUrl);
        if (!mediaList.some((m) => m.url === targetUrl)) {

          let rawName = getFilenameFromUrl(targetUrl);
          let title = rawName;
          let badge = resH > 0 ? `${resH}p` : 'Media';
          let customTitle = null;

          const isAudio = (contentType && contentType.includes('audio/')) || targetUrl.includes('.m4a') || targetUrl.includes('.mp3');
          let isFbAudio = false;
          let isFbVideo = false;
          let isFbReel = false;
          let fbVideoId = null;
          let pageReelId = null;

          if (isFbMedia) {
            const fbEfg = parseFacebookEfg(targetUrl);
            if (fbEfg) {
              const efgVid = fbEfg.video_id || fbEfg.fbid || fbEfg.target_video_id || fbEfg.asset_id || fbEfg.media_id || fbEfg.reel_id || fbEfg.video_asset_id;
              if (efgVid) fbVideoId = String(efgVid);
              if (fbEfg.reel_id) pageReelId = String(fbEfg.reel_id);
              if (fbEfg.is_reel === true || fbEfg.is_reel === 'true' || fbEfg.is_reel === 1 || fbEfg.reel_id) {
                isFbReel = true;
              }
              const vTag = (fbEfg.vencode_tag || fbEfg.encode_tag || '').toLowerCase();
              if (vTag.includes('reel') || vTag.includes('short')) {
                isFbReel = true;
              }
            }
            if (!isFbReel && (targetUrl.includes('/reel/') || targetUrl.includes('is_reel=1') || targetUrl.includes('reel_id='))) {
              isFbReel = true;
            }

            // The tab URL is not proof of stream identity: Facebook preloads
            // recommendations while another Reel is open. Only a media URL's
            // explicit Reel ID may bind a request to the selected Reel.

            const ct = (contentType || '').toLowerCase();
            const uLower = targetUrl.toLowerCase();

            // Strict Priority 1: Inspect explicit fbEfg encoding tags
            // Facebook CDN serves DASH audio MP4 files with Content-Type: video/mp4, so efg audio_tag takes precedence!
            if (fbEfg) {
              const vTag = (fbEfg.vencode_tag || fbEfg.encode_tag || '').toLowerCase();
              const aTag = (fbEfg.audio_tag || '').toLowerCase();

              const hasAudioMarker = vTag.includes('audio') || vTag.includes('heaac') || vTag.includes('aac') || vTag.includes('opus') ||
                                     aTag.includes('audio') || aTag.includes('heaac') || aTag.includes('aac') || aTag.includes('opus') ||
                                     vTag.includes('dash_a') || aTag.includes('dash_a') || vTag.includes('_a1_') || vTag.includes('_a2_') ||
                                     vTag.includes('_a3_') || aTag.includes('_a1_') || aTag.includes('_a2_') || aTag.includes('_a3_');

              const hasVideoMarker = vTag.includes('video') || vTag.includes('dash_v') || vTag.includes('vp9') || vTag.includes('avc') ||
                                     vTag.includes('h264') || vTag.includes('hevc') || vTag.includes('av01') || vTag.includes('baseline') ||
                                     vTag.includes('main') || vTag.includes('high') || vTag.includes('720p') || vTag.includes('1080p') ||
                                     vTag.includes('480p') || vTag.includes('360p') || vTag.includes('inline') || vTag.includes('_v1_') ||
                                     vTag.includes('_v2_') || vTag.includes('_v3_') || vTag.includes('_v4_');

              if (hasAudioMarker && !hasVideoMarker) {
                isFbAudio = true;
                isFbVideo = false;
              } else if (hasVideoMarker && !hasAudioMarker) {
                isFbVideo = true;
                isFbAudio = false;
              } else if (hasAudioMarker) {
                if (fbEfg.bitrate && fbEfg.bitrate < 150000) {
                  isFbAudio = true;
                  isFbVideo = false;
                } else {
                  isFbVideo = true;
                  isFbAudio = false;
                }
              }
            }

            // Strict Priority 2: URL parameter inspection (dash_a, mime=audio, etc.)
            if (!isFbAudio && !isFbVideo) {
              if (uLower.includes('mime=audio') || uLower.includes('frag_2_audio') || uLower.includes('audiocodecs') || uLower.includes('dash_a') || uLower.includes('/audio/') || uLower.includes('.m4a') || uLower.includes('.mp3')) {
                isFbAudio = true;
                isFbVideo = false;
              } else if (uLower.includes('mime=video') || uLower.includes('frag_1_video') || uLower.includes('videocodecs') || uLower.includes('dash_v') || uLower.includes('/video/')) {
                isFbVideo = true;
                isFbAudio = false;
              }
            }

            // Strict Priority 3: Content-Type header fallback
            if (!isFbAudio && !isFbVideo) {
              if (ct.includes('audio/')) {
                isFbAudio = true;
                isFbVideo = false;
              } else if (ct.includes('video/')) {
                isFbVideo = true;
                isFbAudio = false;
              } else {
                // Default to video for Facebook media CDN streams
                isFbVideo = true;
                isFbAudio = false;
              }
            }

            if (!fbVideoId) {
              const pathMatch = targetUrl.match(/\/(\d{10,})[_\.\/]/);
              if (pathMatch) {
                fbVideoId = pathMatch[1];
              } else {
                const idMatch = targetUrl.match(/[?&](?:video_id|v|fbid|story_fbid|asset_id|media_id)=(\d+)/);
                if (idMatch) fbVideoId = idMatch[1];
              }
            }
          }

          const isFinalAudio = isFbMedia ? isFbAudio : isAudio;
          let reportedLength = contentLength;
          // If contentLength is a small fragment (< 1MB) for video, don't report false chunk sizes (like ~136KB) to UI
          if (!isFinalAudio && reportedLength > 0 && reportedLength < 1048576) {
            reportedLength = 0;
          }

          if (isFbMedia) {
            if (isFbAudio) {
              badge = 'Audio Stream';
              customTitle = 'Audio Stream (MP3 / High Quality)';
              title = 'facebook_audio.mp4';
            } else {
              badge = 'Facebook Video';
              customTitle = 'Video Stream (MP4)';
              title = 'facebook_video.mp4';
            }
          } else if (isGoogleVideo) {
            const itagMatch = targetUrl.match(/[?&]itag=(\d+)/);
            const itag = itagMatch ? itagMatch[1] : '';
            const isGvAudio = (contentType && contentType.includes('audio/')) || itag === '140' || itag === '251' || itag === '139';
            badge = isGvAudio ? 'Audio Stream' : (itag ? `Video Stream (itag ${itag})` : 'Video Stream');
            customTitle = isGvAudio ? `Audio Stream (${itag || 'm4a'})` : `Video Stream (${itag || 'mp4'})`;
            title = isGvAudio ? `audio_${itag || 'stream'}.m4a` : `video_${itag || 'stream'}.mp4`;
          } else if (resH > 0 && !isFinalAudio) {
            const ext = (rawName.includes('.') ? rawName.substring(rawName.lastIndexOf('.') + 1) : 'mp4').toLowerCase();
            badge = `${resH}p`;
            customTitle = getResolutionLabel(resH, ext, false);
            title = (rawName && !isOpaqueTokenOrHash(rawName)) ? rawName : `video_${resH}p.${ext}`;
          } else if (isOpaqueTokenOrHash(rawName)) {
            const ext = rawName.includes('.') ? rawName.substring(rawName.lastIndexOf('.')) : '.mp4';
            badge = isFinalAudio ? 'Audio Stream' : 'Direct Video';
            customTitle = isFinalAudio ? 'Audio Stream' : 'Video Stream (MP4)';
            title = (isFinalAudio ? 'audio_stream' : 'video_stream') + ext;
          }

          const cachedH = getCachedStreamHeaders(targetUrl);
          const itemReferer = (cachedH && cachedH.referer) || initiatorUrl || tabUrl || null;
          const itemOrigin = (cachedH && cachedH.origin) || (itemReferer ? new URL(itemReferer).origin : null);

          const mediaItem = {
            url: targetUrl,
            contentType: contentType,
            contentLength: reportedLength,
            filename: title,
            customTitle: customTitle || title,
            customBadge: badge,
            height: resH || 0,
            isAudio: isFinalAudio,
            isVideo: isFbMedia ? isFbVideo : !isFinalAudio,
            fbVideoId: fbVideoId || null,
            pageReelId: pageReelId || null,
            isReel: isFbMedia ? isFbReel : false,
            referer: itemReferer,
            origin: itemOrigin,
            timestamp: Date.now()
          };
          pushToMediaList(mediaList, mediaItem);
          broadcastNewMedia(targetTabId, mediaList);

          // Asynchronously probe full stream size using Range: bytes=0-0 to get real total size without loading stream
          if (!isFinalAudio && targetUrl && targetUrl.startsWith('http') && reportedLength === 0) {
            fetch(targetUrl, { method: 'GET', headers: { 'Range': 'bytes=0-0' } })
              .then(r => {
                const cr = r.headers.get('content-range');
                if (cr) {
                  const m = cr.match(/\/(\d+)/);
                  if (m) {
                    const total = parseInt(m[1], 10);
                    if (total > 1048576) {
                      mediaItem.contentLength = total;
                      broadcastNewMedia(targetTabId, mediaList);
                    }
                  }
                }
              }).catch(() => {});
          }
        } else {
          // If the stream URL was already detected, update its activity timestamp and metadata
          const existing = mediaList.find((m) => m.url === targetUrl);
          if (existing) {
            existing.timestamp = Date.now();
            let changed = false;
            const cachedH = getCachedStreamHeaders(targetUrl);
            const itemReferer = (cachedH && cachedH.referer) || initiatorUrl || tabUrl || null;
            const itemOrigin = (cachedH && cachedH.origin) || (itemReferer ? new URL(itemReferer).origin : null);
            if (itemReferer && !existing.referer) { existing.referer = itemReferer; changed = true; }
            if (itemOrigin && !existing.origin) { existing.origin = itemOrigin; changed = true; }
            if (resH > 0 && (!existing.height || existing.height <= 0)) {
              existing.height = resH;
              existing.customTitle = getResolutionLabel(resH, 'mp4', !!existing.isAudio);
              existing.customBadge = `${resH}p`;
              changed = true;
            }
            if (isFbMedia) {
              const fbEfg = parseFacebookEfg(targetUrl);
              const efgVid = fbEfg ? (fbEfg.video_id || fbEfg.fbid || fbEfg.target_video_id || fbEfg.asset_id || fbEfg.reel_id) : null;
              if (efgVid && !existing.fbVideoId) {
                existing.fbVideoId = String(efgVid);
                changed = true;
              }
              if (fbEfg && (fbEfg.is_reel === true || fbEfg.is_reel === 'true' || fbEfg.is_reel === 1 || fbEfg.reel_id)) {
                if (!existing.isReel) {
                  existing.isReel = true;
                  changed = true;
                }
              }
            }
            if (changed) {
              broadcastNewMedia(targetTabId, mediaList);
            }
          }
        }
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
}

function getFilenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const lastSeg = path.substring(path.lastIndexOf('/') + 1);
    if (lastSeg && lastSeg.includes('.')) return lastSeg;
  } catch (e) {}
  return 'media_stream';
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'download-link') {
    let url = info.linkUrl || info.srcUrl || info.pageUrl;
    if (url) {
      sendToSmartDM(url, tab ? tab.url : null);
    }
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.url) {
    sendToSmartDM(tab.url, tab.url);
  }
});

let cachedActivePort = 18420;

async function probePort(port) {
  const probeController = new AbortController();
  const probeTimer = setTimeout(() => probeController.abort(), 600);
  try {
    const probeRes = await fetch(`http://127.0.0.1:${port}/api/browser`, {
      method: 'GET',
      signal: probeController.signal
    });
    clearTimeout(probeTimer);
    if (probeRes.ok || probeRes.status === 200 || probeRes.status === 204) {
      return port;
    }
  } catch(e) {
    clearTimeout(probeTimer);
  }
  throw new Error(`Port ${port} unavailable`);
}

async function getActivePort() {
  if (cachedActivePort) {
    try {
      return await probePort(cachedActivePort);
    } catch(e) {
      cachedActivePort = null;
    }
  }
  const ports = [18420, 18421, 18422, 18423, 18424, 18425];
  try {
    const foundPort = await Promise.any(ports.map(p => probePort(p)));
    cachedActivePort = foundPort;
    return foundPort;
  } catch(e) {
    return null;
  }
}

function postToDesktopApp(request) {
  return new Promise((resolve) => {
    appendCookiesAndSend(request, (res) => {
      resolve(res);
    });
  });
}

async function appendCookiesAndSend(request, sendResponse) {
  let targetUrl = request.url;
  if (!targetUrl && request.urls && request.urls.length > 0) {
    targetUrl = request.urls[0];
  }

  // Look up authentic browser headers from network interceptor cache
  const cachedH = getCachedStreamHeaders(targetUrl);
  if (cachedH) {
    if (cachedH.referer) request.referer = cachedH.referer;
    if (cachedH.origin) request.origin = cachedH.origin;
    if (cachedH.userAgent) request.userAgent = cachedH.userAgent;
    if (cachedH.cookie && !request.cookies) request.cookies = cachedH.cookie;
  }
  if (!request.userAgent) request.userAgent = navigator.userAgent;
  if (!request.referer) request.referer = request.pageUrl || null;
  if (!request.origin && request.referer) {
    try { request.origin = new URL(request.referer).origin; } catch(e) {}
  }

  // Refresh query tokens from directory token cache if targetUrl has no query
  const dirKey = getStreamDirectoryKey(targetUrl);
  if (dirKey && !targetUrl.includes('?') && streamTokenCache.has(dirKey)) {
    targetUrl += streamTokenCache.get(dirKey);
    request.url = targetUrl;
  }

  if (Array.isArray(request.formats)) {
    request.formats.forEach(f => {
      const fCached = getCachedStreamHeaders(f.url || f.directUrl);
      if (fCached) {
        if (fCached.referer) f.referer = fCached.referer;
        if (fCached.origin) f.origin = fCached.origin;
      } else {
        if (request.referer) f.referer = request.referer;
        if (request.origin) f.origin = request.origin;
      }
    });
  }

  try {
    // Check targetUrl, referer, pageUrl, and origin for cookies (crucial for CDN media streams on separate domains)
    const candidateUrls = [targetUrl, request.referer, request.pageUrl, request.origin].filter(Boolean);
    const domainSet = new Set();
    const urlSet = new Set();

    for (const u of candidateUrls) {
      try {
        const parsed = new URL(u);
        urlSet.add(parsed.protocol + '//' + parsed.hostname + '/');
        const host = parsed.hostname.replace(/^www\./, '');
        if (host) {
          domainSet.add(host);
          const parts = host.split('.');
          if (parts.length > 2) {
            domainSet.add(parts.slice(-2).join('.'));
          }
        }
      } catch (e) {}
    }

    if (chrome.cookies) {
      const allCookiesMap = new Map();

      // First, seed with authentic raw cookies captured by webRequest.onSendHeaders for target stream CDN
      if (cachedH && cachedH.cookie) {
        try {
          let streamDomain = '';
          if (targetUrl) {
            const pu = new URL(targetUrl);
            streamDomain = pu.hostname;
          }
          const pairs = cachedH.cookie.split(';');
          for (const p of pairs) {
            const eq = p.indexOf('=');
            if (eq > 0) {
              const k = p.substring(0, eq).trim();
              const v = p.substring(eq + 1).trim();
              if (k && !allCookiesMap.has(`${streamDomain}_${k}_/`)) {
                allCookiesMap.set(`${streamDomain}_${k}_/`, {
                  domain: streamDomain ? '.' + streamDomain : '',
                  name: k,
                  value: v,
                  path: '/',
                  secure: true,
                  expirationDate: Math.floor(Date.now() / 1000) + 86400 * 30
                });
              }
            }
          }
        } catch(e) {}
      }

      const cookieQueries = [];

      for (const d of domainSet) {
        cookieQueries.push(new Promise(resolve => {
          try {
            chrome.cookies.getAll({ domain: d }, (c) => resolve(c || []));
          } catch(e) { resolve([]); }
        }));
      }
      for (const u of urlSet) {
        cookieQueries.push(new Promise(resolve => {
          try {
            chrome.cookies.getAll({ url: u }, (c) => resolve(c || []));
          } catch(e) { resolve([]); }
        }));
      }

      const queryResults = await Promise.all(cookieQueries);
      for (const cookieList of queryResults) {
        for (const c of cookieList) {
          if (c && c.name) {
            const key = `${c.domain || ''}_${c.name}_${c.path || ''}`;
            if (!allCookiesMap.has(key)) {
              allCookiesMap.set(key, c);
            }
          }
        }
      }

      if (allCookiesMap.size > 0) {
        let cookieStr = '# Netscape HTTP Cookie File\n';
        for (const c of allCookiesMap.values()) {
          const domain = c.domain || '';
          const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
          const path = c.path || '/';
          const secure = c.secure ? 'TRUE' : 'FALSE';
          const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
          cookieStr += `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}\n`;
        }
        request.cookies = cookieStr;
      } else if (cachedH && cachedH.cookie && !request.cookies) {
        request.cookies = cachedH.cookie;
      }
    }
  } catch (e) {
    console.warn('Failed to extract cookies:', e);
  }

  // 1. Send directly to active SmartDM desktop app port (default 18420)
  const isFormatQuery = request.type === 'GET_MEDIA_FORMATS' || request.action === 'extractMediaInfo' || request.type === 'RESOLVE_M3U8_VARIANTS';
  const tryPostToPort = async (port) => {
    try {
      const timeoutMs = isFormatQuery ? 15000 : 8000;
      const reqController = new AbortController();
      const reqTimer = setTimeout(() => reqController.abort(), timeoutMs);
      const res = await fetch(`http://127.0.0.1:${port}/api/browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: reqController.signal
      });
      clearTimeout(reqTimer);
      if (res.ok) {
        cachedActivePort = port;
        const data = await res.json();
        return data || { success: true, status: 'ok' };
      }
    } catch (e) {}
    return null;
  };

  // Fast direct attempt to cachedActivePort (< 10ms)
  let postResult = null;
  if (cachedActivePort) {
    postResult = await tryPostToPort(cachedActivePort);
  }

  // If cached port failed or wasn't set, scan remaining ports
  if (!postResult) {
    const ports = [18420, 18421, 18422, 18423, 18424, 18425].filter(p => p !== cachedActivePort);
    for (const p of ports) {
      postResult = await tryPostToPort(p);
      if (postResult) break;
    }
  }

  if (postResult) {
    if (sendResponse) sendResponse(postResult);
    return;
  }

  // Never call native messaging for format queries - avoid blocking stalls
  if (isFormatQuery) {
    if (sendResponse) sendResponse({ success: false, status: 'error', message: 'Could not connect to SmartDM desktop app.' });
    return;
  }

  // 2. Fallback to Native Messaging Host for download requests if desktop app was launched via browser host
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response) => {
      if (chrome.runtime.lastError || !response || response.status === 'error') {
        if (sendResponse) sendResponse({ success: false, status: 'error', message: 'Could not connect to SmartDM desktop app.' });
      } else {
        if (sendResponse) sendResponse(response || { success: true, status: 'ok' });
      }
    });
  } catch (err) {
    if (sendResponse) sendResponse({ success: false, status: 'error', message: 'Could not connect to SmartDM desktop app.' });
  }
}

function getYouTubeCookiesHeader() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.getAll({ domain: 'youtube.com' }, (cookies) => {
        if (cookies && cookies.length > 0) {
          const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          resolve(cookieString);
        } else {
          resolve('');
        }
      });
    } else {
      resolve('');
    }
  });
}

function extractYtInitialPlayerResponse(text) {
  let searchStart = 0;
  while (true) {
    let idx = text.indexOf('ytInitialPlayerResponse', searchStart);
    if (idx < 0) break;
    searchStart = idx + 20;
    
    let firstBrace = text.indexOf('{', idx);
    if (firstBrace > idx && firstBrace < idx + 100) {
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
        try {
          let parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          if (parsed && parsed.streamingData) return parsed;
        } catch(e) {}
      }
    }
  }
  return null;
}

function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.searchParams.has('v')) {
      const v = u.searchParams.get('v');
      if (v && v.length >= 5) return v;
    }
    if (u.pathname.includes('/shorts/')) {
      const segs = u.pathname.split('/shorts/')[1].split('/');
      if (segs[0] && segs[0].length >= 5) return segs[0];
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('?')[0].split('/')[0];
      if (id && id.length >= 5) return id;
    }
  } catch (e) {}
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^?&#/]+)/) || url.match(/youtu\.be\/([^?&#/]+)/);
  if (match && match[1] && match[1].length >= 5) return match[1];
  return null;
}

async function fetchYouTubeFormatsInServiceWorker(videoUrl) {
  try {
    if (!videoUrl) return null;
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) return null;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/1.56.21 (Linux; U; Android 11)'
    };

    const parseFormats = (data) => {
      if (data && data.streamingData) {
        const videoDetails = data.videoDetails || {};
        const title = videoDetails.title || 'YouTube Video';
        const streamingData = data.streamingData;
        const formats = [];

        let defaultAudioUrl = null;
        let defaultAudioSize = 0;
        const adaptive = streamingData.adaptiveFormats || [];
        adaptive.forEach(f => {
          if ((f.mimeType || '').includes('audio/') && f.url && f.url.startsWith('http')) {
            if (!defaultAudioUrl || f.itag === 140) {
              defaultAudioUrl = f.url;
              defaultAudioSize = parseInt(f.contentLength || 0, 10);
            }
          }
        });

        const combined = streamingData.formats || [];
        combined.forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            formats.push({
              formatId: String(f.itag || ('fmt_' + formats.length)),
              resolution: f.qualityLabel || f.quality || '360p',
              ext: (f.mimeType || '').includes('webm') ? 'webm' : 'mp4',
              formatNote: 'Direct Video + Audio',
              fileSize: parseInt(f.contentLength || 0, 10),
              fps: f.fps || 30,
              isAudioOnly: false,
              title: title,
              url: f.url
            });
          }
        });

        adaptive.forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            const mime = (f.mimeType || '').toLowerCase();
            const isAudio = mime.includes('audio/');
            const isVideo = mime.includes('video/');
            const kbps = Math.round((f.bitrate || 0) / 1000);
            const videoSize = parseInt(f.contentLength || 0, 10);
            const totalSize = isVideo && defaultAudioSize > 0 ? videoSize + defaultAudioSize : videoSize;
            formats.push({
              formatId: String(f.itag || ('fmt_' + formats.length)),
              resolution: isAudio ? ('Audio Only (' + (kbps > 0 ? kbps + 'k' : '128k') + ')') : (f.qualityLabel || (f.height ? f.height + 'p' : 'Video')),
              ext: mime.includes('webm') ? (isAudio ? 'webm' : 'webm') : (isAudio ? 'm4a' : 'mp4'),
              formatNote: isAudio ? 'Audio Only Stream' : 'High Res Video',
              fileSize: totalSize,
              tbr: kbps,
              fps: f.fps || 0,
              isAudioOnly: isAudio,
              isVideoOnly: isVideo,
              title: title,
              url: f.url,
              audioUrl: (!isAudio && defaultAudioUrl) ? defaultAudioUrl : null
            });
          }
        });

        if (formats.length > 0) {
          // Append MP3 option
          formats.push({
            formatId: 'bestaudio/best',
            resolution: 'Audio (MP3 / High Quality)',
            ext: 'mp3',
            formatNote: 'MP3 High Quality',
            fileSize: defaultAudioSize,
            isAudioOnly: true,
            title: title,
            url: defaultAudioUrl
          });

          // Append HD Thumbnail option
          formats.push({
            formatId: 'thumbnail',
            resolution: 'Thumbnail (Cover Image / HD)',
            ext: 'jpg',
            formatNote: 'HD Cover Image',
            fileSize: 0,
            isAudioOnly: false,
            title: title,
            url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
          });

          return { success: true, status: 'ok', title: title, formats: formats };
        }
      }
      return null;
    };

    // 1. Primary: ANDROID_VR client (returns direct streaming URLs for all 26 adaptive resolutions)
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          videoId: videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: {
              clientName: 'ANDROID_VR',
              clientVersion: '1.56.21',
              androidSdkVersion: 32
            }
          }
        })
      });
      const data = await res.json();
      const parsed = parseFormats(data);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('ANDROID_VR fetch failed:', e);
    }

  } catch (e) {
    console.warn('Service worker YouTube fetch error:', e);
  }
  return null;
}

function sanitizeCleanTitle(str) {
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

function isGenericTitle(t) {
  if (!t || typeof t !== 'string') return true;
  let clean = t.replace(/\.[a-z0-9]+$/i, '').trim();
  clean = clean.replace(/^\(\d+\)\s*/, '').replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
  if (!clean || clean.length < 2) return true;

  const genericExact = new Set([
    'youtube', 'youtube music', 'home', 'feed', 'subscriptions', 'library',
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

  // File 12345 or File 12345 - MegaPlay or File_12345 or any file followed by digits
  if (/^file[\s_-]*\d+/i.test(clean)) return true;

  // Generic player embed titles like "MegaPlay - Player", "Kwik Player", etc.
  if (/^(?:kwik|megaplay|streamwish|vidcloud|upcloud|filemoon|doodstream|streamtape|mp4upload)\s*(?:[-_:]\s*)?(?:player|embed|stream|video)?$/i.test(clean)) return true;

  if (clean.includes('megaplay') || clean.includes('kwik') || clean.includes('streamwish') ||
      clean.includes('vidcloud') || clean.includes('upcloud') || clean.includes('filemoon') ||
      clean.includes('doodstream') || clean.includes('streamtape') || clean.includes('mp4upload')) {
    if (clean.startsWith('file') || clean.startsWith('player') || clean.startsWith('embed') || clean.startsWith('video') || clean.includes('server') || clean === 'megaplay' || clean === 'kwik') {
      return true;
    }
  }

  // Single word player tokens
  if (/^(?:player|embed|iframe|video)[\s_-]*\d*$/i.test(clean)) return true;

  return isOpaqueTokenOrHash(clean);
}

async function fetchPageMediaFormats(pageUrl) {
  try {
    const isFb = pageUrl && (pageUrl.includes('facebook.com') || pageUrl.includes('fb.watch'));
    if (isFb) return null; // Whole-page HTML contains unrelated recommended Reels.
    const fetchOpts = {
      credentials: 'include',
      headers: {
        'User-Agent': navigator.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    const res = await fetch(pageUrl, fetchOpts);
    if (!res.ok) return null;
    const html = await res.text();

    let title = 'video';
    const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (ogMatch && ogMatch[1]) {
      title = ogMatch[1].trim();
    } else {
      const tMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (tMatch && tMatch[1]) title = tMatch[1].trim();
    }
    title = sanitizeCleanTitle(title) || 'video';

    const formats = [];
    const seen = new Set();

    const addFmt = (u, q, ext = 'mp4') => {
      if (!u || typeof u !== 'string' || !u.startsWith('http')) return;
      if (u.includes('/video/get_media') || u.includes('/api/') || u.includes('/ajax/') || u.includes('/analytics') || u.endsWith('.json')) return;
      if (seen.has(u)) return;
      seen.add(u);
      const isHls = ext === 'm3u8' || u.includes('.m3u8');
      let qStr = (q && typeof q === 'string') ? q.trim() : (typeof q === 'number' ? String(q) : '');
      if (qStr && !qStr.endsWith('p') && /^\d+$/.test(qStr)) qStr += 'p';
      let qLabel = qStr || (isHls ? 'Master' : 'Video');
      const hNum = parseInt(qLabel, 10);
      if (hNum >= 720 && !qLabel.includes('HD')) qLabel += ' HD';
      qLabel += ' (MP4)';

      formats.push({
        formatId: 'tube_' + (qStr || formats.length),
        resolution: qLabel,
        height: hNum || (isHls ? 1080 : 720),
        ext: isHls ? 'm3u8' : (ext || 'mp4'),
        fileSize: 0,
        isAudioOnly: false,
        title: title,
        url: u,
        videoUrl: pageUrl,
        referer: pageUrl
      });

    };

    // 0. Universal OpenGraph / Twitter meta video tags
    const ogMatches = html.matchAll(/<meta\s+[^>]*(?:property|name)=["'](?:og:video(?::(?:url|secure_url))?|twitter:player:stream)["']\s+content=["']([^"']+)["']/gi);
    for (const m of ogMatches) {
      const u = m[1].replace(/&amp;/g, '&');
      if (u.startsWith('http')) addFmt(u, '720p', u.includes('.m3u8') ? 'm3u8' : 'mp4');
    }

    // 0b. Universal HTML5 <video> and <source> tags
    const srcMatches = html.matchAll(/<(?:video|source)\s+[^>]*src=["'](https?:\/\/[^"']+)["']/gi);
    for (const m of srcMatches) {
      const u = m[1].replace(/&amp;/g, '&');
      const resM = m[0].match(/(?:res|size|height)=["']?(\d+)/i);
      const q = resM ? resM[1] + 'p' : '720p';
      addFmt(u, q, u.includes('.m3u8') ? 'm3u8' : 'mp4');
    }

    // 1. Pornhub / MindGeek mediaDefinitions
    if (html.includes('mediaDefinitions')) {
      const idx = html.indexOf('mediaDefinitions');
      const start = html.indexOf('[', idx);
      if (start >= 0) {
        let openCount = 0, last = -1;
        for (let i = start; i < html.length; i++) {
          if (html[i] === '[') openCount++;
          else if (html[i] === ']') {
            openCount--;
            if (openCount === 0) { last = i; break; }
          }
        }
        if (last > start) {
          try {
            const list = JSON.parse(html.substring(start, last + 1));
            if (Array.isArray(list)) {
              list.forEach(item => {
                if (item && item.videoUrl && !item.remote && !item.videoUrl.includes('/video/get_media')) {
                  let q = item.quality;
                  if (Array.isArray(q)) q = null;
                  addFmt(item.videoUrl, q || (item.format === 'hls' ? 'Master' : '720p'), item.format);
                }
              });
            }
          } catch(e) {}
        }
      }
    }

    // 2. XVideos / XNXX html5player
    if (html.includes('html5player.setVideo')) {
      const high = html.match(/html5player\.setVideoUrlHigh\(['"]([^'"]+)['"]\)/);
      if (high) addFmt(high[1], '720p', 'mp4');
      const low = html.match(/html5player\.setVideoUrlLow\(['"]([^'"]+)['"]\)/);
      if (low) addFmt(low[1], '360p', 'mp4');
      const hls = html.match(/html5player\.setVideoHLS\(['"]([^'"]+)['"]\)/);
      if (hls) addFmt(hls[1], 'Master', 'm3u8');
    }

    // 3. SpankBang & Generic Tube
    const qMatches = html.matchAll(/["']?(?:quality_)?(2160p?|1440p?|1080p?|720p?|480p?|360p?|240p?|144p?)["']?\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/gi);
    for (const m of qMatches) {
      addFmt(m[2], m[1], m[2].includes('.m3u8') ? 'm3u8' : 'mp4');
    }

    // 4. XHamster sources
    if (html.includes('xplayerSettings') || html.includes('sources')) {
      const srcMatches = html.matchAll(/["']?(2160p?|1440p?|1080p?|720p?|480p?|360p?|240p?|144p?|hls)["']?\s*:\s*["'](https?:\/\/[^"']+)["']/gi);
      for (const m of srcMatches) {
        if (m[2].includes('http') && (m[2].includes('.mp4') || m[2].includes('.m3u8'))) {
          addFmt(m[2], m[1], m[2].includes('.m3u8') ? 'm3u8' : 'mp4');
        }
      }
    }

    // 5. Facebook video / reel / watch / post permalink
    const isFbUrl = pageUrl && (pageUrl.includes('facebook.com') || pageUrl.includes('fb.watch'));
    if (isFbUrl) {
      // 1. Check DASH manifest FIRST for complete multi-quality ladder (1440p, 1080p, 720p, 640p, 540p, 480p, 360p)
      if (html.includes('dash_manifest')) {
        const rawXml = extractDashManifestFromText(html);
        if (rawXml) {
          try {
            const mpdFmts = parseMpdFormats(rawXml, pageUrl);
            if (mpdFmts && mpdFmts.length > 0) {
              mpdFmts.forEach(f => {
                f.title = title;
                formats.push(f);
              });
              return { success: true, status: 'ok', title: title, formats: formats };
            }
          } catch(e) {}
        }
      }

      let fbHdUrl = null;
      let fbSdUrl = null;

      const hdMatches = html.matchAll(/(?:"playable_url_quality_hd"|"browser_native_hd_url"|"hd_src"|"hd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
      for (const m of hdMatches) {
        const u = m[1].replace(/\\\/+/g, '/').replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (u.startsWith('http') && !fbHdUrl) fbHdUrl = u;
      }

      const sdMatches = html.matchAll(/(?:"playable_url"|"browser_native_sd_url"|"sd_src"|"sd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
      for (const m of sdMatches) {
        const u = m[1].replace(/\\\/+/g, '/').replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (u.startsWith('http') && !fbSdUrl) fbSdUrl = u;
      }

      const bestFbUrl = fbHdUrl || fbSdUrl;
      if (bestFbUrl) {
        const ladder = [
          { id: '1440p', label: '1440p Quad HD (MP4)',  h: 1440, url: fbHdUrl || bestFbUrl },
          { id: '1080p', label: '1080p Full HD (MP4)',  h: 1080, url: fbHdUrl || bestFbUrl },
          { id: '720p',  label: '720p HD (MP4)',        h: 720,  url: fbHdUrl || bestFbUrl },
          { id: '640p',  label: '640p (MP4)',           h: 640,  url: fbHdUrl || bestFbUrl },
          { id: '540p',  label: '540p (MP4)',           h: 540,  url: fbSdUrl || bestFbUrl },
          { id: '480p',  label: '480p SD (MP4)',        h: 480,  url: fbSdUrl || bestFbUrl },
          { id: '360p',  label: '360p SD (MP4)',        h: 360,  url: fbSdUrl || bestFbUrl }
        ];

        const availableLadder = fbHdUrl ? ladder : ladder.filter(tier => tier.h <= 720);
        availableLadder.forEach(tier => {
          formats.push({
            formatId: 'fb_' + tier.id,
            resolution: tier.label,
            height: tier.h,
            ext: 'mp4',
            fileSize: 0,
            isAudioOnly: false,
            title: title,
            url: tier.url,
            videoUrl: tier.url,
            audioUrl: null
          });
        });

        formats.push({
          formatId: 'fb_audio',
          resolution: 'Audio (MP3 / High Quality)',
          height: -1,
          ext: 'mp3',
          fileSize: 0,
          isAudioOnly: true,
          title: title,
          url: bestFbUrl,
          videoUrl: null,
          audioUrl: bestFbUrl
        });

        return { success: true, status: 'ok', title: title, formats: formats };
      }
    }

    formats.sort((a, b) => (b.height || 0) - (a.height || 0));
    if (formats.length > 0) {
      return { success: true, status: 'ok', title: title, formats: formats };
    }
  } catch(e) {
    console.warn('fetchPageMediaFormats error:', e);
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_DETECTED_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : lastActiveTabId;
    if (request.currentUrl && tabId) {
      tabUrlMap.set(tabId, request.currentUrl);
    }
    let media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    // Return newest media streams first so the currently active/played video is prioritized
    const sortedMedia = media.slice().reverse();
    sendResponse({
      success: true,
      media: sortedMedia,
      tabTitle: (sender.tab && sender.tab.title) ? sender.tab.title : (tabId ? tabTitleMap.get(tabId) : null),
      tabUrl: tabId ? (tabUrlMap.get(tabId) || (sender.tab && sender.tab.url ? sender.tab.url : null)) : null
    });
    return false;
  }

  if (request.type === 'GET_PAGE_MEDIA_FORMATS') {
    const pageUrl = request.url;
    fetchPageMediaFormats(pageUrl).then(pageRes => {
      sendResponse(pageRes || { success: false, status: 'error', message: 'Could not extract page media formats.' });
    }).catch(err => {
      sendResponse({ success: false, status: 'error', message: err ? err.message : 'Error' });
    });
    return true; // Async response
  }

  if (request.type === 'GET_MEDIA_FORMATS' || request.action === 'extractMediaInfo') {
    const url = request.url;
    const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));

    if (isYouTube) {
      // Query SmartDM desktop app first (native YoutubeExplode + Innertube engine)
      appendCookiesAndSend({ type: 'GET_MEDIA_FORMATS', url: url }, (desktopRes) => {
        if (desktopRes && (desktopRes.status === 'ok' || desktopRes.success) && desktopRes.formats && desktopRes.formats.length > 0) {
          sendResponse(desktopRes);
        } else {
          fetchYouTubeFormatsInServiceWorker(url).then(ytRes => {
            if (ytRes && ytRes.formats && ytRes.formats.length > 0) {
              sendResponse(ytRes);
            } else {
              sendResponse(desktopRes || { success: false, status: 'error', message: 'Could not extract YouTube formats.' });
            }
          }).catch(() => {
            sendResponse(desktopRes || { success: false, status: 'error', message: 'Could not extract YouTube formats.' });
          });
        }
      });
      return true; // Async response for YouTube
    }

    // For all non-YouTube sites (Pornhub, Facebook, Vimeo, Twitter/X, Dailymotion, etc.):
    // INSTANT (0ms) response from memory graph without desktop polling or native messaging hang!
    const tabId = sender.tab ? sender.tab.id : null;
    let media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    sendResponse({ success: true, status: 'ok', media: media });
    return false; // Instant synchronous response
  }

  if (request.type === 'RESOLVE_M3U8_VARIANTS') {
    let effectiveBaseUrl = request.url;
    const tabId = (sender && sender.tab && sender.tab.id) || lastActiveTabId;
    const tabUrl = (sender && sender.tab && sender.tab.url) || null;
    const cachedHeaders = getCachedStreamHeaders(effectiveBaseUrl);
    const initiator = (cachedHeaders && cachedHeaders.referer) || (sender && sender.tab && sender.tab.url) || null;
    (async () => {
      let text = await fetchM3u8Text(effectiveBaseUrl, tabUrl, initiator);
      if ((text && !text.includes('#EXT-X-STREAM-INF') && text.includes('#EXTINF')) || !text) {
        const candidates = [];
        const addCand = (cand) => {
          if (cand && cand !== effectiveBaseUrl && !candidates.includes(cand)) {
            candidates.push(cand);
          }
        };
        addCand(effectiveBaseUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
        addCand(effectiveBaseUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
        addCand(effectiveBaseUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
        addCand(effectiveBaseUrl.replace(/[-_]?(?:f\d+|v\d+|a\d+|\d+p|\d+)(?=\.m3u8)/i, ''));
        const parentMatch = effectiveBaseUrl.match(/\/([^\/?#]+)\/[^\/?#]+\.m3u8(?:\?[^#]*)?$/i);
        if (parentMatch) {
          const parentDir = parentMatch[1];
          const isSecurityToken = parentDir.length > 16 || (parentDir.length >= 8 && /^[a-f0-9]{8,}$|^[a-zA-Z0-9_\-]{20,}$/i.test(parentDir));
          if (!isSecurityToken) {
            addCand(effectiveBaseUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
            addCand(effectiveBaseUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
            addCand(effectiveBaseUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
          }
        }

        for (const candUrl of candidates) {
          const parentText = await fetchM3u8Text(candUrl, tabUrl, initiator);
          if (parentText && parentText.includes('#EXT-X-STREAM-INF')) {
            text = parentText;
            effectiveBaseUrl = candUrl;
            break;
          }
        }
      }

      // If in-extension fetch did not yield master variants (e.g. cross-origin referrer blocked by browser),
      // query SmartDM Desktop App IPC which has full C# HttpClient capabilities with 0 CORS restrictions
      if (!text || !text.includes('#EXT-X-STREAM-INF')) {
        try {
          const desktopRes = await postToDesktopApp({
            type: 'RESOLVE_M3U8_VARIANTS',
            url: effectiveBaseUrl,
            referer: initiator,
            userAgent: navigator.userAgent
          });
          if (desktopRes && (desktopRes.status === 'ok' || desktopRes.success) && desktopRes.formats && desktopRes.formats.length > 0) {
            const itemReferer = (cachedHeaders && cachedHeaders.referer) || tabUrl || initiator || null;
            const itemOrigin = (cachedHeaders && cachedHeaders.origin) || (itemReferer ? new URL(itemReferer).origin : null);
            const rawTabTitle = (sender && sender.tab && sender.tab.title) || (tabId ? tabTitleMap.get(tabId) : null);
            const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
            const authoritativeTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;

            const variants = desktopRes.formats.map(f => {
              const h = f.height || extractResolutionNumber(f.resolution || f.directUrl || f.url) || 0;
              const resLabel = f.resolution || getResolutionLabel(h, 'MP4');
              return {
                formatId: f.formatId || (h > 0 ? `hls_${h}p` : 'hls_stream'),
                resolution: resLabel,
                title: authoritativeTitle || resLabel,
                badge: `${h}p`,
                url: f.directUrl || f.url,
                videoUrl: f.directUrl || f.url,
                audioUrl: null,
                height: h,
                ext: 'mp4',
                isAudioOnly: false,
                referer: itemReferer,
                origin: itemOrigin
              };
            });

            if (tabId) {
              if (!detectedMediaMap.has(tabId)) {
                detectedMediaMap.set(tabId, []);
              }
              const mediaList = detectedMediaMap.get(tabId);
              let addedAny = false;
              variants.forEach(v => {
                const finalTitle = (!v.title || isGenericTitle(v.title)) ? (authoritativeTitle || v.title || 'Video') : v.title;
                const existing = mediaList.find(m => m.url === v.url || (m.contentType?.includes('mpegurl') && m.height > 0 && v.height > 0 && m.height === v.height));
                if (!existing) {
                  pushToMediaList(mediaList, {
                    url: v.url,
                    contentType: 'application/x-mpegurl',
                    contentLength: 0,
                    filename: finalTitle + '.mp4',
                    customTitle: finalTitle,
                    customBadge: v.badge || `${v.height}p`,
                    height: v.height || 0,
                    bandwidth: v.bandwidth || 0,
                    referer: itemReferer,
                    origin: itemOrigin,
                    timestamp: Date.now()
                  });
                  addedAny = true;
                }
              });
              if (addedAny) broadcastNewMedia(tabId, mediaList);
            }

            sendResponse({ success: true, status: 'ok', formats: variants });
            return;
          }
        } catch(e) {}
      }

      if (text && text.includes('#EXT-X-STREAM-INF')) {
        const variants = parseM3u8Formats(text, effectiveBaseUrl);
        if (variants && variants.length > 0) {
          const itemReferer = (cachedHeaders && cachedHeaders.referer) || tabUrl || null;
          const itemOrigin = (cachedHeaders && cachedHeaders.origin) || (itemReferer ? new URL(itemReferer).origin : null);
          const rawTabTitle = (sender && sender.tab && sender.tab.title) || (tabId ? tabTitleMap.get(tabId) : null);
          const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
          const authoritativeTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;

          variants.forEach(v => {
            v.referer = itemReferer;
            v.origin = itemOrigin;
          });

          // Also register variants into tab's mediaList so GET_DETECTED_MEDIA has them immediately!
          if (tabId) {
            if (!detectedMediaMap.has(tabId)) {
              detectedMediaMap.set(tabId, []);
            }
            const mediaList = detectedMediaMap.get(tabId);
            let addedAny = false;
            variants.forEach(v => {
              const finalTitle = (!v.title || isGenericTitle(v.title)) ? (authoritativeTitle || v.title || 'Video') : v.title;
              const existing = mediaList.find(m => m.url === v.url || (m.contentType?.includes('mpegurl') && m.height > 0 && v.height > 0 && m.height === v.height));
              if (!existing) {
                pushToMediaList(mediaList, {
                  url: v.url,
                  contentType: 'application/x-mpegurl',
                  contentLength: 0,
                  filename: finalTitle + '.mp4',
                  customTitle: finalTitle,
                  customBadge: v.badge || `${v.height}p`,
                  height: v.height || 0,
                  bandwidth: v.bandwidth || 0,
                  referer: itemReferer,
                  origin: itemOrigin,
                  timestamp: Date.now()
                });
                addedAny = true;
              }
            });
            if (addedAny) broadcastNewMedia(tabId, mediaList);
          }

          sendResponse({ success: true, status: 'ok', formats: variants });
          return;
        }
      }
      sendResponse({ success: false, status: 'error' });
    })().catch(() => sendResponse({ success: false, status: 'error' }));
    return true; // Async response
  }

  if (request.type === 'REGISTER_M3U8_VARIANTS') {
    const tabId = (sender && sender.tab && sender.tab.id) || lastActiveTabId;
    if (tabId && request.formats && request.formats.length > 0) {
      if (!detectedMediaMap.has(tabId)) {
        detectedMediaMap.set(tabId, []);
      }
      const mediaList = detectedMediaMap.get(tabId);
      let addedAny = false;
      const cachedHeaders = getCachedStreamHeaders(request.masterUrl);
      const itemReferer = (cachedHeaders && cachedHeaders.referer) || (sender && sender.tab && sender.tab.url) || null;
      const itemOrigin = (cachedHeaders && cachedHeaders.origin) || (itemReferer ? new URL(itemReferer).origin : null);

      const rawTabTitle = (sender && sender.tab && sender.tab.title) || tabTitleMap.get(tabId) || null;
      const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
      const authoritativeTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;

      request.formats.forEach(v => {
        const fRef = v.referer || itemReferer;
        const fOrig = v.origin || itemOrigin;
        const finalTitle = (!v.title || isGenericTitle(v.title)) ? (authoritativeTitle || v.title || 'Video') : v.title;
        const existing = mediaList.find(m => m.url === v.url || (m.contentType?.includes('mpegurl') && m.height > 0 && v.height > 0 && m.height === v.height));
        if (!existing) {
          pushToMediaList(mediaList, {
            url: v.url,
            contentType: 'application/x-mpegurl',
            contentLength: 0,
            filename: finalTitle + '.mp4',
            customTitle: finalTitle,
            customBadge: v.badge || `${v.height}p`,
            height: v.height || 0,
            bandwidth: v.bandwidth || 0,
            referer: fRef,
            origin: fOrig,
            timestamp: Date.now()
          });
          addedAny = true;
        } else {
          if (v.height > 0 && (!existing.height || existing.height <= 0)) {
            existing.height = v.height;
            existing.customBadge = v.badge || `${v.height}p`;
            addedAny = true;
          }
          if (authoritativeTitle && (!existing.customTitle || isGenericTitle(existing.customTitle))) {
            existing.customTitle = authoritativeTitle;
            existing.filename = authoritativeTitle + '.mp4';
            addedAny = true;
          }
          if (fRef && !existing.referer) existing.referer = fRef;
          if (fOrig && !existing.origin) existing.origin = fOrig;
          existing.timestamp = Date.now();
        }
      });
      if (addedAny) broadcastNewMedia(tabId, mediaList);
    }
    sendResponse({ success: true, status: 'ok' });
    return false;
  }

  if (request.type === 'START_MEDIA_DOWNLOAD' || request.type === 'ADD_BATCH' || request.type === 'ADD_MEDIA_BATCH' || request.type === 'ADD_DOWNLOAD') {
    const tabId = (sender && sender.tab && sender.tab.id) || lastActiveTabId;
    const rawTabTitle = (sender && sender.tab && sender.tab.title) || (tabId ? tabTitleMap.get(tabId) : null);
    const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
    if (cleanTabTitle && !isGenericTitle(cleanTabTitle)) {
      if (!request.title || isGenericTitle(request.title)) {
        request.title = cleanTabTitle;
      }
      if (!request.fileName || isGenericTitle(request.fileName)) {
        const ext = (request.formatId && request.formatId.includes('bestaudio')) ? 'mp3' : (request.ext || 'mp4');
        request.fileName = `${cleanTabTitle}.${ext}`;
      }
      if (Array.isArray(request.formats)) {
        request.formats.forEach(f => {
          if (!f.title || isGenericTitle(f.title)) {
            f.title = cleanTabTitle;
          }
        });
      }
    }
    if (request.title && !isGenericTitle(request.title)) {
      if (!request.fileName || isGenericTitle(request.fileName)) {
        const ext = (request.formatId && request.formatId.includes('bestaudio')) ? 'mp3' : (request.ext || 'mp4');
        request.fileName = `${request.title}.${ext}`;
      }
    }
    appendCookiesAndSend(request, sendResponse);
    return true; // Async response
  }
});

function sendToSmartDM(url, referer, fileName = null) {
  const message = {
    type: 'ADD_DOWNLOAD',
    url: url,
    fileName: fileName,
    referer: referer || null,
    userAgent: navigator.userAgent
  };
  
  console.log('Sending message to native host:', message);
  appendCookiesAndSend(message, null);
}

const bypassedDownloads = new Set();

if (chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener((downloadItem) => {
    if (downloadItem.state !== 'in_progress') return;
    if (downloadItem.byExtensionId || bypassedDownloads.has(downloadItem.url)) {
      return;
    }
    
    if (downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) {
      return;
    }

    // Cancel and erase browser download IMMEDIATELY to prevent browser history/UI pollution
    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.downloads.erase) {
        chrome.downloads.erase({ id: downloadItem.id }, () => {});
      }
    });
    if (chrome.downloads.erase) {
      chrome.downloads.erase({ id: downloadItem.id }, () => {});
    }

    let basename = downloadItem.filename ? downloadItem.filename.split(/[\\/]/).pop() : '';
    if (basename) {
      const lower = basename.toLowerCase();
      if (lower === 'video.mp4' || lower === 'download.php' || lower === 'download.asp' ||
          lower === 'download.aspx' || lower === 'file.php' || lower === 'index.php' ||
          lower.startsWith('unconfirmed') || lower.endsWith('.crdownload') || lower.endsWith('.tmp')) {
        basename = null;
      }
    }

    const message = {
      type: 'ADD_DOWNLOAD',
      url: downloadItem.finalUrl || downloadItem.url,
      fileName: basename || null,
      referer: downloadItem.referrer || null,
      userAgent: navigator.userAgent
    };

    appendCookiesAndSend(message, (response) => {
      if (chrome.runtime.lastError || !response || (response.status !== 'ok' && !response.success)) {
        console.error("SmartDM unavailable, resuming standard download...", chrome.runtime.lastError);
        bypassedDownloads.add(downloadItem.url);
        
        let dlOptions = {
          url: downloadItem.url,
          saveAs: true
        };
        if (basename && basename.length > 0) {
            dlOptions.filename = basename;
        }
        chrome.downloads.download(dlOptions);
        
        setTimeout(() => bypassedDownloads.delete(downloadItem.url), 15000);
      }
    });
  });
}
