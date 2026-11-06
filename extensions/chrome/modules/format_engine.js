// SmartDM Format Registry Engine
// Manages multi-format stream discovery, HLS/DASH manifest parsing, quality ladders, and strict deduplication

class FormatRegistryEngine {
  static streamHeightRegistry = new Map(); // url -> height (number)
  static accumulatedFormatsByCacheKey = new Map(); // cacheKey -> Array<formatItem>
  static mediaFormatCache = {}; // cacheKey -> { status, data, callbacks }
  static fbDomCache = new Map(); // key -> { time, data }
  static processedManifests = new Set(); // manifestKey -> boolean
  static activeProbes = new Set(); // url -> boolean

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
    const assets = new Set((incomingList || []).map(f => f.assetId).filter(Boolean));
    const base = (baseList || []).filter(f => !assets.size || assets.has(f.assetId));
    for (const item of [...base, ...(incomingList || [])]) {
      if (!item || item.provisional) continue;
      const url = item.directUrl || item.url || '';
      if (!/^https?:\/\//i.test(url)) continue;
      const key = [item.assetId || '', item.formatId || url, item.ext || '', item.videoCodec || '', item.audioCodec || '', item.language || '', !!item.isAudioOnly].join('|');
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
          try {
            const resolved = new URL(streamUrl, baseUrl);
            streamUrl = resolved.href;
          } catch (e) {}
        }
        if (baseUrl && baseUrl.includes('?') && !streamUrl.includes('?')) {
          try {
            const bParsed = new URL(baseUrl);
            const sParsed = new URL(streamUrl);
            sParsed.search = bParsed.search;
            streamUrl = sParsed.href;
          } catch(e) {}
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
          title: label,
          resolution: label,
          ext: 'mp4',
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
    if (!streamUrl || typeof streamUrl !== 'string' || !streamUrl.includes('.m3u8')) return null;
    if (this.activeProbes.has(streamUrl)) return null;
    this.activeProbes.add(streamUrl);
    try {
      const fetchPlaylist = async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const r = await fetch(url, {
            signal: controller.signal,
            headers: { 'x-smartdm-probe': '1' }
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
                if (bytes > 500000) { controller.abort(); return null; }
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

  static processCapturedManifest(url, text, onRefresh = null) {
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
    } else if (text.includes('#EXTINF') && url && url.includes('.m3u8')) {
      this.resolveM3u8VariantsInPage(url).then(variants => {
        if (variants && variants.length > 0) {
          variants.forEach(vf => {
            if (vf.height > 0 && vf.url) {
              this.streamHeightRegistry.set(vf.url, vf.height);
            }
          });
          const vEl = SmartDmUtils.findActiveVideoElement();
          const key = SmartDmUtils.getMediaCacheKey(window.location.href, vEl);
          const merged = this.mergeFormatLists(this.accumulatedFormatsByCacheKey.get(key) || [], variants);
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
      const key = SmartDmUtils.getMediaCacheKey(window.location.href, vEl);
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
        if (el.getAttribute('data-smartdm-player')) return;
        const u = el.getAttribute('data-smartdm-url') || window.location.href;
        const txt = el.textContent;
        if (txt) {
          this.processCapturedManifest(u, txt, onRefresh);
        }
        el.remove();
      });
    } catch(e) {}
  }

  static getInstantYouTubeFormats(videoUrl, title = 'YouTube Video') {
    // Resolution choices become selectable only after real discovery.
    return [];
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
    const src = mediaEl && (mediaEl.currentSrc || mediaEl.src) || '';
    const poster = mediaEl && (mediaEl.poster || mediaEl.getAttribute?.('poster')) || '';
    const asset = poster.match(/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)/)?.[1];
    const matches = media.filter(m => m.url === src || (asset && new RegExp('/(?:ext_tw_video|amplify_video)/' + asset + '/').test(m.url || '')));
    const binding = this.playerBinding(mediaEl);
    if (binding) {
      if (binding.audioExpected && !binding.audio) return [];
      matches.push({...(media.find(m => m.url === binding.video) || {}), url: binding.video, audioUrl: binding.audio});
    }
    let caption = '';
    const card = mediaEl?.closest?.('article, [data-e2e="recommend-list-item-container"], [data-e2e="feed-video"], [role="dialog"]');
    if (card) {
      for (const selector of ['[data-testid="tweetText"]', '[data-e2e="video-desc"]', 'h1', '[data-testid="post-caption"]', 'img[alt]']) {
        const node = card.querySelector?.(selector);
        const value = (node?.textContent || node?.getAttribute?.('alt') || '').trim();
        if (value.length > 3 && !/^(instagram|home.*x)$/i.test(value)) { caption = value; break; }
      }
    }
    if (!caption) caption = mediaEl?.getAttribute?.('aria-label') || '';
    const title = caption ? SmartDmUtils.sanitizeCleanTitle(caption).slice(0, 160) : 'Selected video';
    const urls = new Map(matches.map(m => [m.url, m]));
    if (/^https?:/.test(src) && !urls.has(src)) urls.set(src, {url:src});
    const audio = [...urls.values()].filter(m => m.isAudio || /audio\//.test(m.contentType || ''));
    return [...urls.values()].filter(m => !audio.includes(m)).flatMap(m => {
      const audioUrl = m.audioUrl || (audio.length === 1 ? audio[0].url : null);
      if (m.hasAudio === false && !audioUrl) return [];
      const height = m.height || (m.url === src || m.url === binding?.video ? Math.min(mediaEl.videoWidth || Infinity, mediaEl.videoHeight || Infinity) : 0);
      const h = Number.isFinite(height) ? height : 0;
      return [{formatId:'selected_' + h, resolution:h ? h + 'p (captured stream)' : 'Original stream (resolution unknown)', height:h,
        ext:/\.m3u8(?:[?#]|$)/i.test(m.url) ? 'm3u8' : 'mp4', url:m.url, directUrl:m.url, audioUrl, title, isAudioOnly:false, fileSize:m.contentLength || 0}];
    });
  }

  static buildFallbackFormats(videoUrl, mediaEl, callback) {
    try {
      const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch') || (videoUrl && (videoUrl.includes('facebook.com') || videoUrl.includes('fb.watch')));
      let pageTitle = null;
      if (isFb) {
        const card = mediaEl ? (VisualMountDetector.findFacebookReelCard(mediaEl) || VisualMountDetector.findFacebookPostCard(mediaEl)) : null;
        pageTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, card);
        if (!pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
          pageTitle = VisualMountDetector.extractFacebookMediaTitle(mediaEl, null);
        }
      }
      if (window.top !== window.self && window._smartdm_cached_tab_title && !SmartDmUtils.isGenericTitle(window._smartdm_cached_tab_title)) {
        pageTitle = window._smartdm_cached_tab_title;
      } else if (!pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
        pageTitle = SmartDmUtils.extractWatchPageTitle() || (isFb ? 'facebook_video' : 'video');
      }
      const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be') || (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')));

      const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
      if (!runtime || !runtime.sendMessage) {
        callback({ success: false, status: 'error', message: 'Extension context invalid.' });
        return;
      }

      runtime.sendMessage({ type: 'GET_DETECTED_MEDIA', currentUrl: window.location.href }, (response) => {
        try {
          if (response && response.tabTitle && !SmartDmUtils.isGenericTitle(response.tabTitle)) {
            const cleanTitle = SmartDmUtils.sanitizeCleanTitle(response.tabTitle);
            if (cleanTitle) {
              window._smartdm_cached_tab_title = cleanTitle;
              if (!isFb || !pageTitle || SmartDmUtils.isGenericTitle(pageTitle)) {
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
            let vH = mediaEl ? (mediaEl.videoHeight || 0) : 0;
            if (vH <= 0) vH = SmartDmUtils.extractResolutionNumber(boundVideoUrl);

            const resLabel = SmartDmUtils.getResolutionLabel(vH, 'MP4');
            boundFormats.push({
              formatId: `bound_${vH}p`,
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
              audioUrl: boundAudioUrl
            });

            if (boundAudioUrl) {
              boundFormats.push({
                formatId: 'bound_audio',
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
            const merged = this.mergeFormatLists([], boundFormats);
            this.rememberFormats(activeKey, merged.slice());

            callback({ success: true, status: 'ok', title: pageTitle, formats: merged });
            return;
          }

          const selectedSrc = mediaEl && (mediaEl.currentSrc || mediaEl.src || mediaEl.querySelector("source")?.src);
          let prioritizedMedia = netMedia.filter(m => m.url === selectedSrc);
          prioritizedMedia.sort((a, b) => {
            const aH = a.height || SmartDmUtils.extractResolutionNumber(a.url, a.customTitle || a.filename || '') || 0;
            const bH = b.height || SmartDmUtils.extractResolutionNumber(b.url, b.customTitle || b.filename || '') || 0;
            if (bH !== aH) return bH - aH;
            return (b.timestamp || 0) - (a.timestamp || 0);
          });

          let liveSrc = mediaEl ? (mediaEl.currentSrc || mediaEl.src) : null;
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
              mediaKind: ext === 'm3u8' ? 'hls' : /dash\+xml/i.test(m.contentType || '') ? 'dash' : null,
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
      });
    } catch(err) {
      callback({ success: false, status: 'error', message: 'No media formats detected.' });
    }
  }

  static pruneCache() {
    try {
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
    const id = mediaEl && mediaEl.getAttribute('data-smartdm-hls-player');
    if (!id) return null;
    const stashes = Array.from(document.querySelectorAll('smartdm-manifest-stash'));
    const matching = stashes.filter(s => s.getAttribute('data-smartdm-player') === id);
    const audio = matching.find(s => s.getAttribute('data-smartdm-track') === 'audio');
    if (!audio && mediaEl.getAttribute('data-smartdm-hls-external-audio') === '1')
      return {success: false, formats: [], message: 'Play the video until its audio playlist is available, then try again.'};
    const formats = matching.filter(s => s.getAttribute('data-smartdm-track') !== 'audio').map(s => {
      const url = s.getAttribute('data-smartdm-url');
      const manifestText = s.textContent || '';
      if (!/^https?:\/\//i.test(url || '') || !manifestText.startsWith('#EXTM3U') || !manifestText.includes('#EXT-X-ENDLIST')) return null;
      const height = Number(s.getAttribute('data-smartdm-height')) || 0;
      return {formatId: 'captured_hls_' + height, resolution: height ? `${height}p (MP4)` : 'Playing quality (MP4)',
        ext: 'mp4', mediaKind: 'hls', manifestText, audioUrl: audio && audio.getAttribute('data-smartdm-url'),
        audioManifestText: audio && audio.textContent, url, directUrl: url, height, isAudioOnly: false,
        title: SmartDmUtils.extractWatchPageTitle() || document.title || 'Video', referer: window.location.href};
    }).filter(Boolean);
    return formats.length ? {success: true, title: formats[0].title, formats} : null;
  }

  static fetchMediaFormats(videoUrl, mediaEl = null, callback = null, isBackgroundPolling = false) {
    if (typeof callback === 'function') {
      const deliver = callback;
      callback = (result, pending) => deliver(result && result.formats ? {...result,
        formats: result.formats.map(format => ({...format, assetId: format.assetId || videoUrl || window.location.href}))} : result, pending);
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
    const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be') || (videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')));
    const isFb = window.location.hostname.includes('facebook.com') || window.location.hostname.includes('fb.watch');
    const cacheKey = SmartDmUtils.getMediaCacheKey(videoUrl, mediaEl);

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
      (videoUrl.includes('/view_video.php') || videoUrl.includes('/video/') || videoUrl.includes('/videos/') || videoUrl.includes('/watch'));

    let instantDelivered = false;

    this.buildFallbackFormats(videoUrl, mediaEl, (instantRes) => {
      if (instantRes && instantRes.formats && instantRes.formats.length > 0) {
        instantDelivered = true;
        const hasMore = !isFb && !!(isExternalWatchUrl || isYouTube);
        if (typeof callback === 'function' && !isFb) {
          callback(instantRes, hasMore);
        }

        if (isFb) {
          clearTimeout(safetyTimer);
          notifyCallbacks(instantRes);
          return;
        }

        const m3u8Candidates = instantRes.formats.filter(f => (f.url && f.url.includes('.m3u8')) || (f.ext === 'm3u8'));
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

                if (typeof callback === 'function') {
                  callback({ success: true, status: 'ok', title: instantRes.title, formats: merged }, false);
                }
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
                  if (typeof callback === 'function') {
                    callback({ success: true, status: 'ok', title: instantRes.title, formats: merged }, false);
                  }
                }
              });
            }
          })().catch(() => {});
        }
      } else if (isFb) {
        clearTimeout(safetyTimer);
        notifyCallbacks(instantRes || { success: false, status: 'error', message: 'No verified stream for this video yet.' });
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

    if (isYouTube) {
      runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: videoUrl }, (res) => {
        clearTimeout(safetyTimer);
        if (res && (res.success || res.status === 'ok') && res.formats && res.formats.length > 0) {
          notifyCallbacks(res);
          return;
        }

        const isOnWatchPage = window.location.pathname.includes('/watch') || window.location.pathname.includes('/shorts/');
        if (isOnWatchPage && window.location.href.includes(videoUrl)) {
          const instantYt = this.getInstantYouTubeFormats(videoUrl, SmartDmUtils.extractWatchPageTitle());
          if (instantYt && instantYt.length > 0) {
            notifyCallbacks({ success: true, status: 'ok', title: SmartDmUtils.extractWatchPageTitle(), formats: instantYt });
            return;
          }
        }

        if (instantDelivered) {
          if (typeof callback === 'function') callback(null, false);
        } else {
          notifyCallbacks({
            success: false,
            status: 'error',
            message: 'Could not resolve YouTube formats.<br><span style="font-size:10px; color:#94a3b8;">Ensure SmartDM desktop app is running.</span>'
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
