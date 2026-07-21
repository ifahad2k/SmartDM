const NATIVE_HOST_NAME = 'io.smartdm.host';
const detectedMediaMap = new Map(); // tabId -> Array<{ url, type, contentType, contentLength }>

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'download-link',
    title: 'Download with SmartDM',
    contexts: ['link', 'page', 'video', 'audio', 'image']
  });
});

// Clean up tab media on tab close or refresh
chrome.tabs.onRemoved.addListener((tabId) => {
  detectedMediaMap.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    detectedMediaMap.delete(tabId);
  }
});

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
      const isMediaMime = contentType.includes('video/') || 
                          contentType.includes('audio/') || 
                          contentType.includes('application/x-mpegurl') || 
                          contentType.includes('application/vnd.apple.mpegurl') || 
                          contentType.includes('application/dash+xml');
      
      const isMediaExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd') ||
                         url.includes('.webm') || url.includes('.mp3') || url.includes('.m4a') ||
                         url.includes('.flv') || url.includes('.ts');

      if (isMediaMime || isMediaExt) {
        if (!detectedMediaMap.has(details.tabId)) {
          detectedMediaMap.set(details.tabId, []);
        }
        const mediaList = detectedMediaMap.get(details.tabId);
        if (!mediaList.some((m) => m.url === details.url)) {
          mediaList.push({
            url: details.url,
            contentType: contentType,
            contentLength: contentLength,
            filename: getFilenameFromUrl(details.url)
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
