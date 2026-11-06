// SmartDM Content Script Coordinator
// Orchestrates modular OOP engines: SmartDmUtils, VisualMountDetector, FormatRegistryEngine, OverlayUiRenderer, MediaWatcher

(function() {
  if (window.__smartdm_overlay_installed__) return;
  window.__smartdm_overlay_installed__ = true;

  const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

  function injectInPageManifestSniffer() {
    try {
      if (document.documentElement && document.documentElement.hasAttribute('data-smartdm-sniffer')) return;
      if (document.getElementById('__smartdm_sniffer_script__')) return;
      if (runtime && runtime.getURL) {
        const script = document.createElement('script');
        script.id = '__smartdm_sniffer_script__';
        script.src = runtime.getURL('sniffer.js');
        script.async = false;
        (document.head || document.documentElement || document.body).appendChild(script);
        script.remove();
      }
    } catch(e) {}
  }

  function dispatchDownload(currentFmtList, targetItem, finalBaseTitle, onResult = null) {
    const effectiveFormats = (currentFmtList && currentFmtList.length > 0) ? currentFmtList : [targetItem];

    let bestAudioUrl = null;
    let bestAudioSize = 0;
    effectiveFormats.forEach(f => {
      const isAud = f.isAudioOnly || f.IsAudioOnly;
      const aUrl = f.directUrl || f.DirectUrl || f.url || f.Url;
      const fid = String(f.formatId || f.FormatId || '');
      if (isAud && aUrl && aUrl.startsWith('http')) {
        if (!bestAudioUrl || fid === '140') {
          bestAudioUrl = aUrl;
          bestAudioSize = f.fileSize || f.FileSize || 0;
        }
      }
    });

    const formatsList = effectiveFormats.map((f, index) => {
      const isAud = !!(f.isAudioOnly || f.IsAudioOnly);
      const fUrl = f.directUrl || f.DirectUrl || f.url || f.Url || f.videoUrl || f.VideoUrl || null;
      let fExt = (f.ext || f.Ext || 'mp4').toLowerCase();
      if (fExt === 'm3u8') fExt = 'mp4';
      return {
        formatId: String(f.formatId || f.FormatId || 'direct_' + index),
        resolution: f.resolution || f.Resolution || f.qualityLabel || (isAud ? 'Audio Only' : 'Video'),
        ext: fExt,
        fileSize: f.fileSize || f.FileSize || 0,
        isAudioOnly: isAud,
        title: finalBaseTitle,
        url: fUrl,
        directUrl: fUrl,
        mediaKind: f.mediaKind || f.MediaKind || (/\.m3u8(?:[?#]|$)/i.test(fUrl || '') ? 'hls' : null),
        manifestText: f.manifestText || f.ManifestText || null,
        audioManifestText: f.audioManifestText || f.AudioManifestText || null,
        audioUrl: f.audioUrl || f.AudioUrl || (!isAud && bestAudioUrl && bestAudioUrl !== fUrl ? bestAudioUrl : null)
      };
    });

    if (!formatsList.some(f => f.formatId === 'bestaudio/best' || (f.isAudioOnly && f.ext === 'mp3'))) {
      formatsList.push({
        formatId: 'bestaudio/best',
        resolution: 'Audio (MP3 / High Quality)',
        ext: 'mp3',
        fileSize: bestAudioSize,
        isAudioOnly: true,
        title: finalBaseTitle,
        url: bestAudioUrl || targetItem.audioUrl || targetItem.url || null,
        directUrl: bestAudioUrl || targetItem.audioUrl || targetItem.url || null,
        audioUrl: null
      });
    }

    let thumbUrl = null;
    try {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg && ogImg.content) thumbUrl = ogImg.content;
      if (!thumbUrl) {
        const linkImg = document.querySelector('link[rel="image_src"]');
        if (linkImg && linkImg.href) thumbUrl = linkImg.href;
      }
      const pageUrl = window.location.href;
      if (!thumbUrl && (pageUrl.includes('youtube.com') || pageUrl.includes('youtu.be'))) {
        const vidMatch = pageUrl.match(/[?&]v=([^&#]+)/) || pageUrl.match(/youtu\.be\/([^?&#]+)/) || pageUrl.match(/\/shorts\/([^?&#]+)/);
        if (vidMatch) thumbUrl = `https://i.ytimg.com/vi/${vidMatch[1]}/maxresdefault.jpg`;
      }
    } catch(e) {}

    if (!formatsList.some(f => f.formatId === 'thumbnail')) {
      formatsList.push({
        formatId: 'thumbnail',
        resolution: 'Thumbnail (Cover Image / HD)',
        ext: 'jpg',
        fileSize: 0,
        isAudioOnly: false,
        title: finalBaseTitle,
        url: thumbUrl,
        audioUrl: null
      });
    }

    let directDownloadUrl = null;
    if (targetItem.formatId === 'thumbnail') {
      directDownloadUrl = thumbUrl || targetItem.url || window.location.href;
    } else if (targetItem.formatId === 'bestaudio/best') {
      directDownloadUrl = bestAudioUrl || targetItem.audioUrl || targetItem.url || window.location.href;
    } else {
      directDownloadUrl = targetItem.directUrl || targetItem.DirectUrl || targetItem.url || targetItem.Url || targetItem.videoUrl || null;
    }

    // A watch page is not a media fallback. Only the desktop's explicit YouTube
    // resolver accepts a page URL as its source.
    const isYouTubePage = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?|shorts\/)|youtu\.be\/)/i.test(directDownloadUrl || '');
    if (!/^https?:\/\//i.test(directDownloadUrl || '') || (directDownloadUrl === window.location.href && !isYouTubePage)) {
      if (typeof onResult === 'function') onResult({success: false, status: 'error', message: 'No verified media address is available. Play this video and capture it again.'});
      return;
    }
    const selectedFormatId = String(targetItem.formatId || targetItem.FormatId || formatsList.find(f => f.directUrl === directDownloadUrl)?.formatId || 'direct_selected');

    const rawAudio = targetItem.audioUrl || (!targetItem.isAudioOnly && targetItem.formatId !== 'thumbnail' ? bestAudioUrl : null);
    const audioUrlToSend = (rawAudio && rawAudio !== directDownloadUrl) ? rawAudio : null;
    const refToSend = targetItem.referer || (targetItem.videoUrl && targetItem.videoUrl.startsWith('http') && targetItem.videoUrl !== window.location.href ? targetItem.videoUrl : (window.top !== window.self ? window.location.href : (document.referrer || window.location.href)));
    const origToSend = targetItem.origin || window.location.origin;

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (typeof onResult === 'function') onResult(result);
    };
    const timeout = setTimeout(() => finish({ success: false, status: 'error' }), 20000);
    try {
      runtime.sendMessage({
      type: 'START_MEDIA_DOWNLOAD',
      url: directDownloadUrl,
      videoUrl: targetItem.videoUrl,
      audioUrl: audioUrlToSend,
      formatId: selectedFormatId,
      fileName: targetItem.fileName,
      title: finalBaseTitle,
      referer: refToSend,
      origin: origToSend,
      pageUrl: targetItem.referer || (targetItem.videoUrl && targetItem.videoUrl.startsWith('http') ? targetItem.videoUrl : window.location.href),
      formats: formatsList
      }, (response) => {
        const sendError = runtime.lastError;
        finish(sendError ? { success: false, status: 'error' } : (response || { success: false, status: 'error' }));
      });
    } catch (error) {
      finish({ success: false, status: 'error' });
    }
  }

  function initGlobalClickInterceptor() {
    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      try {
        let el = e.target;
        let depth = 0;
        while (el && el !== document.body && depth < 10) {
          if (el.tagName && (el.tagName.toUpperCase() === 'A' || el.tagName.toUpperCase() === 'SVG')) {
            let hrefStr = el.href || el.getAttribute('href') || '';
            if (hrefStr && typeof hrefStr === 'string') {
              const urlLower = hrefStr.toLowerCase();
              const isFileExt = urlLower.match(/\.(zip|rar|7z|exe|msi|iso|bin|mp4|mkv|avi|mp3|flac|wav|pdf|epub|mobi|apk|tar|gz|bz2)(\?.*)?$/i);
              const isDownloadAttr = el.hasAttribute && el.hasAttribute('download');
              
              if ((isFileExt || isDownloadAttr) && urlLower.startsWith('http')) {
                e.preventDefault();
                e.stopPropagation();
                
                let basename = '';
                try { basename = new URL(hrefStr).pathname.split('/').pop(); } catch(err) {}
                
                runtime.sendMessage({
                  type: 'ADD_DOWNLOAD',
                  url: hrefStr,
                  fileName: basename || null,
                  referer: window.location.href
                });
                return;
              }
            }
          }
          el = el.parentElement || el.parentNode;
          depth++;
        }
      } catch (err) {}
    }, true);
  }

  function isTinyOrAdFrame() {
    try {
      if (window.top === window.self) return false;
      const host = window.location.hostname.toLowerCase();
      if (!host) return false; // Allow about:blank and transitioning embed frames
      if (host.includes('doubleclick') || host.includes('googleads') || host.includes('googlesyndication') ||
          host.includes('criteo') || host.includes('taboola') || host.includes('outbrain') ||
          host.includes('adnxs') || host.includes('rubiconproject') || host.includes('amazon-adsystem') ||
          host.includes('adroll') || host.includes('quantserve') || host.includes('facebook.com/plugins') ||
          host.includes('facebook.com/v') || host.includes('connect.facebook.net') || host.includes('analytics') ||
          host.includes('clarity.ms') || host.includes('hotjar') || host.includes('scorecardresearch') ||
          host.includes('trafficjunky') || host.includes('exoclick') || host.includes('popcash') ||
          host.includes('juicyads') || host.includes('ero-advertising') || host.includes('syndication') ||
          host.includes('popads') || host.includes('propellerads') || host.includes('adsterra') ||
          host.includes('monetag')) {
        return true;
      }
      const w = window.innerWidth || (document.documentElement ? document.documentElement.clientWidth : 0);
      const h = window.innerHeight || (document.documentElement ? document.documentElement.clientHeight : 0);
      if (w > 0 && h > 0 && (w < 180 || h < 120)) return true;
    } catch (e) {
      return true;
    }
    return false;
  }

  function initOverlayCoordinator() {
    if (isTinyOrAdFrame()) return;

    injectInPageManifestSniffer();
    FormatRegistryEngine.drainStashedManifests(() => {
      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
        const p = h.shadowRoot ? h.shadowRoot.querySelector('.popover.active') : null;
        if (p && p._smartdm_refresh) p._smartdm_refresh();
      });
    });

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('__smartdm_manifest_captured__', (e) => {
        const refresh = () => {
          document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
            const p = h.shadowRoot ? h.shadowRoot.querySelector('.popover.active') : null;
            if (p && p._smartdm_refresh) p._smartdm_refresh();
          });
        };
        // Player-bound decoded playlists are read from their bounded stash.
        // Do not copy/reprobe them through the generic network discovery path.
        if (e.detail?.playerId) refresh();
        else if (e.detail?.text) FormatRegistryEngine.processCapturedManifest(e.detail.url, e.detail.text, refresh);
      });
    }

    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'SMARTDM_MEDIA_DETECTED') {
          FormatRegistryEngine.mediaFormatCache = {};
          const activeP = document.querySelector('.smartdm-player-host, .smartdm-thumb-host')?.shadowRoot?.querySelector('.popover.active');
          if (activeP && activeP._smartdm_refresh) activeP._smartdm_refresh();
        } else if (msg && msg.type === 'PROBE_M3U8_MANIFEST' && msg.url) {
          (async () => {
            const variants = await FormatRegistryEngine.resolveM3u8VariantsInPage(msg.url);
            if (variants && variants.length > 0) {
              const vEl = SmartDmUtils.findActiveVideoElement();
              const key = SmartDmUtils.getMediaCacheKey(window.location.href, vEl);
              const merged = FormatRegistryEngine.mergeFormatLists(FormatRegistryEngine.accumulatedFormatsByCacheKey.get(key) || [], variants);
              FormatRegistryEngine.rememberFormats(key, merged.slice());
              runtime.sendMessage({
                type: 'REGISTER_M3U8_VARIANTS',
                masterUrl: msg.url,
                formats: merged
              });
            }
          })().catch(() => {});
        }
      });
    }

    if (window.top === window.self) initGlobalClickInterceptor();
    MediaWatcher.init(dispatchDownload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlayCoordinator);
  } else {
    initOverlayCoordinator();
  }
})();
