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
      const ogImg = document.querySelector?.('meta[property="og:image"]');
      if (ogImg && ogImg.content) thumbUrl = ogImg.content;
      if (!thumbUrl) {
        const linkImg = document.querySelector?.('link[rel="image_src"]');
        if (linkImg && linkImg.href) thumbUrl = linkImg.href;
      }
      const videoSource = targetItem.videoUrl || targetItem.assetId || (typeof targetItem.url === 'string' && (targetItem.url.includes('youtube.com') || targetItem.url.includes('youtu.be')) ? targetItem.url : window.location.href);
      if (!thumbUrl && (videoSource.includes('youtube.com') || videoSource.includes('youtu.be'))) {
        const vidMatch = videoSource.match(/[?&]v=([^&#]+)/) || videoSource.match(/youtu\.be\/([^?&#]+)/) || videoSource.match(/\/shorts\/([^?&#]+)/);
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
    if (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) {
      directDownloadUrl = SmartDmUtils.sanitizeStreamUrl(directDownloadUrl);
    }

    // A watch page is not a media fallback. Only the desktop's explicit YouTube
    // resolver accepts a page URL as its source.
    const isYouTubePage = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?|shorts\/)|youtu\.be\/)/i.test(directDownloadUrl || '');
    if (!/^https?:\/\//i.test(directDownloadUrl || '') || (directDownloadUrl === window.location.href && !isYouTubePage)) {
      if (typeof onResult === 'function') onResult({success: false, status: 'error', message: 'No verified media address is available. Play this video and capture it again.'});
      return;
    }
    const selectedFormatId = String(targetItem.formatId || targetItem.FormatId || formatsList.find(f => f.directUrl === directDownloadUrl)?.formatId || 'direct_selected');

    let rawAudio = targetItem.audioUrl || (!targetItem.isAudioOnly && targetItem.formatId !== 'thumbnail' ? bestAudioUrl : null);
    if (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) {
      rawAudio = SmartDmUtils.sanitizeStreamUrl(rawAudio);
    }
    const audioUrlToSend = (rawAudio && rawAudio !== directDownloadUrl) ? rawAudio : null;
    const isMediaUrl = (u) => typeof u === 'string' && (/\.(?:mp4|webm|m3u8|mpd|m4s|ts)(?:[?#]|$)/i.test(u) || /(?:fbcdn\.net|cdninstagram\.com)/i.test(u));
    let refToSend = targetItem.referer;
    if (!refToSend || isMediaUrl(refToSend)) {
      refToSend = (window.top !== window.self) ? (document.referrer || window.location.href) : window.location.href;
    }
    if (isMediaUrl(refToSend)) refToSend = window.location.href;

    let pageUrlToSend = (window.top !== window.self) ? (document.referrer || window.location.href) : window.location.href;
    if (isMediaUrl(pageUrlToSend)) {
      pageUrlToSend = window.location.href;
    }
    let origToSend = targetItem.origin || window.location.origin;
    if (!origToSend && refToSend) {
      try { origToSend = new URL(refToSend).origin; } catch(_) {}
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (typeof onResult === 'function') onResult(result);
    };
    const timeout = setTimeout(() => finish({ success: false, status: 'error' }), 20000);

    const downloadPayload = {
      type: 'START_MEDIA_DOWNLOAD',
      url: directDownloadUrl,
      videoUrl: (typeof SmartDmUtils !== 'undefined' && SmartDmUtils.sanitizeStreamUrl) ? SmartDmUtils.sanitizeStreamUrl(targetItem.videoUrl) : targetItem.videoUrl,
      audioUrl: audioUrlToSend,
      formatId: selectedFormatId,
      fileName: targetItem.fileName,
      title: finalBaseTitle,
      referer: refToSend,
      origin: origToSend,
      pageUrl: pageUrlToSend,
      formats: formatsList
    };

    try {
      runtime.sendMessage(downloadPayload, async (response) => {
        const sendError = runtime.lastError;
        finish(sendError ? { success: false, status: 'error' } : (response || { success: false, status: 'error' }));
      });
    } catch (error) {
      finish({ success: false, status: 'error' });
    }
  }

  function dispatchBatchDownload(batchPayload, onResult = null) {
    if (!batchPayload || !Array.isArray(batchPayload.items) || batchPayload.items.length === 0) {
      if (typeof onResult === 'function') onResult({ success: false, status: 'error', message: 'No items in batch.' });
      return;
    }

    const refToSend = (window.top !== window.self) ? (document.referrer || window.location.href) : window.location.href;
    const pageUrlToSend = window.location.href;
    const origToSend = window.location.origin;

    const message = {
      type: 'ADD_MEDIA_BATCH',
      batchTitle: batchPayload.batchTitle || batchPayload.playlistTitle || 'Batch Download',
      playlistTitle: batchPayload.playlistTitle || null,
      playlistId: batchPayload.playlistId || null,
      isAudio: Boolean(batchPayload.isAudio),
      referer: batchPayload.referer || refToSend,
      pageUrl: batchPayload.pageUrl || pageUrlToSend,
      origin: origToSend,
      items: batchPayload.items.map(item => ({
        url: item.url || item.directUrl,
        directUrl: item.directUrl || item.url,
        title: item.title,
        fileName: item.fileName,
        formatId: item.formatId || (batchPayload.isAudio ? 'bestaudio/best' : '1080p'),
        ext: item.ext || (batchPayload.isAudio ? 'mp3' : 'mp4'),
        referer: item.referer || refToSend,
        pageUrl: item.pageUrl || pageUrlToSend
      }))
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (typeof onResult === 'function') onResult(result);
    };
    const timeout = setTimeout(() => finish({ success: false, status: 'error' }), 20000);

    try {
      runtime.sendMessage(message, async (response) => {
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
              const isFileExt = urlLower.match(/\.(zip|rar|7z|tar|gz|bz2|xz|zst|iso|img|cab|exe|msi|apk|dmg|pkg|deb|rpm|appx|msix|appimage|torrent|pdf|epub|mobi|docx?|xlsx?|pptx?|txt|csv|tsv|rtf|odt|ods|odp|mp4|mkv|webm|avi|mov|wmv|flv|ts|mp3|flac|wav|aac|ogg|opus|m4a|wma|json|xml|whl|jar)(\?.*)?$/i);
              const isTorrentScript = /(?:download|torrent|dl)\.php\?(?:id|torrent|tid|hash)=/i.test(urlLower) ||
                                      /(?:torrentbd\.net|1337x|nyaa\.si|yts\.mx|webtorrent)\/(?:download|torrents)/i.test(urlLower);
              const downloadAttrVal = el.getAttribute ? el.getAttribute('download') : null;
              const isDownloadAttr = el.hasAttribute && el.hasAttribute('download');
              const isGoogleExport = /(?:docs\.google\.com|googleusercontent\.com).*\/export(?:\?|\/|$)/i.test(urlLower);
              
              if ((isFileExt || isTorrentScript || isDownloadAttr || isGoogleExport) && urlLower.startsWith('http')) {
                e.preventDefault();
                e.stopPropagation();
                
                let basename = (downloadAttrVal && typeof downloadAttrVal === 'string') ? downloadAttrVal.trim() : '';
                if (!basename) {
                  try {
                    const parsedUrl = new URL(hrefStr);
                    for (const qKey of ['filename', 'file', 'name', 'fn', 'path', 'attachment']) {
                      const qVal = parsedUrl.searchParams.get(qKey);
                      if (qVal && qVal.includes('.')) {
                        basename = decodeURIComponent(qVal.split(/[\\/]/).pop().trim());
                        break;
                      }
                    }
                    if (!basename) {
                      basename = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '');
                    }
                  } catch(err) {}
                }

                if (isGoogleExport) {
                  let googleExt = null;
                  try {
                    const pu = new URL(hrefStr);
                    const fmt = (pu.searchParams.get('format') ||
                                 pu.searchParams.get('exportFormat') ||
                                 pu.searchParams.get('output') || '').toLowerCase().trim();
                    if (fmt) {
                      googleExt = fmt.startsWith('.') ? fmt : ('.' + fmt);
                    } else if (pu.pathname.endsWith('/pdf') || pu.pathname.includes('/export/pdf')) {
                      googleExt = '.pdf';
                    } else if (pu.pathname.endsWith('/xlsx') || pu.pathname.includes('/export/xlsx') || pu.hostname.includes('sheets')) {
                      googleExt = '.xlsx';
                    }
                  } catch (err) {}

                  if (googleExt && googleExt !== '.html') {
                    if (basename && (basename.endsWith('.html') || basename.endsWith('.htm'))) {
                      basename = basename.replace(/\.html?$/i, '');
                    }
                    if (!basename || basename === 'export') {
                      let titleClean = (document.title || '')
                        .replace(/\s*[\-\|–—·]\s*(?:Google\s+)?(?:Sheets|Docs|Slides|Drive|Forms|Spreadsheets|Documents|Presentations).*$/i, '')
                        .trim();
                      if (titleClean && titleClean !== 'Google Sheets' && titleClean !== 'Google Docs') {
                        basename = `${titleClean}${googleExt}`;
                      } else {
                        basename = `spreadsheet${googleExt}`;
                      }
                    } else if (!basename.toLowerCase().endsWith(googleExt)) {
                      basename = `${basename}${googleExt}`;
                    }
                  }
                }

                if (!basename || basename.endsWith('.php') || basename.endsWith('.asp')) {
                  const idMatch = hrefStr.match(/(?:id|torrent|tid)=([0-9a-zA-Z_-]+)/i);
                  if (idMatch) {
                    basename = 'torrent_' + idMatch[1] + '.torrent';
                  } else if (urlLower.includes('torrent')) {
                    basename = 'download.torrent';
                  }
                }
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
    if (typeof FormatRegistryEngine.drainStashedManifests === 'function') {
      FormatRegistryEngine.drainStashedManifests(() => {
        if (typeof document.querySelectorAll === 'function') document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
          const p = h.shadowRoot ? h.shadowRoot.querySelector('.popover.active') : null;
          if (p && p._smartdm_refresh) p._smartdm_refresh();
        });
      });
    }

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
        if (e.detail?.playerId) {
          try {
            const stashEl = document.querySelector ? document.querySelector?.(`smartdm-manifest-stash[data-smartdm-url="${CSS.escape(e.detail.url)}"]`) : null;
            if (stashEl && stashEl.textContent && typeof FormatRegistryEngine !== 'undefined' && FormatRegistryEngine.processCapturedManifest) {
              FormatRegistryEngine.processCapturedManifest(e.detail.url, stashEl.textContent, refresh, Number(stashEl.getAttribute('data-smartdm-height')) || 0);
            }
          } catch (_) {}
          refresh();
        }
        else if (e.detail?.text) {
          FormatRegistryEngine.processCapturedManifest(e.detail.url, e.detail.text, refresh, e.detail.height || 0);
        } else if (e.detail?.candidateUrl && runtime && runtime.sendMessage) {
          runtime.sendMessage({
            type: 'RESOLVE_M3U8_VARIANTS',
            url: e.detail.candidateUrl,
            referer: e.detail.referer || ((window.top !== window.self) ? window.location.href : (document.referrer || window.location.href)),
            origin: e.detail.origin || window.location.origin
          }, () => { if (runtime.lastError) {} });
          refresh();
        }
      });

      window.addEventListener('__smartdm_youtube_response__', (e) => {
        try {
          if (e.detail?.playerResponse && typeof FormatRegistryEngine !== 'undefined') {
            const vid = e.detail.videoId;
            const parsed = FormatRegistryEngine.parseYouTubePlayerResponse?.(e.detail.playerResponse, vid);
            if (parsed && Array.isArray(parsed.formats) && parsed.formats.length > 0) {
              const key = FormatRegistryEngine.youTubeCacheKey?.(`https://www.youtube.com/watch?v=${vid}`);
              if (key) {
                const existing = FormatRegistryEngine.mediaFormatCache[key];
                const hasHd = FormatRegistryEngine.hasHighResFormats ? FormatRegistryEngine.hasHighResFormats(parsed.formats) : false;
                if (!existing || existing.status !== 'done' || !FormatRegistryEngine.hasHighResFormats?.(existing.data?.formats)) {
                  FormatRegistryEngine.mediaFormatCache[key] = {
                    youtube: true,
                    status: hasHd ? 'done' : 'provisional',
                    data: parsed,
                    expiresAt: Date.now() + (hasHd ? 120000 : 30000),
                    callbacks: existing?.callbacks || []
                  };
                }
              }
            }
          }
        } catch (_) {}
      });

      window.addEventListener('__smartdm_stream_changed__', () => {
        if (typeof FormatRegistryEngine !== 'undefined') {
          const preservedYt = {};
          for (const [k, v] of Object.entries(FormatRegistryEngine.mediaFormatCache || {})) {
            if (v?.youtube) preservedYt[k] = v;
          }
          FormatRegistryEngine.mediaFormatCache = preservedYt;
        }
        document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host').forEach(h => {
          const p = h.shadowRoot ? h.shadowRoot.querySelector('.popover.active') : null;
          if (p && p._smartdm_refresh) p._smartdm_refresh();
        });
      });
    }

    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'SMARTDM_MEDIA_DETECTED') {
          if (typeof FormatRegistryEngine !== 'undefined') {
            const preservedYt = {};
            for (const [k, v] of Object.entries(FormatRegistryEngine.mediaFormatCache || {})) {
              if (v?.youtube) preservedYt[k] = v;
            }
            FormatRegistryEngine.mediaFormatCache = preservedYt;
          }
          const activeP = (typeof document.querySelector === 'function') ? document.querySelector?.('.smartdm-player-host, .smartdm-thumb-host')?.shadowRoot?.querySelector('.popover.active') : null;
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

    function broadcastPageTitleToBackground() {
      try {
        if (window.top === window.self && typeof SmartDmUtils !== 'undefined') {
          const extractedTitle = SmartDmUtils.extractWatchPageTitle();
          if (extractedTitle && !SmartDmUtils.isGenericTitle(extractedTitle)) {
            runtime.sendMessage({
              type: 'UPDATE_TAB_TITLE',
              title: extractedTitle,
              url: window.location.href
            }, () => { if (runtime.lastError) {} });
          }
        }
      } catch (_) {}
    }

    if (window.top === window.self) {
      initGlobalClickInterceptor();
      broadcastPageTitleToBackground();
      window.addEventListener('popstate', broadcastPageTitleToBackground, { passive: true });
      window.addEventListener('hashchange', broadcastPageTitleToBackground, { passive: true });
    }
    if (typeof MediaWatcher !== 'undefined' && typeof MediaWatcher.init === 'function') {
      MediaWatcher.init(dispatchDownload, dispatchBatchDownload);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlayCoordinator);
  } else {
    initOverlayCoordinator();
  }
})();
