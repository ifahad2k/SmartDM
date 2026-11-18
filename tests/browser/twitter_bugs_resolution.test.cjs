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

for (const browser of ['chrome', 'firefox']) {
  function createTestContext(hostname = 'x.com') {
    const fakeWindow = {
      location: {
        hostname: hostname,
        href: `https://${hostname}/user/status/1234567890`,
        pathname: '/user/status/1234567890',
        origin: `https://${hostname}`
      },
      innerWidth: 1200,
      innerHeight: 800
    };
    const fakeDocument = {
      title: 'User on X: "Awesome space telescope discovery" / X',
      documentElement: {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createTextNode: (txt) => ({ textContent: txt, nodeType: 3 })
    };
    const ctx = vm.createContext({
      window: fakeWindow,
      document: fakeDocument,
      Node: { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 },
      URL,
      setTimeout,
      clearTimeout
    });

    for (const [file, name] of [
      ['utils.js', 'SmartDmUtils'],
      ['visual_mount.js', 'VisualMountDetector'],
      ['format_engine.js', 'FormatRegistryEngine'],
      ['overlay_ui.js', 'OverlayUiRenderer']
    ]) {
      const code = fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8');
      vm.runInContext(code + `\nthis.${name} = ${name};`, ctx);
    }
    const watcherCode = fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8');
    vm.runInContext(watcherCode + '\nthis.MediaWatcher = MediaWatcher;', ctx);

    return ctx;
  }

  // --- Title & Text Extraction Tests ---
  test(`${browser}: SmartDmUtils.sanitizeCleanTitle strips X.com and Twitter affixes properly`, () => {
    const ctx = createTestContext('x.com');
    const utils = ctx.SmartDmUtils;

    assert.equal(
      utils.sanitizeCleanTitle('Elon Musk on X: "Starship Flight 5 booster catch" / X'),
      'Starship Flight 5 booster catch'
    );
    assert.equal(
      utils.sanitizeCleanTitle('NASA on Twitter: "New views of Jupiter\'s Great Red Spot"'),
      "New views of Jupiter's Great Red Spot"
    );
    assert.equal(
      utils.sanitizeCleanTitle('Interesting AI demo / X'),
      'Interesting AI demo'
    );
    assert.equal(
      utils.sanitizeCleanTitle('Cool footage - Twitter'),
      'Cool footage'
    );
    // Preserves legitimate titles containing 'X'
    assert.equal(
      utils.sanitizeCleanTitle('Documentary on Generation X'),
      'Documentary on Generation X'
    );
  });

  test(`${browser}: SmartDmUtils.isGenericTitle detects X.com and Twitter generic page titles`, () => {
    const ctx = createTestContext('x.com');
    const utils = ctx.SmartDmUtils;

    assert.equal(utils.isGenericTitle('Home / X'), true);
    assert.equal(utils.isGenericTitle('home _ x'), true);
    assert.equal(utils.isGenericTitle('Twitter Video'), true);
    assert.equal(utils.isGenericTitle('twitter_video'), true);
    assert.equal(utils.isGenericTitle('Notifications / X'), true);
    assert.equal(utils.isGenericTitle('Explore / X'), true);
    assert.equal(utils.isGenericTitle('Bookmarks / X'), true);
    assert.equal(utils.isGenericTitle('SpaceX Starship launch'), false);
  });

  test(`${browser}: VisualMountDetector extracts tweet text with emojis and strips trailing t.co links`, () => {
    const ctx = createTestContext('x.com');
    const vmd = ctx.VisualMountDetector;

    const emojiImg = {
      tagName: 'IMG',
      getAttribute: (k) => (k === 'alt' ? '🚀' : null),
      parentNode: null
    };
    const tCoLink = {
      tagName: 'A',
      href: 'https://t.co/abc123xyz',
      getAttribute: (k) => (k === 'href' ? 'https://t.co/abc123xyz' : null),
      textContent: 'https://t.co/abc123xyz',
      remove() { this.removed = true; }
    };
    const tweetTextEl = {
      textContent: 'Launching the rocket 🚀 https://t.co/abc123xyz',
      querySelectorAll: (sel) => (sel === 'a' ? [tCoLink] : sel === 'img[alt]' ? [emojiImg] : []),
      cloneNode() {
        const clonedImg = { ...emojiImg };
        const clonedLink = { ...tCoLink };
        const clone = {
          textContent: 'Launching the rocket 🚀',
          querySelectorAll: (sel) => (sel === 'a' ? [clonedLink] : sel === 'img[alt]' ? [clonedImg] : [])
        };
        clonedImg.parentNode = {
          replaceChild: (newChild, oldChild) => {
            clone.textContent = 'Launching the rocket ' + newChild.textContent + ' ';
          }
        };
        return clone;
      }
    };
    const tweetCard = {
      querySelector: (sel) => (sel === '[data-testid="tweetText"]' ? tweetTextEl : null)
    };
    const mediaEl = {
      closest: (sel) => (sel.includes('tweet') ? tweetCard : null)
    };

    const title = vmd.extractTwitterMediaTitle(mediaEl, tweetCard);
    assert.match(title, /Launching the rocket/);
    assert.ok(!title.includes('t.co'));
  });

  test(`${browser}: VisualMountDetector extracts author and tweet status ID for video-only tweets`, () => {
    const ctx = createTestContext('x.com');
    const vmd = ctx.VisualMountDetector;

    const tweetCard = {
      querySelector: (sel) => {
        if (sel === '[data-testid="tweetText"]') return null;
        if (sel === '[data-testid="User-Name"]') {
          return {
            querySelector: (s) => (s === 'a[role="link"] span' ? { textContent: 'SpaceX' } : null)
          };
        }
        if (sel === 'a[href*="/status/"]') {
          return {
            getAttribute: () => '/SpaceX/status/185000000000',
            href: 'https://x.com/SpaceX/status/185000000000'
          };
        }
        return null;
      }
    };
    const mediaEl = {
      closest: () => tweetCard
    };

    const title = vmd.extractTwitterMediaTitle(mediaEl, tweetCard);
    assert.equal(title, 'SpaceX - Tweet 185000000000');
  });

  // --- Problem 1: Unmuted / played with sound on X.com does not drop stream ---
  test(`${browser}: Problem 1 Fix - Video played with sound (audioExpected=true) on X.com is verified without dropping`, () => {
    const ctx = createTestContext('x.com');
    const engine = ctx.FormatRegistryEngine;

    // Simulate X.com video playing with sound:
    // audioExpected is true (separate-audio="1"), but binding.audio is null (HLS multiplexed or master manifest)
    const attrs = {
      'data-smartdm-bound-src': 'blob:https://x.com/abc-uuid',
      'data-smartdm-video-url': 'https://video.twimg.com/ext_tw_video/987654321/pu/vid/avc1/720x1280/stream.mp4',
      'data-smartdm-separate-audio': '1'
    };
    const tweetCard = {
      querySelector: (sel) => (sel === '[data-testid="tweetText"]' ? {
        textContent: 'Flight test countdown and liftoff',
        querySelectorAll: () => [],
        cloneNode() { return { textContent: 'Flight test countdown and liftoff', querySelectorAll: () => [] }; }
      } : null)
    };
    const mediaEl = {
      currentSrc: 'blob:https://x.com/abc-uuid',
      videoWidth: 720,
      videoHeight: 1280,
      getAttribute: (k) => attrs[k] || null,
      closest: (sel) => (sel.includes('tweet') || sel.includes('videoPlayer') ? tweetCard : null)
    };

    const media = [
      {
        url: 'https://video.twimg.com/ext_tw_video/987654321/pu/vid/avc1/720x1280/stream.mp4',
        height: 1280
      }
    ];

    const formats = engine.selectedSocialFormats(mediaEl, media);
    assert.ok(formats.length > 0, 'Formats must not be empty when audioExpected=true on x.com');
    assert.equal(formats[0].url, 'https://video.twimg.com/ext_tw_video/987654321/pu/vid/avc1/720x1280/stream.mp4');
    assert.equal(formats[0].title, 'Flight test countdown and liftoff');
  });

  test(`${browser}: Problem 1 Fix - Poster extraction matches sibling video thumb when poster attribute is absent`, () => {
    const ctx = createTestContext('x.com');
    const engine = ctx.FormatRegistryEngine;

    // Video has no poster attribute, but container has sibling img with ext_tw_video_thumb/12345
    const thumbImg = {
      src: 'https://pbs.twimg.com/ext_tw_video_thumb/123456789/pu/img/preview.jpg',
      getAttribute: () => 'https://pbs.twimg.com/ext_tw_video_thumb/123456789/pu/img/preview.jpg'
    };
    const container = {
      querySelector: (sel) => (sel.includes('video_thumb') ? thumbImg : null)
    };
    const mediaEl = {
      currentSrc: 'blob:https://x.com/stream-blob',
      videoWidth: 1080,
      videoHeight: 1920,
      getAttribute: () => null,
      poster: '',
      closest: (sel) => (sel.includes('videoPlayer') ? container : null),
      parentElement: container
    };

    const media = [
      {
        url: 'https://video.twimg.com/ext_tw_video/123456789/pu/pl/master.m3u8',
        contentType: 'application/x-mpegurl',
        height: 1080
      }
    ];

    const formats = engine.selectedSocialFormats(mediaEl, media);
    assert.ok(formats.length > 0, 'Should match master m3u8 via asset ID from thumbnail image');
    assert.equal(formats[0].url, 'https://video.twimg.com/ext_tw_video/123456789/pu/pl/master.m3u8');
  });

  // --- Watcher Feed Clip Detection ---
  test(`${browser}: MediaWatcher does not treat muted auto-looping feed videos on X.com as thumbnails`, () => {
    const ctx = createTestContext('x.com');
    const watcher = ctx.MediaWatcher;

    const tweetCard = {
      querySelector: () => null
    };
    const mediaEl = {
      muted: true,
      loop: true,
      duration: 15,
      offsetWidth: 400,
      offsetHeight: 300,
      getBoundingClientRect: () => ({ width: 400, height: 300 }),
      hasAttribute: (a) => a === 'muted' || a === 'loop',
      closest: (sel) => (sel.includes('videoPlayer') || sel.includes('tweet') ? tweetCard : null)
    };

    const isThumb = watcher.isThumbnailOrPreviewMedia(mediaEl);
    assert.equal(isThumb, false, 'Twitter feed videos must not be treated as thumbnails');
  });

  // --- Problem 2: HLS master manifest audio parsing in background.js and FormatRegistryEngine ---
  test(`${browser}: Problem 2 Fix - parseM3u8Formats extracts #EXT-X-MEDIA:TYPE=AUDIO and populates audioUrl`, () => {
    const fakeChrome = {
      runtime: {
        id: 'mock-ext-id',
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        sendMessage: () => {}
      },
      webRequest: {
        onBeforeRequest: { addListener: () => {} },
        onSendHeaders: { addListener: () => {} },
        onHeadersReceived: { addListener: () => {} },
        onCompleted: { addListener: () => {} },
        onErrorOccurred: { addListener: () => {} }
      },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        onActivated: { addListener: () => {} },
        query: (q, cb) => cb && cb([])
      },
      storage: {
        local: {
          get: (k, cb) => cb && cb({}),
          set: (k, cb) => cb && cb()
        }
      },
      action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {}
      }
    };

    const bgCode = fs.readFileSync(`extensions/${browser}/background.js`, 'utf8');
    const bgCtx = vm.createContext({
      chrome: fakeChrome,
      browser: fakeChrome,
      URL,
      console,
      setTimeout,
      clearTimeout
    });
    vm.runInContext(bgCode, bgCtx);

    const masterM3u8 = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio",DEFAULT=YES,AUTOSELECT=YES,URI="audio/128k/prog_index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2176000,AVERAGE-BANDWIDTH=2000000,RESOLUTION=720x1280,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"
vid/720x1280/prog_index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=832000,AVERAGE-BANDWIDTH=750000,RESOLUTION=480x854,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio"
vid/480x854/prog_index.m3u8`;

    const baseUrl = 'https://video.twimg.com/ext_tw_video/987654321/pu/pl/master.m3u8?tag=12';
    const formats = bgCtx.parseM3u8Formats(masterM3u8, baseUrl);

    assert.ok(formats.length >= 2, 'Should parse both video variants');
    assert.equal(formats[0].height, 720);
    assert.equal(formats[0].url, 'https://video.twimg.com/ext_tw_video/987654321/pu/pl/vid/720x1280/prog_index.m3u8?tag=12');
    assert.equal(formats[0].audioUrl, 'https://video.twimg.com/ext_tw_video/987654321/pu/pl/audio/128k/prog_index.m3u8?tag=12');

    assert.equal(formats[1].height, 480);
    assert.equal(formats[1].audioUrl, 'https://video.twimg.com/ext_tw_video/987654321/pu/pl/audio/128k/prog_index.m3u8?tag=12');

    // Also verify FormatRegistryEngine.parseM3u8Formats in format_engine.js
    const ctx = createTestContext('x.com');
    const feFormats = ctx.FormatRegistryEngine.parseM3u8Formats(masterM3u8, baseUrl);
    assert.ok(feFormats.length >= 2);
    assert.equal(feFormats[0].audioUrl, 'https://video.twimg.com/ext_tw_video/987654321/pu/pl/audio/128k/prog_index.m3u8?tag=12');
  });
}
