const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

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
  test(`${browser} manifest contains Bilibili permissions and content scripts`, () => {
    const manifestPath = path.resolve('extensions', browser, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const permissions = manifest.permissions || [];
    const hostPermissions = manifest.host_permissions || [];
    const allPerms = [...permissions, ...hostPermissions];

    assert.ok(allPerms.some(p => p.includes('bilibili.com')), `${browser} missing bilibili.com permissions`);
    assert.ok(allPerms.some(p => p.includes('bilibili.tv')), `${browser} missing bilibili.tv permissions`);

    const csMatches = manifest.content_scripts.flatMap(cs => cs.matches || []);
    assert.ok(csMatches.some(m => m.includes('bilibili.com')), `${browser} missing bilibili.com content script`);
    assert.ok(csMatches.some(m => m.includes('bilibili.tv')), `${browser} missing bilibili.tv content script`);
  });

  test(`${browser} SmartDmUtils handles Bilibili canonical URLs, cache keys, title sanitization, and generic check`, () => {
    const utilsSource = fs.readFileSync(path.resolve('extensions', browser, 'modules', 'utils.js'), 'utf8');
    const context = vm.createContext({
      URL,
      window: { location: { hostname: 'www.bilibili.tv', origin: 'https://www.bilibili.tv', pathname: '/en/play/2084676' } },
      document: { title: 'LINK CLICK II - Bilibili TV' }
    });
    vm.runInContext(`${utilsSource}\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const utils = context.SmartDmUtils;

    // Canonical URL tests
    const tvUrl = 'https://www.bilibili.tv/en/play/2084676?bstar_from=bstar-web.anime-tab.for-you.all';
    assert.equal(utils.getCanonicalUrl(tvUrl), 'https://www.bilibili.tv/en/play/2084676');

    const comUrl = 'https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.1007.0.0';
    assert.equal(utils.getCanonicalUrl(comUrl), 'https://www.bilibili.com/video/BV1xx411c7mD');

    // Cache key canonicalization (prevents query param cache key mismatch)
    const rawTvKey = utils.getMediaCacheKey(tvUrl, null);
    const canonicalTvKey = utils.getMediaCacheKey('https://www.bilibili.tv/en/play/2084676', null);
    assert.equal(rawTvKey, canonicalTvKey, 'Cache key must normalize URLs so query params do not cause format lookup misses');

    // Title sanitization tests
    assert.equal(utils.sanitizeCleanTitle('LINK CLICK II - Bilibili TV'), 'LINK CLICK II');
    assert.equal(utils.sanitizeCleanTitle('LINK CLICK II - Bilibili Global'), 'LINK CLICK II');
    assert.equal(utils.sanitizeCleanTitle('【时光代理人 第二季】第1集 - 哔哩哔哩_bilibili'), '【时光代理人 第二季】第1集');
    assert.equal(utils.sanitizeCleanTitle('【时光代理人 第二季】第1集_哔哩哔哩'), '【时光代理人 第二季】第1集');

    // Generic title checks
    assert.equal(utils.isGenericTitle('bilibili'), true);
    assert.equal(utils.isGenericTitle('bilibili tv'), true);
    assert.equal(utils.isGenericTitle('bilibili global'), true);
    assert.equal(utils.isGenericTitle('哔哩哔哩'), true);
    assert.equal(utils.isGenericTitle('哔哩哔哩动画'), true);
    assert.equal(utils.isGenericTitle('LINK CLICK II'), false);
  });

  test(`${browser} MediaWatcher identifies Bilibili video players vs sidebar previews and mounts banner`, () => {
    const attachedBanners = [];
    let createdHost = null;

    const makeHost = () => {
      const h = {
        style: {},
        addEventListener() {},
        attachShadow() {
          this.shadowRoot = {
            innerHTML: '',
            querySelector() { return { addEventListener() {} }; }
          };
          return this.shadowRoot;
        },
        getBoundingClientRect() { return { left: 800, right: 900, top: 100, bottom: 130, width: 100, height: 30 }; },
        remove() { this.removed = true; }
      };
      createdHost = h;
      return h;
    };

    const listeners = {};
    const mockPlayerContainer = {
      tagName: 'DIV',
      className: 'bstar-web-player',
      classList: {
        contains(c) { return c === 'bstar-web-player'; },
        add() {},
        remove() {}
      },
      querySelectorAll(sel) {
        if (sel.includes('video')) return [mockVideo];
        return [];
      },
      querySelector(sel) {
        if (sel.includes('video')) return mockVideo;
        return null;
      },
      getBoundingClientRect() {
        return { width: 1280, height: 720, top: 100, bottom: 820, left: 100, right: 1380 };
      },
      getAttribute(attr) { return this[attr] || null; },
      setAttribute(attr, val) { this[attr] = String(val); },
      addEventListener(type, fn) { listeners[type] = fn; },
      removeEventListener() {},
      appendChild(node) {
        attachedBanners.push(node);
      }
    };

    const mockVideo = {
      tagName: 'VIDEO',
      closest(sel) {
        if (sel.includes('.bstar-web-player') || sel.includes('bstar-web-player') || sel.includes('bpx-player')) {
          return mockPlayerContainer;
        }
        return null;
      },
      getBoundingClientRect() {
        return { width: 1280, height: 720, top: 100, bottom: 820, left: 100, right: 1380 };
      },
      getAttribute(attr) { return this[attr] || null; },
      setAttribute(attr, val) { this[attr] = String(val); },
      addEventListener() {},
      removeEventListener() {}
    };

    const mockSidebarCard = {
      tagName: 'DIV',
      className: 'bstar-video-card'
    };

    const mockSidebarVideo = {
      tagName: 'VIDEO',
      closest(sel) {
        if (sel.includes('bstar-video-card') || sel.includes('video-card') || sel.includes('recommend')) {
          return mockSidebarCard;
        }
        return null;
      },
      getBoundingClientRect() {
        return { width: 320, height: 180, top: 200, bottom: 380, left: 1400, right: 1720 };
      },
      getAttribute(attr) { return this[attr] || null; },
      setAttribute(attr, val) { this[attr] = String(val); }
    };

    const body = {
      appendChild(node) {
        node.parentNode = this;
        attachedBanners.push(node);
      }
    };

    const document = {
      body,
      createElement(tag) {
        return makeHost();
      },
      querySelectorAll(selector) {
        if (selector.includes('video')) {
          return mockVideo.getAttribute('data-smartdm-player-attached') ? [] : [mockVideo];
        }
        if (selector.includes('.bstar-web-player') || selector.includes('bstar-web-player')) {
          return mockPlayerContainer.getAttribute('data-smartdm-player-attached') ? [] : [mockPlayerContainer];
        }
        return [];
      },
      querySelector(selector) {
        if (selector.includes('.media-info__title') || selector.includes('.bstar-meta__title')) {
          return { textContent: 'LINK CLICK II' };
        }
        return null;
      }
    };

    const context = vm.createContext({
      URL,
      document,
      window: {
        innerWidth: 1920,
        innerHeight: 1080,
        top: {},
        self: {},
        location: {
          hostname: 'www.bilibili.tv',
          origin: 'https://www.bilibili.tv',
          pathname: '/en/play/2084676',
          href: 'https://www.bilibili.tv/en/play/2084676?bstar_from=bstar-web.anime-tab.for-you.all'
        },
        getComputedStyle() { return { position: 'relative' }; }
      },
      OverlayUiRenderer: {
        getStyles() { return ''; },
        renderFormatDropdown() {}
      },
      SmartDmUtils: {
        isGenericTitle(t) { return !t || t === 'bilibili' || t === 'bilibili tv'; },
        extractWatchPageTitle() { return 'LINK CLICK II'; },
        getCanonicalUrl(u) { return u.split('?')[0]; }
      },
      FormatRegistryEngine: {
        fetchMediaFormats() {}
      },
      setTimeout,
      clearTimeout
    });
    context.window.top = context.window;
    context.window.self = context.window;

    const source = fs.readFileSync(path.resolve('extensions', browser, 'modules', 'watcher.js'), 'utf8');
    vm.runInContext(`${source}\nthis.MediaWatcher = MediaWatcher;`, context);
    const watcher = context.MediaWatcher;

    // 1. isThumbnailOrPreviewMedia should return false for Bilibili main player video inside bstar-web-player
    const isPreview = watcher.isThumbnailOrPreviewMedia(mockVideo);
    assert.equal(isPreview, false, 'Bilibili main player video must NOT be treated as thumbnail or preview');

    // 2. isThumbnailOrPreviewMedia should return true for sidebar recommendation preview video
    const isSidebarPreview = watcher.isThumbnailOrPreviewMedia(mockSidebarVideo);
    assert.equal(isSidebarPreview, true, 'Sidebar recommendation video must be treated as a preview');

    // 3. scanPlayers detects video / bstar-web-player and attaches banner
    watcher.scanPlayers();
    assert.equal(mockVideo.getAttribute(watcher.ATTR_PLAYER_ATTACHED), 'true');
    assert.equal(mockPlayerContainer.getAttribute(watcher.ATTR_PLAYER_ATTACHED), 'true');
    assert.ok(attachedBanners.length > 0 || createdHost !== null, 'Player banner must be mounted on Bilibili player');
    assert.equal(createdHost.parentNode, body);
  });

  test(`${browser} FormatRegistryEngine parses Bilibili DASH, Global playurl, and in-page manifests`, () => {
    const engineSource = fs.readFileSync(path.resolve('extensions', browser, 'modules', 'format_engine.js'), 'utf8');
    const mockScripts = [];
    const context = vm.createContext({
      URL,
      document: {
        getElementById(id) {
          if (id === '__playinfo__') return { textContent: '{"code":0,"data":{"dash":{"video":[{"id":80,"baseUrl":"https://bili.com/video80.m4s","height":1080}],"audio":[{"id":30280,"baseUrl":"https://bili.com/audio.m4s"}]}}}' };
          return null;
        },
        getElementsByTagName(tag) {
          if (tag === 'script') return mockScripts;
          return [];
        }
      },
      window: {
        location: {
          hostname: 'www.bilibili.tv',
          origin: 'https://www.bilibili.tv',
          href: 'https://www.bilibili.tv/en/play/2084676'
        }
      },
      SmartDmUtils: {
        sanitizeCleanTitle(t) { return t || 'LINK CLICK II'; },
        sanitizeStreamUrl(u) { return u; },
        getResolutionLabel(h, ext) { return `${h}p (${ext})`; },
        normalizeVideoResolution(w, h) { return h || 720; },
        formatBytes(b) { return `${(b / 1024 / 1024).toFixed(1)} MB`; },
        extractResolutionNumber(str) {
          const m = String(str).match(/(\d{3,4})[pP]/);
          return m ? parseInt(m[1], 10) : 0;
        }
      }
    });
    vm.runInContext(`${engineSource}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, context);
    const engine = context.FormatRegistryEngine;

    // 1. In-page manifest extraction
    const inPageText = engine.extractInPageBilibiliManifest();
    assert.ok(inPageText && inPageText.includes('"dash"'), 'Must extract in-page Bilibili manifest');

    // 2. Bilibili Global playurl JSON with desc_words resolution resolution
    const biliGlobalJson = JSON.stringify({
      code: 0,
      data: {
        playurl: {
          video_resource: [
            {
              stream_info: { desc_words: '1080P Full HD' },
              codecs: 'avc1.640028',
              url: 'https://upos-hz-mirrorakam.akamaized.net/video_1080p.m4s',
              bandwidth: 4000000,
              size: 50000000
            },
            {
              stream_info: { desc_words: '720P HD' },
              codecs: 'avc1.64001f',
              url: 'https://upos-hz-mirrorakam.akamaized.net/video_720p.m4s',
              bandwidth: 2000000,
              size: 25000000
            }
          ],
          audio_resource: [
            {
              stream_info: { desc_words: 'High Quality Audio' },
              codecs: 'mp4a.40.2',
              url: 'https://upos-hz-mirrorakam.akamaized.net/audio_hq.m4s',
              bandwidth: 192000,
              size: 5000000
            }
          ]
        }
      }
    });

    const parsedGlobal = engine.parseBilibiliFormats(biliGlobalJson, 'https://api.bilibili.tv/playurl', 'LINK CLICK II');
    assert.ok(parsedGlobal && parsedGlobal.length >= 2, 'Should parse at least 2 video formats from Bilibili Global');
    assert.equal(parsedGlobal[0].height, 1080);
    assert.equal(parsedGlobal[0].ext, 'mp4');
    assert.ok(parsedGlobal[0].resolution.includes('1080p') || parsedGlobal[0].resolution.includes('1080P'));
    assert.ok(parsedGlobal[0].audioStream, 'Video format must have paired audioStream');
    assert.equal(parsedGlobal[0].audioStream.audioUrl, 'https://upos-hz-mirrorakam.akamaized.net/audio_hq.m4s');
    // Ensure referer and origin are normalized to web page, NOT API endpoint
    assert.ok(parsedGlobal[0].referer.startsWith('https://www.bilibili.tv/'));
    assert.equal(parsedGlobal[0].origin, 'https://www.bilibili.tv');

    // 3. Bilibili Standard DASH JSON
    const biliStandardDashJson = JSON.stringify({
      code: 0,
      data: {
        dash: {
          duration: 1400,
          video: [
            {
              id: 80,
              baseUrl: 'https://xy123x.bilivideo.com/video_1080.m4s',
              bandwidth: 3500000,
              codecs: 'avc1.640028',
              width: 1920,
              height: 1080
            },
            {
              id: 64,
              baseUrl: 'https://xy123x.bilivideo.com/video_720.m4s',
              bandwidth: 1800000,
              codecs: 'avc1.64001f',
              width: 1280,
              height: 720
            }
          ],
          audio: [
            {
              id: 30280,
              baseUrl: 'https://xy123x.bilivideo.com/audio_192k.m4s',
              bandwidth: 192000,
              codecs: 'mp4a.40.2'
            }
          ]
        }
      }
    });

    const parsedStandard = engine.parseBilibiliFormats(biliStandardDashJson, 'https://api.bilibili.com/x/player/playurl', 'LINK CLICK II');
    assert.ok(parsedStandard && parsedStandard.length >= 2, 'Should parse at least 2 video formats from Bilibili Standard DASH');
    assert.equal(parsedStandard[0].height, 1080);
    assert.ok(parsedStandard[0].audioStream, 'DASH video format must have paired audioStream');
    assert.equal(parsedStandard[0].audioStream.audioUrl, 'https://xy123x.bilivideo.com/audio_192k.m4s');
    assert.ok(parsedStandard[0].referer.startsWith('https://www.bilibili.tv/'));
    assert.equal(parsedStandard[0].origin, 'https://www.bilibili.tv');
  });

  test(`${browser} VisualMountDetector validates Bilibili thumbnail cards and watch links`, () => {
    const visualSource = fs.readFileSync(path.resolve('extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const context = vm.createContext({
      window: { location: { hostname: 'www.bilibili.tv' } },
      document: {}
    });
    vm.runInContext(`${visualSource}\nthis.VisualMountDetector = VisualMountDetector;`, context);
    const detector = context.VisualMountDetector;

    const mockCard = {
      tagName: 'DIV',
      classList: { contains(c) { return c === 'bstar-video-card'; } },
      getAttribute(attr) { return null; },
      querySelector(sel) {
        if (sel.includes('duration')) return { textContent: '24:15' };
        return null;
      },
      querySelectorAll() { return []; }
    };

    const validLink = { href: 'https://www.bilibili.tv/en/play/2084676', getAttribute() { return null; } };
    const invalidLink = { href: 'https://www.bilibili.tv/en/user/12345', getAttribute() { return null; } };

    assert.equal(detector.isLegitimateThumbnailCard(mockCard, validLink), true, 'Bilibili video play link must be legitimate');
    assert.equal(detector.isLegitimateThumbnailCard(mockCard, invalidLink), false, 'Bilibili user link must NOT be accepted as video card');
  });
}
