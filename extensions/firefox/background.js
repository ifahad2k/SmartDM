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

      // Exclude web assets, images, scripts, stylesheets, fonts
      const isNonMediaAsset = url.includes('.js') || url.includes('.css') || url.includes('.jpg') ||
                              url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') ||
                              url.includes('.svg') || url.includes('.webp') || url.includes('.json') ||
                              url.includes('.woff') || url.includes('.woff2') || url.includes('.html') ||
                              url.includes('.ico');
      if (isNonMediaAsset) return;

      const isMediaMime = contentType.includes('video/') || 
                          contentType.includes('audio/') || 
                          contentType.includes('application/x-mpegurl') || 
                          contentType.includes('application/vnd.apple.mpegurl') || 
                          contentType.includes('application/dash+xml');
      
      const isMediaExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd') ||
                         url.includes('.webm') || url.includes('.mp3') || url.includes('.m4a') ||
                         url.includes('.flv') || url.includes('.ts') || url.includes('.mov') ||
                         url.includes('.m4v') || url.includes('.avi') || url.includes('.mkv');

      if (isMediaMime || isMediaExt) {
        if (!detectedMediaMap.has(details.tabId)) {
          detectedMediaMap.set(details.tabId, []);
        }
        const mediaList = detectedMediaMap.get(details.tabId);
        if (!mediaList.some((m) => m.url === details.url)) {
          if (mediaList.length >= 35) mediaList.shift();
          mediaList.push({
            url: details.url,
            contentType: contentType,
            contentLength: contentLength,
            filename: getFilenameFromUrl(details.url)
          });

          // If this is an m3u8 playlist, fetch and parse variants to extract clean quality profiles
          if (details.url.includes('.m3u8')) {
            fetch(details.url)
              .then((r) => r.text())
              .then((text) => {
                if (text.includes('#EXT-X-STREAM-INF')) {
                  const variants = parseM3u8Formats(text, details.url);
                  variants.forEach((v) => {
                    if (!mediaList.some((m) => m.url === v.url)) {
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
                }
              })
              .catch(() => {});
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_DETECTED_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : null;
    const media = tabId ? (detectedMediaMap.get(tabId) || []) : [];
    sendResponse({ success: true, media: media });
    return false;
  }

  if (request.type === 'GET_MEDIA_FORMATS' || request.type === 'START_MEDIA_DOWNLOAD') {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
    return true; // Async response
  }
});

function sendToSmartDM(url, referer) {
  const message = {
    type: 'ADD_DOWNLOAD',
    url: url,
    fileName: null,
    referer: referer || null,
    userAgent: navigator.userAgent
  };

  console.log('Sending message to native host:', message);
  chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending native message:', chrome.runtime.lastError.message);
    } else {
      console.log('Received response from native host:', response);
    }
  });
}
