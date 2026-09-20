const NATIVE_HOST_NAME = 'io.smartdm.host';
const detectedMediaMap = new Map(); // tabId -> Array<{ url, type, contentType, contentLength }>

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'download-link',
    title: 'Download with SmartDM',
    contexts: ['link', 'page', 'video', 'audio', 'image']
  });
});

// Clean up tab media on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  detectedMediaMap.delete(tabId);
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
    if (u.searchParams.has('range') && !u.hostname.includes('googlevideo.com')) {
      u.searchParams.delete('range');
    }
    return u.href;
  } catch (e) {
    return rawUrl;
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
          streamUrl = new URL(streamUrl, baseUrl).href;
        } catch (e) {}
      }
      
      let height = 0;
      if (currentInfo.resolution) {
        const parts = currentInfo.resolution.split('x');
        if (parts.length === 2) height = parseInt(parts[1], 10);
      }

      let label = currentInfo.name || (height > 0 ? `${height}p` : 'Video');
      if (height >= 720 && !label.includes('HD')) label += ' HD';
      
      let badge = 'Stream';
      if (currentInfo.bandwidth) {
        const kbps = Math.round(currentInfo.bandwidth / 1000);
        badge = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
      }

      formats.push({
        title: label,
        badge: badge,
        url: streamUrl,
        height: height,
        bandwidth: currentInfo.bandwidth || 0
      });
      currentInfo = null;
    }
  }

  formats.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  return formats;
}

function parseMpdFormats(mpdText, baseUrl) {
  const formats = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mpdText, "text/xml");
    
    // Check DRM / ContentProtection - if present, return empty (encrypted)
    const drmNode = xmlDoc.querySelector('ContentProtection');
    if (drmNode) return [];

    const adaptSets = xmlDoc.querySelectorAll('AdaptationSet');
    let audioUrl = null;
    let videoReps = [];

    adaptSets.forEach(set => {
      const mime = (set.getAttribute('mimeType') || '').toLowerCase();
      const contentType = (set.getAttribute('contentType') || '').toLowerCase();
      const isVideo = mime.includes('video') || contentType === 'video';
      const isAudio = mime.includes('audio') || contentType === 'audio';

      const reps = set.querySelectorAll('Representation');
      reps.forEach(rep => {
        const bandwidth = parseInt(rep.getAttribute('bandwidth') || '0', 10);
        const width = parseInt(rep.getAttribute('width') || '0', 10);
        const height = parseInt(rep.getAttribute('height') || '0', 10);
        
        let mediaUrl = '';
        const baseUrlNode = rep.querySelector('BaseURL') || set.querySelector('BaseURL');
        if (baseUrlNode) {
          mediaUrl = baseUrlNode.textContent.trim();
          if (!mediaUrl.startsWith('http')) {
            try { mediaUrl = new URL(mediaUrl, baseUrl).href; } catch(e) {}
          }
        }

        if (mediaUrl) {
          if (isVideo) {
            videoReps.push({ height, width, bandwidth, url: mediaUrl });
          } else if (isAudio && !audioUrl) {
            audioUrl = mediaUrl;
          }
        }
      });
    });

    videoReps.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
    videoReps.forEach(v => {
      const label = v.height > 0 ? `${v.height}p HD` : 'Video Stream';
      const kbps = Math.round(v.bandwidth / 1000);
      const badge = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';

      formats.push({
        title: label,
        badge: badge,
        url: v.url,
        videoUrl: v.url,
        audioUrl: audioUrl,
        height: v.height,
        bandwidth: v.bandwidth
      });
    });
  } catch(e) {}
  return formats;
}

// Intercept network requests for video/audio streams
if (chrome.webRequest && chrome.webRequest.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId <= 0) return;

      const headers = details.responseHeaders || [];
      let contentType = '';
      let contentLength = 0;

      headers.forEach((h) => {
        const name = h.name.toLowerCase();
        if (name === 'content-type') contentType = h.value.toLowerCase();
        if (name === 'content-length') contentLength = parseInt(h.value, 10) || 0;
      });

      const url = details.url.toLowerCase();

      // Explicitly ignore Netflix and DRM content so Netflix displays "No media formats detected"
      if (url.includes('netflix.com') || url.includes('nflxvideo.net') || url.includes('widevine') || url.includes('pssh')) {
        return;
      }

      // Exclude web assets, images, scripts, stylesheets, fonts, archives, torrents, executables
      if (contentType.includes('image/')) return;
      const isNonMediaAsset = url.includes('.js') || url.includes('.css') || url.includes('.jpg') ||
                              url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') ||
                              url.includes('.svg') || url.includes('.webp') || url.includes('.avif') ||
                              url.includes('.json') || url.includes('.woff') || url.includes('.woff2') ||
                              url.includes('.html') || url.includes('.ico') || url.includes('.webmanifest') ||
                              url.includes('.torrent') || url.includes('.rar') ||
                              url.includes('.zip') || url.includes('.7z') || url.includes('.tar') ||
                              url.includes('.gz') || url.includes('.iso') || url.includes('.exe') ||
                              url.includes('.msi') || url.includes('.pdf') || contentType.includes('bittorrent') ||
                              contentType.includes('zip') || contentType.includes('x-rar');
      if (isNonMediaAsset) return;

      // Ignore small UI sound effects (< 300KB or audio files named success/failure/no_input/open)
      if (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg')) {
        if (contentLength > 0 && contentLength < 300 * 1024) return;
        if (url.includes('success') || url.includes('failure') || url.includes('no_input') || url.includes('open') || url.includes('sound')) return;
      }

      // Filter out HLS/DASH segment chunks (preserve full stream URLs)
      const isFbMedia = url.includes('fbcdn.net') || url.includes('facebook.com');
      const isGoogleVideo = url.includes('videoplayback') || url.includes('googlevideo.com');
      const isSegmentChunk = (url.includes('.ts') && (url.includes('/seg') || url.includes('fragment') || url.includes('chunk') || url.includes('sq/'))) ||
                             (url.includes('.m4s') && !url.includes('master'));
      if (isSegmentChunk) return;

      let targetUrl = sanitizeStreamUrl(details.url);
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

      if (isMediaMime || isMediaExt || isGoogleVideo) {
        if (!detectedMediaMap.has(details.tabId)) {
          detectedMediaMap.set(details.tabId, []);
        }
        const mediaList = detectedMediaMap.get(details.tabId);

        // If this is an m3u8 playlist, fetch and parse variants BEFORE adding to mediaList
        if (targetUrl.includes('.m3u8')) {
          fetch(targetUrl)
            .then((r) => r.text())
            .then((text) => {
              if (text.includes('#EXT-X-STREAM-INF')) {
                const variants = parseM3u8Formats(text, targetUrl);
                variants.forEach((v) => {
                  if (!mediaList.some((m) => m.url === v.url)) {
                    if (mediaList.length >= 35) mediaList.shift();
                    mediaList.push({
                      url: v.url,
                      contentType: 'application/x-mpegurl',
                      contentLength: 0,
                      filename: v.title + '.mp4',
                      customTitle: v.title,
                      customBadge: v.badge
                    });
                  }
                });
              } else {
                if (!mediaList.some((m) => m.url === targetUrl)) {
                  if (mediaList.length >= 35) mediaList.shift();
                  mediaList.push({
                    url: targetUrl,
                    contentType: 'application/x-mpegurl',
                    contentLength: contentLength,
                    filename: getFilenameFromUrl(targetUrl),
                    customTitle: 'HLS Video Stream',
                    customBadge: 'HLS Stream'
                  });
                }
              }
            })
            .catch(() => {});
          return;
        }

        // If this is an mpd manifest, fetch and parse representations BEFORE adding
        if (targetUrl.includes('.mpd')) {
          fetch(targetUrl)
            .then((r) => r.text())
            .then((text) => {
              const mpdFormats = parseMpdFormats(text, targetUrl);
              if (mpdFormats.length > 0) {
                mpdFormats.forEach((f) => {
                  if (!mediaList.some((m) => m.url === f.url)) {
                    if (mediaList.length >= 35) mediaList.shift();
                    mediaList.push({
                      url: f.url,
                      videoUrl: f.videoUrl,
                      audioUrl: f.audioUrl,
                      contentType: 'video/mp4',
                      contentLength: 0,
                      filename: f.title + '.mp4',
                      customTitle: f.title,
                      customBadge: f.badge
                    });
                  }
                });
              }
            })
            .catch(() => {});
          return;
        }

        // Standard direct media URL (mp4, webm, mp3, m4a, etc.)
        if (!mediaList.some((m) => m.url === targetUrl)) {
          if (mediaList.length >= 35) mediaList.shift();

          let rawName = getFilenameFromUrl(targetUrl);
          let title = rawName;
          let badge = 'Media';
          let customTitle = null;

          if (isFbMedia) {
            badge = 'Facebook Video';
            customTitle = 'Video Stream (MP4)';
            title = 'facebook_video.mp4';
          } else if (isGoogleVideo) {
            const itagMatch = targetUrl.match(/[?&]itag=(\d+)/);
            const itag = itagMatch ? itagMatch[1] : '';
            const isAudio = (contentType && contentType.includes('audio/')) || itag === '140' || itag === '251' || itag === '139';
            badge = isAudio ? 'Audio Stream' : (itag ? `Video Stream (itag ${itag})` : 'Video Stream');
            customTitle = isAudio ? `Audio Stream (${itag || 'm4a'})` : `Video Stream (${itag || 'mp4'})`;
            title = isAudio ? `audio_${itag || 'stream'}.m4a` : `video_${itag || 'stream'}.mp4`;
          } else if (isOpaqueTokenOrHash(rawName)) {
            const ext = rawName.includes('.') ? rawName.substring(rawName.lastIndexOf('.')) : '.mp4';
            const isAudio = contentType && contentType.includes('audio/');
            badge = isAudio ? 'Audio Stream' : 'Direct Video';
            customTitle = isAudio ? 'Audio Stream' : 'Video Stream (MP4)';
            title = (isAudio ? 'audio_stream' : 'video_stream') + ext;
          }

          mediaList.push({
            url: targetUrl,
            contentType: contentType,
            contentLength: contentLength,
            filename: title,
            customTitle: customTitle || title,
            customBadge: badge
          });
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

async function appendCookiesAndSend(request, sendResponse) {
  request.userAgent = navigator.userAgent;
  request.referer = request.referer || request.pageUrl || null;
  try {
    let targetUrl = request.url;
    if (!targetUrl && request.urls && request.urls.length > 0) {
      targetUrl = request.urls[0];
    }
    
    // Check both targetUrl and referer/pageUrl for cookies (crucial for Pornhub and CDN media streams)
    let cookieDomainUrl = request.referer || request.pageUrl || targetUrl;
    let domainHost = '';
    try {
      const parsed = new URL(cookieDomainUrl);
      cookieDomainUrl = parsed.protocol + '//' + parsed.hostname + '/';
      domainHost = parsed.hostname.replace(/^www\./, '');
    } catch (e) {}

    if (chrome.cookies) {
      const cookies = await new Promise(resolve => {
        if (domainHost) {
          chrome.cookies.getAll({ domain: domainHost }, (c) => {
            if (c && c.length > 0) return resolve(c);
            chrome.cookies.getAll({ url: cookieDomainUrl }, (c2) => resolve(c2 || []));
          });
        } else if (cookieDomainUrl) {
          chrome.cookies.getAll({ url: cookieDomainUrl }, (c) => resolve(c || []));
        } else {
          resolve([]);
        }
      });
      
      if (cookies && cookies.length > 0) {
        let cookieStr = '# Netscape HTTP Cookie File\n';
        cookieStr += cookies.map(c => {
          const domain = c.domain;
          const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
          const path = c.path;
          const secure = c.secure ? 'TRUE' : 'FALSE';
          const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
          return `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`;
        }).join('\n') + '\n';
        request.cookies = cookieStr;
      }
    }
  } catch (e) {
    console.warn('Failed to extract cookies:', e);
  }

  // 1. Discover active SmartDM desktop app port (port 18420-18425) via fast OPTIONS probe
  const isFormatQuery = request.type === 'GET_MEDIA_FORMATS' || request.action === 'extractMediaInfo';
  const ports = [18420, 18421, 18422, 18423, 18424, 18425];
  let activePort = null;

  for (const port of ports) {
    try {
      const probeController = new AbortController();
      const probeTimer = setTimeout(() => probeController.abort(), 120);
      const probeRes = await fetch(`http://127.0.0.1:${port}/api/browser`, {
        method: 'OPTIONS',
        signal: probeController.signal
      });
      clearTimeout(probeTimer);
      if (probeRes.ok || probeRes.status === 200 || probeRes.status === 204) {
        activePort = port;
        break;
      }
    } catch(e) {}
  }

  if (activePort) {
    try {
      const timeoutMs = isFormatQuery ? 7000 : 3000;
      const reqController = new AbortController();
      const reqTimer = setTimeout(() => reqController.abort(), timeoutMs);
      const res = await fetch(`http://127.0.0.1:${activePort}/api/browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: reqController.signal
      });
      clearTimeout(reqTimer);
      if (res.ok) {
        const data = await res.json();
        if (sendResponse) sendResponse(data || { success: true, status: 'ok' });
        return;
      }
    } catch (e) {}
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

async function fetchPageMediaFormats(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': navigator.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
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
      if (!u || typeof u !== 'string' || !u.startsWith('http') || seen.has(u)) return;
      seen.add(u);
      const isHls = ext === 'm3u8' || u.includes('.m3u8');
      let qStr = q ? String(q).trim() : '';
      if (qStr && !qStr.endsWith('p') && /^\d+$/.test(qStr)) qStr += 'p';
      let qLabel = qStr || (isHls ? 'Master HLS' : 'Video');
      const hNum = parseInt(qLabel, 10);
      if (hNum >= 720 && !qLabel.includes('HD')) qLabel += ' HD';
      qLabel += isHls ? ' (Stream)' : ' (MP4)';

      formats.push({
        formatId: 'tube_' + (q || formats.length),
        resolution: qLabel,
        height: hNum || (isHls ? 1080 : 720),
        ext: isHls ? 'm3u8' : 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: title,
        url: u
      });
    };

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
                if (item && item.videoUrl) {
                  addFmt(item.videoUrl, item.quality || (item.format === 'hls' ? 'Master' : '720p'), item.format);
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
    const tabId = sender.tab ? sender.tab.id : null;
    let media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    if (media.length === 0 && detectedMediaMap.size > 0) {
      const allEntries = Array.from(detectedMediaMap.values());
      if (allEntries.length > 0) media = allEntries[allEntries.length - 1] || [];
    }
    sendResponse({ success: true, media: media });
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
    if (media.length === 0 && detectedMediaMap.size > 0) {
      const allEntries = Array.from(detectedMediaMap.values());
      if (allEntries.length > 0) media = allEntries[allEntries.length - 1] || [];
    }
    sendResponse({ success: true, status: 'ok', media: media });
    return false; // Instant synchronous response
  }

  if (request.type === 'START_MEDIA_DOWNLOAD' || request.type === 'ADD_BATCH' || request.type === 'ADD_MEDIA_BATCH' || request.type === 'ADD_DOWNLOAD') {
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
