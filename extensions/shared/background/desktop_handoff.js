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

function getAnimeCdnDefaultReferer(url, pageUrl) {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  const lowerPage = (pageUrl || '').toLowerCase();
  if (lowerUrl.includes('jabroni.mov') || lowerPage.includes('goojara.')) {
    if (lowerPage.includes('goojara.')) return pageUrl;
    return 'https://ww1.goojara.to/';
  }
  if (lowerUrl.includes('stellarconductornexus.com') || lowerPage.includes('hydrahd.')) {
    if (lowerPage.includes('hydrahd.')) return pageUrl;
    return 'https://hydrahd.gd/';
  }
  if (lowerUrl.includes('goldenkite.top') || lowerPage.includes('ramoflix.') || lowerPage.includes('111movies.')) {
    if (lowerPage.includes('ramoflix.')) return pageUrl;
    if (lowerPage.includes('111movies.')) return pageUrl;
    return 'https://ramoflix.net/';
  }
  if (lowerUrl.includes('111movies.')) {
    return 'https://111movies.net/';
  }
  if (lowerUrl.includes('wmovies.nl') || lowerPage.includes('wmovies.nl')) {
    return 'https://wmovies.nl/';
  }
  if (lowerUrl.includes('owocdn.top')) {
    if (lowerPage.includes('kwik.cx')) return pageUrl;
    if (lowerPage.includes('animepahe.')) return pageUrl;
    return 'https://kwik.cx/';
  }
  if (lowerUrl.includes('shiora.top') || lowerUrl.includes('megap.')) {
    if (lowerPage.includes('animesuge.')) return pageUrl;
    if (lowerPage.includes('megaplay.')) return pageUrl;
    return 'https://animesuge.tv/';
  }
  if (lowerUrl.includes('sunwave') || lowerUrl.includes('sunwaveclear.top')) {
    if (lowerPage.includes('miruro.')) return pageUrl;
    return 'https://miruro.to/';
  }
  if (lowerUrl.includes('anime.nexus')) {
    return 'https://anime.nexus/';
  }
  if (lowerUrl.includes('anizone') || lowerPage.includes('anizone')) {
    return 'https://anizone.to/';
  }
  return null;
}

async function appendCookiesAndSend(request, sendResponse) {
  let targetUrl = request.url;
  if (!targetUrl && request.urls && request.urls.length > 0) {
    targetUrl = request.urls[0];
  } else if (!targetUrl && request.items && request.items.length > 0) {
    targetUrl = request.items[0].url || request.items[0].directUrl;
  }

  // Look up authentic browser headers from network interceptor cache
  const cachedH = getCachedStreamHeaders(targetUrl);
  if (cachedH) {
    if (cachedH.referer && (cachedH.exact || !request.referer)) request.referer = cachedH.referer;
    if (cachedH.origin && (cachedH.exact || !request.origin)) request.origin = cachedH.origin;
    if (cachedH.userAgent) request.userAgent = cachedH.userAgent;
    if (cachedH.cookie && !request.cookies) request.cookies = cachedH.cookie;
  }
  if (!request.userAgent) request.userAgent = navigator.userAgent;
  if (!request.referer) request.referer = request.pageUrl || null;
  const animeRef = getAnimeCdnDefaultReferer(targetUrl, request.pageUrl || request.referer);
  if (animeRef) {
    if (!request.referer) {
      request.referer = animeRef;
    } else if (targetUrl?.includes('owocdn.top') && !request.referer.includes('kwik.cx') && !request.referer.includes('animepahe')) {
      request.referer = animeRef;
    }
  }
  if (!request.origin && request.referer) {
    try { request.origin = new URL(request.referer).origin; } catch(e) {}
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

    const hasGoogle = candidateUrls.some(u => {
      try {
        const h = new URL(u).hostname.toLowerCase();
        return h.includes('googleusercontent.com') || h.includes('docs.google.com') || h.includes('drive.google.com') || h.includes('google.com');
      } catch (e) { return false; }
    });

    if (hasGoogle) {
      domainSet.add('google.com');
      domainSet.add('.google.com');
      domainSet.add('docs.google.com');
      domainSet.add('.docs.google.com');
      domainSet.add('drive.google.com');
      domainSet.add('.drive.google.com');
      domainSet.add('googleusercontent.com');
      domainSet.add('.googleusercontent.com');
      urlSet.add('https://docs.google.com/');
      urlSet.add('https://drive.google.com/');
      urlSet.add('https://www.google.com/');
      urlSet.add('https://google.com/');
      urlSet.add('https://googleusercontent.com/');
      urlSet.add('https://accounts.google.com/');
      urlSet.add('https://accounts.google.com/');
      urlSet.add('https://accounts.google.com/');
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
                  domain: streamDomain || '',
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

  // Native messaging authenticates the host; never probe HTTP ports with secrets.
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {...request, protocolVersion: 1}, (value) => {
        if (chrome.runtime.lastError) {
          resolve({success: false, status: 'error', message: 'Start SmartDM and register its C# native host, then reload the extension.'});
        } else {
          resolve(value || {success: false, status: 'error', message: 'SmartDM did not acknowledge the request.'});
        }
      });
    });
    if (sendResponse) sendResponse(response);
  } catch (_) {
    if (sendResponse) sendResponse({success: false, status: 'error', message: 'Authenticated SmartDM integration is unavailable.'});
  }
}
