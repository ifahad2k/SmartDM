const NATIVE_HOST_NAME = 'io.smartdm.host';

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'download-link',
    title: 'Download with SmartDM',
    contexts: ['link', 'page', 'video', 'audio', 'image']
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'download-link') {
    let url = info.linkUrl || info.srcUrl || info.pageUrl;
    if (url) {
      sendToSmartDM(url, tab ? tab.url : null);
    }
  }
});

browser.browserAction.onClicked.addListener((tab) => {
  if (tab && tab.url) {
    sendToSmartDM(tab.url, tab.url);
  }
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_MEDIA_FORMATS' || request.type === 'START_MEDIA_DOWNLOAD') {
    browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, request).then(response => {
      sendResponse(response);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
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
  browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, message).then(response => {
    console.log('Received response from native host:', response);
  }).catch(err => {
    console.error('Error sending native message:', err);
  });
}
