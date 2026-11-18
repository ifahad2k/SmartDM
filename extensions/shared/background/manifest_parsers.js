function inheritQueryTokens(targetUrl, sourceUrl) {
  if (!targetUrl || !sourceUrl || !sourceUrl.includes('?')) return targetUrl;
  try {
    const targetParsed = new URL(targetUrl);
    const sourceParsed = new URL(sourceUrl);
    if (!targetParsed.search) {
      targetParsed.search = sourceParsed.search;
      return targetParsed.href;
    }
    for (const [k, v] of sourceParsed.searchParams.entries()) {
      if (!targetParsed.searchParams.has(k)) {
        targetParsed.searchParams.set(k, v);
      }
    }
    return targetParsed.href;
  } catch (e) {
    return targetUrl;
  }
}

function parseM3u8Formats(m3u8Text, baseUrl) {
  const lines = m3u8Text.split('\n');
  const formats = [];
  const audioGroups = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(line)) {
      const uriMatch = line.match(/URI="([^"]+)"/i);
      if (uriMatch) {
        let audioUrl = uriMatch[1];
        if (!audioUrl.startsWith('http')) {
          try {
            const resolved = new URL(audioUrl, baseUrl);
            audioUrl = resolved.href;
          } catch (e) {}
        }
        audioUrl = inheritQueryTokens(audioUrl, baseUrl);
        const groupMatch = line.match(/GROUP-ID="([^"]+)"/i);
        if (groupMatch && (/DEFAULT=YES/i.test(line) || !audioGroups.has(groupMatch[1]))) {
          audioGroups.set(groupMatch[1], audioUrl);
        }
      }
    }
  }

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
      const audioMatch = line.match(/AUDIO="([^"]+)"/i);
      if (audioMatch) currentInfo.audioGroup = audioMatch[1];
    } else if (line && !line.startsWith('#') && currentInfo) {
      let streamUrl = line;
      if (!streamUrl.startsWith('http')) {
        try {
          const resolved = new URL(streamUrl, baseUrl);
          streamUrl = resolved.href;
        } catch (e) {}
      }
      streamUrl = inheritQueryTokens(streamUrl, baseUrl);

      let height = 0;
      if (currentInfo.resolution) {
        const parts = currentInfo.resolution.split('x');
        if (parts.length === 2) height = normalizeVideoResolution(parts[0], parts[1]);
      }
      if (height === 0) {
        height = extractResolutionNumber(streamUrl, currentInfo.name || '');
      }
      if (height === 0 && currentInfo.bandwidth > 0) {
        const bw = currentInfo.bandwidth;
        if (bw >= 3800000) height = 1080;
        else if (bw >= 1800000) height = 720;
        else if (bw >= 900000) height = 480;
        else if (bw >= 450000) height = 360;
        else height = 240;
      }

      let label = getResolutionLabel(height, 'MP4');
      if (!label || label.startsWith('Video Stream')) {
        label = currentInfo.name || (height > 0 ? `${height}p HD (MP4)` : 'Video (MP4)');
      }

      let badge = height > 0 ? `${height}p` : 'Stream';
      if (currentInfo.bandwidth && height <= 0) {
        const kbps = Math.round(currentInfo.bandwidth / 1000);
        badge = kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
      }

      const audioUrl = audioGroups.get(currentInfo.audioGroup) || null;

      formats.push({
        formatId: height > 0 ? `m3u8_${height}p` : `m3u8_stream_${formats.length}`,
        title: label,
        resolution: label,
        ext: 'mp4',
        badge: badge,
        url: streamUrl,
        directUrl: streamUrl,
        audioUrl: audioUrl,
        height: height,
        bandwidth: currentInfo.bandwidth || 0,
        isAudioOnly: false
      });
      currentInfo = null;
    }
  }

  formats.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));

  // Deduplicate by height keeping highest bandwidth variant
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

function extractDashManifestFromText(text, targetVideoId = null) {
  if (!text) return null;
  const markers = ['"dash_manifest"', '"video_dash_manifest"'];
  for (const marker of markers) {
    let idx = 0;
    while ((idx = text.indexOf(marker, idx)) !== -1) {
      if (targetVideoId) {
        const proxStart = Math.max(0, idx - 10000);
        const proxEnd = Math.min(text.length, idx + 10000);
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
}

function parseMpdFormats(mpdText, baseUrl) {
  const formats = [];
  try {
    if (!mpdText || typeof mpdText !== 'string') return [];

    // Check DRM / ContentProtection - if present, return empty (encrypted)
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
      const isVideo = setAttrs.includes('video') || setAttrs.includes('mimetype="video') || setAttrs.includes("mimetype='video");
      const isAudio = setAttrs.includes('audio') || setAttrs.includes('mimetype="audio') || setAttrs.includes("mimetype='audio");

      const repMatches = [...setBody.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)];
      repMatches.forEach(rMatch => {
        const repAttrs = rMatch[1];
        const repBody = rMatch[2];

        const wMatch = repAttrs.match(/\bwidth=["'](\d+)["']/i);
        const hMatch = repAttrs.match(/\bheight=["'](\d+)["']/i);
        const bwMatch = repAttrs.match(/\bbandwidth=["'](\d+)["']/i);

        const width = wMatch ? parseInt(wMatch[1], 10) : 0;
        const height = hMatch ? parseInt(hMatch[1], 10) : 0;
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

        let mediaUrl = '';
        const urlMatch = repBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i) || setBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i);
        if (urlMatch) {
          mediaUrl = urlMatch[1].trim().replace(/&amp;/g, '&');
          if (!mediaUrl.startsWith('http') && baseUrl) {
            try { mediaUrl = new URL(mediaUrl, baseUrl).href; } catch(e) {}
          }
        }

        if (mediaUrl && mediaUrl.startsWith('http')) {
          mediaUrl = sanitizeStreamUrl(mediaUrl);
          if (isVideo) {
            const effH = normalizeVideoResolution(width, height) || ((width > 0 && height > 0) ? Math.min(width, height) : (height || width));
            videoReps.push({ effectiveHeight: effH, width, height, bandwidth, url: mediaUrl });
          } else if (isAudio) {
            if (!audioUrl || bandwidth > audioBw) {
              audioUrl = mediaUrl;
              audioBw = bandwidth;
            }
          }
        }
      });
    });

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

      const kbps = Math.round(v.bandwidth / 1000);
      const badge = estSize >= 1048576 ? formatSize(estSize) : (kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps');

      formats.push({
        formatId: 'fb_' + v.effectiveHeight + 'p',
        resolution: label,
        title: label,
        badge: badge,
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
        title: 'Audio (MP3 / High Quality)',
        badge: 'Audio Only',
        url: audioUrl,
        videoUrl: null,
        audioUrl: audioUrl,
        height: -1,
        ext: 'mp3',
        isAudioOnly: true,
        fileSize: 0
      });
    }
  } catch(e) {
    console.warn('parseMpdFormats error:', e);
  }
  return formats;
}

// Universal cache of authentic browser request headers for stream URLs and domains
