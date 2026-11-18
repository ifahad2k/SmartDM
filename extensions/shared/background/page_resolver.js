async function readPageMediaText(response, limit) {
  if (Number(response.headers?.get('content-length')) > limit) throw new Error('Source metadata is too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Source metadata is unavailable');
  const decoder = new TextDecoder(); let text = '', size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Source metadata is too large');
      text += decoder.decode(value, {stream: true});
    }
    return text + decoder.decode();
  } finally { try { await reader.cancel(); } catch (_) {} reader.releaseLock(); }
}

function parsePlayerSourceData(html) {
  const result = []; let visited = 0;
  const walk = (value, depth = 0, quality = null, type = '') => {
    if (depth > 12 || ++visited > 4000 || result.length >= 48 || !value) return;
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) result.push({url: value, quality, type});
      return;
    }
    if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1, quality, type)); return; }
    if (typeof value !== 'object') return;
    const q = value.quality || value.height || value.label || quality;
    const t = value.format || value.type || type;
    const url = value.videoUrl || value.url || value.src || value.file;
    if (typeof url === 'string') result.push({url, quality: Array.isArray(q) ? null : q, type: t, remote: value.remote === true});
    for (const [key, child] of Object.entries(value)) {
      if (['url', 'videoUrl', 'src', 'file', 'quality', 'height', 'label', 'format', 'type'].includes(key) || /recommend|related|ads|tracking/i.test(key)) continue;
      // Scalars can only be a named quality/source; arbitrary links are not media.
      if (typeof child === 'object' || /^(?:\d{3,4}p?|hls|mp4|webm)$/.test(key))
        walk(child, depth + 1, /^\d{3,4}p?$/.test(key) ? key : q, /hls|m3u8/i.test(key) ? 'hls' : t);
    }
  };
  // JSON source roots only. The scanner respects string escapes/braces and never evals.
  const markers = /["']?(?:mediaDefinitions|xplayerSettings|sources)["']?\s*[:=]\s*([\[{])/g;
  let m, roots = 0;
  while ((m = markers.exec(html)) && ++roots <= 32 && visited < 4000 && result.length < 48) {
    const start = markers.lastIndex - 1; let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < Math.min(html.length, start + 1024 * 1024); i++) {
      const c = html[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') { quoted = true; continue; }
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      if (depth === 0) { try { walk(JSON.parse(html.slice(start, i + 1))); } catch (_) {} markers.lastIndex = i + 1; break; }
    }
  }
  return result;
}

async function fetchPageMediaFormats(pageUrl) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15000);
  try {
    let page = new URL(pageUrl);
    if (!/^https?:$/.test(page.protocol) || page.username || page.password || /(^|\.)(facebook\.com|fb\.watch)$/.test(page.hostname)) return null;
    const res = await fetch(page.href, {credentials: 'include', signal: controller.signal});
    if (!res.ok) return null;
    if (res.url) { const redirected = new URL(res.url); if (!/^https?:$/.test(redirected.protocol) || redirected.username || redirected.password) return null; page = redirected; }
    const html = await readPageMediaText(res, 4 * 1024 * 1024);
    let title = html.match(/<meta\s+[^>]*property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1]
      || html.match(/<title>([^<]+)<\/title>/i)?.[1] || 'Video';
    title = sanitizeCleanTitle(title.replace(/&amp;/g, '&').replace(/&#39;/g, "'")) || 'Video';
    const sources = parsePlayerSourceData(html);
    const decode = value => { try { return JSON.parse('"' + value + '"').replace(/&amp;/g, '&'); } catch (_) { return value.replace(/&amp;/g, '&'); } };
    for (const m of html.matchAll(/html5player\.setVideo(UrlHigh|UrlLow|HLS)\(['"]([^'"\r\n]+)['"]\)/g))
      sources.push({url: decode(m[2]), quality: null, type: m[1] === 'HLS' ? 'hls' : 'mp4'});
    for (const m of html.matchAll(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi))
      sources.push({url: decode(m[1]), quality: m[0].match(/(?:res|size|height)=["']?(\d+)/i)?.[1]});
    for (const m of html.matchAll(/<meta\s+[^>]*(?:property|name)=["'](?:og:video(?::(?:url|secure_url))?|twitter:player:stream)["']\s+content=["']([^"']+)["']/gi)) {
      // og:video is often a watch/embed HTML page (not media).
      if (/\.(?:mp4|webm|m3u8)(?:[?#]|$)/i.test(m[1])) sources.push({url: decode(m[1])});
    }
    for (const m of html.matchAll(/["']?(\d{3,4}p?)["']?\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/gi))
      sources.push({url: decode(m[2]), quality: m[1]});
    const formats = [], seen = new Set(); let requests = 0;
    const visit = async (source, depth = 0) => {
      if (depth > 2 || requests >= 12 || formats.length >= 24 || controller.signal.aborted) return;
      let url;
      try { url = new URL(source.url, page); } catch (_) { return; }
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || seen.has(url.href)) return;
      seen.add(url.href);
      const remote = source.remote || /\/video\/get_media(?:[?#]|$)/i.test(url.href);
      if (remote && url.origin !== page.origin) return;
      const hls = /hls|m3u8/i.test(source.type || '') || /\.m3u8(?:[?#]|$)/i.test(url.href);
      const requestStop = new AbortController();
      const stop = () => requestStop.abort(); controller.signal.addEventListener('abort', stop, {once: true});
      const timeout = setTimeout(stop, 3500);
      try {
        requests++;
        const response = await fetch(url.href, {credentials: 'include', referrer: page.href,
          headers: hls || remote ? {} : {Range: 'bytes=0-0'}, signal: requestStop.signal});
        if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} return; }
        const type = response.headers.get('content-type') || '';
        if (remote) {
          const data = JSON.parse(await readPageMediaText(response, 1024 * 1024));
          const nested = parsePlayerSourceData('sources=' + JSON.stringify(data));
          for (const child of nested) await visit(child, depth + 1);
          return;
        }
        if (hls || /mpegurl/i.test(type)) {
          const text = await readPageMediaText(response, 4 * 1024 * 1024);
          if (!text.trimStart().startsWith('#EXTM3U')) return;
          if (text.includes('#EXT-X-STREAM-INF')) {
            for (const f of parseM3u8Formats(text, response.url || url.href))
              formats.push({...f, title, videoUrl: page.href, referer: page.href,
                mediaKind: /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(f.url) ? 'http' : 'hls'});
          } else if (text.includes('#EXTINF:') && text.includes('#EXT-X-ENDLIST')) {
            const height = parseInt(source.quality, 10) || extractResolutionNumber(url.href) || 0;
            formats.push({formatId: 'page_hls_' + height, url: url.href, directUrl: url.href, ext: 'mp4',
              title, height, resolution: height ? `${height}p (MP4)` : 'Playing quality (MP4)', mediaKind: 'hls',
              manifestText: text, referer: page.href, videoUrl: page.href});
          }
          return;
        }
        try { await response.body?.cancel(); } catch (_) {}
        if (!/^(?:video|audio)\//i.test(type)) return;
        const height = parseInt(source.quality, 10) || extractResolutionNumber(url.href) || 0;
        formats.push({formatId: 'page_direct_' + formats.length, url: url.href, directUrl: url.href, title,
          height, ext: /webm/i.test(type) ? 'webm' : 'mp4', mediaKind: 'http', isAudioOnly: /^audio\//i.test(type),
          resolution: height ? `${height}p (MP4)` : 'Source quality (resolution unknown)', referer: page.href, videoUrl: page.href});
      } catch (_) { /* Failed/expired sources cannot be advertised as verified formats. */ }
      finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', stop); }
    };
    sources.sort((a,b) => Number(/hls|m3u8/i.test(b.type || b.url)) - Number(/hls|m3u8/i.test(a.type || a.url)) || (parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0));
    for (const source of sources) await visit(source);
    formats.sort((a,b) => (b.height||0)-(a.height||0));
    const unique = formats.filter((f,i) => formats.findIndex(x => x.url === f.url) === i);
    return unique.length ? {success: true, status: 'ok', title, formats: unique} : null;
  } catch (_) { return null; }
  finally { clearTimeout(deadline); }
}
