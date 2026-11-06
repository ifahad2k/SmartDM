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
  const BINARY_EXT_REGEX = /\.(ts|m4s|mp4|m4a|m4v|webm|mkv|aac|mp3|flac|wav|ogg|png|jpg|jpeg|webp|gif|svg|ico|css|js|wasm|json)(?:$|[?#])/i;
  const IGNORED_DOMAINS_REGEX = /(?:fbcdn\.net|facebook\.com|messenger\.com|instagram\.com|googlevideo\.com|ytimg\.com|googleads|doubleclick\.net)/i;
  const capturedUrls = new Set();
  const pendingReads = new Set();
  const MAX_MANIFEST_BYTES = 500000;

  // Associate actual network buffers with the SourceBuffer that consumes them.
  // Weak keys never retain response bodies, players or detached DOM elements.
  // This handles ordinary MSE/DASH players without guessing from tab-wide traffic.
  const networkBuffers = new WeakMap(), sourceStates = new WeakMap(), bufferOwners = new WeakMap();
  function sourceState(source) {
    if (!sourceStates.has(source)) sourceStates.set(source, {blobs: [], video: null, audio: null, audioExpected: false, lastSync: 0});
    return sourceStates.get(source);
  }
  function rememberBuffer(buffer, url, contentType, range) {
    if (!buffer || typeof buffer !== 'object' || !/^https?:\/\//i.test(url || '')) return;
    const total = Number((range || '').match(/\/(\d+)$/)?.[1]) || 0;
    // Individual HLS/DASH fragments are not complete downloadable resources.
    // A ranged backing file is usable even when its URL has no extension.
    const backingRange = total > (buffer.byteLength || 0) && total > 1048576 && /(?:video|audio)\/(?:mp4|webm)|octet-stream/i.test(contentType || '');
    let completeMp4 = false;
    try {
      const view = new DataView(buffer);
      let offset = 0, ftyp = false, moov = false, media = false;
      for (let i = 0; i < 32 && offset + 8 <= view.byteLength; i++) {
        const size = view.getUint32(offset), type = String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4));
        if (size < 8 || size > view.byteLength - offset) break;
        ftyp ||= type === 'ftyp'; moov ||= type === 'moov'; media ||= type === 'mdat';
        offset += size;
      }
      completeMp4 = ftyp && moov && media;
    } catch (_) {}
    if (!backingRange && !completeMp4) return;
    networkBuffers.set(buffer, {url, contentType});
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
      if (state.video) media.setAttribute('data-smartdm-video-url', state.video.url);
      if (state.audio) media.setAttribute('data-smartdm-audio-url', state.audio.url);
      media.setAttribute('data-smartdm-separate-audio', state.audioExpected ? '1' : '0');
    });
  }
  try {
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
        if (audio) state.audioExpected = true;
        bufferOwners.set(buffer, {state, audio});
        return buffer;
      };
      const append = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function(bytes) {
        const result = append.apply(this, arguments);
        try {
          const owner = bufferOwners.get(this), metadata = networkBuffers.get(bytes) || networkBuffers.get(bytes?.buffer);
          if (owner && metadata) {
            const track = owner.audio ? 'audio' : 'video';
            const changed = owner.state[track]?.url !== metadata.url;
            owner.state[track] = metadata;
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
      stashAndEmitManifest(response.url || requestUrl, text);
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
    return MANIFEST_EXT_REGEX.test(url);
  }

  function stashAndEmitManifest(url, text, playerId = null, height = 0, track = "video") {
    if (!text || typeof text !== 'string' || text.length > 500000) return;
    const manifestUrl = url || window.location.href;
    if (capturedUrls.has(manifestUrl) && !playerId) return;

    if (text.includes('#EXT-X-STREAM-INF') || text.includes('<MPD') || text.includes('&lt;MPD') || (text.includes('#EXTM3U') && text.includes('#EXTINF'))) {
      if (capturedUrls.size >= 50) {
        const first = capturedUrls.values().next().value;
        if (first) capturedUrls.delete(first);
      }
      capturedUrls.add(manifestUrl);

      try {
        const root = document.head || document.documentElement || document.body;
        if (root) {
          const existing = root.querySelector(`smartdm-manifest-stash[data-smartdm-url="${CSS.escape(manifestUrl)}"]`);
          if (existing) {
            if (playerId && existing.textContent === text && existing.getAttribute('data-smartdm-player') === playerId &&
                existing.getAttribute('data-smartdm-height') === String(height) && existing.getAttribute('data-smartdm-track') === track) return;
            existing.textContent = text;
            if (playerId) { existing.setAttribute("data-smartdm-player", playerId); existing.setAttribute("data-smartdm-height", String(height)); existing.setAttribute("data-smartdm-track", track); }
          } else {
            const stashes = root.querySelectorAll('smartdm-manifest-stash');
            if (stashes.length >= 3 && stashes[0]) {
              stashes[0].remove();
            }
            const stashEl = document.createElement('smartdm-manifest-stash');
            stashEl.setAttribute('data-smartdm-url', manifestUrl);
            stashEl.textContent = text;
            if (playerId) { stashEl.setAttribute('data-smartdm-player', playerId); stashEl.setAttribute('data-smartdm-height', String(height)); stashEl.setAttribute('data-smartdm-track', track); }
            stashEl.style.display = 'none';
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
        const clear = () => {
          document.querySelectorAll('smartdm-manifest-stash').forEach(s => {
            if (s.getAttribute('data-smartdm-player') === id) s.remove();
          });
        };
        instance.on(Hls.Events.MANIFEST_LOADING, clear);
        instance.on(Hls.Events.MEDIA_ATTACHED, () => { if (instance.media) instance.media.setAttribute('data-smartdm-hls-player', id); });
        instance.on(Hls.Events.DESTROYING, clear);
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (instance.media) instance.media.setAttribute('data-smartdm-hls-external-audio',
            (instance.audioTracks || []).some(t => !!t.url) ? '1' : '0');
        });
        const capture = (track, data) => {
          try {
            const video = instance.media;
            const details = data && data.details;
            if (!video || !details || details.live || typeof details.m3u8 !== 'string') return;
            // A detached/recycled player must not hand off an earlier episode.
            if (!video.isConnected) return;
            video.setAttribute('data-smartdm-hls-player', id);
            if (track === 'audio' && data.id !== undefined && data.id !== instance.audioTrack) return;
            const level = track === 'audio' ? (instance.audioTracks || [])[data.id] : data.levelInfo || (instance.levels && instance.levels[data.level]);
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
          if (opts && opts.headers) {
            const h = opts.headers;
            if (h['x-smartdm-probe'] || (typeof h.get === 'function' && h.get('x-smartdm-probe'))) {
              return origFetch.apply(this, args);
            }
          }
        } catch(e) {}

        const resp = await origFetch.apply(this, args);
        try {
          const reqUrl = (typeof args[0] === 'string') ? args[0] : (args[0] && (args[0].url || args[0].href));
          const playlistMime = /mpegurl|dash\+xml/i.test(resp.headers?.get('content-type') || '') && !IGNORED_DOMAINS_REGEX.test(reqUrl || '');
          if ((isLikelyManifestUrl(reqUrl) || playlistMime) && !capturedUrls.has(reqUrl) && !pendingReads.has(reqUrl) && pendingReads.size < 4) {
            const headers = resp.headers;
            if (headers) {
              const contentType = (headers.get('content-type') || '').toLowerCase();
              if (contentType.includes('video/') || contentType.includes('audio/') ||
                  contentType.includes('image/') || contentType.includes('octet-stream')) {
                return resp;
              }
              const lenStr = headers.get('content-length');
              if (lenStr) {
                const len = parseInt(lenStr, 10);
                if (!isNaN(len) && len > 500000) return resp;
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
      // A reused XHR previously acquired another permanent load listener on
      // every send, including ordinary API/segment requests.
      if (!isLikelyManifestUrl(xhr._smartdm_req_url) || observedXhrs.has(xhr)) return origSend.apply(this, arguments);
      observedXhrs.add(xhr);
      this.addEventListener('load', function() {
        try {
          const reqUrl = xhr._smartdm_req_url;
          if (isLikelyManifestUrl(reqUrl) && !capturedUrls.has(reqUrl)) {
            const respType = xhr.responseType;
            if (respType === 'blob' || respType === 'arraybuffer') return;
            const cType = (xhr.getResponseHeader('content-type') || '').toLowerCase();
            if (cType.includes('video/') || cType.includes('audio/') || cType.includes('image/') || cType.includes('octet-stream')) return;
            const txt = xhr.responseText;
            if (txt && txt.length <= 500000) {
              stashAndEmitManifest(xhr.responseURL || reqUrl, txt);
            }
          }
        } catch(e) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch(e) {}
})();
