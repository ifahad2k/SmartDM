const NATIVE_HOST_NAME = 'io.smartdm.host';
const detectedMediaMap = new Map(); // tabId -> Array<{ url, type, contentType, contentLength }>
const tabUrlMap = new Map(); // tabId -> url
const tabTitleMap = new Map(); // tabId -> title
const probedM3u8Urls = new Set(); // url -> boolean (prevents duplicate manifest probing loops)
const ytBackgroundFormatCache = new Map(); // cacheKey -> { data, expiresAt }
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
          if (oldU.origin !== newU.origin || (oldU.pathname !== newU.pathname && !tab.url.includes('facebook.com') && !oldUrl.includes('facebook.com') && !tab.url.includes('instagram.com') && !oldUrl.includes('instagram.com'))) {
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

const streamHeadersCache = new Map(); // url -> { referer, origin, userAgent, cookie }
const domainHeadersCache = new Map(); // domain -> { referer, origin, userAgent, cookie }

function getCachedStreamHeaders(url) {
  if (!url) return null;
  if (streamHeadersCache.has(url)) return {...streamHeadersCache.get(url), exact: true};
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname;
    if (domainHeadersCache.has(domain)) { const {cookie, ...safeHeaders} = domainHeadersCache.get(domain); return {...safeHeaders, exact: false}; }
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
  const isFb = !!newItem.fbVideoId || (newItem.url && (newItem.url.includes('fbcdn.net') || newItem.url.includes('facebook.com') || newItem.url.includes('fbsbx.com') || newItem.url.includes('cdninstagram.com') || newItem.url.includes('instagram.com')));
  const existingIdx = mediaList.findIndex((m) => {
    if (m.url === newItem.url) return true;
    const isMAudio = !!m.isAudio || (m.contentType && m.contentType.includes('audio/'));
    if (isNewAudio !== isMAudio) return false;

    // For Facebook media: deduplicate only if exact same fbVideoId and same audio/video track role
    if (isFb && newItem.fbVideoId && m.fbVideoId) {
      return m.fbVideoId === newItem.fbVideoId;
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
    if (newItem.audioUrl && !existing.audioUrl) {
      existing.audioUrl = newItem.audioUrl;
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

// Preserve the browser's original entry point across redirects. A signed CDN
// destination may reject a fresh direct request while the observed entry point
// remains valid. Identity comes from this request's redirect chain, never a tab.
const mediaRedirectEntries = new Map();
chrome.webRequest?.onBeforeRedirect?.addListener(details => {
  if (!details.requestId || !/^https?:\/\//i.test(details.url || '')) return;
  const old = mediaRedirectEntries.get(details.requestId);
  if (!old || Date.now() - old.at > 60000) mediaRedirectEntries.set(details.requestId, {url: details.url, at: Date.now(), tabId: details.tabId});
  while (mediaRedirectEntries.size > 100) mediaRedirectEntries.delete(mediaRedirectEntries.keys().next().value);
}, {urls: ['<all_urls>']});
const forgetRedirect = details => mediaRedirectEntries.delete(details.requestId);
chrome.webRequest?.onCompleted?.addListener(forgetRedirect, {urls: ['<all_urls>']});
chrome.webRequest?.onErrorOccurred?.addListener(forgetRedirect, {urls: ['<all_urls>']});

// Intercept network requests for video/audio streams
if (chrome.webRequest && chrome.webRequest.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      let targetTabId = details.tabId;
      if (!targetTabId || targetTabId <= 0) {
        targetTabId = lastActiveTabId;
      }
      if (!targetTabId || targetTabId <= 0) return;

      // A failed preload is not an available media rendition.
      if (typeof details.statusCode === 'number' && (details.statusCode < 200 || details.statusCode >= 300)) return;
      const redirected = mediaRedirectEntries.get(details.requestId);
      const originalUrl = redirected && redirected.tabId === details.tabId && Date.now() - redirected.at <= 60000 ? redirected.url : null;
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

      // Filter out HLS/DASH segment chunks (preserve full stream URLs)
      const isGoogleVideo = url.includes('videoplayback') || url.includes('googlevideo.com');
      const isM3u8OrMpd = url.includes('.m3u8') || url.includes('.mpd');
      const isManifestPath = /(?:stream-embed\/(?:playlist|media)|\/(?:playlists?|manifests?|master|hls|dash|streams?|sources?|prox(?:y|ies)|embeds?|videos?|media|play(?:back)?|prorcp|chunklists?|vod|live|file|serve)(?:[?#/]|$)|[?&](?:format=m3u8|type=m3u8|source=m3u8|file=.*\.m3u8))/i.test(url) || url.includes('/stream-embed/');

      // Exclude web assets, images, scripts, stylesheets, fonts, archives, torrents, executables, wasm
      if (contentType.includes('image/') || contentType.includes('wasm') || contentType.includes('text/css')) return;
      if (contentType.includes('javascript') && !isManifestPath && !isM3u8OrMpd) return;
      const isNonMediaAsset = (!isManifestPath && !isM3u8OrMpd) && (url.includes('.js') || url.includes('.css') || url.includes('.jpg') ||
                              url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') ||
                              url.includes('.svg') || url.includes('.webp') || url.includes('.avif') ||
                              url.includes('.json') || url.includes('.woff') || url.includes('.woff2') ||
                              url.includes('.html') || url.includes('.ico') || url.includes('.webmanifest') ||
                              url.includes('.wasm') || url.includes('.map') ||
                              url.includes('.torrent') || url.includes('.rar') ||
                              url.includes('.zip') || url.includes('.7z') || url.includes('.tar') ||
                              url.includes('.gz') || url.includes('.iso') || url.includes('.exe') ||
                              url.includes('.msi') || url.includes('.pdf') || contentType.includes('bittorrent') ||
                              contentType.includes('zip') || contentType.includes('x-rar'));
      if (isNonMediaAsset) return;

      // Filter out tiny video tracking beacons, range probes, and init fragments (< 64KB)
      // Never drop Facebook media chunks since Facebook audio init fragments and DASH chunks can be < 64KB
      const isFbMedia = url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('fbsbx.com') || url.includes('facebook.net') || url.includes('cdninstagram.com') || url.includes('instagram.com');
      const tabUrlForCheck = (details.tabId && tabUrlMap.get(details.tabId)) || '';
      const initiatorForCheck = details.initiator || details.originUrl || details.documentUrl || tabUrlForCheck || '';
      const isBiliMedia = url.includes('bilivideo.com') || url.includes('bilibili.com') || url.includes('bilibili.tv') || url.includes('biliapi.net') || url.includes('ibilibili.com') || initiatorForCheck.includes('bilibili.com') || initiatorForCheck.includes('bilibili.tv') || ((url.includes('akamaized.net') || url.includes('byteoversea.com') || url.includes('upos')) && (initiatorForCheck.includes('bilibili') || tabUrlForCheck.includes('bilibili')));
      if (!isFbMedia && !isBiliMedia && contentType.includes('video/') && contentLength > 0 && contentLength < 65536 && !contentRangeTotal) {
        return;
      }

      // Ignore small UI sound effects (< 300KB or audio files named success/failure/no_input/open)
      if (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg')) {
        if (contentLength > 0 && contentLength < 300 * 1024) return;
        if (url.includes('success') || url.includes('failure') || url.includes('no_input') || url.includes('open') || url.includes('sound')) return;
      }

      const isSegmentChunk = !isGoogleVideo && !isM3u8OrMpd && !isFbMedia && !isBiliMedia && !isManifestPath && (
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

      if (isGoogleVideo) {
        if (!contentLength || contentLength === 0) {
          const clenMatch = targetUrl.match(/[?&]clen=(\d+)/);
          if (clenMatch) contentLength = parseInt(clenMatch[1], 10);
        }
      }

      const isDisguisedManifest = isManifestPath && (contentType.includes('text/plain') || contentType.includes('octet-stream') || contentType.includes('javascript') || !contentType);

      const isMediaMime = contentType.includes('video/') ||
                          contentType.includes('audio/') ||
                          contentType.includes('application/x-mpegurl') ||
                          contentType.includes('application/vnd.apple.mpegurl') ||
                          contentType.includes('application/dash+xml') ||
                          isDisguisedManifest;

      const isMediaExt = isManifestPath || url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd') ||
                         url.includes('.webm') || url.includes('.mp3') || url.includes('.m4a') ||
                         url.includes('.flv') || url.includes('.mov') || url.includes('.m4v') ||
                         url.includes('.avi') || url.includes('.mkv') || (isBiliMedia && url.includes('.m4s'));

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
        const isHlsManifest = targetUrl.includes('.m3u8') || /mpegurl/i.test(contentType) || isManifestPath || isDisguisedManifest;
        if (isHlsManifest) {
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
              if (targetUrl.includes('/stream-embed/')) {
                addCand(targetUrl.replace(/\/stream-embed\/media\//i, '/stream-embed/playlist/'));
              }
              addCand(targetUrl.replace(/\/media\//i, '/playlist/'));

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
                    audioUrl: v.audioUrl || null,
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
                  if (v.audioUrl && !existing.audioUrl) {
                    existing.audioUrl = v.audioUrl;
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
                  bandwidth: 0,
                  referer: itemReferer,
                  origin: itemOrigin,
                  mediaKind: 'hls',
                  manifestText: isCompleteHlsMediaPlaylist(text) ? text : null,
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
              if (targetTabId && targetTabId > 0) {
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

            if (targetTabId && targetTabId > 0) {
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
          fetchM3u8Text(targetUrl, tabUrl, initiatorUrl)
            .then((text) => { if (!text) throw new Error('Manifest unavailable within discovery limits.'); return text; })
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
            const isInsta = targetUrl.includes('cdninstagram.com') || targetUrl.includes('instagram.com') || (tabUrl && tabUrl.includes('instagram.com'));
            if (isFbAudio) {
              badge = 'Audio Stream';
              customTitle = 'Audio Stream (MP3 / High Quality)';
              title = isInsta ? 'instagram_audio.mp4' : 'facebook_audio.mp4';
            } else {
              badge = isInsta ? 'Instagram Video' : 'Facebook Video';
              customTitle = 'Video Stream (MP4)';
              title = isInsta ? 'instagram_video.mp4' : 'facebook_video.mp4';
            }
          } else if (isBiliMedia) {
            let biliH = resH || extractResolutionNumber(targetUrl);
            if (!biliH) {
              if (targetUrl.includes('30127') || /[?&_-](?:qn|quality)=?127\b/.test(targetUrl)) biliH = 4320;
              else if (targetUrl.includes('30120') || targetUrl.includes('30125') || targetUrl.includes('30126') || targetUrl.includes('2160') || /[?&_-](?:qn|quality)=?(?:120|125|126)\b/.test(targetUrl)) biliH = 2160;
              else if (targetUrl.includes('30116') || targetUrl.includes('30112') || targetUrl.includes('30080') || targetUrl.includes('1080') || /[?&_-](?:qn|quality)=?(?:80|112|116)\b/.test(targetUrl)) biliH = 1080;
              else if (targetUrl.includes('30074') || targetUrl.includes('30064') || targetUrl.includes('720') || /[?&_-](?:qn|quality)=?(?:64|74)\b/.test(targetUrl)) biliH = 720;
              else if (targetUrl.includes('30032') || targetUrl.includes('480') || /[?&_-](?:qn|quality)=?32\b/.test(targetUrl)) biliH = 480;
              else if (targetUrl.includes('30016') || targetUrl.includes('360') || /[?&_-](?:qn|quality)=?16\b/.test(targetUrl)) biliH = 360;
              else if (targetUrl.includes('30006') || targetUrl.includes('240') || /[?&_-](?:qn|quality)=?6\b/.test(targetUrl)) biliH = 240;
              else if (targetUrl.includes('30001') || targetUrl.includes('30144') || targetUrl.includes('144') || /[?&_-](?:qn|quality)=?(?:1|144)\b/.test(targetUrl)) biliH = 144;
            }
            if (biliH > 0) resH = biliH;
            const isBiliAud = isFinalAudio || (contentType && contentType.includes('audio/')) || targetUrl.includes('/audio/') || targetUrl.includes('audio.m4s') || /302(16|32|80)\.m4s/i.test(targetUrl);
            if (isBiliAud) isFinalAudio = true;
            badge = isBiliAud ? 'Audio Stream' : (resH > 0 ? `${resH}p` : 'Bilibili Video');
            customTitle = isBiliAud ? 'Audio Stream (MP3 / High Quality)' : (resH > 0 ? getResolutionLabel(resH, 'MP4', false) : 'Bilibili Video');
            title = (authoritativeTabTitle || (isBiliAud ? 'bilibili_audio' : 'bilibili_video')) + (isBiliAud ? '.mp3' : '.mp4');
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
            originalUrl,
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
            probeMediaSize(targetUrl, itemReferer).then(total => {
              if (total > 0) {
                mediaItem.contentLength = total;
                broadcastNewMedia(targetTabId, mediaList);
              }
            }).catch(() => {});
          }
        } else {
          // If the stream URL was already detected, update its activity timestamp and metadata
          const existing = mediaList.find((m) => m.url === targetUrl);
          if (existing) {
            existing.timestamp = Date.now();
            let changed = false;
            if (originalUrl && existing.originalUrl !== originalUrl) { existing.originalUrl = originalUrl; changed = true; }
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

if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'download-link') {
      let url = info.linkUrl || info.srcUrl || info.pageUrl;
      if (url) {
        sendToSmartDM(url, tab ? tab.url : null);
      }
    }
  });
}

let cachedActivePort = 18420;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_MEDIA_SIZE') {
    if (!sender || sender.id !== chrome.runtime.id) { sendResponse({success:false}); return false; }
    Promise.all([probeMediaSize(request.url, request.referer), request.audioUrl ? probeMediaSize(request.audioUrl, request.referer) : 0])
      .then(([video, audio]) => {
        const total = video + audio, success = video > 0 && (!request.audioUrl || audio > 0) && Number.isSafeInteger(total);
        sendResponse({success, fileSize:success ? total : 0});
      })
      .catch(() => sendResponse({success:false}));
    return true;
  }
  if (request.type === 'UPDATE_TAB_TITLE' || request.type === 'SET_TAB_TITLE') {
    const tabId = (sender && sender.tab) ? sender.tab.id : (request.tabId || lastActiveTabId);
    if (tabId && request.title && !isGenericTitle(request.title)) {
      tabTitleMap.set(tabId, request.title);
      // Retroactively update existing detected media in this tab if their title was generic
      const mediaList = detectedMediaMap.get(tabId);
      if (Array.isArray(mediaList)) {
        let updatedAny = false;
        for (const item of mediaList) {
          if (!item.title || isGenericTitle(item.title) || !item.customTitle || isGenericTitle(item.customTitle) || isGenericTitle(item.filename) || isGenericTitle(item.fileName)) {
            item.title = request.title;
            item.customTitle = request.title;
            item.filename = `${sanitizeCleanTitle(request.title)}.mp4`;
            item.fileName = `${sanitizeCleanTitle(request.title)}.mp4`;
            updatedAny = true;
          }
        }
        if (updatedAny) broadcastNewMedia(tabId, mediaList);
      }
    }
    if (tabId && request.url) {
      tabUrlMap.set(tabId, request.url);
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'GET_DETECTED_MEDIA' || request.type === 'GET_TAB_MEDIA') {
    const tabId = request.tabId || (sender && sender.tab ? sender.tab.id : lastActiveTabId);
    if (request.currentUrl && tabId) {
      tabUrlMap.set(tabId, request.currentUrl);
    }
    let media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    // Return newest media streams first so the currently active/played video is prioritized
    const sortedMedia = media.slice().reverse();
    const storedTitle = tabId ? tabTitleMap.get(tabId) : null;
    const tabTitle = (storedTitle && !isGenericTitle(storedTitle))
      ? storedTitle
      : ((sender && sender.tab && sender.tab.title) ? sender.tab.title : storedTitle);
    sendResponse({
      success: true,
      media: sortedMedia,
      tabTitle: tabTitle,
      tabUrl: tabId ? (tabUrlMap.get(tabId) || (sender && sender.tab && sender.tab.url ? sender.tab.url : null)) : null
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

function bestYouTubeHeight(formats) {
  let height = 0;
  for (const format of formats || []) {
    if (!format || format.isAudioOnly || format.formatId === 'thumbnail') continue;
    const label = String(format.resolution || '');
    const measured = Number(format.height) || Number(label.match(/^(\d+)p/i)?.[1]) || (/^4k\b/i.test(label) ? 2160 : 0);
    if (Number.isFinite(measured)) height = Math.max(height, measured);
  }
  return height;
}

  if (request.type === 'GET_MEDIA_FORMATS' || request.action === 'extractMediaInfo') {
    const url = request.url;
    const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));

    if (isYouTube) {
      const vid = extractYouTubeVideoId(url);
      const cacheKey = vid || url;
      const cached = ytBackgroundFormatCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() && bestYouTubeHeight(cached.data?.formats) >= 720) {
        sendResponse(cached.data);
        return false;
      }

      let responded = false, pending = 2, fallback = null;
      const finish = (res) => {
        if (responded) return;
        responded = true;
        clearTimeout(deadline);
        if (bestYouTubeHeight(res?.formats) >= 720) {
          ytBackgroundFormatCache.set(cacheKey, { data: res, expiresAt: Date.now() + 120000 });
        }
        sendResponse(res || {success: false, status: 'error', message: 'Could not extract YouTube formats.'});
      };
      const deadline = setTimeout(() => finish(fallback), 25000);
      const receive = (res) => {
        if (responded) return;
        if ((res?.success || res?.status === 'ok') && Array.isArray(res.formats)) {
          const height = bestYouTubeHeight(res.formats);
          if (height >= 720) { finish(res); return; }
          if (height > bestYouTubeHeight(fallback?.formats)) fallback = res;
        }
        if (--pending === 0) finish(fallback);
      };

      // The first verified HD result wins. A low-resolution reply waits for the other source.
      fetchYouTubeFormatsInServiceWorker(url).then(receive, () => receive(null));
      appendCookiesAndSend({ type: 'GET_MEDIA_FORMATS', url }, receive);

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
    const tabId = (sender && sender.tab && sender.tab.id) || request.tabId || lastActiveTabId;
    if (!effectiveBaseUrl && tabId) {
      const tabMedia = detectedMediaMap.get(tabId) || [];
      const m3u8Item = tabMedia.slice().reverse().find(m => (m.url && (m.url.includes('.m3u8') || m.url.includes('.mpd'))) ||
        m.contentType?.includes('mpegurl') || m.contentType?.includes('dash') ||
        /(?:stream-embed\/(?:playlist|media)|\/(?:playlists?|manifests?|master|hls|dash|streams?|sources?|prox(?:y|ies)|embeds?|videos?|media|play(?:back)?|prorcp|chunklists?|vod|live|file|serve)(?:[?#/]|$)|[?&](?:format=m3u8|type=m3u8|source=m3u8|file=.*\.m3u8))/i.test(m.url || ''));
      if (m3u8Item) {
        effectiveBaseUrl = m3u8Item.url;
      } else {
        const directVideo = tabMedia.slice().reverse().find(m => m.url && (m.contentType?.includes('video/') || /\.(?:mp4|webm|mkv|mov)(?:[?#]|$)/i.test(m.url)));
        if (directVideo) {
          const storedTitle = tabId ? tabTitleMap.get(tabId) : null;
          const rawTabTitle = (storedTitle && !isGenericTitle(storedTitle))
            ? storedTitle
            : ((sender && sender.tab && sender.tab.title) || storedTitle);
          const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
          const authoritativeTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : (directVideo.customTitle || 'Video');
          const h = directVideo.height || extractResolutionNumber(directVideo.url, authoritativeTitle) || 0;
          sendResponse({
            success: true,
            status: 'ok',
            formats: [{
              formatId: h > 0 ? `direct_${h}p` : 'direct_video',
              resolution: h > 0 ? `${h}p (MP4)` : 'Video Stream (MP4)',
              title: authoritativeTitle,
              badge: h > 0 ? `${h}p` : 'Video',
              url: directVideo.url,
              directUrl: directVideo.url,
              videoUrl: directVideo.url,
              audioUrl: null,
              height: h,
              ext: 'mp4',
              fileSize: directVideo.contentLength || 0,
              isAudioOnly: false
            }]
          });
          return false;
        }
      }
    }
    if (!effectiveBaseUrl) {
      sendResponse({ success: false, status: 'error', message: 'No manifest URL provided or detected' });
      return false;
    }
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
        if (effectiveBaseUrl.includes('/stream-embed/')) {
          addCand(effectiveBaseUrl.replace(/\/stream-embed\/media\//i, '/stream-embed/playlist/'));
        }
        addCand(effectiveBaseUrl.replace(/\/media\//i, '/playlist/'));

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
                audioUrl: f.audioUrl || null,
                mediaKind: f.mediaKind || 'hls',
                bandwidth: f.bandwidth || 0,
                totalDuration: f.totalDuration || 0,
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
                const existing = mediaList.find(m => m.url === v.url);
                if (!existing) {
                  pushToMediaList(mediaList, {
                    url: v.url,
                    audioUrl: v.audioUrl || null,
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
                } else {
                  if (v.audioUrl && !existing.audioUrl) {
                    existing.audioUrl = v.audioUrl;
                    addedAny = true;
                  }
                  if (v.height > 0 && (!existing.height || existing.height <= 0)) {
                    existing.height = v.height;
                    existing.customBadge = v.badge || `${v.height}p`;
                    addedAny = true;
                  }
                }
              });
              if (addedAny) broadcastNewMedia(tabId, mediaList);
            }

            sendResponse({ success: true, status: 'ok', formats: variants });
            return;
          }
        } catch(e) {}
      }

      if (text && (text.includes('#EXT-X-STREAM-INF') || text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION') || text.includes('#EXT-X-ENDLIST'))) {
        let variants = text.includes('#EXT-X-STREAM-INF') ? parseM3u8Formats(text, effectiveBaseUrl) : [];
        const itemReferer = (cachedHeaders && cachedHeaders.referer) || tabUrl || null;
        const itemOrigin = (cachedHeaders && cachedHeaders.origin) || (itemReferer ? new URL(itemReferer).origin : null);
        const storedTitle = tabId ? tabTitleMap.get(tabId) : null;
        const rawTabTitle = (storedTitle && !isGenericTitle(storedTitle))
          ? storedTitle
          : ((sender && sender.tab && sender.tab.title) || storedTitle);
        const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;
        const authoritativeTitle = (cleanTabTitle && !isGenericTitle(cleanTabTitle)) ? cleanTabTitle : null;

        if ((!variants || variants.length === 0) && (text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION') || text.includes('#EXT-X-ENDLIST'))) {
          let h = extractResolutionNumber(effectiveBaseUrl);
          if (h <= 0 && request.height) h = Number(request.height);
          const resLabel = getResolutionLabel(h, 'MP4');
          let parsedBw = 0;
          const bwMatch = text.match(/AVERAGE-BANDWIDTH=(\d+)/i) || text.match(/BANDWIDTH=(\d+)/i) || text.match(/#EXT-X-BITRATE:\s*(\d+)/i);
          if (bwMatch) parsedBw = parseInt(bwMatch[1], 10);
          let parsedDur = 0;
          const infMatches = text.match(/#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/gi);
          if (infMatches) {
            for (const im of infMatches) {
              const dm = im.match(/#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/i);
              if (dm && dm[1]) parsedDur += parseFloat(dm[1]);
            }
          }
          if (parsedDur <= 0) {
            const targetDurMatch = text.match(/#EXT-X-TARGETDURATION:\s*([0-9]+)/i);
            const count = (text.match(/#EXTINF/gi) || []).length;
            if (targetDurMatch && count > 0) parsedDur = count * parseFloat(targetDurMatch[1]);
          }
          variants = [{
            formatId: h > 0 ? `hls_${h}p` : 'hls_stream',
            resolution: resLabel,
            title: authoritativeTitle || resLabel,
            badge: `${h}p`,
            url: effectiveBaseUrl,
            directUrl: effectiveBaseUrl,
            videoUrl: effectiveBaseUrl,
            audioUrl: null,
            height: h,
            ext: 'mp4',
            mediaKind: 'hls',
            manifestText: text,
            bandwidth: parsedBw,
            totalDuration: parsedDur,
            isAudioOnly: false,
            referer: itemReferer,
            origin: itemOrigin
          }];
        }

        if (variants && variants.length > 0) {
          variants.forEach(v => {
            v.referer = itemReferer;
            v.origin = itemOrigin;
            if (!v.mediaKind) v.mediaKind = 'hls';
            if (!isCompleteHlsMediaPlaylist(v.manifestText)) v.manifestText = null;
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
              const existing = mediaList.find(m => m.url === v.url);
              if (!existing) {
                pushToMediaList(mediaList, {
                  url: v.url,
                  audioUrl: v.audioUrl || null,
                  contentType: 'application/x-mpegurl',
                  contentLength: 0,
                  filename: finalTitle + '.mp4',
                  customTitle: finalTitle,
                  customBadge: v.badge || `${v.height}p`,
                  height: v.height || 0,
                  bandwidth: v.bandwidth || 0,
                  referer: itemReferer,
                  origin: itemOrigin,
                  mediaKind: v.mediaKind || 'hls',
                  manifestText: v.manifestText || null,
                  timestamp: Date.now()
                });
                addedAny = true;
              } else {
                if (v.audioUrl && !existing.audioUrl) {
                  existing.audioUrl = v.audioUrl;
                  addedAny = true;
                }
                if (v.height > 0 && (!existing.height || existing.height <= 0)) {
                  existing.height = v.height;
                  existing.customBadge = v.badge || `${v.height}p`;
                  addedAny = true;
                }
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
        const existing = mediaList.find(m => m.url === v.url);
        if (!existing) {
          pushToMediaList(mediaList, {
            url: v.url,
            audioUrl: v.audioUrl || null,
            contentType: 'application/x-mpegurl',
            contentLength: 0,
            filename: finalTitle + '.mp4',
            customTitle: finalTitle,
            customBadge: v.badge || `${v.height}p`,
            height: v.height || 0,
            bandwidth: v.bandwidth || 0,
            referer: fRef,
            origin: fOrig,
            mediaKind: v.mediaKind || 'hls',
            manifestText: isCompleteHlsMediaPlaylist(v.manifestText) ? v.manifestText : null,
            timestamp: Date.now()
          });
          addedAny = true;
        } else {
          if (v.audioUrl && !existing.audioUrl) {
            existing.audioUrl = v.audioUrl;
            addedAny = true;
          }
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
    const isExplicitMedia = request.type !== 'ADD_DOWNLOAD' || Array.isArray(request.formats) || Boolean(request.formatId) || Boolean(request.videoUrl);
    const tabId = (sender && sender.tab && sender.tab.id) || lastActiveTabId;
    const storedTabTitle = tabId ? tabTitleMap.get(tabId) : null;
    const rawTabTitle = (storedTabTitle && !isGenericTitle(storedTabTitle))
      ? storedTabTitle
      : ((sender && sender.tab && sender.tab.title) || storedTabTitle);
    const cleanTabTitle = rawTabTitle ? sanitizeCleanTitle(rawTabTitle) : null;

    const targetMediaUrl = request.url || (Array.isArray(request.formats) && request.formats[0]?.url) || (Array.isArray(request.items) && request.items[0]?.url);
    const animeRef = getAnimeCdnDefaultReferer(targetMediaUrl, request.pageUrl || request.referer);
    if (animeRef) {
      if (!request.referer) {
        request.referer = animeRef;
      } else if (targetMediaUrl?.includes('owocdn.top') && !request.referer.includes('kwik.cx') && !request.referer.includes('animepahe')) {
        request.referer = animeRef;
      }
    }

    if (isExplicitMedia) {
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
    } else {
      // General direct file download (e.g. .exe, .torrent, .zip, .pdf)
      if (!request.fileName || isGenericTitle(request.fileName)) {
        try {
          const parsed = new URL(request.url);
          for (const qKey of ['filename', 'file', 'name', 'fn', 'path', 'attachment']) {
            const qVal = parsed.searchParams.get(qKey);
            if (qVal && qVal.includes('.')) {
              request.fileName = decodeURIComponent(qVal.split(/[\\/]/).pop().trim());
              break;
            }
          }
          if (!request.fileName || isGenericTitle(request.fileName)) {
            const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
            if (pathName && pathName.includes('.')) {
              request.fileName = pathName;
            }
          }
        } catch (e) {}
      }
    }

    appendCookiesAndSend(request, sendResponse);
    return true; // Async response
  }
});

function sendToSmartDM(url, referer, fileName = null) {
  if (!fileName) {
    try {
      const parsed = new URL(url);
      for (const qKey of ['filename', 'file', 'name', 'fn', 'path', 'attachment']) {
        const qVal = parsed.searchParams.get(qKey);
        if (qVal && qVal.includes('.')) {
          fileName = decodeURIComponent(qVal.split(/[\\/]/).pop().trim());
          break;
        }
      }
      if (!fileName) {
        const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
        if (pathName && pathName.includes('.')) {
          fileName = pathName;
        }
      }
    } catch (e) {}
  }
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
const interceptedDownloadIds = new Set();

async function handleInterceptedDownload(downloadItem, suggest) {
  if (!downloadItem) {
    if (typeof suggest === 'function') suggest();
    return;
  }
  if (downloadItem.state && downloadItem.state !== 'in_progress') {
    if (typeof suggest === 'function') suggest();
    return;
  }
  if (downloadItem.byExtensionId || bypassedDownloads.has(downloadItem.url)) {
    if (typeof suggest === 'function') suggest();
    return;
  }

  if (downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) {
    if (typeof suggest === 'function') suggest();
    return;
  }

  if (interceptedDownloadIds.has(downloadItem.id)) {
    if (typeof suggest === 'function') suggest();
    return;
  }
  interceptedDownloadIds.add(downloadItem.id);
  const timer = setTimeout(() => interceptedDownloadIds.delete(downloadItem.id), 30000);
  if (timer && typeof timer.unref === 'function') timer.unref();

  // Cancel and erase browser download IMMEDIATELY to prevent browser history/UI pollution
  chrome.downloads.cancel(downloadItem.id, () => {
    if (chrome.downloads.erase) {
      chrome.downloads.erase({ id: downloadItem.id }, () => {});
    }
  });
  if (chrome.downloads.erase) {
    chrome.downloads.erase({ id: downloadItem.id }, () => {});
  }
  if (typeof suggest === 'function') {
    try { suggest(); } catch (e) {}
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

  const dlUrl = downloadItem.finalUrl || downloadItem.url || '';
  const initUrl = downloadItem.url || '';
  const refUrl = downloadItem.referrer || '';

  let activeTabTitle = null;
  let activeTabUrl = null;
  try {
    if (chrome.tabs && chrome.tabs.query) {
      const activeTabs = await new Promise(resolve => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) resolve(tabs);
          else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs2) => resolve(tabs2 || []));
          }
        });
      });
      if (activeTabs && activeTabs.length > 0) {
        activeTabTitle = activeTabs[0].title || null;
        activeTabUrl = activeTabs[0].url || null;
      }
    }
  } catch (e) {}

  const candidateUrls = [dlUrl, initUrl, refUrl, activeTabUrl].filter(Boolean);

  let isGoogleDocs = candidateUrls.some(u => {
    try {
      const parsed = new URL(u);
      const h = parsed.hostname.toLowerCase();
      const p = parsed.pathname.toLowerCase();
      return h.includes('googleusercontent.com') || h.includes('docs.google.com') || h.includes('drive.google.com') || p.includes('/export') || p.includes('/spreadsheets/') || p.includes('/document/') || p.includes('/presentation/');
    } catch (e) { return false; }
  });

  let googleExt = null;
  if (downloadItem.mime) {
    const m = downloadItem.mime.toLowerCase();
    if (m === 'application/pdf') googleExt = '.pdf';
    else if (m.includes('spreadsheet') || m.includes('excel')) googleExt = '.xlsx';
    else if (m.includes('wordprocessingml') || m.includes('msword')) googleExt = '.docx';
    else if (m.includes('presentation') || m.includes('powerpoint')) googleExt = '.pptx';
    else if (m.includes('csv')) googleExt = '.csv';
    else if (m.includes('tab-separated')) googleExt = '.tsv';
    else if (m.includes('opendocument.spreadsheet')) googleExt = '.ods';
    else if (m.includes('opendocument.text')) googleExt = '.odt';
  }

  if (!googleExt) {
    for (const u of candidateUrls) {
      try {
        const pu = new URL(u);
        const fmt = (pu.searchParams.get('format') ||
                     pu.searchParams.get('exportFormat') ||
                     pu.searchParams.get('output') || '').toLowerCase().trim();
        if (fmt) {
          googleExt = fmt.startsWith('.') ? fmt : ('.' + fmt);
          break;
        }
      } catch (e) {}
    }
  }

  if (!googleExt) {
    for (const u of candidateUrls) {
      try {
        const pu = new URL(u);
        const p = pu.pathname.toLowerCase();
        if (p.endsWith('/pdf') || p.includes('/export/pdf')) { googleExt = '.pdf'; break; }
        if (p.endsWith('/xlsx') || p.includes('/export/xlsx')) { googleExt = '.xlsx'; break; }
        if (p.endsWith('/csv') || p.includes('/export/csv')) { googleExt = '.csv'; break; }
        if (p.endsWith('/tsv') || p.includes('/export/tsv')) { googleExt = '.tsv'; break; }
        if (p.endsWith('/docx') || p.includes('/export/docx')) { googleExt = '.docx'; break; }
        if (p.endsWith('/ods') || p.includes('/export/ods')) { googleExt = '.ods'; break; }
        if (p.endsWith('/pptx') || p.includes('/export/pptx')) { googleExt = '.pptx'; break; }
      } catch (e) {}
    }
  }

  if (!googleExt && isGoogleDocs) {
    for (const u of candidateUrls) {
      try {
        const pu = new URL(u);
        const h = pu.hostname.toLowerCase();
        const p = pu.pathname.toLowerCase();
        if (h.includes('sheets') || p.includes('spreadsheets')) { googleExt = '.xlsx'; break; }
        if (h.includes('docs.googleusercontent.com') || (h.includes('docs.google.com') && p.includes('document'))) { googleExt = '.docx'; break; }
        if (h.includes('presentation') || p.includes('presentation') || p.includes('slides')) { googleExt = '.pptx'; break; }
      } catch (e) {}
    }
    if (!googleExt) googleExt = '.xlsx';
  }

  let googleDocId = null;
  for (const u of candidateUrls) {
    const m = u.match(/(?:spreadsheets|document|presentation|file)(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/i) ||
              u.match(/\/d\/([a-zA-Z0-9_-]{20,})/i);
    if (m) {
      googleDocId = m[1];
      break;
    }
    try {
      const pu = new URL(u);
      const id = pu.searchParams.get('id') || pu.searchParams.get('docId');
      if (id) {
        googleDocId = id;
        break;
      }
    } catch (e) {}
  }

  let docTitle = null;
  if (activeTabTitle) {
    let clean = activeTabTitle
      .replace(/\s*[\-\|â€“â€”Â·]\s*(?:Google\s+)?(?:Sheets|Docs|Slides|Drive|Forms|Spreadsheets|Documents|Presentations).*$/i, '')
      .trim();
    if (clean && clean !== 'Google Sheets' && clean !== 'Google Docs' && clean !== 'Google Drive') {
      docTitle = clean;
    }
  }

  if (!basename) {
    for (const u of [dlUrl, initUrl]) {
      if (!u) continue;
      try {
        const parsedUrl = new URL(u);
        for (const qKey of ['filename', 'file', 'name', 'fn', 'path', 'attachment']) {
          const qVal = parsedUrl.searchParams.get(qKey);
          if (qVal && qVal.includes('.')) {
            basename = decodeURIComponent(qVal.split(/[\\/]/).pop().trim());
            break;
          }
        }
        if (!basename) {
          const pathBase = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '').trim();
          if (pathBase && pathBase.includes('.')) {
            basename = pathBase;
          }
        }
        if (basename) break;
      } catch (e) {}
    }
  }

  if (isGoogleDocs && googleExt && googleExt !== '.html') {
    if (basename) {
      if (basename.endsWith('.html') || basename.endsWith('.htm')) {
        basename = basename.replace(/\.html?$/i, '');
      }
      const lower = basename.toLowerCase();
      if (lower === 'spreadsheet' || lower === 'document' || lower === 'presentation' || lower === 'export') {
        basename = null;
      }
    }

    if (!basename) {
      if (docTitle) {
        basename = `${docTitle}${googleExt}`;
      } else if (googleDocId) {
        basename = `${googleDocId}${googleExt}`;
      } else {
        basename = `document${googleExt}`;
      }
    } else if (!basename.toLowerCase().endsWith(googleExt)) {
      basename = `${basename}${googleExt}`;
    }
  }

  if (!basename || basename.endsWith('.php') || basename.endsWith('.asp')) {
    const idMatch = dlUrl.match(/(?:id|torrent|tid)=([0-9a-zA-Z_-]+)/i);
    if (idMatch) {
      basename = 'torrent_' + idMatch[1] + '.torrent';
    } else if (dlUrl.toLowerCase().includes('torrent')) {
      basename = 'download.torrent';
    }
  }

  let effectiveReferer = downloadItem.referrer || null;
  if (!effectiveReferer && activeTabUrl) {
    effectiveReferer = activeTabUrl;
  }

  const message = {
    type: 'ADD_DOWNLOAD',
    url: isGoogleDocs ? (downloadItem.finalUrl || downloadItem.url) : (downloadItem.url || downloadItem.finalUrl),
    fileName: basename || null,
    title: docTitle || basename || null,
    referer: effectiveReferer || null,
    mime: downloadItem.mime || null,
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

      const bTimer = setTimeout(() => bypassedDownloads.delete(downloadItem.url), 15000);
      if (bTimer && typeof bTimer.unref === 'function') bTimer.unref();
    }
  });
}

if (chrome.downloads) {
  if (chrome.downloads.onDeterminingFilename) {
    chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
      handleInterceptedDownload(downloadItem, suggest);
    });
  } else if (chrome.downloads.onCreated) {
    chrome.downloads.onCreated.addListener((downloadItem) => {
      handleInterceptedDownload(downloadItem, null);
    });
  }
}
