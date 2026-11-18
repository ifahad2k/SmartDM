function isCompleteHlsMediaPlaylist(text) {
  return typeof text === 'string' && /^\s*#EXTM3U\s/m.test(text) &&
    /^#EXTINF:/m.test(text) && /^#EXT-X-ENDLIST\s*$/m.test(text) &&
    !/^#EXT-X-STREAM-INF:/m.test(text);
}

async function fetchM3u8Text(url, referrer, initiator = null) {
  if (!url) return null;
  const reads = (fetchM3u8Text._reads = fetchM3u8Text._reads || new Map());
  const activeCount = fetchM3u8Text._active || 0;
  const key = `${url}\n${referrer || ''}\n${initiator || ''}`;
  if (reads.has(key)) return reads.get(key);
  if (activeCount >= 4) return null;
  fetchM3u8Text._active = activeCount + 1;
  const pending = readManifestText(url, referrer, initiator);
  reads.set(key, pending);
  try { return await pending; }
  finally { fetchM3u8Text._active = Math.max(0, (fetchM3u8Text._active || 1) - 1); reads.delete(key); }
}

// Header-only probes: never leave an ignored Range request downloading in the background.
async function probeMediaSize(url, referrer = null) {
  if (!/^https?:\/\//i.test(url || '') || /\.(?:m3u8|mpd|m4s|ts)(?:[?#]|$)/i.test(url)) return 0;
  const cache = probeMediaSize.cache ||= new Map();
  const key = `${url}\n${referrer || ''}`, now = Date.now();
  const previous = cache.get(key);
  if (previous && previous.expires > now) return previous.promise;
  if ((probeMediaSize.active || 0) >= 4) return 0;
  for (const [entryKey, entry] of cache) if (entry.expires <= now) cache.delete(entryKey);
  while (cache.size >= 64) cache.delete(cache.keys().next().value);
  probeMediaSize.active = (probeMediaSize.active || 0) + 1;
  const promise = (async () => {
    const options = referrer && /^https?:\/\//i.test(referrer) ? [{referrer}, {referrerPolicy:'no-referrer'}] : [{}];
    for (const option of options) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      let response;
      try {
        response = await fetch(url, {...option, method:'GET', headers:{Range:'bytes=0-0'}, credentials:'include', signal:controller.signal});
        const type = response.headers.get('content-type') || '';
        if (!response.ok || /html|json|mpegurl|dash\+xml/i.test(type)) continue;
        const range = response.headers.get('content-range');
        const match = /^bytes 0-0\/(\d+)$/i.exec(range || '');
        const encoding = response.headers.get('content-encoding');
        const size = response.status === 206 && match ? Number(match[1])
          : response.status === 200 && !range && (!encoding || encoding === 'identity') ? Number(response.headers.get('content-length')) : 0;
        if (Number.isSafeInteger(size) && size > 0) return size;
      } catch (_) {
      } finally {
        clearTimeout(timer);
        try { await response?.body?.cancel(); } catch (_) {}
        controller.abort();
      }
    }
    return 0;
  })();
  cache.set(key, {promise, expires:now + 15000});
  try { return await promise; }
  finally { probeMediaSize.active--; }
}
async function readManifestText(url, referrer, initiator = null) {
  if (!url) return null;
  const options = [];
  if (initiator && initiator.startsWith('http')) {
    options.push({referrer: initiator});
  }
  if (referrer && referrer.startsWith('http') && (!initiator || referrer !== initiator)) {
    options.push({referrer});
  }
  options.push({referrerPolicy: 'no-referrer'}, {});
  for (const option of options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    let reader;
    try {
      const res = await fetch(url, {...option, signal: controller.signal});
      if (!res.ok || !res.body) continue;
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '', bytes = 0;
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) { controller.abort(); break; }
        text += decoder.decode(value, {stream: true});
      }
      if (!controller.signal.aborted) {
        text += decoder.decode();
        if (text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF') || text.includes('<MPD') || text.includes('#EXTINF')) return text;
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
      try { await reader?.cancel(); } catch (_) {}
      try { reader?.releaseLock(); } catch (_) {}
    }
  }
  return null;
}
