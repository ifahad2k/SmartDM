const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SHARED_FILES = [
  'background.js',
  'smartdm_overlay.js',
  'sniffer.js',
  'modules/format_engine.js',
  'modules/overlay_ui.js',
  'modules/utils.js',
  'modules/visual_mount.js',
  'modules/watcher.js'
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('100% SHA-256 byte parity between Chrome and Firefox shared files', () => {
  for (const relPath of SHARED_FILES) {
    const chromePath = path.resolve('extensions', 'chrome', relPath);
    const firefoxPath = path.resolve('extensions', 'firefox', relPath);
    assert.ok(fs.existsSync(chromePath), `Chrome file missing: ${relPath}`);
    assert.ok(fs.existsSync(firefoxPath), `Firefox file missing: ${relPath}`);
    const hashChrome = sha256(chromePath);
    const hashFirefox = sha256(firefoxPath);
    assert.equal(hashChrome, hashFirefox, `Hash mismatch in ${relPath}: Chrome=${hashChrome} Firefox=${hashFirefox}`);
  }
});

const samplePlayerResponse = {
  videoDetails: {
    videoId: 'abc12345XYZ',
    title: 'Instant YouTube Video Test',
    author: 'Test Channel',
    lengthSeconds: '300'
  },
  streamingData: {
    formats: [
      {
        itag: 22,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=22',
        mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        qualityLabel: '720p',
        quality: 'hd720',
        contentLength: '25000000',
        fps: 30
      }
    ],
    adaptiveFormats: [
      {
        itag: 137,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=137',
        mimeType: 'video/mp4; codecs="avc1.640028"',
        qualityLabel: '1080p',
        contentLength: '50000000',
        height: 1080,
        fps: 60,
        bitrate: 4500000
      },
      {
        itag: 136,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=136',
        mimeType: 'video/mp4; codecs="avc1.4d401f"',
        qualityLabel: '720p',
        contentLength: '20000000',
        height: 720,
        fps: 30,
        bitrate: 2500000
      },
      {
        itag: 135,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=135',
        mimeType: 'video/mp4; codecs="avc1.4d401e"',
        qualityLabel: '480p',
        contentLength: '12000000',
        height: 480,
        fps: 30,
        bitrate: 1200000
      },
      {
        itag: 134,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=134',
        mimeType: 'video/mp4; codecs="avc1.4d401e"',
        qualityLabel: '360p',
        contentLength: '8000000',
        height: 360,
        fps: 30,
        bitrate: 800000
      },
      {
        itag: 140,
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=140',
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        contentLength: '4000000',
        bitrate: 128000
      }
    ]
  }
};

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: Bug 1 - parseYouTubePlayerResponse parses 1080p, 720p, 480p, 360p, MP3, and HD Thumbnail`, () => {
    const c = vm.createContext({
      URL,
      document: {},
      window: { location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/watch?v=abc12345XYZ' } },
      SmartDmUtils: {
        extractResolutionNumber(str) {
          const m = String(str).match(/(\d+)p?/);
          return m ? parseInt(m[1], 10) : 0;
        }
      }
    });
    const code = fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8');
    vm.runInContext(`${code}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, c);
    const engine = c.FormatRegistryEngine;

    const result = engine.parseYouTubePlayerResponse(samplePlayerResponse, 'abc12345XYZ');
    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.title, 'Instant YouTube Video Test');

    const fmts = result.formats;
    assert.ok(fmts.length >= 6);

    // Verify 1080p adaptive format paired with default audio
    const f1080 = fmts.find(f => f.resolution.includes('1080p'));
    assert.ok(f1080, '1080p format found');
    assert.equal(f1080.height, 1080);
    assert.equal(f1080.audioUrl, samplePlayerResponse.streamingData.adaptiveFormats[4].url);
    assert.equal(f1080.fileSize, 50000000 + 4000000); // video + audio size

    // Verify 720p, 480p, 360p
    assert.ok(fmts.some(f => f.resolution.includes('720p')));
    assert.ok(fmts.some(f => f.resolution.includes('480p')));
    assert.ok(fmts.some(f => f.resolution.includes('360p')));

    // Verify MP3 format
    const fMp3 = fmts.find(f => f.formatId === 'bestaudio/best');
    assert.ok(fMp3, 'MP3 format found');
    assert.equal(fMp3.ext, 'mp3');
    assert.equal(fMp3.isAudioOnly, true);
    assert.equal(fMp3.url, samplePlayerResponse.streamingData.adaptiveFormats[4].url);

    // Verify HD thumbnail format
    const fThumb = fmts.find(f => f.formatId === 'thumbnail');
    assert.ok(fThumb, 'Thumbnail format found');
    assert.equal(fThumb.url, 'https://i.ytimg.com/vi/abc12345XYZ/maxresdefault.jpg');
  });

  test(`${browser}: Bug 1 - In-page playerResponse resolution is instant (<50ms) without network roundtrip`, () => {
    const c = vm.createContext({
      URL,
      setTimeout,
      clearTimeout,
      document: {
        querySelector() { return null; },
        querySelectorAll() { return []; }
      },
      window: {
        location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/watch?v=abc12345XYZ' },
        ytInitialPlayerResponse: samplePlayerResponse
      },
      SmartDmUtils: {
        extractResolutionNumber(str) {
          const m = String(str).match(/(\d+)p?/);
          return m ? parseInt(m[1], 10) : 0;
        }
      },
      chrome: {
        runtime: {
          sendMessage() {
            assert.fail('Should not send runtime message when in-page playerResponse exists!');
          }
        }
      }
    });
    const code = fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8');
    vm.runInContext(`${code}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, c);
    const engine = c.FormatRegistryEngine;

    // Instant formats extraction
    const instant = engine.getInstantYouTubeFormats('https://www.youtube.com/watch?v=abc12345XYZ');
    assert.ok(instant.length > 0, 'Instant formats resolved directly from in-page playerResponse');
    assert.ok(instant.some(f => f.resolution.includes('1080p')));

    // fetchYouTubeFormats also resolves instantly without sendMessage
    let delivered = null;
    engine.fetchYouTubeFormats('https://www.youtube.com/watch?v=abc12345XYZ', (res) => {
      delivered = res;
    });
    assert.ok(delivered);
    assert.equal(delivered.success, true);
    assert.equal(delivered.formats.length, instant.length);
  });

  test(`${browser}: Bug 2 - VisualMountDetector validates cards across all YouTube feed components`, () => {
    const c = vm.createContext({
      URL,
      document: {},
      window: { location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/' } }
    });
    const code = fs.readFileSync(`extensions/${browser}/modules/visual_mount.js`, 'utf8');
    vm.runInContext(`${code}\nthis.VisualMountDetector = VisualMountDetector;`, c);
    const vmd = c.VisualMountDetector;

    // Test card 1: standard ytd-rich-item-renderer with lazy image (w=0, h=0)
    const cardLazy = {
      tagName: 'YTD-RICH-ITEM-RENDERER',
      querySelector(selector) {
        if (selector.includes('a#thumbnail') || selector.includes('watch?v=')) {
          return { href: 'https://www.youtube.com/watch?v=lazy1234567', getAttribute() { return '/watch?v=lazy1234567'; } };
        }
        if (selector.includes('ytd-thumbnail')) {
          return { tagName: 'YTD-THUMBNAIL', style: {} };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute(name) { return name === 'href' ? null : null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(cardLazy), true, 'Lazy card without image dimension is legitimate');

    // Test card 2: ytd-grid-video-renderer
    const cardGrid = {
      tagName: 'YTD-GRID-VIDEO-RENDERER',
      querySelector(selector) {
        if (selector.includes('watch?v=')) {
          return { href: 'https://www.youtube.com/watch?v=grid1234567', getAttribute() { return '/watch?v=grid1234567'; } };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(cardGrid), true, 'ytd-grid-video-renderer is legitimate');

    // Test card 3: ytd-reel-item-renderer (YouTube Shorts)
    const cardShorts = {
      tagName: 'YTD-REEL-ITEM-RENDERER',
      querySelector(selector) {
        if (selector.includes('/shorts/')) {
          return { href: 'https://www.youtube.com/shorts/short123456', getAttribute() { return '/shorts/short123456'; } };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(cardShorts), true, 'ytd-reel-item-renderer is legitimate');

    // Test card with avatar link preceding video link
    const cardWithAvatar = {
      tagName: 'YTD-RICH-ITEM-RENDERER',
      querySelector(selector) {
        // If searching specifically for video links:
        if (selector.includes('watch?v=') || selector.includes('/shorts/')) {
          return { href: 'https://www.youtube.com/watch?v=video123456', getAttribute() { return '/watch?v=video123456'; } };
        }
        // Generic a[href] query would return avatar link:
        if (selector === 'a[href]') {
          return { href: 'https://www.youtube.com/@channelName', getAttribute() { return '/@channelName'; } };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(cardWithAvatar), true, 'Card with channel avatar link is not rejected');

    // Mount resolution finds ytd-thumbnail
    const mount = vmd.findVisualThumbnailMount(cardLazy);
    assert.ok(mount);
    assert.equal(mount.tagName, 'YTD-THUMBNAIL');
  });

  test(`${browser}: Bug 3 - YouTube Shorts thumbnail badge has elevated z-index and stops event propagation without swallowing child clicks`, () => {
    let hostListeners = [];
    let btnListeners = [];
    let popoverActive = false;
    const popover = {
      style: {},
      classList: {
        add(cls) { if (cls === 'active') popoverActive = true; },
        remove(cls) { if (cls === 'active') popoverActive = false; },
        contains(cls) { return cls === 'active' ? popoverActive : false; }
      }
    };
    const content = {
      innerHTML: '',
      appendChild() {},
      querySelector() { return null; }
    };
    const btn = {
      addEventListener(type, fn, opts) {
        btnListeners.push({ type, fn, opts });
      },
      style: {}
    };

    const createdHost = {
      style: {},
      isConnected: true,
      addEventListener(type, fn, opts) {
        hostListeners.push({ type, fn, opts });
      },
      attachShadow() {
        return {
          innerHTML: '',
          querySelector(sel) {
            if (sel === '.thumb-btn') return btn;
            if (sel === '.popover') return popover;
            if (sel === '.popover-content') return content;
            return null;
          }
        };
      },
      getBoundingClientRect() { return { left: 100, right: 300, top: 100, bottom: 400, width: 200, height: 300 }; }
    };

    const containerEl = {
      tagName: 'DIV',
      style: {},
      closest(sel) {
        if (sel.includes('ytd-reel-item-renderer')) return { tagName: 'YTD-REEL-ITEM-RENDERER' };
        return null;
      },
      appendChild(child) { child.parentNode = this; },
      querySelector() { return null; }
    };

    const c = vm.createContext({
      document: {
        createElement(tag) { return tag === 'div' ? createdHost : {}; },
        querySelectorAll() { return []; },
        body: { appendChild() {} }
      },
      window: {
        innerWidth: 1200,
        innerHeight: 800,
        location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/' },
        getComputedStyle() { return { position: 'static' }; }
      },
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: {
        getInstantYouTubeFormats() { return [{ formatId: '720p', resolution: '720p', height: 720, ext: 'mp4' }]; },
        fetchMediaFormats() {}
      },
      SmartDmUtils: {
        getCanonicalUrl(url) { return url; },
        isGenericTitle() { return false; }
      }
    });

    const code = fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8');
    vm.runInContext(`${code}\nthis.MediaWatcher = MediaWatcher;`, c);
    const watcher = c.MediaWatcher;

    watcher.attachThumbnailBadge(containerEl, 'https://www.youtube.com/shorts/testShort123', 'Shorts Title');

    // 1. Shorts badge gets maximum z-index (2147483647) to stay above YouTube overlay anchors
    assert.equal(createdHost.style.zIndex, '2147483647');
    assert.equal(createdHost.style.pointerEvents, 'auto');

    // 2. CRITICAL: Host must NOT register click with { capture: true } (which would swallow events before reaching btn)
    const hostClickListeners = hostListeners.filter(l => l.type === 'click');
    assert.ok(hostClickListeners.length > 0, 'Host has click listener to stop bubbling to YouTube anchor');
    const captureClick = hostClickListeners.find(l => l.opts === true || l.opts?.capture === true);
    assert.equal(captureClick, undefined, 'Host must NOT capture click events (would kill shadow DOM child clicks)');

    // 3. CRITICAL: Button click listener must be registered EXACTLY ONCE (not twice, which immediately toggles active and closes popover)
    const btnClicks = btnListeners.filter(l => l.type === 'click');
    assert.equal(btnClicks.length, 1, 'Button click listener must be registered exactly once');

    // 4. Test button click execution: popover must open and remain active
    let stopped = false, immediateStopped = false, prevented = false;
    const testEvt = {
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { immediateStopped = true; },
      preventDefault() { prevented = true; }
    };

    assert.equal(popoverActive, false, 'Popover initially inactive');
    btnClicks[0].fn(testEvt);
    assert.equal(prevented, true, 'Button prevents default navigation on YouTube Shorts anchor');
    assert.equal(stopped, true, 'Button stops propagation');
    assert.equal(popoverActive, true, 'Popover opened and stays active');
  });

  test(`${browser}: Bug 2 - Live stream URLs and yt-thumbnail-view-model are recognized without aspect-ratio drop`, () => {
    const c = vm.createContext({
      URL,
      document: {},
      window: { location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/' } }
    });
    const code = fs.readFileSync(`extensions/${browser}/modules/visual_mount.js`, 'utf8');
    vm.runInContext(`${code}\nthis.VisualMountDetector = VisualMountDetector;`, c);
    const vmd = c.VisualMountDetector;

    // Live stream card on YouTube home feed
    const cardLive = {
      tagName: 'YTD-RICH-ITEM-RENDERER',
      querySelector(selector) {
        if (selector.includes('watch?v=') || selector.includes('/live/')) {
          return { href: 'https://www.youtube.com/live/LiveStream123', getAttribute() { return '/live/LiveStream123'; } };
        }
        if (selector.includes('yt-thumbnail-view-model')) {
          return { tagName: 'YT-THUMBNAIL-VIEW-MODEL', style: {} };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(cardLive), true, 'YouTube Live stream card is recognized as legitimate');
    const mount = vmd.findVisualThumbnailMount(cardLive);
    assert.ok(mount, 'Mount found for YouTube Live card');
    assert.equal(mount.tagName, 'YT-THUMBNAIL-VIEW-MODEL');

    // Direct YT-THUMBNAIL-VIEW-MODEL card container
    const directModel = {
      tagName: 'YT-THUMBNAIL-VIEW-MODEL',
      querySelector(selector) {
        if (selector.includes('watch?v=')) {
          return { href: 'https://www.youtube.com/watch?v=model1234567', getAttribute() { return '/watch?v=model1234567'; } };
        }
        return null;
      },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { contains() { return false; } }
    };
    assert.equal(vmd.isLegitimateThumbnailCard(directModel), true, 'Direct YT-THUMBNAIL-VIEW-MODEL is legitimate');
    const directMount = vmd.findVisualThumbnailMount(directModel);
    assert.equal(directMount, directModel, 'Direct YT-THUMBNAIL-VIEW-MODEL returns self as mount');
  });

  test(`${browser}: Bug 1 - smartdm_overlay preserves YouTube format cache across stream detection`, () => {
    let streamChangedListener = null;
    let messageListener = null;

    const mockWindow = {
      addEventListener(type, fn) {
        if (type === '__smartdm_stream_changed__') streamChangedListener = fn;
      },
      location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/watch?v=testVid1234' }
    };

    const mockRuntime = {
      onMessage: {
        addListener(fn) { messageListener = fn; }
      },
      sendMessage() {},
      getURL(file) { return 'chrome-extension://id/' + file; }
    };

    const mockEngine = {
      drainStashedManifests() {},
      mediaFormatCache: {
        'https://www.youtube.com/watch?v=testVid1234': {
          youtube: true,
          status: 'done',
          data: { formats: [{ formatId: '1080p', resolution: '1080p' }] }
        },
        'https://example.com/other': {
          youtube: false,
          status: 'done',
          data: { formats: [] }
        }
      }
    };

    const c = vm.createContext({
      window: mockWindow,
      document: {
        documentElement: { hasAttribute() { return true; } },
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {}
      },
      chrome: { runtime: mockRuntime },
      FormatRegistryEngine: mockEngine,
      SmartDmUtils: { isGenericTitle() { return false; } },
      VisualMountDetector: {},
      OverlayUiRenderer: {},
      MediaWatcher: { init() {} }
    });

    const code = fs.readFileSync(`extensions/${browser}/smartdm_overlay.js`, 'utf8');
    vm.runInContext(code, c);

    // Trigger __smartdm_stream_changed__
    assert.ok(streamChangedListener, '__smartdm_stream_changed__ listener registered');
    streamChangedListener();
    assert.ok(mockEngine.mediaFormatCache['https://www.youtube.com/watch?v=testVid1234'], 'YouTube cache preserved on stream changed');
    assert.equal(mockEngine.mediaFormatCache['https://example.com/other'], undefined, 'Non-YouTube cache cleared on stream changed');

    // Trigger SMARTDM_MEDIA_DETECTED
    mockEngine.mediaFormatCache['https://example.com/other2'] = { youtube: false };
    assert.ok(messageListener, 'runtime.onMessage listener registered');
    messageListener({ type: 'SMARTDM_MEDIA_DETECTED' });
    assert.ok(mockEngine.mediaFormatCache['https://www.youtube.com/watch?v=testVid1234'], 'YouTube cache preserved on media detected');
    assert.equal(mockEngine.mediaFormatCache['https://example.com/other2'], undefined, 'Non-YouTube cache cleared on media detected');
  });

  test(`${browser}: YouTube 360p in-page provisional upgrade to 1080p via desktop query`, () => {
    let sentMessage = null;
    let messageCallback = null;

    const sample360Only = {
      videoDetails: { videoId: 'lowResVid12', title: 'Real YouTube 360p Video' },
      streamingData: {
        formats: [{
          itag: 18,
          url: 'https://rr1---sn-test.googlevideo.com/videoplayback?expire=9999999999&itag=18',
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          qualityLabel: '360p',
          contentLength: '8000000',
          height: 360
        }],
        adaptiveFormats: []
      }
    };

    const c = vm.createContext({
      URL,
      setTimeout,
      clearTimeout,
      document: {
        querySelector() { return null; },
        querySelectorAll() { return []; }
      },
      window: {
        location: { hostname: 'www.youtube.com', href: 'https://www.youtube.com/watch?v=lowResVid12' },
        ytInitialPlayerResponse: sample360Only
      },
      SmartDmUtils: {
        extractResolutionNumber(str) {
          const m = String(str).match(/(\d+)p?/);
          return m ? parseInt(m[1], 10) : 0;
        }
      },
      chrome: {
        runtime: {
          sendMessage(msg, cb) {
            sentMessage = msg;
            messageCallback = cb;
          }
        }
      }
    });

    const code = fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8');
    vm.runInContext(`${code}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, c);
    const engine = c.FormatRegistryEngine;

    // 1. getInstantYouTubeFormats returns 360p instantly, but marks cache provisional
    const instant = engine.getInstantYouTubeFormats('https://www.youtube.com/watch?v=lowResVid12');
    assert.ok(instant.length > 0);
    assert.equal(instant.some(f => f.resolution.includes('360p')), true);
    const cacheKey = engine.youTubeCacheKey('https://www.youtube.com/watch?v=lowResVid12');
    assert.equal(engine.mediaFormatCache[cacheKey].status, 'provisional');

    // 2. fetchYouTubeFormats delivers provisional 360p with pending=true, then sends GET_MEDIA_FORMATS
    const delivered = [];
    engine.fetchYouTubeFormats('https://www.youtube.com/watch?v=lowResVid12', (res, pending) => {
      delivered.push({ res, pending });
    });

    assert.equal(delivered.length, 1, 'Provisional 360p delivered immediately');
    assert.equal(delivered[0].pending, true, 'Marked pending = true');
    assert.ok(sentMessage, 'Sent GET_MEDIA_FORMATS to desktop/background');
    assert.equal(sentMessage.type, 'GET_MEDIA_FORMATS');

    // 3. Desktop app replies with 1080p, 720p ladder
    messageCallback({
      status: 'ok',
      success: true,
      title: 'Real YouTube 360p Video',
      formats: [
        { formatId: '137_mp4', resolution: '1080p', height: 1080, ext: 'mp4', directUrl: 'https://googlevideo.com/1080p', isAudioOnly: false },
        { formatId: '136_mp4', resolution: '720p', height: 720, ext: 'mp4', directUrl: 'https://googlevideo.com/720p', isAudioOnly: false },
        { formatId: '18_mp4', resolution: '360p', height: 360, ext: 'mp4', directUrl: 'https://googlevideo.com/360p', isAudioOnly: false }
      ]
    });

    assert.equal(delivered.length, 2, 'Final HD ladder delivered to callback');
    assert.equal(delivered[1].pending, false, 'Final delivery has pending = false');
    assert.ok(delivered[1].res.formats.some(f => f.resolution.includes('1080p')), '1080p present');
    assert.ok(delivered[1].res.formats.some(f => f.resolution.includes('720p')), '720p present');
    assert.equal(engine.mediaFormatCache[cacheKey].status, 'done');
  });

  test(`${browser}: Mismatched videoId player response is rejected`, () => {
    const c = vm.createContext({
      URL,
      SmartDmUtils: {}
    });
    const code = fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8');
    vm.runInContext(`${code}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, c);
    const engine = c.FormatRegistryEngine;

    const dataFromOtherVideo = {
      videoDetails: { videoId: 'videoAAA1111', title: 'Wrong Video' },
      streamingData: { formats: [{ itag: 18, url: 'https://googlevideo.com/test' }] }
    };

    const res = engine.parseYouTubePlayerResponse(dataFromOtherVideo, 'videoBBB2222');
    assert.equal(res, null, 'Mismatched videoId player response must return null');
  });
}

