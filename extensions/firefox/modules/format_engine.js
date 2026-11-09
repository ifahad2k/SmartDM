// SmartDM Format Registry Engine
// Manages multi-format stream discovery, HLS/DASH manifest parsing, quality ladders, and strict deduplication

class FormatRegistryEngine {
  static MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
  static streamHeightRegistry = new Map(); // url -> height (number)
  static accumulatedFormatsByCacheKey = new Map(); // cacheKey -> Array<formatItem>
  static mediaFormatCache = {}; // cacheKey -> { status, data, callbacks }
  static fbDomCache = new Map(); // key -> { time, data }
  static processedManifests = new Set(); // manifestKey -> boolean
  static activeProbes = new Set(); // url -> boolean

  static fetchLinkedPageFormats(videoUrl, callback = null, isBackgroundPolling = false) {
    let url;
    try {
      url = new URL(videoUrl);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('Invalid page URL');
    } catch (_) {
      callback?.({success: false, formats: [], message: 'Invalid video page URL.'}, false);
      return;
    }
    this.pruneCache();
    const key = SmartDmUtils.getMediaCacheKey(url.href, null);
    const cached = this.mediaFormatCache[key];
    if (cached?.linkedPage && cached.status === 'pending') {
      if (!isBackgroundPolling && callback) cached.callbacks.push(callback);
      return;
    }
    if (cached?.linkedPage && cached.expiresAt > Date.now()) {
      callback?.(cached.data, false);
      return;
    }
    const entry = {linkedPage: true, status: 'pending', data: null, callbacks: callback ? [callback] : []};
    this.mediaFormatCache[key] = entry;
    let settled = false, timer;
    const finish = response => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const formats = Array.isArray(response?.formats) ? response.formats.filter(f =>
        f && !f.provisional && /^https?:\/\//i.test(f.url || f.directUrl || '')).map(f => ({...f,
          assetId: key, videoUrl: f.videoUrl || url.href, referer: f.referer || url.href})) : [];
      const success = !!(response?.success || response?.status === 'ok') && formats.length > 0;
      entry.status = 'done';
      entry.data = success ? {...response, success: true, status: 'ok', formats} : {success: false, status: 'error', formats: [],
        message: 'Could not resolve this selected video. Open its page, play it briefly, and try again.'};
      entry.expiresAt = Date.now() + 60000;
      // A failed listing lookup must retry on reopen, never reuse a search preview.
      if (!success && this.mediaFormatCache[key] === entry) delete this.mediaFormatCache[key];
      const callbacks = entry.callbacks;
      entry.callbacks = [];
      callbacks.forEach(cb => { try { cb(entry.data, false); } catch (_) {} });
      this.pruneCache();
    };
    timer = setTimeout(() => finish(null), 20000);
    try {
      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      runtime.sendMessage({type: 'GET_PAGE_MEDIA_FORMATS', url: url.href}, finish);
    } catch (_) { finish(null); }
  }

  static rememberFormats(key, formats) {
    this.accumulatedFormatsByCacheKey.delete(key);
    this.accumulatedFormatsByCacheKey.set(key, formats);
    this.pruneCache();
  }

  static rememberFacebook(key, data) {
    this.pruneCache();
    this.fbDomCache.delete(key);
    this.fbDomCache.set(key, {time: Date.now(), data});
    while (this.fbDomCache.size > 20) this.fbDomCache.delete(this.fbDomCache.keys().next().value);
  }

  static requestM3u8Variants(url) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 20000);
      try {
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        if (!runtime?.sendMessage) { finish(null); return; }
        runtime.sendMessage({type: 'RESOLVE_M3U8_VARIANTS', url}, res => {
          finish(res?.success && res.formats?.length ? res.formats : null);
        });
      } catch (_) { finish(null); }
    });
  }

  static mergeFormatLists(baseList, incomingList) {
    const result = [];
    const norm = (id) => (id && typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getCanonicalUrl) ? SmartDmUtils.getCanonicalUrl(id) : (id || '');
    const assets = new Set((incomingList || []).map(f => norm(f.assetId)).filter(Boolean));
    const base = (baseList || []).filter(f => {
      if (!assets.size) return true;
      if (!f.assetId) return true;
      return assets.has(norm(f.assetId));
    });
    for (const item of [...base, ...(incomingList || [])]) {
      if (!item || item.provisional) continue;
      const url = item.directUrl || item.url || '';
      if (!/^https?:\/\//i.test(url)) continue;
      const key = [item.formatId || url, item.ext || '', item.videoCodec || '', item.audioCodec || '', item.language || '', !!item.isAudioOnly].join('|');
      const index = result.findIndex(row => row._identity === key);
      const copy = {...item, _identity: key};
      if (index >= 0) result[index] = {...result[index], ...copy};
      else result.push(copy);
    }
    return result.sort((a,b) => Number(a.isAudioOnly) - Number(b.isAudioOnly) || (b.height || 0) - (a.height || 0));
  }

  static parseM3u8Formats(m3u8Text, baseUrl) {
    if (!m3u8Text || typeof m3u8Text !== 'string') return [];
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
          let resolved = false;
          if (typeof URL !== 'undefined' && baseUrl) {
            try {
              streamUrl = new URL(streamUrl, baseUrl).href;
              resolved = true;
            } catch (e) {}
          }
          if (!resolved && baseUrl) {
            try {
              const baseParts = baseUrl.split('?')[0].split('/');
              baseParts.pop();
              streamUrl = baseParts.join('/') + '/' + streamUrl;
            } catch (e) {}
          }
        }
        if (baseUrl && baseUrl.includes('?') && !streamUrl.includes('?')) {
          if (typeof URL !== 'undefined') {
            try {
              const bParsed = new URL(baseUrl);
              const sParsed = new URL(streamUrl);
              sParsed.search = bParsed.search;
              streamUrl = sParsed.href;
            } catch(e) {}
          } else {
            const query = baseUrl.split('?')[1];
            if (query) streamUrl += '?' + query;
          }
        }

        let height = 0;
        if (currentInfo.resolution) {
          const parts = currentInfo.resolution.split('x');
          if (parts.length === 2) height = SmartDmUtils.normalizeVideoResolution(parts[0], parts[1]);
        }
        if (height === 0) {
          height = SmartDmUtils.extractResolutionNumber(streamUrl, currentInfo.name || '');
        }
        let label = SmartDmUtils.getResolutionLabel(height, 'MP4');
        if (!label || label.startsWith('Video Stream')) {
          label = currentInfo.name || (height > 0 ? `${height}p HD (MP4)` : 'Video (MP4)');
        }

        let badge = height > 0 ? `${height}p` : 'Stream';
        if (currentInfo.bandwidth && height <= 0) {
          const kbps = Math.round(currentInfo.bandwidth / 1000);
          badge = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
        }

        formats.push({
          formatId: height > 0 ? `m3u8_${height}p` : `m3u8_stream_${formats.length}`,
          // A quality label is not the movie's title. The overlay supplies the
          // selected page/player title when forming the download filename.
          title: null,
          resolution: label,
          ext: 'mp4',
          mediaKind: 'hls',
          badge: badge,
          url: streamUrl,
          directUrl: streamUrl,
          videoUrl: streamUrl,
          height: height,
          bandwidth: currentInfo.bandwidth || 0,
          isAudioOnly: false,
          referer: window.location.href,
          origin: window.location.origin
        });
        currentInfo = null;
      }
    }

    formats.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));

    const uniqueFormats = [];
    const seenH = new Set();
    for (const f of formats) {
      if (f.height > 0) {
        if (!seenH.has(f.height)) {
          seenH.add(f.height);
          uniqueFormats.push(f);
        }
      } else {
        uniqueFormats.push(f);
      }
    }
    return uniqueFormats;
  }

  static async resolveM3u8VariantsInPage(streamUrl) {
    if (!streamUrl || typeof streamUrl !== 'string') return null;
    if (!streamUrl.includes('.m3u8') && !/mpegurl|dash/i.test(streamUrl) && !/stream-embed|\/(?:playlist|manifest|master|hls)(?:[?#/]|$)/i.test(streamUrl)) return null;
    if (this.activeProbes.has(streamUrl)) return null;
    this.activeProbes.add(streamUrl);
    try {
      const fetchPlaylist = async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const r = await fetch(url, {
            signal: controller.signal,
            _smartdm_probe: true
          });
          if (r.ok) {
            const reader = r.body?.getReader();
            if (!reader) return null;
            let txt = '', bytes = 0;
            const decoder = new TextDecoder();
            try {
              while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > this.MAX_MANIFEST_BYTES) { controller.abort(); return null; }
                txt += decoder.decode(value, {stream: true});
              }
              txt += decoder.decode();
            } finally { reader.releaseLock(); }
            if (txt && txt.includes('#EXTM3U')) return { url, text: txt };
          }
        } catch(e) {
        } finally { clearTimeout(timer); }
        return null;
      };

      let initial = await fetchPlaylist(streamUrl);
      if (!initial) {
        return await this.requestM3u8Variants(streamUrl);
      }

      let effectiveUrl = initial.url;
      let text = initial.text;

      if (text.includes('#EXT-X-STREAM-INF')) {
        return this.parseM3u8Formats(text, effectiveUrl);
      }

      if (text.includes('#EXTINF')) {
        const candidates = [];
        const addCand = (cand) => {
          if (cand && cand !== effectiveUrl && !candidates.includes(cand)) {
            candidates.push(cand);
          }
        };

        addCand(effectiveUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
        addCand(effectiveUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
        addCand(effectiveUrl.replace(/\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
        addCand(effectiveUrl.replace(/[-_]?(?:f\d+|v\d+|a\d+|\d+p|\d+)(?=\.m3u8)/i, ''));

        const parentMatch = effectiveUrl.match(/\/([^\/?#]+)\/[^\/?#]+\.m3u8(?:\?[^#]*)?$/i);
        if (parentMatch) {
          const parentDir = parentMatch[1];
          const isSecurityToken = parentDir.length > 16 || (parentDir.length >= 8 && /^[a-f0-9]{8,}$|^[a-zA-Z0-9_\-]{20,}$/i.test(parentDir));
          if (!isSecurityToken) {
            addCand(effectiveUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/master.m3u8$1'));
            addCand(effectiveUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/playlist.m3u8$1'));
            addCand(effectiveUrl.replace(/\/[^/?#]+\/[^/?#]+\.m3u8(\?[^#]*)?$/i, '/index.m3u8$1'));
          }
        }
        if (effectiveUrl.includes('/stream-embed/')) {
          addCand(effectiveUrl.replace(/\/stream-embed\/media\//i, '/stream-embed/playlist/'));
        }
        addCand(effectiveUrl.replace(/\/media\//i, '/playlist/'));

        for (const candUrl of candidates) {
          const p = await fetchPlaylist(candUrl);
          if (p && p.text && p.text.includes('#EXT-X-STREAM-INF')) {
            return this.parseM3u8Formats(p.text, p.url);
          }
        }

        // Delegate to desktop app via background IPC if in-page candidate probing did not yield master
        return await this.requestM3u8Variants(effectiveUrl);
      }
    } catch(e) {
    } finally {
      this.activeProbes.delete(streamUrl);
    }
    return null;
  }

  static processCapturedManifest(url, text, onRefresh = null, explicitHeight = 0) {
    if (!text || typeof text !== 'string') return;
    const manifestKey = (url || '') + '::' + text.length;
    if (this.processedManifests.has(manifestKey)) return;
    if (this.processedManifests.size >= 50) {
      const first = this.processedManifests.values().next().value;
      if (first) this.processedManifests.delete(first);
    }
    this.processedManifests.add(manifestKey);
    let parsed = null;
    if (text.includes('#EXT-X-STREAM-INF')) {
      parsed = this.parseM3u8Formats(text, url);
    } else if (text.includes('<MPD') || text.includes('&lt;MPD')) {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (url && (url.includes('facebook.com') || url.includes('fbcdn.net')));
      const vEl = SmartDmUtils.findActiveVideoElement();
      const card = isFb ? (vEl ? (VisualMountDetector.findFacebookReelCard(vEl) || VisualMountDetector.findFacebookPostCard(vEl)) : null) : null;
      const pageTitle = isFb ? VisualMountDetector.extractFacebookMediaTitle(vEl, card) : (SmartDmUtils.extractWatchPageTitle() || 'video');
      parsed = this.parseFacebookDashManifest(text, url, pageTitle);
    } else if (text.includes('"playurl"') || text.includes('"video_resource"') || text.includes('"audio_resource"') || text.includes('"video_data"') || (text.includes('"dash"') && (text.includes('"video"') || text.includes('"baseUrl"') || text.includes('"base_url"')))) {
      const pageTitle = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractWatchPageTitle?.()) || (typeof document !== 'undefined' && document.title) || 'video';
      parsed = this.parseBilibiliFormats(text, url, pageTitle);
    } else if ((text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION') || text.includes('#EXT-X-ENDLIST')) && url) {
      this.resolveM3u8VariantsInPage(url).then(variants => {
        let finalVariants = variants;
        if (!finalVariants || finalVariants.length === 0) {
          const vEl = SmartDmUtils.findActiveVideoElement();
          const h = explicitHeight || SmartDmUtils.extractResolutionNumber(url) || (vEl ? SmartDmUtils.normalizeVideoResolution(vEl.videoWidth || 0, vEl.videoHeight || 0) : 0) || 720;
          const resLabel = SmartDmUtils.getResolutionLabel(h, 'MP4');
          const pageTitle = SmartDmUtils.extractWatchPageTitle() || (typeof document !== 'undefined' && document.title) || 'Video';
          finalVariants = [{
            formatId: h > 0 ? `m3u8_${h}p` : 'm3u8_stream',
            resolution: resLabel,
            title: pageTitle,
            badge: h > 0 ? `${h}p` : 'Stream',
            url: url,
            directUrl: url,
            videoUrl: url,
            height: h,
            ext: 'mp4',
            mediaKind: 'hls',
            manifestText: text,
            referer: (typeof window !== 'undefined' ? window.location.href : ''),
            origin: (typeof window !== 'undefined' ? window.location.origin : '')
          }];
        }
        if (finalVariants && finalVariants.length > 0) {
          finalVariants.forEach(vf => {
            if (vf.height > 0 && vf.url) {
              this.streamHeightRegistry.set(vf.url, vf.height);
            }
          });
          const vEl = SmartDmUtils.findActiveVideoElement();
          const canonicalUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getCanonicalUrl) ? SmartDmUtils.getCanonicalUrl(window.location.href) : window.location.href;
          const key = SmartDmUtils.getMediaCacheKey(canonicalUrl, vEl);
          const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], finalVariants);
          this.rememberFormats(key, merged.slice());

          const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
          if (runtime && runtime.sendMessage) {
            try {
              runtime.sendMessage({
                type: 'REGISTER_M3U8_VARIANTS',
                masterUrl: url,
                formats: merged
              });
            } catch(err) {}
          }

          if (typeof onRefresh === 'function') onRefresh();
        }
      }).catch(() => {});
      return;
    }
    if (parsed && parsed.length > 0) {
      parsed.forEach(vf => {
        if (vf.height > 0 && vf.url) {
          this.streamHeightRegistry.set(vf.url, vf.height);
        }
      });
      const vEl = SmartDmUtils.findActiveVideoElement();
      const canonicalUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getCanonicalUrl) ? SmartDmUtils.getCanonicalUrl(window.location.href) : window.location.href;
      const key = SmartDmUtils.getMediaCacheKey(canonicalUrl, vEl);
      const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], parsed);
      this.rememberFormats(key, merged.slice());

      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      if (runtime && runtime.sendMessage) {
        try {
          runtime.sendMessage({
            type: 'REGISTER_M3U8_VARIANTS',
            masterUrl: url,
            formats: merged
          });
        } catch(err) {}
      }

      if (typeof onRefresh === 'function') onRefresh();
    }
  }

  static drainStashedManifests(onRefresh = null) {
    try {
      const stashed = document.querySelectorAll('smartdm-manifest-stash');
      stashed.forEach(el => {
        const u = el.getAttribute('data-smartdm-url') || window.location.href;
        const txt = el.textContent;
        const h = Number(el.getAttribute('data-smartdm-height')) || 0;
        if (txt) {
          this.processCapturedManifest(u, txt, onRefresh, h);
        }
        if (!el.getAttribute('data-smartdm-player')) el.remove();
      });
    } catch(e) {}
  }

  static extractYouTubeVideoId(url) {
    if (!url) return null;
    try {
      const u = new URL(url, 'https://www.youtube.com');
      if (u.searchParams.has('v')) {
        const v = u.searchParams.get('v');
        if (/^[A-Za-z0-9_-]{11}$/.test(v || '')) return v;
      }
      if (u.pathname.includes('/shorts/')) {
        const m = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
        if (m) return m[1];
      }
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.replace(/^\//, '').split('?')[0].split('/')[0];
        if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
      }
    } catch (_) {}
    const m = String(url).match(/[?&]v=([A-Za-z0-9_-]{11})/) || String(url).match(/\/shorts\/([A-Za-z0-9_-]{11})/) || String(url).match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  static parseYouTubePlayerResponse(data, videoId = null, videoUrl = null) {
    try {
      if (!data) return null;
      let resp = data;
      if (typeof resp === 'string') {
        if (!resp.includes('streamingData')) return null;
        try { resp = JSON.parse(resp); } catch (_) { return null; }
      }
      if (!resp || typeof resp !== 'object' || !resp.streamingData) return null;

      const streamingData = resp.streamingData;
      const videoDetails = resp.videoDetails || {};
      const title = videoDetails.title || 'YouTube Video';
      const resolvedVid = videoDetails.videoId || videoId ||
        (videoUrl ? this.extractYouTubeVideoId(videoUrl) : null);
      if (!resolvedVid) return null;

      const formats = [];
      let defaultAudioUrl = null;
      let defaultAudioSize = 0;

      const adaptive = Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [];
      adaptive.forEach(f => {
        if (!f) return;
        let u = f.url;
        if (!u && (f.signatureCipher || f.cipher)) {
          try { u = new URLSearchParams(f.signatureCipher || f.cipher).get('url'); } catch (_) {}
        }
        if (u && typeof u === 'string' && u.startsWith('http')) {
          const mime = (f.mimeType || '').toLowerCase();
          if (mime.includes('audio/')) {
            if (!defaultAudioUrl || f.itag === 140) {
              defaultAudioUrl = u;
              defaultAudioSize = parseInt(f.contentLength || 0, 10);
            }
          }
        }
      });

      const combined = Array.isArray(streamingData.formats) ? streamingData.formats : [];
      combined.forEach(f => {
        if (!f) return;
        let u = f.url;
        if (!u && (f.signatureCipher || f.cipher)) {
          try { u = new URLSearchParams(f.signatureCipher || f.cipher).get('url'); } catch (_) {}
        }
        if (u && typeof u === 'string' && u.startsWith('http')) {
          const height = f.height || (typeof SmartDmUtils !== 'undefined' ? SmartDmUtils.extractResolutionNumber?.(f.qualityLabel || f.quality || '') : 360) || 360;
          formats.push({
            formatId: String(f.itag || ('fmt_' + formats.length)),
            resolution: f.qualityLabel || f.quality || `${height}p`,
            height: height,
            ext: (f.mimeType || '').includes('webm') ? 'webm' : 'mp4',
            formatNote: 'Direct Video + Audio',
            fileSize: parseInt(f.contentLength || 0, 10),
            fps: f.fps || 30,
            isAudioOnly: false,
            isVideoOnly: false,
            title: title,
            url: u,
            directUrl: u,
            videoUrl: `https://www.youtube.com/watch?v=${resolvedVid}`,
            assetId: `https://www.youtube.com/watch?v=${resolvedVid}`
          });
        }
      });

      adaptive.forEach(f => {
        if (!f) return;
        let u = f.url;
        if (!u && (f.signatureCipher || f.cipher)) {
          try { u = new URLSearchParams(f.signatureCipher || f.cipher).get('url'); } catch (_) {}
        }
        if (u && typeof u === 'string' && u.startsWith('http')) {
          const mime = (f.mimeType || '').toLowerCase();
          const isAudio = mime.includes('audio/');
          const isVideo = mime.includes('video/');
          const kbps = Math.round((f.bitrate || 0) / 1000);
          const videoSize = parseInt(f.contentLength || 0, 10);
          const totalSize = isVideo && defaultAudioSize > 0 ? videoSize + defaultAudioSize : videoSize;
          const height = isVideo ? (f.height || (typeof SmartDmUtils !== 'undefined' ? SmartDmUtils.extractResolutionNumber?.(f.qualityLabel || '') : 0) || 0) : 0;
          formats.push({
            formatId: String(f.itag || ('fmt_' + formats.length)),
            resolution: isAudio ? ('Audio Only (' + (kbps > 0 ? kbps + 'k' : '128k') + ')') : (f.qualityLabel || (height ? `${height}p` : 'Video')),
            height: height,
            ext: mime.includes('webm') ? (isAudio ? 'webm' : 'webm') : (isAudio ? 'm4a' : 'mp4'),
            formatNote: isAudio ? 'Audio Only Stream' : 'High Res Video',
            fileSize: totalSize,
            tbr: kbps,
            fps: f.fps || 0,
            isAudioOnly: isAudio,
            isVideoOnly: isVideo,
            title: title,
            url: u,
            directUrl: u,
            audioUrl: (!isAudio && defaultAudioUrl) ? defaultAudioUrl : null,
            videoUrl: `https://www.youtube.com/watch?v=${resolvedVid}`,
            assetId: `https://www.youtube.com/watch?v=${resolvedVid}`
          });
        }
      });

      if (formats.length > 0) {
        if (defaultAudioUrl) {
          formats.push({
            formatId: 'bestaudio/best',
            resolution: 'Audio (MP3 / High Quality)',
            ext: 'mp3',
            formatNote: 'MP3 High Quality',
            fileSize: defaultAudioSize,
            isAudioOnly: true,
            title: title,
            url: defaultAudioUrl,
            directUrl: defaultAudioUrl,
            videoUrl: `https://www.youtube.com/watch?v=${resolvedVid}`,
            assetId: `https://www.youtube.com/watch?v=${resolvedVid}`
          });
        }
        formats.push({
          formatId: 'thumbnail',
          resolution: 'Thumbnail (Cover Image / HD)',
          ext: 'jpg',
          formatNote: 'HD Cover Image',
          fileSize: 0,
          isAudioOnly: false,
          title: title,
          url: `https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`,
          directUrl: `https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`,
          videoUrl: `https://www.youtube.com/watch?v=${resolvedVid}`,
          assetId: `https://www.youtube.com/watch?v=${resolvedVid}`
        });

        return { success: true, status: 'ok', title: title, formats: formats };
      }
      return null;
    } catch (_) { return null; }
  }

  static extractInPageYouTubeFormats(videoUrl) {
    try {
      const vid = this.extractYouTubeVideoId(videoUrl || (typeof window !== 'undefined' ? window.location?.href : ''));
      if (!vid) return null;

      // 0. Synchronously request in-page sniffer to capture current YouTube player data
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('__smartdm_query_youtube__', { detail: { videoId: vid } }));
        } catch (_) {}
      }

      // 1. Direct window property
      if (typeof window !== 'undefined' && window.ytInitialPlayerResponse) {
        const res = this.parseYouTubePlayerResponse(window.ytInitialPlayerResponse, vid, videoUrl);
        if (res && res.formats?.length) return res;
      }

      // 2. Stashed element by sniffer
      if (typeof document !== 'undefined') {
        const safeVid = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') ? CSS.escape(vid) : vid.replace(/"/g, '\\"');
        const stashEl = document.querySelector ? (document.querySelector(`smartdm-player-response[data-smartdm-video-id="${safeVid}"]`) || document.querySelector('smartdm-player-response')) : null;
        if (stashEl && stashEl.textContent) {
          const res = this.parseYouTubePlayerResponse(stashEl.textContent, vid, videoUrl);
          if (res && res.formats?.length) return res;
        }

        // 3. Embedded scripts containing ytInitialPlayerResponse
        const scripts = document.querySelectorAll ? document.querySelectorAll('script') : [];
        for (let i = 0; i < scripts.length; i++) {
          const text = scripts[i].textContent || '';
          const idx = text.indexOf('ytInitialPlayerResponse');
          if (idx !== -1) {
            const firstBrace = text.indexOf('{', idx);
            if (firstBrace > idx && firstBrace < idx + 100) {
              let openCount = 0, lastBrace = -1, inString = false, escape = false;
              for (let j = firstBrace; j < text.length; j++) {
                const c = text.charAt(j);
                if (inString) {
                  if (escape) escape = false;
                  else if (c === '\\') escape = true;
                  else if (c === '"') inString = false;
                } else {
                  if (c === '"') inString = true;
                  else if (c === '{') openCount++;
                  else if (c === '}') {
                    openCount--;
                    if (openCount === 0) { lastBrace = j; break; }
                  }
                }
              }
              if (lastBrace > firstBrace) {
                try {
                  const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
                  const res = this.parseYouTubePlayerResponse(parsed, vid, videoUrl);
                  if (res && res.formats?.length) return res;
                } catch (_) {}
              }
            }
          }
        }
      }
      return null;
    } catch (_) { return null; }
  }

  static getInstantYouTubeFormats(videoUrl, title = 'YouTube Video') {
    const key = this.youTubeCacheKey(videoUrl);
    if (!key) return [];
    const entry = this.mediaFormatCache[key];
    if (entry?.youtube && entry.status === 'done' && entry.expiresAt > Date.now() && Array.isArray(entry.data?.formats) && entry.data.formats.length > 0) {
      return entry.data.formats;
    }
    // Attempt instant in-page extraction
    const inPage = this.extractInPageYouTubeFormats(videoUrl);
    if (inPage && Array.isArray(inPage.formats) && inPage.formats.length > 0) {
      this.mediaFormatCache[key] = {
        youtube: true,
        status: 'done',
        data: inPage,
        expiresAt: Date.now() + 120000,
        callbacks: []
      };
      return inPage.formats;
    }
    return [];
  }

  static youTubeCacheKey(videoUrl) {
    try {
      const url = new URL(videoUrl);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      let id;
      if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1];
      else if (/(^|\.)youtube\.com$/.test(url.hostname)) {
        id = url.pathname === '/watch' ? url.searchParams.get('v')
          : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
    } catch (_) { return null; }
  }

  static fetchYouTubeFormats(videoUrl, callback = null, isBackgroundPolling = false) {
    const key = this.youTubeCacheKey(videoUrl);
    if (!key) {
      callback?.({success: false, formats: [], message: 'Invalid YouTube video URL.'}, false);
      return;
    }
    const cached = this.mediaFormatCache[key];
    if (cached?.youtube && cached.status === 'done' && cached.expiresAt > Date.now()) {
      callback?.(cached.data, false);
      return;
    }
    if (cached?.youtube && cached.status === 'pending') {
      if (!isBackgroundPolling && callback) cached.callbacks.push(callback);
      return;
    }
    // Check in-page player response first for instant resolution (<5ms)
    const inPage = this.extractInPageYouTubeFormats(videoUrl);
    if (inPage && Array.isArray(inPage.formats) && inPage.formats.length > 0) {
      const entry = {
        youtube: true,
        status: 'done',
        data: inPage,
        expiresAt: Date.now() + 120000,
        callbacks: []
      };
      this.mediaFormatCache[key] = entry;
      callback?.(inPage, false);
      return;
    }
    const entry = {youtube: true, status: 'pending', data: null, callbacks: callback ? [callback] : []};
    this.mediaFormatCache[key] = entry;
    let settled = false;
    let timer;
    const finish = response => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const formats = Array.isArray(response?.formats)
        ? response.formats.filter(f => f && !f.provisional && /^https?:\/\//i.test(f.url || f.directUrl || '')) : [];
      const success = !!(response?.success || response?.status === 'ok') && formats.length > 0;
      entry.data = success ? {...response, success: true, status: 'ok', formats} : {success: false, status: 'error', formats: [],
        message: 'YouTube format lookup failed; reopen this menu to retry.'};
      entry.status = 'done';
      // Short failure cooldown prevents a visible shelf repeatedly probing a closed app.
      entry.expiresAt = Date.now() + (success ? 120000 : 5000);
      if (success) {
        for (const format of formats) {
          for (const stream of [format.url, format.directUrl, format.audioUrl]) {
            try {
              const expiry = Number(new URL(stream).searchParams.get('expire')) * 1000;
              if (expiry > 0) entry.expiresAt = Math.min(entry.expiresAt, expiry - 30000);
            } catch (_) { /* Not every representation has a signed URL. */ }
          }
        }
      }
      const callbacks = entry.callbacks;
      entry.callbacks = [];
      callbacks.forEach(cb => { try { cb(entry.data, false); } catch (_) {} });
      this.pruneCache();
    };
    // The desktop HTTP attempt allows 15 seconds, followed by browser fallback.
    // A shorter UI deadline discarded valid responses from that existing route.
    timer = setTimeout(() => finish(null), 30000);
    try {
      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      runtime.sendMessage({type: 'GET_MEDIA_FORMATS', url: key}, finish);
    } catch (_) { finish(null); }
  }

  static extractTubeFormatsFromDOM(pageTitle = 'video') {
    const formats = [];
    const seen = new Set();

    const addFormat = (url, quality, ext = 'mp4') => {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      if (url.includes('/video/get_media') || url.includes('/api/') || url.includes('/ajax/') || url.includes('/analytics') || url.endsWith('.json')) return;
      if (seen.has(url)) return;
      seen.add(url);

      const isHls = ext === 'm3u8' || url.includes('.m3u8');
      let qStr = (quality && typeof quality === 'string') ? quality.trim() : (typeof quality === 'number' ? String(quality) : '');
      if (qStr && !qStr.endsWith('p') && /^\d+$/.test(qStr)) qStr += 'p';
      let qLabel = qStr || (isHls ? 'Master' : 'Video');
      const hNum = parseInt(qLabel, 10);
      if (hNum >= 720 && !qLabel.includes('HD')) qLabel += ' HD';
      qLabel += ' (MP4)';

      formats.push({
        formatId: 'tube_' + (qStr || formats.length),
        resolution: qLabel,
        height: hNum || (isHls ? 1080 : 720),
        ext: 'mp4',
        fileSize: 0,
        isAudioOnly: false,
        title: pageTitle,
        url: url
      });
    };

    try {
      const ogVideo = document.querySelector('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"]');
      if (ogVideo && ogVideo.content && ogVideo.content.startsWith('http')) {
        addFormat(ogVideo.content, '720p', ogVideo.content.includes('.m3u8') ? 'm3u8' : 'mp4');
      }

      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (!text || text.length < 30) continue;

        if (text.includes('mediaDefinitions')) {
          const idx = text.indexOf('mediaDefinitions');
          const start = text.indexOf('[', idx);
          if (start >= 0) {
            let openCount = 0, last = -1;
            for (let i = start; i < text.length; i++) {
              if (text[i] === '[') openCount++;
              else if (text[i] === ']') {
                openCount--;
                if (openCount === 0) { last = i; break; }
              }
            }
            if (last > start) {
              try {
                const list = JSON.parse(text.substring(start, last + 1));
                if (Array.isArray(list)) {
                  list.forEach(item => {
                    if (item && item.videoUrl && !item.remote && !item.videoUrl.includes('/video/get_media')) {
                      let q = item.quality;
                      if (Array.isArray(q)) q = null;
                      addFormat(item.videoUrl, q || (item.format === 'hls' ? 'Master' : '720p'), item.format);
                    }
                  });
                }
              } catch(e) {}
            }
          }
        }
      }

      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        const src = v.currentSrc || v.src;
        if (src && src.startsWith('http')) {
          let h = SmartDmUtils.extractResolutionNumber(src);
          if (h <= 0) h = SmartDmUtils.normalizeVideoResolution(v.videoWidth || 0, v.videoHeight || 720);
          addFormat(src, h + 'p', src.includes('.m3u8') ? 'm3u8' : 'mp4');
        }
        const sources = v.querySelectorAll('source');
        sources.forEach(s => {
          const sUrl = s.src || s.getAttribute('src');
          if (sUrl && sUrl.startsWith('http')) {
            let h = SmartDmUtils.extractResolutionNumber(sUrl);
            const resAttr = s.getAttribute('res') || s.getAttribute('size');
            if (h <= 0 && resAttr) h = SmartDmUtils.extractResolutionNumber('', resAttr);
            if (h <= 0) h = SmartDmUtils.normalizeVideoResolution(v.videoWidth || 0, v.videoHeight || 720);
            addFormat(sUrl, h + 'p', sUrl.includes('.m3u8') ? 'm3u8' : 'mp4');
          }
        });
      });
    } catch(e) {}

    formats.sort((a, b) => (b.height || 0) - (a.height || 0));
    return formats;
  }

  static extractInPageMovieStreams(mediaEl, pageTitle = 'video') {
    const list = [];
    const seenUrls = new Set();
    const addUrl = (url, height, label) => {
      if (!url || typeof url !== 'string' || seenUrls.has(url)) return;
      if (!url.startsWith('http') && !url.startsWith('//') && !url.startsWith('/')) return;
      if (url.includes('/analytics') || url.includes('recaptcha') || url.includes('doubleclick')) return;
      let fullUrl = url;
      if (url.startsWith('//')) {
        fullUrl = (typeof window !== 'undefined' && window.location?.protocol ? window.location.protocol : 'https:') + url;
      } else if (url.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
        fullUrl = window.location.origin + url;
      }
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const isHls = /\.m3u8(?:[?#]|$)/i.test(fullUrl);
      let h = height || SmartDmUtils.extractResolutionNumber(fullUrl);
      if (h <= 0 && mediaEl && mediaEl.videoHeight > 0) {
        h = SmartDmUtils.normalizeVideoResolution(mediaEl.videoWidth || 0, mediaEl.videoHeight);
      }
      if (h <= 0) h = 720;
      const resLabel = label || SmartDmUtils.getResolutionLabel(h, 'mp4');

      list.push({
        formatId: `inpage_${h}p_${list.length}`,
        resolution: resLabel,
        ext: 'mp4',
        mediaKind: isHls ? 'hls' : null,
        fileSize: 0,
        isAudioOnly: false,
        title: pageTitle,
        url: fullUrl,
        videoUrl: fullUrl,
        referer: window.location.href,
        height: h
      });
    };

    try {
      if (mediaEl) {
        const directAttrs = [
          mediaEl.src,
          mediaEl.currentSrc,
          mediaEl.getAttribute?.('src'),
          mediaEl.getAttribute?.('data-src'),
          mediaEl.getAttribute?.('data-video-src'),
          mediaEl.getAttribute?.('data-stream'),
          mediaEl.getAttribute?.('data-file')
        ];
        directAttrs.forEach(s => {
          if (s && !s.startsWith('blob:')) addUrl(s, 0);
        });

        const childSources = mediaEl.querySelectorAll ? mediaEl.querySelectorAll('source, track') : [];
        childSources.forEach(sc => {
          const s = sc.src || sc.getAttribute('src') || sc.getAttribute('data-src') || sc.getAttribute('data-file');
          if (s && !s.startsWith('blob:')) addUrl(s, 0);
        });
      }

      if (typeof document !== 'undefined') {
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(v => {
          if (v === mediaEl) return;
          const s = v.src || v.currentSrc || v.getAttribute('src') || v.getAttribute('data-src');
          if (s && !s.startsWith('blob:')) addUrl(s, 0);
          const scs = v.querySelectorAll('source');
          scs.forEach(sc => {
            const u = sc.src || sc.getAttribute('src') || sc.getAttribute('data-src');
            if (u && !u.startsWith('blob:')) addUrl(u, 0);
          });
        });

        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(ifr => {
          const isrc = ifr.src || ifr.getAttribute('src') || ifr.getAttribute('data-src');
          if (isrc) {
            const m = isrc.match(/[?&#](?:file|url|src|stream|source)=([^&#]+)/i);
            if (m) {
              try {
                const decoded = decodeURIComponent(m[1]);
                if (decoded.includes('.m3u8') || decoded.includes('.mp4')) addUrl(decoded, 0);
              } catch (_) {}
            }
          }
        });

        const unpackDeanEdwards = (str) => {
          const m = str.match(/eval\(function\(p,a,c,k,e,[rd]\)\s*\{[\s\S]*?\}\s*\(\s*(['"][\s\S]*?['"])\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"][\s\S]*?['"])\.split\(['"]\|['"]\)/);
          if (!m) return null;
          try {
            let p = JSON.parse(m[1]);
            const a = parseInt(m[2], 10);
            const c = parseInt(m[3], 10);
            const k = m[4].slice(1, -1).split('|');
            const baseUnpack = (val) => {
              let res = '';
              if (val >= a) res += baseUnpack(Math.floor(val / a));
              const rem = val % a;
              res += (rem > 35) ? String.fromCharCode(rem + 29) : rem.toString(36);
              return res;
            };
            const dict = {};
            for (let i = 0; i < c; i++) {
              const key = (a > 36) ? baseUnpack(i) : i.toString(a);
              dict[key] = k[i] || key;
            }
            return p.replace(/\b\w+\b/g, w => Object.prototype.hasOwnProperty.call(dict, w) ? dict[w] : w);
          } catch (_) { return null; }
        };

        const scripts = document.querySelectorAll('script');
        const streamRegex = /(?:https?:)?\/\/[^\s"'<>]+\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>]*)?/gi;
        const configRegex = /(?:file|source|url|src|stream)\s*:\s*["']([^"']+\.(?:m3u8|mp4|webm)[^"']*)["']/gi;
        for (const s of scripts) {
          let text = s.textContent || '';
          if (!text || text.length < 20) continue;
          if (text.includes('eval(function(p,a,c,k,e,')) {
            const unpacked = unpackDeanEdwards(text);
            if (unpacked) text += '\n' + unpacked;
          }
          if (text.includes('.m3u8') || text.includes('.mp4') || text.includes('.webm')) {
            let match;
            while ((match = streamRegex.exec(text)) !== null) {
              addUrl(match[0], 0);
            }
            while ((match = configRegex.exec(text)) !== null) {
              addUrl(match[1], 0);
            }
          }
        }
      }
    } catch (_) {}

    list.sort((a, b) => (b.height || 0) - (a.height || 0));
    return list;
  }

  static extractDashManifestFromText(text, targetVideoId = null) {
    if (!text) return null;
    const markers = ['"dash_manifest"', '"video_dash_manifest"'];

    const tryExtract = (requireTargetId) => {
      for (const marker of markers) {
        let idx = 0;
        while ((idx = text.indexOf(marker, idx)) !== -1) {
          if (requireTargetId && targetVideoId) {
            const proxStart = Math.max(0, idx - 15000);
            const proxEnd = Math.min(text.length, idx + 15000);
            const chunk = text.substring(proxStart, proxEnd);
            if (!chunk.includes(targetVideoId)) {
              idx += marker.length;
              continue;
            }
          }

          const colonIdx = text.indexOf(':', idx);
          if (colonIdx === -1) { idx += marker.length; continue; }
          const quoteStart = text.indexOf('"', colonIdx);
          if (quoteStart === -1) { idx += marker.length; continue; }

          let quoteEnd = -1;
          for (let i = quoteStart + 1; i < text.length; i++) {
            if (text[i] === '"' && text[i - 1] !== '\\') {
              quoteEnd = i;
              break;
            }
          }
          if (quoteEnd > quoteStart) {
            let raw = text.substring(quoteStart + 1, quoteEnd);
            try {
              raw = JSON.parse('"' + raw + '"');
            } catch(e) {
              raw = raw.replace(/\\"/g, '"').replace(/\\\/+/g, '/').replace(/\\n/g, '\n').replace(/\\u0026/g, '&');
            }
            if (raw && (raw.includes('<MPD') || raw.includes('&lt;MPD'))) {
              return raw;
            }
          }
          idx += marker.length;
        }
      }
      return null;
    };

    let result = null;
    if (targetVideoId) {
      result = tryExtract(true);
    }
    if (!result) {
      const isSingleVideo = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch');
      if (isSingleVideo) {
        result = tryExtract(false);
      }
    }
    return result;
  }

  static extractInPageBilibiliManifest() {
    if (typeof document === 'undefined') return null;
    const isBili = typeof window !== 'undefined' && window.location?.hostname &&
      (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));
    if (!isBili) return null;

    try {
      if (typeof window !== 'undefined') {
        if (window.__playinfo__) {
          try {
            const txt = JSON.stringify(window.__playinfo__);
            if (txt.includes('"playurl"') || txt.includes('"video_resource"') || txt.includes('"dash"') || txt.includes('"video_data"')) return txt;
          } catch (_) {}
        }
        if (window.__NEXT_DATA__) {
          try {
            const txt = JSON.stringify(window.__NEXT_DATA__);
            if (txt.includes('"playurl"') || txt.includes('"video_resource"') || txt.includes('"dash"') || txt.includes('"video_data"')) return txt;
          } catch (_) {}
        }
      }

      const el = document.getElementById('__playinfo__') || document.getElementById('__NEXT_DATA__');
      if (el && el.textContent && (el.textContent.includes('"playurl"') || el.textContent.includes('"video_resource"') || el.textContent.includes('"dash"') || el.textContent.includes('"video_data"'))) {
        return el.textContent;
      }

      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const txt = scripts[i].textContent || '';
        if (txt.includes('window.__playinfo__') || txt.includes('__playinfo__=')) {
          const m = txt.match(/window\.__playinfo__\s*=\s*(\{[\s\S]*?\})(?:;|\n|$)/);
          if (m && m[1]) return m[1];
        }
        if (txt.includes('window.__INITIAL_STATE__') && (txt.includes('"playurl"') || txt.includes('"video_resource"') || txt.includes('"dash"') || txt.includes('"video_data"'))) {
          const m = txt.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})(?:;|\n|$)/);
          if (m && m[1]) return m[1];
        }
      }
    } catch (_) {}
    return null;
  }

  static parseBilibiliFormats(jsonText, baseUrl, pageTitle = 'video') {
    const formats = [];
    try {
      if (!jsonText) return [];
      let data = null;
      try {
        data = typeof jsonText === 'object' ? jsonText : JSON.parse(jsonText);
      } catch (_) {
        return [];
      }
      if (!data) return [];

      let root = data.data || data.result || data.props?.pageProps?.videoInfo || data.props?.pageProps || data;
      let playurl = root.playurl || root.video_data || root;
      let dash = playurl.dash || root.dash;
      if (!dash && !playurl.video_resource && !playurl.video && !root.video_resource && !root.durl && !playurl.durl) {
        const findPlayurlOrDash = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return null;
          if (obj.dash || obj.video_resource || (Array.isArray(obj.video) && (obj.audio || obj.video[0]?.baseUrl || obj.video[0]?.base_url || obj.video[0]?.url))) {
            return obj;
          }
          if (obj.playurl && typeof obj.playurl === 'object') return obj.playurl;
          if (obj.video_data && typeof obj.video_data === 'object') return obj.video_data;
          for (const k of Object.keys(obj)) {
            if (typeof obj[k] === 'object' && obj[k] !== null) {
              const f = findPlayurlOrDash(obj[k], depth + 1);
              if (f) return f;
            }
          }
          return null;
        };
        const found = findPlayurlOrDash(data);
        if (found) {
          root = found;
          playurl = root.playurl || root.video_data || root;
          dash = playurl.dash || root.dash;
        }
      }

      const qnToHeight = (qVal) => {
        if (!qVal) return 0;
        const id = qVal >= 30000 ? (qVal - 30000) : qVal;
        if (id === 144 || id === 1) return 144;
        if (id === 127) return 4320;
        if (id >= 120 && id <= 126) return 2160;
        if (id >= 120) return 2160;
        if (id >= 80) return 1080;
        if (id >= 64) return 720;
        if (id >= 32) return 480;
        if (id >= 16) return 360;
        if (id >= 6) return 240;
        return 0;
      };

      const videoItems = [];
      let audioUrl = null;
      let audioBw = 0;

      let effectiveReferer = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : (baseUrl || '');
      if (effectiveReferer.includes('api.bilibili.tv')) effectiveReferer = 'https://www.bilibili.tv/';
      else if (effectiveReferer.includes('api.bilibili.com')) effectiveReferer = 'https://www.bilibili.com/';

      let effectiveOrigin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
      if (!effectiveOrigin || effectiveOrigin.includes('api.bilibili.tv')) effectiveOrigin = 'https://www.bilibili.tv';
      else if (effectiveOrigin.includes('api.bilibili.com')) effectiveOrigin = 'https://www.bilibili.com';
      if (!effectiveOrigin) {
        try { effectiveOrigin = baseUrl ? new URL(baseUrl).origin : ''; } catch (_) {}
      }

      // 1. DASH format (separate video + audio streams)
      if (dash) {
        const vList = Array.isArray(dash.video) ? dash.video : [];
        const aList = Array.isArray(dash.audio) ? dash.audio : [];
        const dolbyList = Array.isArray(dash.dolby?.audio) ? dash.dolby.audio : [];
        const flacList = Array.isArray(dash.flac?.audio) ? [dash.flac.audio] : [];
        const allAudio = [...aList, ...dolbyList, ...flacList];

        allAudio.forEach(a => {
          const aUrl = a.baseUrl || a.base_url || a.url || (Array.isArray(a.backupUrl) && a.backupUrl[0]) || (Array.isArray(a.backup_url) && a.backup_url[0]);
          const bw = a.bandwidth || a.id || 0;
          if (aUrl && aUrl.startsWith('http')) {
            if (!audioUrl || bw > audioBw) {
              audioUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(aUrl) : aUrl;
              audioBw = bw;
            }
          }
        });

        vList.forEach(v => {
          const vUrl = v.baseUrl || v.base_url || v.url || (Array.isArray(v.backupUrl) && v.backupUrl[0]) || (Array.isArray(v.backup_url) && v.backup_url[0]);
          if (!vUrl || !vUrl.startsWith('http')) return;
          let h = 0;
          const qId = v.id || v.quality || v.qn || 0;
          if (qId) {
            h = qnToHeight(qId);
          }
          if (!h && v.width && v.height) {
            h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.normalizeVideoResolution) ? SmartDmUtils.normalizeVideoResolution(v.width, v.height) : (v.height || 0);
          }
          if (!h && v.height) {
            h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.normalizeVideoResolution) ? SmartDmUtils.normalizeVideoResolution(0, v.height) : v.height;
          }
          if (!h && v.stream_info?.desc_words) {
            h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(v.stream_info.desc_words) : 0;
          }
          if (!h && vUrl) {
            h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(vUrl) : 0;
          }
          if (!h) h = 720;
          videoItems.push({
            url: (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(vUrl) : vUrl,
            height: h,
            bandwidth: v.bandwidth || 0,
            codecs: v.codecs || v.codecid || ''
          });
        });
      }

      // 2. Bilibili Global video_resource / audio_resource shape
      const rawVList = Array.isArray(playurl.video_resource) ? playurl.video_resource : (Array.isArray(playurl.video) ? playurl.video : (Array.isArray(root.video_resource) ? root.video_resource : []));
      const rawAList = Array.isArray(playurl.audio_resource) ? playurl.audio_resource : (Array.isArray(playurl.audio) ? playurl.audio : (Array.isArray(root.audio_resource) ? root.audio_resource : []));
      rawAList.forEach(a => {
        const aRes = a.audio_resource || a;
        const aUrl = aRes.url || (Array.isArray(aRes.backup_url) && aRes.backup_url[0]) || aRes.baseUrl || aRes.base_url;
        const bw = aRes.bandwidth || 0;
        if (aUrl && aUrl.startsWith('http')) {
          if (!audioUrl || bw > audioBw) {
            audioUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(aUrl) : aUrl;
            audioBw = bw;
          }
        }
      });

      rawVList.forEach(v => {
        const vRes = v.video_resource || v;
        const vUrl = vRes.url || (Array.isArray(vRes.backup_url) && vRes.backup_url[0]) || vRes.baseUrl || vRes.base_url;
        if (!vUrl || !vUrl.startsWith('http')) return;
        let h = 0;
        const q = vRes.quality || vRes.qn || vRes.id || 0;
        if (q) {
          h = qnToHeight(q);
        }
        if (!h && vRes.width && vRes.height) {
          h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.normalizeVideoResolution) ? SmartDmUtils.normalizeVideoResolution(vRes.width, vRes.height) : (vRes.height || 0);
        }
        if (!h && vRes.height) {
          h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.normalizeVideoResolution) ? SmartDmUtils.normalizeVideoResolution(0, vRes.height) : vRes.height;
        }
        if (!h && vRes.stream_info?.desc_words) {
          h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(vRes.stream_info.desc_words) : 0;
        }
        if (!h && vUrl) {
          h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(vUrl) : 0;
        }
        if (!h) h = 720;
        videoItems.push({
          url: (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(vUrl) : vUrl,
          height: h,
          bandwidth: vRes.bandwidth || 0,
          codecs: vRes.codecs || ''
        });
      });

      // 3. Progressive durl shape (FLV/MP4 single files)
      const durl = root.durl || playurl.durl;
      if (videoItems.length === 0 && Array.isArray(durl) && durl.length > 0) {
        durl.forEach((d, idx) => {
          const dUrl = d.url || (Array.isArray(d.backup_url) && d.backup_url[0]);
          if (dUrl && dUrl.startsWith('http')) {
            const h = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(dUrl) : 720;
            const resLabel = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getResolutionLabel) ? SmartDmUtils.getResolutionLabel(h, 'MP4') : `${h}p (MP4)`;
            const cleanUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(dUrl) : dUrl;
            formats.push({
              formatId: `bili_prog_${h}p_${idx}`,
              resolution: resLabel,
              ext: 'mp4',
              fileSize: d.size || 0,
              height: h,
              isAudioOnly: false,
              title: pageTitle,
              url: cleanUrl,
              directUrl: cleanUrl,
              videoUrl: cleanUrl,
              referer: effectiveReferer,
              origin: effectiveOrigin
            });
          }
        });
      }

      if (videoItems.length > 0) {
        const isAvc = (c) => typeof c === 'string' && (c.includes('avc') || c.includes('h264') || c.includes('264') || c === '7' || c === 7);
        videoItems.sort((a, b) => (b.height - a.height) || (Number(isAvc(b.codecs)) - Number(isAvc(a.codecs))) || (b.bandwidth - a.bandwidth));
        const seenH = new Set();

        videoItems.forEach(v => {
          if (seenH.has(v.height)) return;
          seenH.add(v.height);

          const resLabel = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getResolutionLabel) ? SmartDmUtils.getResolutionLabel(v.height, 'MP4') : `${v.height}p (MP4)`;
          formats.push({
            formatId: `bili_${v.height}p`,
            resolution: resLabel,
            ext: 'mp4',
            height: v.height,
            isAudioOnly: false,
            title: pageTitle,
            url: v.url,
            directUrl: v.url,
            videoUrl: v.url,
            audioUrl: audioUrl || null,
            audioStream: audioUrl ? { audioUrl, bandwidth: audioBw } : null,
            referer: effectiveReferer,
            origin: effectiveOrigin
          });
        });

        if (audioUrl) {
          formats.push({
            formatId: 'bili_audio',
            resolution: 'Audio (MP3 / High Quality)',
            ext: 'mp3',
            height: -1,
            isAudioOnly: true,
            title: pageTitle,
            url: audioUrl,
            directUrl: audioUrl,
            videoUrl: null,
            audioUrl: audioUrl,
            referer: effectiveReferer,
            origin: effectiveOrigin
          });
        }
      }
    } catch (_) {}
    return formats;
  }

  static async queryBilibiliPlayurlApi(videoUrl = null) {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname || '';
    const isTv = host.includes('bilibili.tv') || (videoUrl && videoUrl.includes('bilibili.tv'));
    const isCom = host.includes('bilibili.com') || (videoUrl && videoUrl.includes('bilibili.com'));
    if (!isTv && !isCom) return null;

    try {
      const pageUrl = (videoUrl && videoUrl.startsWith('http')) ? videoUrl : window.location.href;
      const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : (isTv ? 'https://www.bilibili.tv' : 'https://www.bilibili.com');
      const u = new URL(pageUrl, origin);
      const endpoints = [];

      if (isTv) {
        let epId = u.searchParams.get('ep_id');
        let aid = u.searchParams.get('aid');
        let seasonId = u.searchParams.get('season_id');

        const mPlay = u.pathname.match(/\/play\/(\d+)(?:\/(\d+))?/);
        if (mPlay) {
          if (mPlay[2]) {
            seasonId = seasonId || mPlay[1];
            epId = epId || mPlay[2];
          } else {
            seasonId = seasonId || mPlay[1];
          }
        }
        const mVid = u.pathname.match(/\/video\/(\d+)/);
        if (mVid) aid = aid || mVid[1];

        try {
          const nextEl = typeof document !== 'undefined' ? document.getElementById('__NEXT_DATA__') : null;
          const nextJson = (typeof window !== 'undefined' && window.__NEXT_DATA__) || (nextEl?.textContent ? JSON.parse(nextEl.textContent) : null);
          if (nextJson) {
            const findMeta = (obj, depth = 0) => {
              if (!obj || typeof obj !== 'object' || depth > 8) return;
              if (!epId && (obj.ep_id || obj.episode_id || obj.currentEpId)) {
                epId = String(obj.ep_id || obj.episode_id || obj.currentEpId);
              }
              if (!aid && obj.aid) {
                aid = String(obj.aid);
              }
              if (!seasonId && (obj.season_id || obj.seasonId)) {
                seasonId = String(obj.season_id || obj.seasonId);
              }
              if (Array.isArray(obj.episodeList) && obj.episodeList.length > 0 && !epId) {
                const first = obj.episodeList[0];
                if (first?.ep_id || first?.id) epId = String(first.ep_id || first.id);
                if (first?.aid && !aid) aid = String(first.aid);
              }
              if (Array.isArray(obj.episodes) && obj.episodes.length > 0 && !epId) {
                const first = obj.episodes[0];
                if (first?.ep_id || first?.id) epId = String(first.ep_id || first.id);
                if (first?.aid && !aid) aid = String(first.aid);
              }
              for (const k of Object.keys(obj)) {
                if (typeof obj[k] === 'object' && obj[k] !== null && k !== 'dehydratedState') {
                  findMeta(obj[k], depth + 1);
                }
              }
            };
            findMeta(nextJson);
          }
        } catch (_) {}

        if (!epId && mPlay && mPlay[1]) {
          epId = mPlay[1];
        }

        if (epId || aid || seasonId) {
          const mLocale = u.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
          const sLocale = mLocale ? (mLocale[1] === 'en' ? 'en_US' : mLocale[1]) : 'en_US';
          const params = new URLSearchParams();
          if (epId) params.set('ep_id', epId);
          if (aid) params.set('aid', aid);
          if (seasonId) params.set('season_id', seasonId);
          params.set('fnval', '4048');
          params.set('qn', '80');
          params.set('fnver', '0');
          params.set('device', 'wap');
          params.set('platform', 'web');
          params.set('s_locale', sLocale);
          endpoints.push(`https://api.bilibili.tv/s/player/online/playurl?${params.toString()}`);
          endpoints.push(`https://api.bilibili.tv/intl/gateway/web/playurl?${params.toString()}`);
        }
      } else if (isCom) {
        let bvid = null;
        let cid = u.searchParams.get('cid');
        let epId = u.searchParams.get('ep_id');
        let seasonId = u.searchParams.get('season_id');

        const mBv = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
        if (mBv) bvid = mBv[1];

        const mEp = u.pathname.match(/\/bangumi\/play\/ep(\d+)/i);
        if (mEp) epId = mEp[1];

        const mSs = u.pathname.match(/\/bangumi\/play\/ss(\d+)/i);
        if (mSs) seasonId = mSs[1];

        if (!cid || !bvid || !epId) {
          try {
            if (typeof window !== 'undefined' && window.__INITIAL_STATE__) {
              const init = window.__INITIAL_STATE__;
              if (!bvid && init.videoData?.bvid) bvid = init.videoData.bvid;
              if (!cid && init.videoData?.cid) cid = init.videoData.cid;
              if (!epId && init.epInfo?.id) epId = init.epInfo.id;
              if (!epId && Array.isArray(init.epList) && init.epList[0]?.id) epId = init.epList[0].id;
              if (!cid && init.epInfo?.cid) cid = init.epInfo.cid;
            }
          } catch (_) {}
        }
        if (!cid && typeof document !== 'undefined') {
          try {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
              const txt = scripts[i].textContent || '';
              if (!cid && txt.includes('"cid":')) {
                const m = txt.match(/"cid":\s*(\d+)/);
                if (m) cid = m[1];
              }
              if (!bvid && txt.includes('"bvid":')) {
                const m = txt.match(/"bvid":\s*"(BV[^"]+)"/);
                if (m) bvid = m[1];
              }
            }
          } catch (_) {}
        }

        if (epId || seasonId) {
          const epParam = epId ? `ep_id=${epId}` : `season_id=${seasonId}`;
          endpoints.push(`https://api.bilibili.com/pgc/player/web/playurl?${epParam}&fnval=4048&qn=80&fnver=0&fourk=1`);
        }
        if (bvid && cid) {
          endpoints.push(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=4048&qn=80&fnver=0&fourk=1`);
          endpoints.push(`https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&fnval=4048&qn=80&fnver=0&fourk=1`);
        }
      }

      if (endpoints.length === 0) return null;

      const pageTitle = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractWatchPageTitle?.()) || (typeof document !== 'undefined' && document.title) || 'video';

      for (const apiUrl of endpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const resp = await fetch(apiUrl, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/plain, */*'
            },
            signal: controller.signal,
            _smartdm_probe: true
          });
          clearTimeout(timer);
          if (resp.ok) {
            const text = await resp.text();
            if (text && (text.includes('"playurl"') || text.includes('"video_resource"') || text.includes('"dash"') || text.includes('"video_data"') || text.includes('"video"') || text.includes('"durl"'))) {
              const parsed = this.parseBilibiliFormats(text, apiUrl, pageTitle);
              if (parsed && parsed.length > 0) {
                return parsed;
              }
            }
          }
        } catch (_) {
          clearTimeout(timer);
        }
      }
    } catch (_) {}
    return null;
  }

  static parseFacebookDashManifest(mpdText, baseUrl, pageTitle = 'facebook_video') {
    const formats = [];
    try {
      if (!mpdText || typeof mpdText !== 'string') return [];

      if (mpdText.includes('<ContentProtection') || mpdText.includes('&lt;ContentProtection')) {
        return [];
      }

      let cleanText = mpdText;
      if (cleanText.includes('&lt;MPD')) {
        cleanText = cleanText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      }

      let durationSec = 0;
      const durMatch = cleanText.match(/mediaPresentationDuration=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?["']/);
      if (durMatch) {
        const h = parseFloat(durMatch[1] || 0);
        const m = parseFloat(durMatch[2] || 0);
        const s = parseFloat(durMatch[3] || 0);
        durationSec = h * 3600 + m * 60 + s;
      }

      const adaptMatches = [...cleanText.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)];
      let audioUrl = null;
      let audioBw = 0;
      const videoReps = [];

      adaptMatches.forEach(aMatch => {
        const setAttrs = aMatch[1].toLowerCase();
        const setBody = aMatch[2];
        const isSetVideo = setAttrs.includes('video') || setAttrs.includes('mimetype="video') || setAttrs.includes("mimetype='video");
        const isSetAudio = setAttrs.includes('audio') || setAttrs.includes('mimetype="audio') || setAttrs.includes("mimetype='audio");

        const repMatches = [...setBody.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)];
        repMatches.forEach(rMatch => {
          const repAttrs = rMatch[1];
          const repAttrsLower = repAttrs.toLowerCase();
          const repBody = rMatch[2];

          const isRepVideo = isSetVideo || repAttrsLower.includes('video') || repAttrsLower.includes('codecs="avc') || repAttrsLower.includes('codecs="vp9') || repAttrsLower.includes('codecs="av01') || repAttrsLower.includes('fbqualitylabel') || repAttrsLower.includes('width=') || repAttrsLower.includes('height=');
          const isRepAudio = isSetAudio || repAttrsLower.includes('audio') || repAttrsLower.includes('codecs="mp4a') || repAttrsLower.includes('codecs="opus');

          const wMatch = repAttrs.match(/\bwidth=["'](\d+)["']/i);
          const hMatch = repAttrs.match(/\bheight=["'](\d+)["']/i);
          const bwMatch = repAttrs.match(/\bbandwidth=["'](\d+)["']/i);
          const qlMatch = repAttrs.match(/\bFBQualityLabel=["']([^"']+)["']/i) || repAttrs.match(/\bqualityLabel=["']([^"']+)["']/i);

          const width = wMatch ? parseInt(wMatch[1], 10) : 0;
          let height = hMatch ? parseInt(hMatch[1], 10) : 0;
          const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

          if (height <= 0 && qlMatch) {
            const qlNum = parseInt(qlMatch[1], 10);
            if (qlNum > 0) height = qlNum;
          }

          let mediaUrl = '';
          const urlMatch = repBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i) || setBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i);
          if (urlMatch) {
            mediaUrl = urlMatch[1].trim().replace(/&amp;/g, '&');
            if (!mediaUrl.startsWith('http') && baseUrl) {
              try { mediaUrl = new URL(mediaUrl, baseUrl).href; } catch(e) {}
            }
          }

          if (mediaUrl && mediaUrl.startsWith('http')) {
            mediaUrl = SmartDmUtils.sanitizeStreamUrl(mediaUrl);
            if (isRepVideo && !isRepAudio) {
              let effH = (width > 0 && height > 0) ? Math.min(width, height) : (height || width);
              if (effH <= 0 && bandwidth > 0) {
                if (bandwidth >= 3000000) effH = 1080;
                else if (bandwidth >= 1500000) effH = 720;
                else if (bandwidth >= 800000) effH = 480;
                else effH = 360;
              }
              if (effH <= 0) effH = 720;
              videoReps.push({ effectiveHeight: effH, width, height, bandwidth, url: mediaUrl });
            } else if (isRepAudio) {
              if (!audioUrl || bandwidth > audioBw) {
                audioUrl = mediaUrl;
                audioBw = bandwidth;
              }
            }
          }
        });
      });

      if (videoReps.length === 0) {
        return [];
      }

      videoReps.sort((a, b) => b.effectiveHeight - a.effectiveHeight || b.bandwidth - a.bandwidth);
      const seenH = new Set();
      videoReps.forEach(v => {
        if (seenH.has(v.effectiveHeight)) return;
        seenH.add(v.effectiveHeight);

        let label = '';
        if (v.effectiveHeight >= 2160) label = '4K UHD (2160p) (MP4)';
        else if (v.effectiveHeight >= 1440) label = '1440p Quad HD (MP4)';
        else if (v.effectiveHeight >= 1080) label = '1080p Full HD (MP4)';
        else if (v.effectiveHeight >= 720) label = '720p HD (MP4)';
        else if (v.effectiveHeight === 640) label = '640p (MP4)';
        else if (v.effectiveHeight === 540) label = '540p (MP4)';
        else if (v.effectiveHeight === 480) label = '480p SD (MP4)';
        else if (v.effectiveHeight === 360) label = '360p SD (MP4)';
        else label = `${v.effectiveHeight}p (MP4)`;

        let estSize = 0;
        if (durationSec > 0 && v.bandwidth > 0) {
          estSize = Math.round(((v.bandwidth + (audioBw || 128000)) * durationSec) / 8);
        }

        formats.push({
          formatId: 'fb_' + v.effectiveHeight + 'p',
          resolution: label,
          title: pageTitle,
          url: v.url,
          videoUrl: v.url,
          audioUrl: audioUrl,
          height: v.effectiveHeight,
          bandwidth: v.bandwidth,
          ext: 'mp4',
          isAudioOnly: false,
          fileSize: estSize
        });
      });

      if (audioUrl) {
        formats.push({
          formatId: 'fb_audio',
          resolution: 'Audio (MP3 / High Quality)',
          title: pageTitle,
          url: audioUrl,
          videoUrl: null,
          audioUrl: audioUrl,
          height: -1,
          ext: 'mp3',
          isAudioOnly: true,
          fileSize: 0
        });
      }
    } catch(e) {}
    return formats;
  }

  static extractFacebookMediaFromDOM(targetVideoId = null, pageTitle = 'facebook_video') {
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    if (!isFb) return null;

    const isSingleVideo = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch');
    if (!targetVideoId && !isSingleVideo) {
      return null;
    }

    this.pruneCache();
    // Check fast memory cache (15-second TTL)
    const cacheKey = targetVideoId ? `fb_dom_${targetVideoId}` : `fb_dom_${window.location.pathname}`;
    if (this.fbDomCache && this.fbDomCache.has(cacheKey)) {
      const entry = this.fbDomCache.get(cacheKey);
      if (Date.now() - entry.time < 15000) {
        return entry.data;
      }
    }

    // 1. Try extracting DASH manifest directly from in-page scripts (instant, 1440p-ready)
    try {
      const allScripts = document.querySelectorAll('script');
      for (let i = 0; i < allScripts.length; i++) {
        const s = allScripts[i];
        if (s.src) continue; // Skip external scripts
        const text = s.textContent;
        if (!text || text.length < 50 || !text.includes('dash_manifest')) continue;

        const rawXml = this.extractDashManifestFromText(text, targetVideoId);
        if (rawXml) {
          const dashFormats = this.parseFacebookDashManifest(rawXml, window.location.href, pageTitle);
          if (dashFormats && dashFormats.some(f => !f.isAudioOnly)) {
            const res = { success: true, status: 'ok', title: pageTitle, formats: dashFormats };
            if (!this.fbDomCache) this.fbDomCache = new Map();
            this.rememberFacebook(cacheKey, res);
            return res;
          }
        }
      }
    } catch (e) {}

    // 2. Direct progressive extraction
    const formats = [];
    const seen = new Set();

    const addDirect = (url, quality, ext = 'mp4', audioUrl = null) => {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      let cleanUrl = SmartDmUtils.sanitizeStreamUrl(url.replace(/\\\/+/g, '/').replace(/\\u0026/g, '&').replace(/\\/g, ''));
      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);

      formats.push({
        formatId: 'fb_' + (quality.toLowerCase().includes('hd') ? 'hd' : (quality.toLowerCase().includes('audio') ? 'audio' : 'sd')),
        resolution: quality.includes('(') ? quality : `${quality} (MP4)`,
        ext: ext,
        fileSize: 0,
        isAudioOnly: quality.toLowerCase().includes('audio'),
        title: pageTitle,
        url: cleanUrl,
        directUrl: cleanUrl,
        videoUrl: cleanUrl,
        audioUrl: audioUrl
      });
    };

    try {
      const allScripts = document.querySelectorAll('script');
      for (let i = 0; i < allScripts.length; i++) {
        const s = allScripts[i];
        if (s.src) continue;
        const text = s.textContent;
        if (!text || text.length < 50) continue;
        const hasFbMediaKeys = text.includes('playable_url') || text.includes('browser_native') || text.includes('hd_src') || text.includes('sd_src');
        if (!hasFbMediaKeys) continue;

        if (targetVideoId) {
          if (!text.includes(targetVideoId)) continue;
          let idIndex = text.indexOf(targetVideoId);
          while (idIndex !== -1) {
            const windowStart = Math.max(0, idIndex - 25000);
            const windowEnd = Math.min(text.length, idIndex + 25000);
            const chunk = text.substring(windowStart, windowEnd);
            if (chunk.includes('playable_url') || chunk.includes('browser_native') || chunk.includes('hd_src') || chunk.includes('sd_src')) {
              const hdMatches = chunk.matchAll(/(?:"playable_url_quality_hd"|"browser_native_hd_url"|"hd_src"|"hd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
              for (const m of hdMatches) {
                addDirect(m[1], 'Source quality (resolution unknown)', 'mp4');
              }
              const sdMatches = chunk.matchAll(/(?:"playable_url"|"browser_native_sd_url"|"sd_src"|"sd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
              for (const m of sdMatches) {
                addDirect(m[1], 'Standard Definition (SD)', 'mp4');
              }
            }
            idIndex = text.indexOf(targetVideoId, idIndex + 1);
          }
        } else {
          const isSingleVideo = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch');
          if (isSingleVideo) {
            const hdMatches = text.matchAll(/(?:"playable_url_quality_hd"|"browser_native_hd_url"|"hd_src"|"hd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
            for (const m of hdMatches) {
              addDirect(m[1], 'Source quality (resolution unknown)', 'mp4');
            }
            const sdMatches = text.matchAll(/(?:"playable_url"|"browser_native_sd_url"|"sd_src"|"sd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
            for (const m of sdMatches) {
              addDirect(m[1], 'Standard Definition (SD)', 'mp4');
            }
          }
        }
      }

      if (formats.length === 0) {
        const isSingleVideoPage = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/videos/') || window.location.pathname.includes('/watch') || window.location.pathname.includes('/posts/');
        if (isSingleVideoPage) {
          for (let i = 0; i < allScripts.length; i++) {
            const s = allScripts[i];
            if (s.src) continue;
            const text = s.textContent;
            if (!text || text.length < 50) continue;
            if (!text.includes('playable_url') && !text.includes('browser_native') && !text.includes('hd_src') && !text.includes('sd_src')) continue;
            const hdMatches = text.matchAll(/(?:"playable_url_quality_hd"|"browser_native_hd_url"|"hd_src"|"hd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
            for (const m of hdMatches) {
              addDirect(m[1], 'Source quality (resolution unknown)', 'mp4');
            }
            const sdMatches = text.matchAll(/(?:"playable_url"|"browser_native_sd_url"|"sd_src"|"sd_src_no_ratelimit")\s*:\s*"([^"]+)"/g);
            for (const m of sdMatches) {
              addDirect(m[1], 'Standard Definition (SD)', 'mp4');
            }
          }
        }
      }
    } catch (e) {}

    if (formats.some(f => !f.isAudioOnly)) {
      const ladderFormats = formats.map(f => ({...f, height: f.height || 0,
        resolution: f.height > 0 ? `${f.height}p (${(f.ext || 'mp4').toUpperCase()})` : 'Source quality (resolution unknown)'}));
      const res = { success: true, status: 'ok', title: pageTitle, formats: ladderFormats };
      if (!this.fbDomCache) this.fbDomCache = new Map();
      this.rememberFacebook(cacheKey, res);
      return res;
    }
    return null;
  }

  static isSocialFeed() {
    return /(^|\.)(x\.com|twitter\.com|instagram\.com|tiktok\.com)$/.test(window.location.hostname);
  }

  static playerBinding(mediaEl) {
    if (!mediaEl) return null;
    const source = mediaEl.getAttribute?.('data-smartdm-bound-src');
    if (source && source !== (mediaEl.currentSrc || mediaEl.src)) return null;
    const video = mediaEl.getAttribute?.('data-smartdm-video-url') || mediaEl._smartdm_video_url;
    if (!/^https?:\/\//i.test(video || '')) return null;
    return {video, audio: mediaEl.getAttribute?.('data-smartdm-audio-url') || mediaEl._smartdm_audio_url,
      audioExpected: mediaEl.getAttribute?.('data-smartdm-separate-audio') === '1'};
  }

  static mediaExtension(url, contentType = '') {
    if (/mpegurl/i.test(contentType) || /\.m3u8(?:[?#]|$)/i.test(url)) return 'm3u8';
    if (/webm/i.test(contentType) || /\.webm(?:[?#]|$)/i.test(url)) return 'webm';
    const ext = (url || '').match(/\.(mp4|m4a|mp3|mkv|mov|ogg|aac|flac)(?:[?#]|$)/i)?.[1];
    return ext ? ext.toLowerCase() : 'mp4';
  }

  static selectedSocialFormats(mediaEl, media) {
    const src = mediaEl?.currentSrc || mediaEl?.src || '';
    const poster = mediaEl && (mediaEl.poster || mediaEl.getAttribute?.('poster')) || '';
    const asset = poster.match(/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)/)?.[1];
    const isInsta = typeof window !== 'undefined' && /(^|\.)instagram\.com$/.test(window.location.hostname);
    const sanitize = u => (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(u) : u;
    const matches = (media || []).filter(m => m.url === src || (asset && new RegExp('/(?:ext_tw_video|amplify_video)/' + asset + '/').test(m.url || '')));
    let binding = this.playerBinding(mediaEl);
    if (binding) {
      if (!binding.audio && (media || []).length) {
        const fbEfg = SmartDmUtils.parseFacebookEfg ? SmartDmUtils.parseFacebookEfg(binding.video) : null;
        const vid = fbEfg ? (fbEfg.video_id || fbEfg.fbid || fbEfg.asset_id || fbEfg.media_id || fbEfg.reel_id) : null;
        const matchedAudio = (media || []).find(m => m.isAudio && ((vid && m.fbVideoId === String(vid)) || /(?:cdninstagram\.com|fbcdn\.net)/i.test(m.url)));
        if (matchedAudio) binding.audio = matchedAudio.url;
      }
      if (binding.audioExpected && !binding.audio && !isInsta) return [];
      const cleanVideo = sanitize(binding.video);
      const cleanAudio = binding.audio ? (sanitize(binding.audio) || null) : null;
      matches.push({...(media || []).find(m => m.url === binding.video) || {}, url: cleanVideo, audioUrl: cleanAudio});
    } else if (isInsta && !matches.length) {
      const instaVideos = (media || []).filter(m => !m.isAudio && /(?:cdninstagram\.com|fbcdn\.net)/i.test(m.url || ''));
      if (instaVideos.length > 0) {
        const best = instaVideos.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        const matchingAudio = (media || []).find(m => m.isAudio && (best.fbVideoId && m.fbVideoId === best.fbVideoId || /(?:cdninstagram\.com|fbcdn\.net)/i.test(m.url)));
        const cleanVideo = sanitize(best.url);
        const cleanAudio = matchingAudio ? (sanitize(matchingAudio.url) || null) : null;
        matches.push({...best, url: cleanVideo, audioUrl: cleanAudio});
      }
    }
    let caption = '';
    if (isInsta && typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractInstagramMediaTitle) {
      const detected = VisualMountDetector.extractInstagramMediaTitle(mediaEl);
      if (detected && !SmartDmUtils.isGenericTitle(detected)) {
        caption = detected;
      }
    }
    if (!caption) {
      const card = isInsta
        ? (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.findInstagramPostCard ? VisualMountDetector.findInstagramPostCard(mediaEl) : mediaEl?.closest?.('article, [role="dialog"]'))
        : mediaEl?.closest?.('article, [data-e2e="recommend-list-item-container"], [data-e2e="feed-video"], [role="dialog"]');
      if (card) {
        if (isInsta && typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractInstagramMediaTitle) {
          const detected = VisualMountDetector.extractInstagramMediaTitle(mediaEl, card);
          if (detected && !SmartDmUtils.isGenericTitle(detected)) {
            caption = detected;
          }
        }
        if (!caption) {
          for (const selector of ['[data-testid="tweetText"]', '[data-e2e="video-desc"]', 'h1', '[data-testid="post-caption"]', 'img[alt]']) {
            const node = card.querySelector?.(selector);
            let value = (node?.textContent || node?.getAttribute?.('alt') || '').trim();
            if (value) {
              value = value.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
            }
            if (value.length > 3 && !/^(instagram|home.*x)$/i.test(value) && !SmartDmUtils.isGenericTitle(value)) { caption = value; break; }
          }
        }
        if (isInsta && !caption) {
          let author = card.querySelector?.('header a, h2 a, a[role="link"][tabindex="0"]')?.textContent?.trim();
          if (author) {
            author = author.replace(/\s*[•·\s\-–—|]?\s*\d+\s*(?:s|m|h|d|w|y|wk|mo|yr|sec|min|hr|day|week|month|year)s?(?:\s*ago)?$/i, '').trim();
            author = author.replace(/^[•·\s\-–—|]+|[•·\s\-–—|]+$/g, '').trim();
          }
          if (author && author.length > 1 && !SmartDmUtils.isGenericTitle(author)) {
            caption = `${author} - Instagram Video`;
          }
        }
      }
    }
    if (!caption) {
      const aria = mediaEl?.getAttribute?.('aria-label') || '';
      if (aria && !SmartDmUtils.isGenericTitle(aria)) caption = aria;
    }
    const title = caption ? SmartDmUtils.sanitizeCleanTitle(caption).slice(0, 160) : (isInsta ? 'Instagram Video' : 'Selected video');
    const urls = new Map(matches.map(m => {
      const u = sanitize(m.url);
      const a = m.audioUrl ? (sanitize(m.audioUrl) || null) : null;
      return [u, {...m, url: u, audioUrl: a}];
    }));
    const cleanSrc = sanitize(src);
    if (/^https?:/.test(cleanSrc) && !urls.has(cleanSrc)) urls.set(cleanSrc, {url:cleanSrc});
    const audio = [...urls.values()].filter(m => m.isAudio || /audio\//.test(m.contentType || ''));
    return [...urls.values()].filter(m => !audio.includes(m)).flatMap(m => {
      const cleanUrl = sanitize(m.url);
      const rawA = m.audioUrl || (audio.length === 1 ? audio[0].url : null);
      const audioUrl = rawA ? (sanitize(rawA) || null) : null;
      if (m.hasAudio === false && !audioUrl) return [];
      const cleanBindingVideo = sanitize(binding?.video);
      const height = m.height || (cleanUrl === cleanSrc || cleanUrl === cleanBindingVideo ? Math.min(mediaEl.videoWidth || Infinity, mediaEl.videoHeight || Infinity) : 0);
      const h = Number.isFinite(height) ? height : 0;
      return [{
        formatId:'selected_' + h,
        resolution:h ? h + 'p (captured stream)' : 'Original stream (resolution unknown)',
        height:h,
        ext:/\.m3u8(?:[?#]|$)/i.test(cleanUrl) ? 'm3u8' : 'mp4',
        url:cleanUrl,
        directUrl:cleanUrl,
        audioUrl,
        title,
        isAudioOnly:false,
        fileSize:m.contentLength || 0,
        referer: (typeof window !== 'undefined' ? window.location.href : ''),
        origin: (typeof window !== 'undefined' ? window.location.origin : '')
      }];
    });
  }

  static buildFallbackFormats(videoUrl, mediaEl, callback) {
    try {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')));
      const isInsta = typeof window !== 'undefined' && /(^|\.)instagram\.com$/.test(window.location.hostname);
      let pageTitle = null;
      if (isFb) {
        const card = mediaEl ? (VisualMountDetector.findFacebookReelCard(mediaEl) || VisualMountDetector.findFacebookPostCard(mediaEl)) : null;
        pageTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, card);
        if (!pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
          pageTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, null);
        }
      } else if (isInsta) {
        const card = mediaEl ? (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.findInstagramPostCard ? VisualMountDetector.findInstagramPostCard(mediaEl) : null) : null;
        pageTitle = (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractInstagramMediaTitle) ? VisualMountDetector.extractInstagramMediaTitle(mediaEl, card) : null;
        if (!pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
          pageTitle = (typeof VisualMountDetector !== 'undefined' && VisualMountDetector.extractInstagramMediaTitle) ? VisualMountDetector.extractInstagramMediaTitle(mediaEl, null) : null;
        }
      }
      if (window.top !== window.self && window._smartdm_cached_tab_title && !SmartDmUtils.isGenericTitle(window._smartdm_cached_tab_title)) {
        pageTitle = window._smartdm_cached_tab_title;
      } else if (!pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
        pageTitle = SmartDmUtils.extractWatchPageTitle() || (isFb ? 'facebook_video' : (isInsta ? 'Instagram Video' : 'video'));
      }
      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be') || (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')));

      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      if (!runtime || !runtime.sendMessage) {
        callback({ success: false, status: 'error', message: 'Extension context invalid.' });
        return;
      }

      const queryType = (mediaEl && mediaEl.tagName === 'IFRAME') ? 'GET_TAB_MEDIA' : 'GET_DETECTED_MEDIA';
      const handleMediaResponse = (response) => {
        try {
          if (response && response.tabTitle) {
            const cleanTitle = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeCleanTitle) ? SmartDmUtils.sanitizeCleanTitle(response.tabTitle) : response.tabTitle;
            if (cleanTitle && !SmartDmUtils.isGenericTitle(cleanTitle)) {
              window._smartdm_cached_tab_title = cleanTitle;
              if ((!isFb && !isInsta) || !pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
                pageTitle = cleanTitle;
              }
            }
          }
          const netMedia = (response && response.media) ? response.media : [];
          if (this.isSocialFeed()) {
            const selected = this.selectedSocialFormats(mediaEl, netMedia);
            callback(selected.length ? {success:true, status:'ok', title:selected[0].title, formats:selected} :
              {success:false, status:'error', message:'No verified stream for this selected video. Play this video and try again.'});
            return;
          }


          // Dedicated Facebook stream isolation & dual video+audio pairing
          if (isFb) {
            let primaryVideo = null;
            let primaryAudio = null;

            // 0. UNIVERSAL STREAM BINDER (Direct MediaSource & HTMLMediaElement binding)
            const binding = this.playerBinding(mediaEl);
            const boundVideoUrl = binding?.video;
            let boundAudioUrl = binding?.audio;
            if (boundAudioUrl && boundVideoUrl && boundAudioUrl === boundVideoUrl) {
              boundAudioUrl = null;
            }

            const isAudioCandidate = (m) => {
              if (!m || !m.url) return false;
              return SmartDmUtils.isFacebookAudioStream(m.url, m.contentType, m.isAudio);
            };

            const isVideoCandidate = (m) => {
              if (!m || !m.url) return false;
              return SmartDmUtils.isFacebookVideoStream(m.url, m.contentType, m.isVideo);
            };

            const fbStreams = (netMedia || []).filter(m => m.url && !m.url.includes('static.xx.fbcdn.net') && !m.url.includes('/rsrc.php/') && !m.url.includes('.wasm') && (
              m.url.includes('fbcdn.net') || m.url.includes('facebook.com') ||
              m.url.includes('fbsbx.com') || m.url.includes('facebook.net')
            ));
            const allVideoStreams = fbStreams.filter(m => isVideoCandidate(m));
            const allAudioStreams = fbStreams.filter(m => isAudioCandidate(m));

            if (boundVideoUrl && !isAudioCandidate({ url: boundVideoUrl })) {
              primaryVideo = {
                url: boundVideoUrl,
                contentLength: 0,
                timestamp: Date.now()
              };
              if (boundAudioUrl && isAudioCandidate({ url: boundAudioUrl })) {
                primaryAudio = {
                  url: boundAudioUrl,
                  contentLength: 0,
                  timestamp: Date.now()
                };
              }
            }

            let fbTargetId = null;
            if (videoUrl) {
              const m = videoUrl.match(/\/(?:reel|videos)\/(\d+)/) || videoUrl.match(/[?&](?:v|video_id|fbid|story_fbid)=(\d+)/);
              if (m) fbTargetId = m[1];
            }
            if (!fbTargetId && mediaEl) {
              try {
                const card = VisualMountDetector.findFacebookPostCard(mediaEl) || VisualMountDetector.findFacebookReelCard(mediaEl);
                fbTargetId = VisualMountDetector.extractFacebookPostVideoId(mediaEl, card);
              } catch(e) {}
            }

            // Do not scrape a page-wide script for a player stream. A Reel page
            // includes recommendations and their manifests alongside the active Reel.

            if (!primaryVideo) {
              const relevantVideo = fbTargetId
                ? allVideoStreams.filter(m => (m.pageReelId && m.pageReelId === fbTargetId) || (m.fbVideoId && m.fbVideoId === fbTargetId))
                : [];
              if (relevantVideo.length > 0) primaryVideo = relevantVideo[0];

              // Never substitute an unrelated stream just because it was recently
              // seen in this tab. That attached the current caption to another video.

              if (primaryVideo && isAudioCandidate(primaryVideo)) {
                primaryVideo = null;
              }
            }

            // Direct DOM source fallback for HTML5 video element (if progressive src is on mediaEl)
            if (!primaryVideo && mediaEl) {
              let live = mediaEl.currentSrc || mediaEl.src;
              if (!live || live.startsWith('blob:')) {
                const srcEl = mediaEl.querySelector('source');
                if (srcEl && srcEl.src && !srcEl.src.startsWith('blob:')) {
                  live = srcEl.src;
                }
              }
              if (live && live.startsWith('http') && isVideoCandidate({ url: live, contentType: '' })) {
                primaryVideo = {
                  url: live,
                  contentLength: 0,
                  timestamp: Date.now()
                };
              }
            }

            // Match audio stream strictly for primaryVideo if not already bound
            if (primaryVideo && !primaryAudio) {
              // RULE 1: Exact pageReelId match
              if (primaryVideo.pageReelId) {
                const sameReelAudio = allAudioStreams.filter(m => m.pageReelId && m.pageReelId === primaryVideo.pageReelId);
                if (sameReelAudio.length > 0) {
                  primaryAudio = sameReelAudio[0];
                }
              }

              // RULE 2: Exact fbVideoId asset match
              if (!primaryAudio && primaryVideo.fbVideoId) {
                const sameAssetAudio = allAudioStreams.filter(m => m.fbVideoId && m.fbVideoId === primaryVideo.fbVideoId);
                if (sameAssetAudio.length > 0) {
                  primaryAudio = sameAssetAudio[0];
                }
              }

              // RULE 3: If fbTargetId matches
              if (!primaryAudio && fbTargetId) {
                const targetAudio = allAudioStreams.filter(m => (m.pageReelId && m.pageReelId === fbTargetId) || (m.fbVideoId && m.fbVideoId === fbTargetId));
                if (targetAudio.length > 0) {
                  primaryAudio = targetAudio[0];
                }
              }

              // Audio is optional. Never pair it by timestamp or Reel/feed label.
            }

            if (primaryAudio && primaryVideo && primaryAudio.url === primaryVideo.url) {
              primaryAudio = null;
            }

            if (!primaryVideo) {
              // If no video stream has arrived yet, do NOT return audio alone as a finished format list!
              // Returning audio-only locks the dropdown to audio-only and hides video formats.
              callback({
                success: false,
                status: 'error',
                message: 'No verified stream for this video yet. Play it briefly, then reopen Download Video.'
              });
              return;
            }

            const fbFormats = [];
            const vH = mediaEl ? (mediaEl.videoHeight || 0) : 0;
            const totalStreamSize = (primaryVideo.contentLength || 0) + (primaryAudio ? (primaryAudio.contentLength || 0) : 0);
            fbFormats.push({formatId: 'fb_source', resolution: vH > 0 ? `${vH}p (MP4)` : 'Source quality (resolution unknown)',
              height: vH, ext: 'mp4', fileSize: totalStreamSize, isAudioOnly: false, title: pageTitle,
              url: primaryVideo.url, videoUrl: primaryVideo.url, audioUrl: primaryAudio ? primaryAudio.url : null});

            if (primaryAudio) {
              fbFormats.push({
                formatId: 'fb_audio',
                resolution: 'Audio (MP3 / High Quality)',
                height: -1,
                ext: 'mp3',
                fileSize: primaryAudio.contentLength || 0,
                isAudioOnly: true,
                title: pageTitle,
                url: primaryAudio.url,
                videoUrl: null,
                audioUrl: primaryAudio.url
              });
            }

            callback({ success: true, status: 'ok', title: pageTitle, formats: fbFormats });
            return;
          }

          // 0. UNIVERSAL STREAM BINDER (Direct MediaSource & HTMLMediaElement binding for all sites)
          const binding = this.playerBinding(mediaEl);
          const boundVideoUrl = binding?.video;
          let boundAudioUrl = binding?.audio;
          if (boundAudioUrl && boundVideoUrl && boundAudioUrl === boundVideoUrl) {
            boundAudioUrl = null;
          }

          if (boundVideoUrl) {
            if (binding.audioExpected && !boundAudioUrl) {
              callback({success: false, formats: [], message: 'Play this video until its audio stream is captured, then try again.'});
              return;
            }
            const boundFormats = [];
            const isBili = typeof window !== 'undefined' && window.location?.hostname &&
              (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));

            let vH = mediaEl ? (mediaEl.videoHeight || 0) : 0;
            if (vH <= 0 || isBili) {
              const extH = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractResolutionNumber) ? SmartDmUtils.extractResolutionNumber(boundVideoUrl) : 0;
              if (extH > 0 && (vH <= 0 || !mediaEl?.videoHeight || isBili)) vH = extH;
            }
            if (vH <= 0) vH = 720;

            const resLabel = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.getResolutionLabel) ? SmartDmUtils.getResolutionLabel(vH, 'MP4') : `${vH}p (MP4)`;
            boundFormats.push({
              formatId: isBili ? `bili_${vH}p` : `bound_${vH}p`,
              resolution: resLabel,
              height: vH,
              ext: 'mp4',
              fileSize: 0,
              isAudioOnly: false,
              title: pageTitle,
              url: boundVideoUrl,
              directUrl: boundVideoUrl,
              videoUrl: boundVideoUrl,
              referer: videoUrl || window.location.href,
              audioUrl: boundAudioUrl,
              audioStream: boundAudioUrl ? { audioUrl: boundAudioUrl, bandwidth: 0 } : null
            });

            if (boundAudioUrl) {
              boundFormats.push({
                formatId: isBili ? 'bili_audio' : 'bound_audio',
                resolution: 'Audio (MP3 / High Quality)',
                height: -1,
                ext: 'mp3',
                fileSize: 0,
                isAudioOnly: true,
                title: pageTitle,
                url: boundAudioUrl,
                directUrl: boundAudioUrl,
                videoUrl: null,
                audioUrl: boundAudioUrl
              });
            }

            const activeKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
            const existing = this.accumulatedFormatsByCacheKey.get(activeKey) || [];
            const merged = this.mergeFormatLists(existing, boundFormats);
            this.rememberFormats(activeKey, merged.slice());

            callback({ success: true, status: 'ok', title: pageTitle, formats: merged });
            return;
          }

          const isIframePlayer = !!(mediaEl && mediaEl.tagName === 'IFRAME');
          const selectedSrc = (!isIframePlayer && mediaEl) ? (mediaEl.currentSrc || mediaEl.src || (mediaEl.querySelector && mediaEl.querySelector("source")?.src)) : null;
          let prioritizedMedia = selectedSrc ? netMedia.filter(m => m.url === selectedSrc) : [];
          if (prioritizedMedia.length === 0 && !this.isSocialFeed() && (!selectedSrc || isIframePlayer || (mediaEl && (mediaEl.currentSrc || mediaEl.src || '').startsWith('blob:')))) {
            const videoMedia = netMedia.filter(m => {
              if (m.isAudio) return false;
              const u = m.url || '';
              const ct = m.contentType || '';
              return ct.includes('video/') || ct.includes('mpegurl') || ct.includes('dash') ||
                     /\.(m3u8|mp4|webm|mkv|mov|mpd)(?:[?#]|$)/i.test(u) ||
                     /(?:stream-embed\/(?:playlist|media)|\/(?:playlists?|manifests?|master|hls|dash|streams?|sources?|prox(?:y|ies)|embeds?|videos?|media|play(?:back)?|prorcp|chunklists?|vod|live|file|serve)(?:[?#/]|$)|[?&](?:format=m3u8|type=m3u8|source=m3u8|file=.*\.m3u8))/i.test(u);
            });
            if (videoMedia.length > 0) {
              prioritizedMedia = videoMedia;
            }
          }
          prioritizedMedia.sort((a, b) => {
            const aH = a.height || SmartDmUtils.extractResolutionNumber(a.url, a.customTitle || a.filename || '') || 0;
            const bH = b.height || SmartDmUtils.extractResolutionNumber(b.url, b.customTitle || b.filename || '') || 0;
            if (bH !== aH) return bH - aH;
            return (b.timestamp || 0) - (a.timestamp || 0);
          });

          let liveSrc = (!isIframePlayer && mediaEl) ? (mediaEl.currentSrc || mediaEl.src) : null;
          if (liveSrc && liveSrc.startsWith('blob:')) {
            liveSrc = null;
            const sourceChild = mediaEl.querySelector('source');
            if (sourceChild && sourceChild.src && !sourceChild.src.startsWith('blob:')) {
              liveSrc = sourceChild.src;
            }
          }

          const rawFormats = [];

          if (liveSrc && liveSrc.startsWith('http')) {
            const liveMetadata = netMedia.find(m => m.url === liveSrc);
            let h = SmartDmUtils.extractResolutionNumber(liveSrc);
            const w = mediaEl ? (mediaEl.videoWidth || 0) : 0;
            const elH = mediaEl ? (mediaEl.videoHeight || 0) : 0;
            if (h <= 0 && (w > 0 || elH > 0)) {
              h = SmartDmUtils.normalizeVideoResolution(w, elH);
            } else if (h > 0) {
              h = SmartDmUtils.normalizeVideoResolution(0, h);
            }
            let resText = SmartDmUtils.getResolutionLabel(h, liveSrc.includes('.webm') ? 'webm' : 'mp4');

            rawFormats.push({
              formatId: h > 0 ? `live_${h}p` : 'live_stream',
              resolution: resText,
              ext: liveSrc.includes('.webm') ? 'webm' : 'mp4',
              mediaKind: /\.m3u8(?:[?#]|$)/i.test(liveSrc) || /mpegurl/i.test(liveMetadata?.contentType || (mediaEl.querySelector('source') || {}).type || mediaEl.getAttribute('type') || '') ? 'hls' : null,
              fileSize: 0,
              isAudioOnly: false,
              title: pageTitle,
              url: liveSrc,
              videoUrl: videoUrl || window.location.href,
              referer: videoUrl || window.location.href,
              height: h
            });
          }

          prioritizedMedia.forEach((m, idx) => {
            if (liveSrc && m.url === liveSrc) return;
            const isGv = m.url.includes('googlevideo.com') || m.url.includes('videoplayback');
            const ext = this.mediaExtension(m.url, m.contentType);
            const isAudio = (m.contentType && m.contentType.includes('audio/')) || m.url.includes('.m4a') || m.url.includes('.mp3') || !!m.isAudio;

            let vH = (m.height && m.height > 0) ? SmartDmUtils.normalizeVideoResolution(0, m.height) : 0;
            if (vH <= 0 && this.streamHeightRegistry.has(m.url)) {
              vH = this.streamHeightRegistry.get(m.url);
            }
            if (vH <= 0 && m.url) {
              vH = SmartDmUtils.extractResolutionNumber(m.url, m.customTitle || m.filename || '');
            }
            if (vH <= 0 && prioritizedMedia.length === 1 && mediaEl && mediaEl.videoHeight > 0) {
              vH = SmartDmUtils.normalizeVideoResolution(mediaEl.videoWidth || 0, mediaEl.videoHeight);
            }
            if (vH > 0 && m.url) {
              this.streamHeightRegistry.set(m.url, vH);
            }

            let resLabel = '';
            if (isGv) {
              const itagMatch = m.url.match(/[?&]itag=(\d+)/);
              const itag = itagMatch ? itagMatch[1] : '';
              if (isAudio || itag === '140' || itag === '251') {
                resLabel = 'Audio Stream (High Quality)';
              } else if (itag === '137' || itag === '248' || itag === '399') {
                resLabel = '1080p Full HD (MP4)';
              } else if (itag === '22' || itag === '136' || itag === '247') {
                resLabel = '720p HD (MP4)';
              } else if (itag === '18' || itag === '135' || itag === '244') {
                resLabel = '480p / 360p (MP4)';
              } else {
                resLabel = m.height && m.height >= 720 ? `${m.height}p HD (MP4)` : (m.height ? `${m.height}p (MP4)` : (itag ? `Video Stream (itag ${itag})` : 'Video Stream (MP4)'));
              }
            } else {
              if (isAudio) {
                resLabel = `Audio Stream (${ext === 'm4a' || ext === 'mp3' ? ext.toUpperCase() : 'MP3'})`;
              } else if (vH > 0) {
                resLabel = SmartDmUtils.getResolutionLabel(vH, ext === 'm3u8' ? 'MP4' : ext.toUpperCase(), false);
              } else {
                resLabel = `Video Stream (${ext === 'm3u8' ? 'MP4' : ext.toUpperCase()})`;
              }
            }

            const fmtId = isAudio ? `net_audio_${idx}` : (vH > 0 ? `net_${vH}p` : `net_video_${idx}`);
            const itemReferer = m.referer || (window.top !== window.self ? window.location.href : (document.referrer || window.location.href));
            const itemOrigin = m.origin || window.location.origin;

            rawFormats.push({
              formatId: fmtId,
              resolution: resLabel,
              ext: ext === 'm3u8' ? 'mp4' : ext,
              mediaKind: m.mediaKind || (ext === 'm3u8' ? 'hls' : /dash\+xml/i.test(m.contentType || '') ? 'dash' : null),
              manifestText: m.manifestText || null,
              bandwidth: m.bandwidth || 0,
              totalDuration: m.totalDuration || null,
              badge: m.customBadge || (vH > 0 ? `${vH}p` : null),
              fileSize: (m.contentLength && m.contentLength >= 1048576) ? m.contentLength : 0,
              isAudioOnly: isAudio,
              title: pageTitle,
              url: m.url,
              directUrl: m.url,
              videoUrl: m.url,
              height: vH,
              referer: itemReferer,
              origin: itemOrigin
            });
          });

          const isBili = typeof window !== 'undefined' && window.location?.hostname &&
            (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));
          if (isBili) {
            const biliAudio = netMedia.find(m => m.isAudio || (m.contentType && m.contentType.includes('audio/')) || (m.url && /audio|302(16|32|80)/i.test(m.url)));
            if (biliAudio) {
              const cleanAudioUrl = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(biliAudio.url) : biliAudio.url;
              rawFormats.forEach(f => {
                if (!f.isAudioOnly && !f.audioUrl) {
                  f.audioUrl = cleanAudioUrl;
                  f.audioStream = { audioUrl: cleanAudioUrl, bandwidth: 0 };
                }
              });
            }
          }

          const formats = [];
          const seenFmt = new Set();
          rawFormats.forEach(f => {
            const h = f.height || 0;
            const isAud = !!f.isAudioOnly;
            const k = isAud ? `audio_${f.ext || 'stream'}` : (h > 0 ? `video_${h}` : 'video_generic');
            if (!seenFmt.has(k)) {
              seenFmt.add(k);
              formats.push(f);
            }
          });

          if (formats.some(f => !f.isAudioOnly && f.height > 0)) {
            const filtered = formats.filter(f => f.isAudioOnly || f.height > 0);
            if (filtered.length > 0) {
              formats.length = 0;
              formats.push(...filtered);
            }
          }

          const activeKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
          const accumulated = this.accumulatedFormatsByCacheKey.get(activeKey) || [];
          accumulated.forEach(prev => {
            const pH = prev.height || 0;
            const pAud = !!prev.isAudioOnly;
            if (!formats.some(curr => (curr.height || 0) === pH && !!curr.isAudioOnly === pAud)) {
              formats.push(prev);
            }
          });
          if (formats.some(f => !f.isAudioOnly && f.height > 0)) {
            const filtered = formats.filter(f => f.isAudioOnly || f.height > 0);
            if (filtered.length > 0) {
              formats.length = 0;
              formats.push(...filtered);
            }
          }
          this.rememberFormats(activeKey, formats.slice());

          if (!isYouTube && !isFb) {
            const domFormats = this.extractTubeFormatsFromDOM(pageTitle);
            if (domFormats && domFormats.length > 0) {
              domFormats.forEach(df => {
                const dfH = df.height || 0;
                if (!formats.some(uf => uf.height === dfH && !uf.isAudioOnly)) {
                  formats.push(df);
                }
              });
            }
          }

          formats.sort((a, b) => {
            if (a.isAudioOnly && !b.isAudioOnly) return 1;
            if (!a.isAudioOnly && b.isAudioOnly) return -1;
            return (b.height || 0) - (a.height || 0);
          });

          if (formats.length > 0) {
            callback({ success: true, status: 'ok', title: pageTitle, formats: formats });
          } else {
            if (!isYouTube) {
              const inPageStreams = this.extractInPageMovieStreams(mediaEl, pageTitle);
              if (inPageStreams && inPageStreams.length > 0) {
                this.rememberFormats(activeKey, inPageStreams.slice());
                callback({ success: true, status: 'ok', title: pageTitle, formats: inPageStreams });
                return;
              }
              const tubeFormats = this.extractTubeFormatsFromDOM(pageTitle);
              if (tubeFormats && tubeFormats.length > 0) {
                callback({ success: true, status: 'ok', title: pageTitle, formats: tubeFormats });
                return;
              }
            }
            callback({
              success: false,
              status: 'error',
              message: 'No media formats detected for this video.'
            });
          }
        } catch(e) {
          callback({ success: false, status: 'error', message: 'No media formats detected.' });
        }
      };

      runtime.sendMessage({ type: queryType, currentUrl: window.location.href }, (response) => {
        if ((!response || !response.success) && queryType === 'GET_TAB_MEDIA') {
          runtime.sendMessage({ type: 'GET_DETECTED_MEDIA', currentUrl: window.location.href }, handleMediaResponse);
        } else {
          handleMediaResponse(response);
        }
      });
    } catch(err) {
      callback({ success: false, status: 'error', message: 'No media formats detected.' });
    }
  }

  static pruneCache() {
    try {
      for (const [key, entry] of Object.entries(this.mediaFormatCache)) {
        if ((entry.youtube || entry.linkedPage) && entry.status !== 'pending' && entry.expiresAt <= Date.now()) delete this.mediaFormatCache[key];
      }
      const keys = Object.keys(this.mediaFormatCache).filter(k => this.mediaFormatCache[k].status !== 'pending');
      if (keys.length > 30) {
        keys.slice(0, keys.length - 30).forEach(k => delete this.mediaFormatCache[k]);
      }
      if (this.accumulatedFormatsByCacheKey.size > 30) {
        const it = this.accumulatedFormatsByCacheKey.keys();
        while (this.accumulatedFormatsByCacheKey.size > 30) {
          this.accumulatedFormatsByCacheKey.delete(it.next().value);
        }
      }
      if (this.streamHeightRegistry.size > 50) {
        const it = this.streamHeightRegistry.keys();
        while (this.streamHeightRegistry.size > 50) {
          this.streamHeightRegistry.delete(it.next().value);
        }
      }
      for (const [key, entry] of this.fbDomCache) {
        if (Date.now() - entry.time >= 15000) this.fbDomCache.delete(key);
      }
    } catch(e) {}
  }

  static capturedPlayerFormats(mediaEl) {
    if (typeof document === 'undefined' || !document.querySelectorAll) return null;
    const id = mediaEl && typeof mediaEl.getAttribute === 'function' ? mediaEl.getAttribute('data-smartdm-hls-player') : null;
    const stashes = Array.from(document.querySelectorAll('smartdm-manifest-stash'));
    let matching = id ? stashes.filter(s => s.getAttribute('data-smartdm-player') === id) : [];
    if (!matching.length) {
      const vEls = Array.from(document.querySelectorAll('video'));
      if (vEls.length <= 1 || (mediaEl && typeof SmartDmUtils !== 'undefined' && mediaEl === SmartDmUtils.findActiveVideoElement?.())) {
        matching = stashes.filter(s => !s.getAttribute('data-smartdm-player'));
      }
    }
    if (!matching.length) return null;
    const audio = matching.find(s => s.getAttribute('data-smartdm-track') === 'audio');
    if (!audio && mediaEl && typeof mediaEl.getAttribute === 'function' && mediaEl.getAttribute('data-smartdm-hls-external-audio') === '1')
      return {success: false, formats: [], message: 'Play the video until its audio playlist is available, then try again.'};

    const masterStash = matching.find(s => (s.textContent || '').includes('#EXT-X-STREAM-INF'));
    if (masterStash) {
      let masterUrl = masterStash.getAttribute('data-smartdm-url');
      if (!masterUrl || masterUrl.startsWith('blob:')) {
        const src = mediaEl && (mediaEl.currentSrc || mediaEl.src);
        masterUrl = (src && !src.startsWith('blob:')) ? src : window.location.href;
      }
      const parsedVariants = this.parseM3u8Formats(masterStash.textContent, masterUrl);
      if (parsedVariants && parsedVariants.length > 0) {
        const pageTitle = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractWatchPageTitle?.()) || (typeof document !== 'undefined' && document.title) || 'Video';
        const formats = parsedVariants.map(v => ({
          ...v,
          title: pageTitle,
          audioUrl: audio && audio.getAttribute('data-smartdm-url'),
          audioManifestText: audio && audio.textContent,
          referer: window.location.href
        }));
        return { success: true, title: pageTitle, formats };
      }
    }

    const formats = matching.filter(s => s.getAttribute('data-smartdm-track') !== 'audio').flatMap(s => {
      const url = s.getAttribute('data-smartdm-url');
      const manifestText = s.textContent || '';
      if (!/^https?:\/\//i.test(url || '') || !manifestText.startsWith('#EXTM3U')) return [];
      if (manifestText.includes('#EXT-X-STREAM-INF')) {
        const parsed = this.parseM3u8Formats(manifestText, url);
        return parsed || [];
      }
      if (!manifestText.includes('#EXTINF') && !manifestText.includes('#EXT-X-ENDLIST')) return [];
      let height = Number(s.getAttribute('data-smartdm-height')) || 0;
      if (height <= 0 && url) height = SmartDmUtils.extractResolutionNumber(url);
      if (height <= 0 && mediaEl && mediaEl.videoHeight > 0) height = SmartDmUtils.normalizeVideoResolution(mediaEl.videoWidth || 0, mediaEl.videoHeight);
      return [{formatId: 'captured_hls_' + height, resolution: height ? `${height}p (MP4)` : 'Playing quality (MP4)',
        ext: 'mp4', mediaKind: 'hls', manifestText, audioUrl: audio && audio.getAttribute('data-smartdm-url'),
        audioManifestText: audio && audio.textContent, url, directUrl: url, height, isAudioOnly: false,
        title: (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractWatchPageTitle?.()) || (typeof document !== 'undefined' && document.title) || 'Video', referer: window.location.href}];
    }).filter(Boolean);
    return formats.length ? {success: true, title: formats[0].title, formats} : null;
  }

  static fetchMediaFormats(videoUrl, mediaEl = null, callback = null, isBackgroundPolling = false, lookupOptions = null) {
    if (typeof callback === 'function') {
      const deliver = callback;
      callback = (result, pending) => deliver(result && result.formats ? {...result,
        formats: result.formats.map(format => ({...format, assetId: format.assetId || videoUrl || window.location.href}))} : result, pending);
    }
    const isYouTube = /(^|\.)(youtube\.com|youtu\.be)$/.test(window.location.hostname) || !!this.youTubeCacheKey(videoUrl);
    if (isYouTube) {
      this.pruneCache();
      // Keep a usable selected-player capture while the complete resolver runs.
      // Unbound tab-wide captures must not substitute a different thumbnail video.
      const key = this.youTubeCacheKey(videoUrl);
      const binding = mediaEl ? this.playerBinding(mediaEl) : null;
      const selectedSource = binding?.video || mediaEl?.currentSrc || mediaEl?.src;
      let available = null;
      let lookupDone = false;
      let lookupResult = null;
      let fallbackDone = !/^https?:\/\//i.test(selectedSource || '');
      const deliverFailure = () => {
        if (lookupDone && fallbackDone && !available && !lookupResult?.success) callback?.(lookupResult, false);
      };
      this.fetchYouTubeFormats(videoUrl, result => {
        lookupDone = true;
        lookupResult = result;
        if (result?.success && result.formats?.length) callback?.(result, false);
        else if (available) callback?.(available, false);
        else deliverFailure();
      }, isBackgroundPolling);
      if (!fallbackDone && !lookupResult?.success) this.buildFallbackFormats(videoUrl, mediaEl, result => {
        fallbackDone = true;
        const selected = (result?.formats || []).filter(f => (f.url || f.directUrl) === selectedSource ||
          (binding?.audio && (f.url || f.directUrl) === binding.audio));
        if (selected.length) {
          available = {...result, formats: selected.map(f => ({...f, assetId: key}))};
          if (!lookupResult?.success) callback?.(available, false);
        } else deliverFailure();
      });
      return;
    }
    // A card targets another document. Listing previews and the current page's
    // player graph cannot establish which streams belong to that linked video.
    if (lookupOptions?.fromThumbnail && !this.isSocialFeed()) {
      this.fetchLinkedPageFormats(videoUrl, callback, isBackgroundPolling);
      return;
    }
    const captured = this.capturedPlayerFormats(mediaEl);
    if (captured) { if (typeof callback === 'function') callback(captured, false); return; }
    const source = mediaEl && mediaEl.querySelector('source');
    if (source && /mpegurl/i.test(source.type || '') && /^https?:\/\//i.test(source.src || '')) {
      const height = SmartDmUtils.normalizeVideoResolution(mediaEl.videoWidth || 0, mediaEl.videoHeight || 0);
      const title = SmartDmUtils.extractWatchPageTitle() || document.title || 'Video';
      if (typeof callback === 'function') callback({success: true, title, formats: [{formatId: 'player_hls',
        resolution: height ? `${height}p (MP4)` : 'Playing quality (MP4)', height, ext: 'mp4', mediaKind: 'hls',
        url: source.src, directUrl: source.src, title, referer: window.location.href, isAudioOnly: false}]}, false);
      return;
    }
    if (this.isSocialFeed()) {
      this.buildFallbackFormats(videoUrl, mediaEl, result => { if (typeof callback === 'function') callback(result, false); });
      return;
    }

    this.pruneCache();
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    const isBili = typeof window !== 'undefined' && window.location?.hostname &&
      (window.location.hostname.includes('bilibili.com') || window.location.hostname.includes('bilibili.tv'));
    const cacheKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);

    if (isBili && (!this.accumulatedFormatsByCacheKey.has(cacheKey) || this.accumulatedFormatsByCacheKey.get(cacheKey).length === 0)) {
      const inPageManifest = this.extractInPageBilibiliManifest();
      if (inPageManifest) {
        const pageTitle = (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.extractWatchPageTitle?.()) || (typeof document !== 'undefined' && document.title) || 'video';
        const parsed = this.parseBilibiliFormats(inPageManifest, videoUrl || window.location.href, pageTitle);
        if (parsed && parsed.length > 0) {
          const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(cacheKey) || [], parsed);
          this.rememberFormats(cacheKey, merged.slice());
        }
      }
    }

    // A slow resolver must not acquire another callback/DOM closure every poll.
    if (this.mediaFormatCache[cacheKey]?.status === 'pending') {
      if (!isBackgroundPolling && typeof callback === 'function') this.mediaFormatCache[cacheKey].callbacks.push(callback);
      return;
    }
    if (this.mediaFormatCache[cacheKey] && !isBackgroundPolling) {
      const cached = this.mediaFormatCache[cacheKey];
      if (cached.status === 'done') {
        if (typeof callback === 'function') callback(cached.data, false);
        return;
      }
    }

    const cacheEntry = this.mediaFormatCache[cacheKey] = {
      status: 'pending',
      data: null,
      callbacks: (typeof callback === 'function' && !isBackgroundPolling) ? [callback] : []
    };

    const notifyCallbacks = (res) => {
      // A removed player or detection update can invalidate this key while an
      // IPC reply is in flight. Complete only the request that owns the reply.
      const entry = cacheEntry;
      let delivered = false;
      if (entry) {
        entry.status = 'done';
        entry.data = res;
        const cbs = entry.callbacks || [];
        entry.callbacks = [];
        cbs.forEach(cb => {
          if (cb === callback) delivered = true;
          try { cb(res, false); } catch(e) {}
        });
        this.pruneCache();
      }
      if (typeof callback === 'function' && !delivered) {
        try { callback(res, false); } catch(e) {}
      }
    };

    let safetyTriggered = false;
    const safetyTimeoutMs = isYouTube ? 9000 : 2500;
    const safetyTimer = setTimeout(() => {
      safetyTriggered = true;
      const entry = cacheEntry;
      if (entry && entry.status === 'pending') {
        const activeKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
        const accumulated = this.accumulatedFormatsByCacheKey.get(activeKey);
        if (accumulated && accumulated.length > 0) {
          let resolvedSafetyTitle = null;
          if (isFb) {
            const card = mediaEl ? (VisualMountDetector.findFacebookReelCard(mediaEl) || VisualMountDetector.findFacebookPostCard(mediaEl)) : null;
            resolvedSafetyTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, card);
          }
          if (!resolvedSafetyTitle || SmartDmUtils.isGenericTitle(resolvedSafetyTitle)) {
            resolvedSafetyTitle = SmartDmUtils.extractWatchPageTitle() || (isFb ? 'facebook_video' : 'video');
          }
          notifyCallbacks({
            success: true,
            status: 'ok',
            title: resolvedSafetyTitle,
            formats: accumulated
          });
        } else {
          notifyCallbacks({
            success: false,
            status: 'error',
            message: 'No media formats detected for this video.'
          });
        }
      }
    }, safetyTimeoutMs);

    const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
    const isSpecificFbUrl = isFb && videoUrl && (
      videoUrl.includes('/reel/') || videoUrl.includes('/videos/') || videoUrl.includes('/watch') || videoUrl.includes('/posts/') || videoUrl.includes('fbid=') || videoUrl.includes('story_fbid=') || videoUrl.includes('/permalink') || videoUrl.includes('/share/')
    );
    const isExternalWatchUrl = !isFb && !isYouTube && videoUrl !== window.location.href &&
      (videoUrl.includes('/view_video.php') || videoUrl.includes('/video/') || videoUrl.includes('/videos/') || videoUrl.includes('/watch') || videoUrl.includes('/play/'));

    let instantDelivered = false;

    this.buildFallbackFormats(videoUrl, mediaEl, (instantRes) => {
      const activeKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
      const accumulated = this.accumulatedFormatsByCacheKey.get(activeKey);
      if (accumulated && accumulated.length > 0) {
        const pageTitle = (instantRes && instantRes.title && !SmartDmUtils.isGenericTitle(instantRes.title)) ? instantRes.title : (SmartDmUtils.extractWatchPageTitle() || 'video');
        instantRes = {
          success: true,
          status: 'ok',
          title: pageTitle,
          formats: this.mergeFormatLists(accumulated, (instantRes && instantRes.formats) || [])
        };
      }
      if (instantRes && instantRes.formats && instantRes.formats.length > 0) {
        instantDelivered = true;
        const hasMore = !isFb && !!(isExternalWatchUrl || isYouTube || isBili);
        if (typeof callback === 'function' && !isFb) {
          callback(instantRes, hasMore);
        }

        if (isFb) {
          clearTimeout(safetyTimer);
          notifyCallbacks(instantRes);
          return;
        }

        const m3u8Candidates = instantRes.formats.filter(f => (f.url && f.url.includes('.m3u8')) || f.ext === 'm3u8' || f.mediaKind === 'hls' || /(?:stream-embed\/(?:playlist|media)|\/(?:playlists?|manifests?|master|hls|dash|streams?|sources?|prox(?:y|ies)|embeds?|videos?|media|play(?:back)?|prorcp|chunklists?|vod|live|file|serve)(?:[?#/]|$)|[?&](?:format=m3u8|type=m3u8|source=m3u8|file=.*\.m3u8))/i.test(f.url || ''));
        if (m3u8Candidates.length > 0) {
          (async () => {
            for (const candItem of m3u8Candidates) {
              if (!candItem.url) continue;
              let pageVariants = await this.resolveM3u8VariantsInPage(candItem.url);
              if (pageVariants && pageVariants.length > 0) {
                pageVariants.forEach(vf => {
                  if (!vf.title || SmartDmUtils.isGenericTitle(vf.title)) {
                    vf.title = instantRes.title || vf.title;
                  }
                  if (vf.height > 0 && vf.url) {
                    this.streamHeightRegistry.set(vf.url, vf.height);
                  }
                });
                const key = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
                const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], pageVariants);
                this.rememberFormats(key, merged.slice());

                try {
                  runtime.sendMessage({
                    type: 'REGISTER_M3U8_VARIANTS',
                    masterUrl: candItem.url,
                    formats: merged
                  });
                } catch(e) {}

                const finalRes = { success: true, status: 'ok', title: instantRes.title, formats: merged };
                clearTimeout(safetyTimer);
                notifyCallbacks(finalRes);
                return;
              }
            }

            const firstM3u8 = m3u8Candidates[0];
            if (firstM3u8 && firstM3u8.url) {
              runtime.sendMessage({ type: 'RESOLVE_M3U8_VARIANTS', url: firstM3u8.url }, (varRes) => {
                if (varRes && varRes.success && varRes.formats && varRes.formats.length > 0) {
                  varRes.formats.forEach(vf => {
                    if (!vf.title || SmartDmUtils.isGenericTitle(vf.title)) {
                      vf.title = instantRes.title || vf.title;
                    }
                    if (vf.height > 0 && vf.url) {
                      this.streamHeightRegistry.set(vf.url, vf.height);
                    }
                  });
                  const key = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
                  const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], varRes.formats);
                  this.rememberFormats(key, merged.slice());
                  const finalRes = { success: true, status: 'ok', title: instantRes.title, formats: merged };
                  clearTimeout(safetyTimer);
                  notifyCallbacks(finalRes);
                } else if (!hasMore) {
                  clearTimeout(safetyTimer);
                  notifyCallbacks(instantRes);
                }
              });
            } else if (!hasMore) {
              clearTimeout(safetyTimer);
              notifyCallbacks(instantRes);
            }
          })().catch(() => {
            if (!hasMore) {
              clearTimeout(safetyTimer);
              notifyCallbacks(instantRes);
            }
          });
        } else if (isBili) {
          (async () => {
            const apiFormats = await this.queryBilibiliPlayurlApi(videoUrl || window.location.href);
            if (apiFormats && apiFormats.length > 0) {
              apiFormats.forEach(vf => {
                if (vf.height > 0 && vf.url) {
                  this.streamHeightRegistry.set(vf.url, vf.height);
                }
              });
              const key = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
              const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], apiFormats);
              this.rememberFormats(key, merged.slice());
              const finalTitle = (instantRes && instantRes.title && !SmartDmUtils.isGenericTitle(instantRes.title)) ? instantRes.title : (SmartDmUtils.extractWatchPageTitle() || 'video');
              const finalRes = { success: true, status: 'ok', title: finalTitle, formats: merged };
              clearTimeout(safetyTimer);
              notifyCallbacks(finalRes);
              return;
            }
            clearTimeout(safetyTimer);
            notifyCallbacks(instantRes);
          })().catch(() => {
            clearTimeout(safetyTimer);
            notifyCallbacks(instantRes);
          });
        } else if (!hasMore) {
          clearTimeout(safetyTimer);
          notifyCallbacks(instantRes);
        }
      } else if (isFb) {
        clearTimeout(safetyTimer);
        notifyCallbacks(instantRes || { success: false, status: 'error', message: 'No verified stream for this video yet.' });
      } else if (isBili || (mediaEl && (mediaEl.tagName === 'IFRAME' || !mediaEl.currentSrc || (typeof mediaEl.currentSrc === 'string' && mediaEl.currentSrc.startsWith('blob:'))))) {
        if (isBili) {
          this.queryBilibiliPlayurlApi(videoUrl || window.location.href).then(apiFormats => {
            if (apiFormats && apiFormats.length > 0) {
              const key = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);
              const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], apiFormats);
              this.rememberFormats(key, merged.slice());
              const title = SmartDmUtils.extractWatchPageTitle() || 'video';
              clearTimeout(safetyTimer);
              notifyCallbacks({ success: true, status: 'ok', title, formats: merged });
            } else {
              clearTimeout(safetyTimer);
              notifyCallbacks(instantRes || { success: false, status: 'error', message: 'No media formats detected for this video.' });
            }
          }).catch(() => {
            clearTimeout(safetyTimer);
            notifyCallbacks(instantRes || { success: false, status: 'error', message: 'No media formats detected for this video.' });
          });
          return;
        }
        runtime.sendMessage({ type: 'RESOLVE_M3U8_VARIANTS' }, (varRes) => {
          if (varRes && varRes.success && varRes.formats && varRes.formats.length > 0) {
            instantDelivered = true;
            clearTimeout(safetyTimer);
            notifyCallbacks(varRes);
          } else {
            clearTimeout(safetyTimer);
            notifyCallbacks(instantRes || { success: false, status: 'error', message: 'No media formats detected for this video.' });
          }
        });
      }
    });

    // Facebook pages include unrelated recommended videos. Use only a stream
    // bound to the current player or one with the exact target video ID.
    if (isFb) return;

    if (isSpecificFbUrl || isExternalWatchUrl) {
      runtime.sendMessage({ type: 'GET_PAGE_MEDIA_FORMATS', url: videoUrl }, (pageRes) => {
        if (pageRes && (pageRes.success || pageRes.status === 'ok') && pageRes.formats && pageRes.formats.length > 0) {
          clearTimeout(safetyTimer);
          pageRes.formats.forEach(f => {
            if (!f.videoUrl) f.videoUrl = videoUrl;
            if (!f.referer) f.referer = videoUrl;
          });
          notifyCallbacks(pageRes);
          return;
        }
        if (instantDelivered) {
          if (typeof callback === 'function') callback(null, false);
        } else {
          this.buildFallbackFormats(videoUrl, mediaEl, (fallbackRes) => {
            clearTimeout(safetyTimer);
            notifyCallbacks(fallbackRes);
          });
        }
      });
      return;
    }

    if (!instantDelivered) {
      this.buildFallbackFormats(videoUrl, mediaEl, (res) => {
        clearTimeout(safetyTimer);
        notifyCallbacks(res);
      });
    }
  }
}
