// SmartDM Universal In-Page Manifest Sniffer
// Captures authentic HLS (.m3u8) and DASH (.mpd) playlists before players initialize.
// Captures are bounded and retained only for discovery and download handoff.

(function() {
  if (window.__smartdm_sniffer_installed__) return;

  // In subframes (iframes), ignore ad networks and analytics trackers
  if (window.top !== window.self) {
    try {
      const host = window.location.hostname.toLowerCase();
      if (!host || host.includes('doubleclick') || host.includes('googleads') || host.includes('googlesyndication') ||
          host.includes('criteo') || host.includes('taboola') || host.includes('outbrain') ||
          host.includes('adnxs') || host.includes('rubiconproject') || host.includes('amazon-adsystem') ||
          host.includes('adroll') || host.includes('quantserve') || host.includes('facebook.com/plugins') ||
          host.includes('facebook.com/v') || host.includes('connect.facebook.net') || host.includes('analytics') ||
          host.includes('clarity.ms') || host.includes('hotjar') || host.includes('scorecardresearch') ||
          host.includes('trafficjunky') || host.includes('exoclick') || host.includes('popcash') ||
          host.includes('juicyads') || host.includes('ero-advertising') || host.includes('syndication') ||
          host.includes('popads') || host.includes('propellerads') || host.includes('adsterra') ||
          host.includes('monetag')) {
        return;
      }
    } catch(e) { return; }
  }

  window.__smartdm_sniffer_installed__ = true;

  try {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-smartdm-sniffer', '1');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.documentElement) document.documentElement.setAttribute('data-smartdm-sniffer', '1');
      });
    }
  } catch(e) {}

  const MANIFEST_EXT_REGEX = /\.(m3u8|mpd)(?:$|[?#])/i;
  const MANIFEST_PATH_REGEX = /(?:stream-embed\/(?:playlist|media)|\/(?:playlists?|manifests?|master|hls|dash|streams?|sources?|prox(?:y|ies)|embeds?|videos?|media|play(?:back)?|api\/streams?|prorcp|chunklists?|vod|live|file|serve)(?:[?#/]|$)|[?&](?:format=m3u8|type=m3u8|source=m3u8|file=.*\.m3u8))/i;
  const BINARY_EXT_REGEX = /\.(ts|m4s|mp4|m4a|m4v|webm|mkv|aac|mp3|flac|wav|ogg|png|jpg|jpeg|webp|gif|svg|ico|css|js|wasm)(?:$|[?#])/i;
  const IGNORED_DOMAINS_REGEX = /(?:fbcdn\.net|facebook\.com|messenger\.com|instagram\.com|googlevideo\.com|ytimg\.com|googleads|doubleclick\.net)/i;
  const capturedUrls = new Set();
  const pendingReads = new Set();
  // Long VOD playlists contain thousands of signed URLs. Bound both reads and
  // retained snapshots; a three-entry count alone is insufficient for movies.
  const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
  const MAX_STASH_CHARS = 8 * 1024 * 1024;

  function inspectJsonResponseForManifests(text, requestUrl) {
    if (!text || typeof text !== 'string' || text.length > 500000) return;
    try {
      const unescapedText = text.replace(/\\\/+/g, '/');
      const m3u8Matches = unescapedText.match(/https?:\/\/[^"'\s\\]+?\.(?:m3u8|mpd)[^"'\s\\]*/gi);
      if (m3u8Matches && m3u8Matches.length > 0) {
        for (let mUrl of m3u8Matches) {
          mUrl = mUrl.replace(/\\/g, '');
          if (!capturedUrls.has(mUrl)) {
            stashAndEmitManifest(mUrl, `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n${mUrl}`);
            try {
              window.dispatchEvent(new CustomEvent('__smartdm_manifest_captured__', {
                detail: { url: mUrl, text: null, playerId: null, candidateUrl: mUrl }
              }));
            } catch (_) {}
          }
        }
      }
      if (unescapedText.includes('"file"') || unescapedText.includes('"url"') || unescapedText.includes('"sources"') ||
          unescapedText.includes('"source"') || unescapedText.includes('"src"') || unescapedText.includes('"stream"') ||
          unescapedText.includes('"link"')) {
        try {
          const data = JSON.parse(text);
          const findSources = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            const candidates = [obj.file, obj.url, obj.src, obj.source, obj.stream, obj.link, obj.video, obj.playlist, obj.manifest].filter(v => typeof v === 'string');
            for (const cand of candidates) {
              let fullUrl = cand;
              try { fullUrl = new URL(cand, requestUrl || window.location.href).href; } catch(_) {}
              if (!capturedUrls.has(fullUrl) && (isLikelyManifestUrl(fullUrl) || /\.(?:m3u8|mpd|mp4)(?:[?#]|$)/i.test(fullUrl) || /(?:stream|source|playlist|master|hls)/i.test(fullUrl))) {
                stashAndEmitManifest(fullUrl, `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n${fullUrl}`);
                try {
                  window.dispatchEvent(new CustomEvent('__smartdm_manifest_captured__', {
                    detail: { url: fullUrl, text: null, playerId: null, candidateUrl: fullUrl }
                  }));
                } catch (_) {}
              }
            }
            for (const k in obj) {
              if (typeof obj[k] === 'object') findSources(obj[k]);
            }
          };
          findSources(data);
        } catch (_) {}
      }
    } catch (_) {}
  }

  function stripByteRangeParams(url) {
    if (!url || typeof url !== 'string') return url;
    try {
      const u = new URL(url, window.location.href);
      if (u.searchParams.has('bytestart') || u.searchParams.has('byteend') || u.searchParams.has('range')) {
        u.searchParams.delete('bytestart');
        u.searchParams.delete('byteend');
        u.searchParams.delete('range');
        return u.href;
      }
    } catch (_) {}
    return url;
  }

  // Associate actual network buffers with the SourceBuffer that consumes them.
  // Weak keys never retain response bodies, players or detached DOM elements.
  // This handles ordinary MSE/DASH players without guessing from tab-wide traffic.
  const networkBuffers = new WeakMap(), sourceStates = new WeakMap(), bufferOwners = new WeakMap();
  const streamOwners = new WeakMap(), readerOwners = new WeakMap();
  const sampledResources = new Map(), sampleIndex = new Map();
  const SAMPLE_BYTES = 32, MAX_SAMPLE_RESOURCES = 16, MAX_RESOURCE_SAMPLES = 128;
  const MAX_BUFFER_SPANS = 32;
  function byteSpan(value) {
    if (ArrayBuffer.isView(value)) return {buffer: value.buffer, start: value.byteOffset, end: value.byteOffset + value.byteLength};
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return {buffer: value, start: 0, end: value.byteLength};
    return null;
  }
  function copiedSpans(value) {
    const span = byteSpan(value);
    if (!span) return [];
    return (networkBuffers.get(span.buffer) || []).flatMap(part => {
      const start = Math.max(part.start, span.start), end = Math.min(part.end, span.end);
      return end > start ? [{start: start - span.start, end: end - span.start, metadata: part.metadata}] : [];
    });
  }
  function writeSpans(buffer, start, end, incoming) {
    if (end <= start) return;
    const previous = networkBuffers.get(buffer);
    if (previous === undefined && !incoming.length) return;
    // Overflow remains untrusted until a full overwrite, rather than forgetting
    // one of several sources and mistaking the remainder for a single source.
    if (previous === false && (start !== 0 || end !== buffer.byteLength)) return;
    const spans = (previous || []).flatMap(part => {
      const keep = [];
      if (part.start < start) keep.push({...part, end: Math.min(part.end, start)});
      if (part.end > end) keep.push({...part, start: Math.max(part.start, end)});
      return keep;
    });
    spans.push(...incoming.map(part => ({...part, start: part.start + start, end: part.end + start})));
    spans.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const part of spans) {
      const last = merged[merged.length - 1];
      if (last && last.end === part.start && last.metadata.url === part.metadata.url) last.end = part.end;
      else merged.push({...part});
    }
    if (merged.length) networkBuffers.set(buffer, merged.length > MAX_BUFFER_SPANS ? false : merged);
    else networkBuffers.delete(buffer);
  }
  function appendedMetadata(bytes) {
    const span = byteSpan(bytes);
    if (span && networkBuffers.get(span.buffer) === false) return false;
    const spans = copiedSpans(bytes).filter(part => part.end - part.start >= 32);
    if (!spans.length) return null;
    const metadata = spans[0].metadata;
    // Remux headers may be generated, but media from two different resources
    // cannot identify one selected stream. Never pick the most recent request.
    return spans.every(part => part.metadata.url === metadata.url) ? metadata : false;
  }
  function forgetSamples(resource) {
    for (const record of resource.samples) {
      const bucket = sampleIndex.get(record.words[0]);
      bucket?.delete(record);
      if (!bucket?.size) sampleIndex.delete(record.words[0]);
    }
    sampledResources.delete(resource.url);
  }
  function mp4Boxes(bytes, visit, start = 0, end = bytes.byteLength, depth = 0) {
    const span = byteSpan(bytes);
    if (!span || depth > 4) return;
    const view = new DataView(span.buffer, span.start, span.end - span.start);
    for (let offset = start, count = 0; count < 128 && offset + 8 <= end; count++) {
      let size = view.getUint32(offset), header = 8;
      const type = String.fromCharCode(...new Uint8Array(span.buffer, span.start + offset + 4, 4));
      if (size === 1) {
        if (offset + 16 > end) break;
        size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12); header = 16;
      }
      if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header) break;
      const stop = Math.min(end, offset + size);
      visit(type, offset + header, stop, view);
      if (['moov', 'trak', 'mdia'].includes(type)) mp4Boxes(bytes, visit, offset + header, stop, depth + 1);
      offset += size;
    }
  }
  function sampleResource(bytes, metadata) {
    // This fallback follows byte identity across worker transfers/remux copies.
    // Only media responses representing backing resources qualify; never JSON,
    // playlists or known isolated HLS/DASH fragment URLs.
    const isMeta = /(?:cdninstagram\.com|fbcdn\.net|facebook\.com|instagram\.com)/i.test(metadata.url || "");
    if (!/^https?:\/\//i.test(metadata.url || '') || !/(?:video|audio)\/(?:mp4|webm)/i.test(metadata.type || '') ||
        /\.(?:m4s|ts|aac)(?:[?#]|$)|\/(?:seg-|fragment-)/i.test(metadata.url) ||
        ![200, 206].includes(metadata.status) || (!isMeta && !(metadata.length >= 65536 || metadata.range))) return;
    const span = byteSpan(bytes);
    if (!span || span.end - span.start < SAMPLE_BYTES * 2) return;
    const now = Date.now();
    for (const resource of sampledResources.values()) if (now - resource.seen > 120000) forgetSamples(resource);
    let resource = sampledResources.get(metadata.url);
    if (!resource) {
      if (sampledResources.size >= MAX_SAMPLE_RESOURCES) forgetSamples(sampledResources.values().next().value);
      resource = {url: stripByteRangeParams(metadata.url), contentType: metadata.type, kind: /^audio\//i.test(metadata.type) ? 'audio' : 'unknown', samples: [], seen: now};
    }
    resource.seen = now;
    sampledResources.delete(resource.url); sampledResources.set(resource.url, resource);
    mp4Boxes(bytes, (type, start, end, view) => {
      if (type === 'hdlr' && start + 12 <= end) {
        const kind = view.getUint32(start + 8);
        if (kind === 0x76696465) resource.kind = 'video';
        else if (kind === 0x736f756e && resource.kind !== 'video') resource.kind = 'audio';
      }
    });
    const view = new DataView(span.buffer, span.start, span.end - span.start);
    const step = Math.max(SAMPLE_BYTES, Math.floor((view.byteLength - SAMPLE_BYTES) / 63));
    for (let offset = 0, n = 0; offset + SAMPLE_BYTES <= view.byteLength && n < 64; offset += step, n++) {
      const words = Array.from({length: 8}, (_, i) => view.getUint32(offset + i * 4));
      if (new Set(words).size < 4) continue;
      if (resource.samples.length >= MAX_RESOURCE_SAMPLES) {
        // Keep initial payload evidence even when the browser prefetches the
        // complete file before its first MSE append; rotate only the tail.
        const old = resource.samples.splice(64, 1)[0], bucket = sampleIndex.get(old.words[0]);
        bucket.delete(old); if (!bucket.size) sampleIndex.delete(old.words[0]);
      }
      const record = {words, resource};
      resource.samples.push(record);
      if (!sampleIndex.has(words[0])) sampleIndex.set(words[0], new Set());
      sampleIndex.get(words[0]).add(record);
    }
  }
  function sampledMetadata(bytes) {
    if (!sampleIndex.size) return null;
    const span = byteSpan(bytes), hits = new Map();
    if (!span) return null;
    let budget = 65536;
    mp4Boxes(bytes, (type, start, end, view) => {
      // Match compressed payload, never common codec/init headers. At least two
      // distinct exact 32-byte samples must agree on the same network resource.
      if (type !== 'mdat') return;
      for (let offset = start; offset + SAMPLE_BYTES <= end && budget-- > 0; offset++) {
        const bucket = sampleIndex.get(view.getUint32(offset));
        if (!bucket) continue;
        for (const record of bucket) {
          if (!record.words.every((word, i) => word === view.getUint32(offset + i * 4))) continue;
          if (!hits.has(record.resource)) hits.set(record.resource, new Set());
          hits.get(record.resource).add(record.words.join(','));
        }
      }
    });
    const matches = [...hits].filter(([, samples]) => samples.size >= 2).map(([resource]) => resource);
    return matches.length === 1 ? {url: matches[0].url, contentType: matches[0].contentType, kind: matches[0].kind} : matches.length > 1 ? false : null;
  }
  function sourceState(source) {
    if (!sourceStates.has(source)) sourceStates.set(source, {blobs: [], video: null, audio: null, audioExpected: false, lastSync: 0});
    return sourceStates.get(source);
  }
  function rememberBuffer(buffer, url, contentType, range) {
    const span = byteSpan(buffer);
    if (!span) return;
    // BYOB readers can reuse a previous response's backing buffer.
    if (networkBuffers.has(span.buffer)) writeSpans(span.buffer, span.start, span.end, []);
    if (!/^https?:\/\//i.test(url || '')) return;
    const total = Number((range || '').match(/\/(\d+)$/)?.[1]) || 0;
    // Individual HLS/DASH fragments are not complete downloadable resources.
    // A ranged backing file is usable even when its URL has no extension.
    const isMeta = /(?:cdninstagram\.com|fbcdn\.net|facebook\.com|instagram\.com)/i.test(url || "");
    const backingRange = (isMeta || (total > (buffer.byteLength || 0) && total > 1048576)) && /(?:video|audio)\/(?:mp4|webm)|octet-stream/i.test(contentType || "");
    let completeMp4 = false;
    try {
      const view = new DataView(span.buffer, span.start, span.end - span.start);
      let offset = 0, ftyp = false, moov = false, media = false;
      for (let i = 0; i < 32 && offset + 8 <= view.byteLength; i++) {
        const size = view.getUint32(offset), type = String.fromCharCode(...new Uint8Array(span.buffer, span.start + offset + 4, 4));
        if (size < 8 || size > view.byteLength - offset) break;
        ftyp ||= type === 'ftyp'; moov ||= type === 'moov'; media ||= type === 'mdat';
        offset += size;
      }
      completeMp4 = ftyp && moov && media;
    } catch (_) {}
    if (!backingRange && !completeMp4) return;
    writeSpans(span.buffer, span.start, span.end, [{start: 0, end: span.end - span.start, metadata: {url: stripByteRangeParams(url), contentType}}]);
  }
  function bindSource(state) {
    state.lastSync = Date.now();
    document.querySelectorAll('video, audio').forEach(media => {
      const src = media.currentSrc || media.src;
      if (!state.blobs.includes(src)) return;
      if (media.getAttribute?.('data-smartdm-bound-src') !== src) {
        media.removeAttribute?.('data-smartdm-video-url'); media.removeAttribute?.('data-smartdm-audio-url');
      }
      media.setAttribute('data-smartdm-bound-src', src);
      if (state.video) media.setAttribute('data-smartdm-video-url', stripByteRangeParams(state.video.url));
      else media.removeAttribute?.('data-smartdm-video-url');
      if (state.audio) media.setAttribute('data-smartdm-audio-url', stripByteRangeParams(state.audio.url));
      else media.removeAttribute?.('data-smartdm-audio-url');
      media.setAttribute('data-smartdm-separate-audio', state.audioExpected ? '1' : '0');
    });
  }
  try {
    // Follow the player's own copies without retaining media bytes or changing
    // them. Untagged writes remove overlapping provenance, including pool reuse.
    const set = Uint8Array.prototype.set;
    Uint8Array.prototype.set = function(value, offset = 0) {
      const result = set.apply(this, arguments);
      try {
        if (ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1 && typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) {
          writeSpans(this.buffer, this.byteOffset + offset, this.byteOffset + offset + value.byteLength, copiedSpans(value));
        } else if (networkBuffers.has(this.buffer)) {
          // Non-byte sources/coercible offsets can run arbitrary getters. Avoid
          // reading them twice or trusting a partially overwritten old buffer.
          networkBuffers.set(this.buffer, false);
        }
      } catch (_) {}
      return result;
    };
    const slice = Uint8Array.prototype.slice;
    Uint8Array.prototype.slice = function(...args) {
      const result = slice.apply(this, args);
      try {
        if (args.every(arg => arg === undefined || (typeof arg === 'number' && Number.isInteger(arg)))) {
          const length = this.length;
          const start = args[0] === undefined ? 0 : Math.min(length, Math.max(0, args[0] < 0 ? length + args[0] : args[0]));
          const source = new Uint8Array(this.buffer, this.byteOffset + start, result.byteLength);
          writeSpans(result.buffer, result.byteOffset, result.byteOffset + result.byteLength, copiedSpans(source));
        }
      } catch (_) {}
      return result;
    };
    const fill = Uint8Array.prototype.fill;
    Uint8Array.prototype.fill = function(...args) {
      const result = fill.apply(this, args);
      // Clearing pooled storage cannot leave evidence from its previous video.
      try { if (networkBuffers.has(this.buffer)) networkBuffers.set(this.buffer, false); } catch (_) {}
      return result;
    };
    const body = typeof Response !== 'undefined' && Object.getOwnPropertyDescriptor(Response.prototype, 'body');
    if (body?.get && body.configurable) {
      Object.defineProperty(Response.prototype, 'body', {...body, get() {
        const stream = body.get.call(this);
        try {
          if (stream) streamOwners.set(stream, {url: this.url, type: this.headers.get('content-type'), range: this.headers.get('content-range'),
            length: Number(this.headers.get('content-length')), status: this.status});
        } catch (_) {}
        return stream;
      }});
    }
    if (typeof ReadableStream !== 'undefined') {
      const getReader = ReadableStream.prototype.getReader;
      ReadableStream.prototype.getReader = function(...args) {
        const reader = getReader.apply(this, args), metadata = streamOwners.get(this);
        if (metadata) readerOwners.set(reader, metadata);
        return reader;
      };
    }
    for (const Reader of [typeof ReadableStreamDefaultReader === 'undefined' ? null : ReadableStreamDefaultReader,
      typeof ReadableStreamBYOBReader === 'undefined' ? null : ReadableStreamBYOBReader]) {
      if (!Reader) continue;
      const read = Reader.prototype.read;
      Reader.prototype.read = function(...args) {
        const result = read.apply(this, args), metadata = readerOwners.get(this);
        if (!metadata) return result;
        return result.then(chunk => {
          try { if (chunk.value) { rememberBuffer(chunk.value, metadata.url, metadata.type, metadata.range); sampleResource(chunk.value, metadata); } } catch (_) {}
          return chunk;
        });
      };
    }
    if (typeof Response !== 'undefined' && Response.prototype.arrayBuffer) {
      const arrayBuffer = Response.prototype.arrayBuffer;
      Response.prototype.arrayBuffer = function(...args) {
        const response = this;
        return arrayBuffer.apply(this, args).then(buffer => {
          try { rememberBuffer(buffer, response.url, response.headers.get('content-type'), response.headers.get('content-range')); } catch (_) {}
          return buffer;
        });
      };
    }
    const response = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
    if (response?.get && response.configurable) {
      Object.defineProperty(XMLHttpRequest.prototype, 'response', {...response, get() {
        const value = response.get.call(this);
        try { if (this.responseType === 'arraybuffer') rememberBuffer(value, this.responseURL,
          this.getResponseHeader('content-type'), this.getResponseHeader('content-range')); } catch (_) {}
        return value;
      }});
    }
    if (typeof MediaSource !== 'undefined' && typeof SourceBuffer !== 'undefined') {
      const createObjectURL = URL.createObjectURL;
      URL.createObjectURL = function(object) {
        const url = createObjectURL.apply(this, arguments);
        if (object instanceof MediaSource) {
          const state = sourceState(object);
          if (state.blobs.length >= 4) state.blobs.shift();
          state.blobs.push(url);
        }
        return url;
      };
      const add = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function(type) {
        const buffer = add.apply(this, arguments), state = sourceState(this);
        const audio = /^audio\//i.test(type);
        if (audio) { state.audioExpected = true; bindSource(state); }
        bufferOwners.set(buffer, {state, audio});
        return buffer;
      };
      const append = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function(bytes) {
        const result = append.apply(this, arguments);
        try {
          const owner = bufferOwners.get(this), direct = appendedMetadata(bytes);
          const metadata = direct === null ? sampledMetadata(bytes) : direct;
          let initialization = false;
          if (owner && metadata === null) mp4Boxes(bytes, type => { if (type === 'ftyp' || type === 'moov') initialization = true; });
          // Once bytes prove this MediaSource's backing resource, ordinary later
          // appends may come from a worker/cache outside the retained sample
          // window. Keep that session identity until a new init, conflicting
          // evidence or the element's source changes; never borrow tab traffic.
          if (owner && (metadata !== null || initialization)) {
            const track = owner.audio || metadata?.kind === 'audio' ? 'audio' : 'video';
            if (track === 'audio') owner.state.audioExpected = true;
            if (initialization && track === 'video') owner.state.audio = null;
            if (metadata && metadata.url) metadata.url = stripByteRangeParams(metadata.url);
            const changed = owner.state[track]?.url !== (metadata?.url);
            owner.state[track] = metadata || null;
            if (changed || Date.now() - owner.state.lastSync > 1000) bindSource(owner.state);
          }
        } catch (_) {}
        return result;
      };
    }
  } catch (_) { /* Discovery hooks must never prevent normal playback. */ }

  async function readManifestClone(response, requestUrl) {
    let reader, timer;
    try {
      const clone = response.clone();
      if (!clone.body) return;
      reader = clone.body.getReader();
      // Cancel only our tee branch. Never cancel or delay the player's response.
      let cancelled = false;
      const cancel = () => { cancelled = true; reader.cancel().catch(() => {}); };
      timer = setTimeout(cancel, 5000);
      const decoder = new TextDecoder();
      let text = '', bytes = 0;
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_MANIFEST_BYTES) { cancel(); return; }
        text += decoder.decode(value, {stream: true});
      }
      if (cancelled) return;
      text += decoder.decode();
      if (text.includes('#EXT-X-STREAM-INF') || text.includes('<MPD') || text.includes('&lt;MPD') || (text.includes('#EXTM3U') && (text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION') || text.includes('#EXT-X-MEDIA')))) {
        stashAndEmitManifest(response.url || requestUrl, text);
      } else {
        inspectJsonResponseForManifests(text, response.url || requestUrl);
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
      try { reader?.releaseLock(); } catch (_) {}
      pendingReads.delete(requestUrl);
    }
  }

  function isLikelyManifestUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) return false;
    if (BINARY_EXT_REGEX.test(url) || IGNORED_DOMAINS_REGEX.test(url)) return false;
    if (url.includes('bytestart=') || url.includes('byteend=') || url.includes('/seg-') || url.includes('/fragment-') || url.includes('/sq/')) return false;
    return MANIFEST_EXT_REGEX.test(url) || MANIFEST_PATH_REGEX.test(url);
  }

  function stashAndEmitManifest(url, text, playerId = null, height = 0, track = "video") {
    if (!text || typeof text !== 'string' || text.length > MAX_MANIFEST_BYTES) return;
    const manifestUrl = url || window.location.href;
    if (capturedUrls.has(manifestUrl) && !playerId) return;

    if (text.includes('#EXT-X-STREAM-INF') || text.includes('<MPD') || text.includes('&lt;MPD') || (text.includes('#EXTM3U') && (text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION') || text.includes('#EXT-X-MEDIA')))) {
      if (capturedUrls.size >= 50) {
        const first = capturedUrls.values().next().value;
        if (first) capturedUrls.delete(first);
      }
      capturedUrls.add(manifestUrl);

      try {
        const root = document.head || document.documentElement || document.body;
        if (root) {
          const existing = root.querySelector(`smartdm-manifest-stash[data-smartdm-url="${CSS.escape(manifestUrl)}"]`);
          if (existing && playerId && existing.textContent === text && existing.getAttribute('data-smartdm-player') === playerId &&
              existing.getAttribute('data-smartdm-height') === String(height) && existing.getAttribute('data-smartdm-track') === track) return;
          const retained = Array.from(root.querySelectorAll('smartdm-manifest-stash')).filter(s => s !== existing);
          let retainedChars = retained.reduce((sum, s) => sum + (s.textContent || '').length, 0);
          while (retained.length && (retained.length >= 4 || retainedChars + text.length > MAX_STASH_CHARS)) {
            const nonMasterIdx = retained.findIndex(s => !(s.textContent || '').includes('#EXT-X-STREAM-INF'));
            const oldest = nonMasterIdx !== -1 ? retained.splice(nonMasterIdx, 1)[0] : retained.shift();
            retainedChars -= (oldest.textContent || '').length;
            oldest.remove();
          }
          if (existing) {
            existing.textContent = text;
            if (playerId) { existing.setAttribute("data-smartdm-player", playerId); existing.setAttribute("data-smartdm-height", String(height)); existing.setAttribute("data-smartdm-track", track); }
          } else {
            const stashEl = document.createElement('smartdm-manifest-stash');
            stashEl.setAttribute('data-smartdm-url', manifestUrl);
            stashEl.textContent = text;
            if (playerId) { stashEl.setAttribute('data-smartdm-player', playerId); stashEl.setAttribute('data-smartdm-height', String(height)); stashEl.setAttribute('data-smartdm-track', track); }
            if (stashEl.style) stashEl.style.display = 'none';
            root.appendChild(stashEl);
          }
        }
      } catch(e) {}

      try {
        window.dispatchEvent(new CustomEvent('__smartdm_manifest_captured__', {
          detail: { url: manifestUrl, text: playerId ? null : text, playerId }
        }));
      } catch(e) {}
    }
  }

  // Observe the player's already-parsed playlist. No keys, WASM state, or
  // decoder implementation is copied. Each capture belongs to its actual video.
  let nextPlayerId = 0;
  const wrappedHls = new WeakMap();
  function observeHls(Hls) {
    if (typeof Hls !== 'function' || !Hls.Events) return Hls;
    if (wrappedHls.has(Hls)) return wrappedHls.get(Hls);
    const wrapper = new Proxy(Hls, { construct(target, args, newTarget) {
      const instance = Reflect.construct(target, args, newTarget);
      try {
        const id = `hls-${++nextPlayerId}`;
        let expectsAudio = false;
        const markAudio = tracks => {
          if ((tracks || []).some(t => !!t.url)) expectsAudio = true;
          if (instance.media) instance.media.setAttribute('data-smartdm-hls-external-audio', expectsAudio ? '1' : '0');
        };
        const clear = () => {
          expectsAudio = false;
          if (instance.media) instance.media.setAttribute('data-smartdm-hls-external-audio', '0');
          document.querySelectorAll('smartdm-manifest-stash').forEach(s => {
            if (s.getAttribute('data-smartdm-player') === id) s.remove();
          });
        };
        instance.on(Hls.Events.MANIFEST_LOADING, clear);
        instance.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (instance.media) instance.media.setAttribute('data-smartdm-hls-player', id);
          markAudio(instance.audioTracks);
        });
        instance.on(Hls.Events.DESTROYING, clear);
        instance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => markAudio(data?.audioTracks || instance.audioTracks));
        if (Hls.Events.AUDIO_TRACKS_UPDATED)
          instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => markAudio(data?.audioTracks || instance.audioTracks));
        const capture = (track, data) => {
          try {
            const video = instance.media;
            const details = data && data.details;
            if (!video || !details || details.live || typeof details.m3u8 !== 'string') return;
            // A detached/recycled player must not hand off an earlier episode.
            if (!video.isConnected) return;
            video.setAttribute('data-smartdm-hls-player', id);
            markAudio(instance.audioTracks);
            const selectedAudio = (instance.audioTracks || [])[instance.audioTrack];
            if (track === 'audio') {
              // Event IDs belong to a rendition group; audioTrack is an index
              // into the currently exposed tracks, not necessarily that ID.
              if (!selectedAudio || (data.id !== undefined && data.id !== (selectedAudio.id ?? instance.audioTrack)) ||
                  (data.groupId && selectedAudio.groupId && data.groupId !== selectedAudio.groupId)) return;
              expectsAudio = true;
              markAudio([]);
            }
            const level = track === 'audio' ? selectedAudio : data.levelInfo || (instance.levels && instance.levels[data.level]);
            const url = details.url || (level && (Array.isArray(level.url) ? level.url[0] : level.url)) || instance.url;
            if (!/^https?:\/\//i.test(url || '')) return;
            const height = level && level.height || video.videoHeight || 0;
            stashAndEmitManifest(url, details.m3u8, id, height, track);
          } catch (_) {}
        };
        instance.on(Hls.Events.LEVEL_LOADED, (_event, data) => capture('video', data));
        instance.on(Hls.Events.AUDIO_TRACK_LOADED, (_event, data) => capture('audio', data));
      } catch (_) {}
      return instance;
    }});
    wrappedHls.set(Hls, wrapper);
    wrappedHls.set(wrapper, wrapper);
    return wrapper;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'Hls');
    if (!descriptor || (descriptor.configurable && !descriptor.get && !descriptor.set)) {
      let value = observeHls(window.Hls);
      Object.defineProperty(window, 'Hls', { configurable: true, enumerable: true,
        get() { return value; }, set(next) { value = observeHls(next); } });
    }
  } catch (_) {}

  // Hook only likely playlists, with bounded concurrent clone readers.
  try {
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = async function(...args) {
        try {
          const opts = args[1];
          if (opts && (opts._smartdm_probe || opts.headers?.['x-smartdm-probe'] || (typeof opts.headers?.get === 'function' && opts.headers.get('x-smartdm-probe')))) {
            return origFetch.apply(this, args);
          }
        } catch(e) {}

        const resp = await origFetch.apply(this, args);
        try {
          const reqUrl = (typeof args[0] === 'string') ? args[0] : (args[0] && (args[0].url || args[0].href));
          const contentType = (resp.headers?.get('content-type') || '').toLowerCase();
          const playlistMime = /mpegurl|dash\+xml/i.test(contentType) && !IGNORED_DOMAINS_REGEX.test(reqUrl || '');
          const isManifestUrl = isLikelyManifestUrl(reqUrl);
          const isPotentialProxyStream = !BINARY_EXT_REGEX.test(reqUrl || '') && (
            /text\/plain|application\/octet-stream|binary\/octet-stream/i.test(contentType) &&
            /(?:stream|source|proxy|playlist|master|hls|embed|video|media|play|chunklist|vod)/i.test(reqUrl || '')
          );
          const isJsonApi = (contentType.includes('json') || (reqUrl && reqUrl.includes('.json')) || (reqUrl && /(?:api|ajax|source|stream|embed|player|prorcp|playback)/i.test(reqUrl))) && !IGNORED_DOMAINS_REGEX.test(reqUrl || '');

          if ((isManifestUrl || playlistMime || isPotentialProxyStream || isJsonApi) && !capturedUrls.has(reqUrl) && !pendingReads.has(reqUrl) && pendingReads.size < 4) {
            const headers = resp.headers;
            if (headers) {
              if (contentType.includes('video/') || contentType.includes('audio/') ||
                  contentType.includes('image/') || (!isManifestUrl && !playlistMime && !isPotentialProxyStream && contentType.includes('octet-stream'))) {
                return resp;
              }
              const lenStr = headers.get('content-length');
              if (lenStr) {
                const len = parseInt(lenStr, 10);
                if (!isNaN(len) && len > MAX_MANIFEST_BYTES) return resp;
              }
            }
            pendingReads.add(reqUrl);
            void readManifestClone(resp, reqUrl);
          }
        } catch(e) {}
        return resp;
      };
    }
  } catch(e) {}

  // Hook XMLHttpRequest strictly for manifest interception
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const observedXhrs = new WeakSet();
    XMLHttpRequest.prototype.open = function(method, url) {
      this._smartdm_req_url = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      // MIME-typed proxy/extensionless playlists cannot be identified at send.
      // One weakly tracked listener per XHR checks headers before touching text.
      if (observedXhrs.has(xhr)) return origSend.apply(this, arguments);
      observedXhrs.add(xhr);
      this.addEventListener('load', function() {
        try {
          const reqUrl = xhr._smartdm_req_url;
          const responseUrl = xhr.responseURL || reqUrl;
          if (!capturedUrls.has(responseUrl)) {
            const respType = xhr.responseType;
            let txt = null;
            if (!respType || respType === 'text') {
              txt = xhr.responseText;
            } else if (respType === 'arraybuffer' && (xhr.response instanceof ArrayBuffer || typeof xhr.response?.byteLength === 'number')) {
              if (xhr.response.byteLength <= MAX_MANIFEST_BYTES) {
                try { txt = new TextDecoder().decode(xhr.response); } catch(_) {}
              }
            } else if (respType === 'json' && xhr.response) {
              try { txt = typeof xhr.response === 'string' ? xhr.response : JSON.stringify(xhr.response); } catch(_) {}
            } else {
              return;
            }
            const cType = (xhr.getResponseHeader('content-type') || '').toLowerCase();
            const typedManifest = /mpegurl|dash\+xml/.test(cType);
            const isManifest = isLikelyManifestUrl(responseUrl);
            const isPotentialProxyStream = !BINARY_EXT_REGEX.test(responseUrl || '') && (
              /text\/plain|application\/octet-stream|binary\/octet-stream/i.test(cType) &&
              /(?:stream|source|proxy|playlist|master|hls|embed|video|media|play|chunklist|vod)/i.test(responseUrl || '')
            );
            const isJsonApi = (cType.includes('json') || (responseUrl && responseUrl.includes('.json')) || (responseUrl && /(?:api|ajax|source|stream|embed|player|prorcp|playback)/i.test(responseUrl))) && !IGNORED_DOMAINS_REGEX.test(responseUrl || '');

            if (txt && (txt.includes('#EXTM3U') || typedManifest || isManifest || isPotentialProxyStream)) {
              if (txt.includes('#EXT-X-STREAM-INF') || txt.includes('<MPD') || txt.includes('&lt;MPD') || (txt.includes('#EXTM3U') && (txt.includes('#EXTINF') || txt.includes('#EXT-X-TARGETDURATION') || txt.includes('#EXT-X-MEDIA')))) {
                stashAndEmitManifest(responseUrl, txt);
                return;
              }
            }
            if (txt && isJsonApi) {
              inspectJsonResponseForManifests(txt, responseUrl);
            }
          }
        } catch(e) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch(e) {}
})();
