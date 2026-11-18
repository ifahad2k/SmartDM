function getYouTubeCookiesHeader() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.getAll({ domain: 'youtube.com' }, (cookies) => {
        if (cookies && cookies.length > 0) {
          const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          resolve(cookieString);
        } else {
          resolve('');
        }
      });
    } else {
      resolve('');
    }
  });
}

function extractYtInitialPlayerResponse(text) {
  let searchStart = 0;
  while (true) {
    let idx = text.indexOf('ytInitialPlayerResponse', searchStart);
    if (idx < 0) break;
    searchStart = idx + 20;

    let firstBrace = text.indexOf('{', idx);
    if (firstBrace > idx && firstBrace < idx + 100) {
      let openCount = 0, lastBrace = -1, inString = false, escape = false;
      for (let i = firstBrace; i < text.length; i++) {
        let c = text.charAt(i);
        if (inString) {
          if (escape) escape = false;
          else if (c === '\\') escape = true;
          else if (c === '"') inString = false;
        } else {
          if (c === '"') inString = true;
          else if (c === '{') openCount++;
          else if (c === '}') {
            openCount--;
            if (openCount === 0) { lastBrace = i; break; }
          }
        }
      }
      if (lastBrace > firstBrace) {
        try {
          let parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          if (parsed && parsed.streamingData) return parsed;
        } catch(e) {}
      }
    }
  }
  return null;
}

function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.searchParams.has('v')) {
      const v = u.searchParams.get('v');
      if (v && v.length >= 5) return v;
    }
    if (u.pathname.includes('/shorts/')) {
      const segs = u.pathname.split('/shorts/')[1].split('/');
      if (segs[0] && segs[0].length >= 5) return segs[0];
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('?')[0].split('/')[0];
      if (id && id.length >= 5) return id;
    }
  } catch (e) {}
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^?&#/]+)/) || url.match(/youtu\.be\/([^?&#/]+)/);
  if (match && match[1] && match[1].length >= 5) return match[1];
  return null;
}

async function fetchYouTubeFormatsInServiceWorker(videoUrl) {
  try {
    if (!videoUrl) return null;
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) return null;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/1.56.21 (Linux; U; Android 11)'
    };

    const parseFormats = (data) => {
      if (data && data.streamingData) {
        const videoDetails = data.videoDetails || {};
        const title = videoDetails.title || 'YouTube Video';
        const streamingData = data.streamingData;
        const formats = [];

        let defaultAudioUrl = null;
        let defaultAudioSize = 0;
        const adaptive = streamingData.adaptiveFormats || [];
        adaptive.forEach(f => {
          if ((f.mimeType || '').includes('audio/') && f.url && f.url.startsWith('http')) {
            if (!defaultAudioUrl || f.itag === 140) {
              defaultAudioUrl = f.url;
              defaultAudioSize = parseInt(f.contentLength || 0, 10);
            }
          }
        });

        const combined = streamingData.formats || [];
        combined.forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            const height = f.height || (typeof extractResolutionNumber === 'function' ? extractResolutionNumber(f.qualityLabel || f.quality || '') : 360) || 360;
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
              url: f.url,
              directUrl: f.url,
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              assetId: `https://www.youtube.com/watch?v=${videoId}`
            });
          }
        });

        adaptive.forEach(f => {
          if (f.url && f.url.startsWith('http')) {
            const mime = (f.mimeType || '').toLowerCase();
            const isAudio = mime.includes('audio/');
            const isVideo = mime.includes('video/');
            const kbps = Math.round((f.bitrate || 0) / 1000);
            const videoSize = parseInt(f.contentLength || 0, 10);
            const totalSize = isVideo && defaultAudioSize > 0 ? videoSize + defaultAudioSize : videoSize;
            const height = isVideo ? (f.height || (typeof extractResolutionNumber === 'function' ? extractResolutionNumber(f.qualityLabel || '') : 0) || 0) : 0;
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
              url: f.url,
              directUrl: f.url,
              audioUrl: (!isAudio && defaultAudioUrl) ? defaultAudioUrl : null,
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              assetId: `https://www.youtube.com/watch?v=${videoId}`
            });
          }
        });

        if (formats.length > 0) {
          // Append MP3 option
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
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            assetId: `https://www.youtube.com/watch?v=${videoId}`
          });

          // Append HD Thumbnail option
          formats.push({
            formatId: 'thumbnail',
            resolution: 'Thumbnail (Cover Image / HD)',
            ext: 'jpg',
            formatNote: 'HD Cover Image',
            fileSize: 0,
            isAudioOnly: false,
            title: title,
            url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            directUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            assetId: `https://www.youtube.com/watch?v=${videoId}`
          });

          return { success: true, status: 'ok', title: title, formats: formats };
        }
      }
      return null;
    };

    // 1. Primary: ANDROID_VR client (returns direct streaming URLs for all 26 adaptive resolutions)
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          videoId: videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: {
              clientName: 'ANDROID_VR',
              clientVersion: '1.56.21',
              androidSdkVersion: 32
            }
          }
        })
      });
      const data = await res.json();
      const parsed = parseFormats(data);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('ANDROID_VR fetch failed:', e);
    }

  } catch (e) {
    console.warn('Service worker YouTube fetch error:', e);
  }
  return null;
}
