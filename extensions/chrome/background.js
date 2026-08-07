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

      // Exclude web assets, images, scripts, stylesheets, fonts
      if (contentType.includes('image/')) return;
      const isNonMediaAsset = url.includes('.js') || url.includes('.css') || url.includes('.jpg') ||
                              url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') ||
                              url.includes('.svg') || url.includes('.webp') || url.includes('.avif') ||
                              url.includes('.json') || url.includes('.woff') || url.includes('.woff2') ||
                              url.includes('.html') || url.includes('.ico') || url.includes('.webmanifest') ||
                              url.includes('manifest.');
      if (isNonMediaAsset) return;

      // Ignore small UI sound effects (< 300KB or audio files named success/failure/no_input/open)
      if (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg')) {
        if (contentLength > 0 && contentLength < 300 * 1024) return;
        if (url.includes('success') || url.includes('failure') || url.includes('no_input') || url.includes('open') || url.includes('sound')) return;
      }

      // Filter out HLS/DASH segment chunks and range requests
      const isFbMedia = url.includes('fbcdn.net') || url.includes('facebook.com');
      const isSegmentChunk = (url.includes('.ts') && (url.includes('/seg') || url.includes('fragment') || url.includes('chunk') || url.includes('sq/'))) ||
                             (url.includes('.m4s') && !url.includes('master')) ||
                             (!isFbMedia && (url.includes('bytestart=') || url.includes('byteend=') || url.includes('range=')));
      if (isSegmentChunk) return;

      const targetUrl = details.url;


      const isMediaMime = contentType.includes('video/') || 
                          contentType.includes('audio/') || 
                          contentType.includes('application/x-mpegurl') || 
                          contentType.includes('application/vnd.apple.mpegurl') || 
                          contentType.includes('application/dash+xml');
      
      const isMediaExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd') ||
                         url.includes('.webm') || url.includes('.mp3') || url.includes('.m4a') ||
                         url.includes('.flv') || url.includes('.mov') || url.includes('.m4v') ||
                         url.includes('.avi') || url.includes('.mkv');

      if (isMediaMime || isMediaExt) {
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
          mediaList.push({
            url: targetUrl,
            contentType: contentType,
            contentLength: contentLength,
            filename: getFilenameFromUrl(targetUrl)
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
  try {
    let targetUrl = request.url;
    if (!targetUrl && request.urls && request.urls.length > 0) {
      targetUrl = request.urls[0];
    }
    
    if (targetUrl && chrome.cookies) {
      let cookieDomainUrl = targetUrl;
      try {
        const parsed = new URL(targetUrl);
        cookieDomainUrl = parsed.protocol + '//' + parsed.hostname + '/';
      } catch (e) {}

      const cookies = await new Promise(resolve => {
        chrome.cookies.getAll({ url: cookieDomainUrl }, (c) => resolve(c || []));
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

  chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response) => {
    if (chrome.runtime.lastError) {
      if (sendResponse) sendResponse({ success: false, error: chrome.runtime.lastError.message });
      else console.error('Error sending native message:', chrome.runtime.lastError.message);
    } else {
      if (sendResponse) sendResponse(response || { success: true });
      else console.log('Received response from native host:', response);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_DETECTED_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : null;
    const media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    sendResponse({ success: true, media: media });
    return false;
  }

  if (request.type === 'GET_MEDIA_FORMATS' || request.action === 'extractMediaInfo' || request.type === 'START_MEDIA_DOWNLOAD' || request.type === 'ADD_BATCH' || request.type === 'ADD_MEDIA_BATCH' || request.type === 'ADD_DOWNLOAD') {
    if (request.action === 'extractMediaInfo') {
      request.type = 'GET_MEDIA_FORMATS';
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

    // Cancel browser download
    chrome.downloads.cancel(downloadItem.id);
    
    let basename = downloadItem.filename ? downloadItem.filename.split(/[\\/]/).pop() : '';
    const message = {
      type: 'ADD_DOWNLOAD',
      url: downloadItem.finalUrl || downloadItem.url,
      fileName: basename,
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
