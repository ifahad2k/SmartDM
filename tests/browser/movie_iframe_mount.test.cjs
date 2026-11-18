const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: Movie streaming site (67movies.st) iframe player detection and overlay mounting`, () => {
    const listeners = {};
    const classes = new Set();
    const popover = {
      style: {},
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); }
      }
    };
    const button = { addEventListener(name, callback) { listeners[name] = callback; } };
    const content = { innerHTML: '', children: [], appendChild(node) { this.children.push(node); } };
    let createdHost = null;

    const makeHost = () => {
      const h = {
        style: {},
        addEventListener() {},
        attachShadow() {
          this.shadowRoot = {
            innerHTML: '',
            querySelector(selector) {
              return { '.thumb-btn': button, '.banner-btn': button, '.popover': popover, '.popover-content': content }[selector];
            }
          };
          return this.shadowRoot;
        },
        getBoundingClientRect() { return { left: 800, right: 900, top: 100, bottom: 130, width: 100, height: 30 }; },
        remove() { this.removed = true; }
      };
      createdHost = h;
      return h;
    };

    const docListeners = {};
    const body = {
      appendChild(node) { node.parentNode = this; },
      removeChild(node) { node.parentNode = null; node.removed = true; },
      contains(node) { return node.parentNode === this; }
    };

    const documentMock = {
      body,
      fullscreenElement: null,
      createElement(tag) { return tag === 'button' ? { addEventListener() {} } : makeHost(); },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener(event, handler) { docListeners[event] = handler; },
      removeEventListener(event, handler) { if (docListeners[event] === handler) delete docListeners[event]; }
    };

    const windowMock = {
      innerWidth: 1280,
      innerHeight: 720,
      location: {
        hostname: '67movies.st',
        pathname: '/watch/movie/1283515',
        href: 'https://67movies.st/watch/movie/1283515',
        origin: 'https://67movies.st'
      },
      top: null,
      self: null,
      getComputedStyle() { return { position: 'static' }; }
    };
    windowMock.top = windowMock;
    windowMock.self = windowMock; // Top window!

    // Load modules
    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');
    const formatSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'format_engine.js'), 'utf8');

    let lastSentMessage = null;
    const runtimeMock = {
      sendMessage(msg, callback) {
        lastSentMessage = msg;
        if (msg.type === 'GET_TAB_MEDIA' || msg.type === 'GET_DETECTED_MEDIA') {
          if (typeof callback === 'function') {
            callback({
              success: true,
              tabTitle: '67movies - Gladiator II (2024) - Server VidQueen 4K',
              media: [
                {
                  url: 'https://vidqueen.cloud/source/stream.m3u8',
                  height: 1080,
                  contentLength: 0,
                  timestamp: Date.now()
                }
              ]
            });
          }
        }
      }
    };

    const context = vm.createContext({
      document: documentMock,
      window: windowMock,
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      VisualMountDetector: {
        findFacebookReelCard() { return null; },
        findFacebookPostCard() { return null; },
        extractFacebookMediaTitle() { return null; }
      },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(utilsSource + '\nthis.SmartDmUtils = SmartDmUtils;', context);
    vm.runInContext(visualMountSource + '\nthis.VisualMountDetector = VisualMountDetector;', context);
    vm.runInContext(formatSource + '\nthis.FormatRegistryEngine = FormatRegistryEngine;', context);
    vm.runInContext(watcherSource + '\nthis.MediaWatcher = MediaWatcher;', context);

    const watcher = context.MediaWatcher;
    const formatEngine = context.FormatRegistryEngine;
    const utils = context.SmartDmUtils;

    // 1. Verify title sanitization strips 67movies and Server VidQueen 4K
    const rawTitle = '67movies - Gladiator II (2024) - Server VidQueen 4K';
    const cleanTitle = utils.sanitizeCleanTitle(rawTitle);
    assert.equal(cleanTitle, 'Gladiator II (2024)');
    assert.equal(utils.isGenericTitle('Server VidQueen 4K'), true);
    assert.equal(utils.isGenericTitle('VidQueen'), true);
    assert.equal(utils.isGenericTitle(cleanTitle), false);

    // 2. Verify isPlayerIframe detection
    const adIframe = {
      tagName: 'IFRAME',
      src: 'https://googleads.g.doubleclick.net/pagead/ads',
      clientWidth: 300,
      clientHeight: 250,
      getAttribute() { return null; }
    };
    assert.equal(watcher.isPlayerIframe(adIframe), false);

    const vidQueenIframe = {
      tagName: 'IFRAME',
      id: 'iframe-player',
      src: 'https://vidqueen.cloud/embed/movie/1283515',
      clientWidth: 854,
      clientHeight: 480,
      getAttribute(k) { return k === 'src' ? this.src : (k === 'allowfullscreen' ? '' : null); },
      setAttribute(k, v) { this[k] = v; },
      getBoundingClientRect() { return { width: 854, height: 480, top: 50, bottom: 530, left: 100, right: 954 }; },
      addEventListener() {},
      removeEventListener() {}
    };
    assert.equal(watcher.isPlayerIframe(vidQueenIframe), true);

    // 3. Mount overlay banner on the iframe player
    watcher.attachPlayerBanner(vidQueenIframe);
    assert.equal(vidQueenIframe[watcher.ATTR_PLAYER_ATTACHED], 'true');
    assert.equal(createdHost.parentNode, body);
    assert.equal(createdHost.style.position, 'fixed');
    assert.equal(createdHost.style.left, '809px'); // 954 - 145 = 809

    // 4. Test format resolution queries GET_TAB_MEDIA and returns iframe streams
    let formatsResult = null;
    formatEngine.buildFallbackFormats('https://67movies.st/watch/movie/1283515', vidQueenIframe, (res) => {
      formatsResult = res;
    });

    assert.ok(formatsResult !== null);
    assert.equal(formatsResult.success, true);
    assert.equal(formatsResult.title, 'Gladiator II (2024)');
    assert.equal(formatsResult.formats.length, 1);
    assert.equal(formatsResult.formats[0].url, 'https://vidqueen.cloud/source/stream.m3u8');
    assert.equal(formatsResult.formats[0].height, 1080);
    assert.equal(lastSentMessage.type, 'GET_TAB_MEDIA');
  });

  test(`${browser}: Background resolves single-rendition HLS playlist without EXT-X-STREAM-INF`, async () => {
    // Load background script in an isolated VM context
    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');

    const messageListeners = [];
    const webRequestHeadersListeners = [];

    const chromeMock = {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { messageListeners.push(fn); } },
        lastError: null
      },
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} },
        sendMessage() {}
      },
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      action: { onClicked: { addListener() {} } },
      downloads: { onCreated: { addListener() {} } },
      webRequest: {
        onSendHeaders: { addListener() {} },
        onHeadersReceived: { addListener(fn) { webRequestHeadersListeners.push(fn); } }
      }
    };

    const singleRenditionManifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.000,
segment0.ts
#EXTINF:10.000,
segment1.ts
#EXT-X-ENDLIST`;

    const bgContext = vm.createContext({
      chrome: chromeMock,
      browser: chromeMock,
      fetch: async (url) => {
        return {
          ok: true,
          body: {
            getReader() {
              let sent = false;
              return {
                async read() {
                  if (sent) return { done: true, value: undefined };
                  sent = true;
                  return { done: false, value: Buffer.from(singleRenditionManifest) };
                },
                cancel() {},
                releaseLock() {}
              };
            }
          },
          text: async () => singleRenditionManifest
        };
      },
      navigator: { userAgent: 'Mozilla/5.0 TestBrowser' },
      URL,
      setTimeout,
      clearTimeout,
      AbortController,
      TextDecoder,
      Buffer,
      console
    });

    vm.runInContext(bgSource, bgContext);

    // Find the message handler
    assert.ok(messageListeners.length > 0);
    const msgHandler = messageListeners[0];

    // 1. Send RESOLVE_M3U8_VARIANTS with a single-rendition m3u8
    const sender = { tab: { id: 101, title: '67movies - Gladiator II (2024) - Server VidQueen 4K', url: 'https://67movies.st/watch/movie/1283515' } };

    let resolveReply = null;
    const handled = msgHandler({
      type: 'RESOLVE_M3U8_VARIANTS',
      url: 'https://vidqueen.cloud/source/stream-1080p.m3u8'
    }, sender, (response) => {
      resolveReply = response;
    });

    assert.equal(handled, true); // Async handler

    // Wait for the async resolution
    await new Promise(r => setTimeout(r, 50));

    assert.ok(resolveReply !== null);
    assert.equal(resolveReply.success, true);
    assert.equal(resolveReply.status, 'ok');
    assert.equal(resolveReply.formats.length, 1);
    assert.equal(resolveReply.formats[0].height, 1080);
    assert.equal(resolveReply.formats[0].title, 'Gladiator II (2024)');

    // 2. Query GET_TAB_MEDIA for tab 101: it should return the registered format immediately
    let getMediaReply = null;
    msgHandler({
      type: 'GET_TAB_MEDIA',
      tabId: 101
    }, sender, (response) => {
      getMediaReply = response;
    });

    assert.ok(getMediaReply !== null);
    assert.equal(getMediaReply.success, true);
    assert.ok(getMediaReply.media.length >= 1);
    assert.equal(getMediaReply.media[0].height, 1080);
    assert.equal(getMediaReply.media[0].customTitle, 'Gladiator II (2024)');
  });

  test(`${browser}: Sniffer and background intercept extensionless / proxy HLS streams with text/plain`, async () => {
    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');

    const messageListeners = [];
    const webRequestHeadersListeners = [];

    const chromeMock = {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { messageListeners.push(fn); } },
        lastError: null
      },
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} },
        sendMessage() {}
      },
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      action: { onClicked: { addListener() {} } },
      downloads: { onCreated: { addListener() {} } },
      webRequest: {
        onSendHeaders: { addListener() {} },
        onHeadersReceived: { addListener(fn) { webRequestHeadersListeners.push(fn); } }
      }
    };

    const masterManifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720
720p/index.m3u8`;

    const bgContext = vm.createContext({
      chrome: chromeMock,
      browser: chromeMock,
      fetch: async (url) => {
        return {
          ok: true,
          body: {
            getReader() {
              let sent = false;
              return {
                async read() {
                  if (sent) return { done: true, value: undefined };
                  sent = true;
                  return { done: false, value: Buffer.from(masterManifest) };
                },
                cancel() {},
                releaseLock() {}
              };
            }
          },
          text: async () => masterManifest
        };
      },
      navigator: { userAgent: 'Mozilla/5.0 TestBrowser' },
      URL,
      setTimeout,
      clearTimeout,
      AbortController,
      TextDecoder,
      Buffer,
      console
    });

    vm.runInContext(bgSource, bgContext);

    assert.ok(webRequestHeadersListeners.length > 0);
    const headersHandler = webRequestHeadersListeners[0];
    const msgHandler = messageListeners[0];

    // Trigger onHeadersReceived with disguised proxy stream endpoint
    headersHandler({
      tabId: 202,
      url: 'https://vidqueen.cloud/prorcp/play/source?token=abc123xyz',
      responseHeaders: [
        { name: 'content-type', value: 'text/plain; charset=utf-8' },
        { name: 'content-length', value: String(masterManifest.length) }
      ]
    });

    // Wait for background async probe
    await new Promise(r => setTimeout(r, 60));

    // Verify GET_TAB_MEDIA now contains both 1080p and 720p variants
    let tabMediaRes = null;
    msgHandler({
      type: 'GET_TAB_MEDIA',
      tabId: 202
    }, { tab: { id: 202 } }, (res) => {
      tabMediaRes = res;
    });

    assert.ok(tabMediaRes !== null);
    assert.equal(tabMediaRes.success, true);
    assert.equal(tabMediaRes.media.length, 2);
    assert.ok(tabMediaRes.media.some(m => m.height === 1080));
    assert.ok(tabMediaRes.media.some(m => m.height === 720));
  });

  test(`${browser}: Sniffer parses JSON API response with escaped slashes, relative URLs, and XHR responseType json`, () => {
    const snifferSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'sniffer.js'), 'utf8');

    const dispatchedEvents = [];
    const elements = [];
    const head = {
      appendChild(el) { elements.push(el); },
      querySelector(sel) { return null; },
      querySelectorAll() { return []; }
    };

    const docMock = {
      head,
      documentElement: head,
      body: head,
      createElement(tag) {
        const attrs = {};
        return {
          tagName: tag.toUpperCase(),
          setAttribute(k, v) { attrs[k] = v; },
          getAttribute(k) { return attrs[k] || null; },
          textContent: '',
          style: {},
          remove() {}
        };
      },
      querySelectorAll() { return elements; }
    };

    let xhrLoadListener = null;
    class MockXMLHttpRequest {
      constructor() {
        this.responseType = '';
        this.response = null;
        this.responseText = '';
        this._headers = {};
      }
      open(m, u) { this._url = u; }
      send() {}
      setRequestHeader(k, v) { this._headers[k.toLowerCase()] = v; }
      getResponseHeader(k) { return this._headers[k.toLowerCase()] || null; }
      addEventListener(evt, fn) {
        if (evt === 'load') xhrLoadListener = fn;
      }
    }

    const winMock = {
      top: null,
      self: null,
      location: { href: 'https://vidqueen.cloud/embed/movie/1283515', hostname: 'vidqueen.cloud' },
      dispatchEvent(evt) { dispatchedEvents.push(evt); },
      CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
      TextDecoder,
      XMLHttpRequest: MockXMLHttpRequest,
      setTimeout,
      clearTimeout
    };
    winMock.top = winMock;
    winMock.self = winMock;

    const ctx = vm.createContext({
      window: winMock,
      document: docMock,
      XMLHttpRequest: MockXMLHttpRequest,
      CustomEvent: winMock.CustomEvent,
      TextDecoder,
      URL,
      setTimeout,
      clearTimeout,
      CSS: { escape(s) { return s; } }
    });

    vm.runInContext(snifferSource, ctx);

    // Test XHR interception with responseType: 'json' and relative source URL
    const xhr = new ctx.XMLHttpRequest();
    xhr.open('GET', 'https://vidqueen.cloud/ajax/getSources?id=1283515');
    xhr.responseURL = 'https://vidqueen.cloud/ajax/getSources?id=1283515';
    xhr.responseType = 'json';
    xhr.response = {
      sources: [
        { file: '/source/stream.m3u8', type: 'hls' }
      ]
    };
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send();

    // Trigger load listener
    assert.ok(typeof xhrLoadListener === 'function');
    xhrLoadListener.call(xhr);

    // Verify candidate event was dispatched with resolved absolute URL
    const resolvedUrl = 'https://vidqueen.cloud/source/stream.m3u8';
    const foundEvent = dispatchedEvents.find(e => e.detail?.candidateUrl === resolvedUrl || e.detail?.url === resolvedUrl);
    assert.ok(foundEvent, 'Must dispatch event for intercepted JSON stream URL');

    assert.equal(foundEvent.detail.text, null);
    assert.equal(elements.find(el => el.getAttribute('data-smartdm-url') === resolvedUrl), undefined);

    // The same address can later return a real playlist and must still be captured.
    xhr.open('GET', resolvedUrl);
    xhr.responseURL = resolvedUrl;
    xhr.responseType = 'text';
    xhr.responseText = '#EXTM3U\n#EXTINF:6,\npart.ts\n#EXT-X-ENDLIST';
    xhr.setRequestHeader('content-type', 'application/vnd.apple.mpegurl');
    xhrLoadListener.call(xhr);
    const stash = elements.find(el => el.getAttribute('data-smartdm-url') === resolvedUrl);
    assert.equal(stash?.textContent, xhr.responseText);
  });

  test(`${browser}: Plural/tokenized stream paths (/sources/, /streams/, /chunklist.m3u8, /vod/) matched across regexes`, () => {
    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');
    const snifferSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'sniffer.js'), 'utf8');

    // Extract MANIFEST_PATH_REGEX from sniffer
    const snifferMatch = snifferSource.match(/const MANIFEST_PATH_REGEX = (\/[^\n]+\/i);/);
    assert.ok(snifferMatch);
    const snifferRegex = eval(snifferMatch[1]);

    // Extract isManifestPath from background
    const bgMatch = bgSource.match(/const isManifestPath = (\/[^\n]+\/i)\.test/);
    assert.ok(bgMatch);
    const bgRegex = eval(bgMatch[1]);

    const testUrls = [
      'https://vidqueen.cloud/sources/stream-1080p',
      'https://vidsrc.to/streams/movie/master',
      'https://streamcloud.org/vod/hls/playlist',
      'https://superembed.tv/play/chunklist.m3u8',
      'https://autoembed.cc/playback/source',
      'https://embed.stream/api/streams/hls'
    ];

    for (const u of testUrls) {
      assert.ok(snifferRegex.test(u), `sniffer MANIFEST_PATH_REGEX must match ${u}`);
      assert.ok(bgRegex.test(u), `background isManifestPath regex must match ${u}`);
    }
  });

  test(`${browser}: RESOLVE_M3U8_VARIANTS selects newest stream from tab and falls back to direct MP4 video`, async () => {
    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');

    const messageListeners = [];
    const chromeMock = {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { messageListeners.push(fn); } },
        lastError: null
      },
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} },
        sendMessage() {}
      },
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      action: { onClicked: { addListener() {} } },
      downloads: { onCreated: { addListener() {} } },
      webRequest: {
        onSendHeaders: { addListener() {} },
        onHeadersReceived: { addListener() {} }
      }
    };

    const sampleManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nindex.m3u8`;

    const bgContext = vm.createContext({
      chrome: chromeMock,
      browser: chromeMock,
      fetch: async (url) => ({
        ok: true,
        body: {
          getReader() {
            let sent = false;
            return {
              async read() {
                if (sent) return { done: true, value: undefined };
                sent = true;
                return { done: false, value: Buffer.from(sampleManifest) };
              },
              cancel() {},
              releaseLock() {}
            };
          }
        },
        text: async () => sampleManifest
      }),
      navigator: { userAgent: 'Mozilla/5.0 TestBrowser' },
      URL,
      setTimeout,
      clearTimeout,
      AbortController,
      TextDecoder,
      Buffer,
      console
    });

    vm.runInContext(bgSource, bgContext);
    const msgHandler = messageListeners[0];

    // Case 1: Tab 303 has an old bumper stream and a newer movie stream
    msgHandler({
      type: 'REGISTER_M3U8_VARIANTS',
      masterUrl: 'https://adcdn.com/bumper/ad.m3u8',
      formats: [{ url: 'https://adcdn.com/bumper/ad.m3u8', height: 360, resolution: '360p', title: 'Ad' }]
    }, { tab: { id: 303, title: '67movies - Gladiator II (2024)' } }, () => {});

    msgHandler({
      type: 'REGISTER_M3U8_VARIANTS',
      masterUrl: 'https://vidqueen.cloud/source/movie-1080p.m3u8',
      formats: [{ url: 'https://vidqueen.cloud/source/movie-1080p.m3u8', height: 1080, resolution: '1080p', title: 'Gladiator II (2024)' }]
    }, { tab: { id: 303, title: '67movies - Gladiator II (2024)' } }, () => {});

    // Now resolve without url for tab 303: it should pick the newest stream (1080p)
    let resolveReply = null;
    msgHandler({
      type: 'RESOLVE_M3U8_VARIANTS'
    }, { tab: { id: 303, title: '67movies - Gladiator II (2024)' } }, (res) => {
      resolveReply = res;
    });

    await new Promise(r => setTimeout(r, 50));
    assert.ok(resolveReply !== null);
    assert.equal(resolveReply.success, true);
    assert.ok(resolveReply.formats.some(f => f.height === 1080), 'Must resolve the newest 1080p stream rather than the 360p ad bumper');
    assert.ok(resolveReply.formats.every(f => !f.manifestText), 'A master must never be attached as the body of a variant');

    // Case 2: Tab 304 has only a direct MP4 video
    let directReply = null;
    msgHandler({
      type: 'REGISTER_M3U8_VARIANTS',
      masterUrl: 'https://vidqueen.cloud/files/direct.mp4',
      formats: [{ url: 'https://vidqueen.cloud/files/direct.mp4', height: 1080, resolution: '1080p (MP4)', title: 'Direct Movie' }]
    }, { tab: { id: 304, title: 'Direct Movie' } }, () => {});

    msgHandler({
      type: 'RESOLVE_M3U8_VARIANTS'
    }, { tab: { id: 304, title: 'Direct Movie' } }, (res) => {
      directReply = res;
    });

    await new Promise(r => setTimeout(r, 50));
    assert.ok(directReply !== null);
    assert.equal(directReply.success, true);
    assert.ok(directReply.formats.length >= 1);
  });

  test(`${browser}: FormatRegistryEngine.fetchMediaFormats clears safety timer and delivers immediately on iframe player`, (t, done) => {
    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const formatSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'format_engine.js'), 'utf8');

    const iframeEl = {
      tagName: 'IFRAME',
      src: 'https://vidqueen.cloud/embed/movie/1283515',
      getAttribute(k) { return k === 'src' ? this.src : null; },
      querySelector() { return null; }
    };

    const runtimeMock = {
      sendMessage(msg, callback) {
        if (msg.type === 'GET_TAB_MEDIA' || msg.type === 'GET_DETECTED_MEDIA') {
          callback({
            success: true,
            tabTitle: 'Gladiator II (2024)',
            media: [
              {
                url: 'https://vidqueen.cloud/source/stream.m3u8',
                height: 1080,
                contentLength: 0,
                timestamp: Date.now()
              }
            ]
          });
        } else if (msg.type === 'RESOLVE_M3U8_VARIANTS') {
          callback({
            success: true,
            status: 'ok',
            title: 'Gladiator II (2024)',
            formats: [
              {
                formatId: 'hls_1080p',
                resolution: '1080p Full HD (MP4)',
                title: 'Gladiator II (2024)',
                badge: '1080p',
                url: 'https://vidqueen.cloud/source/stream.m3u8',
                height: 1080,
                ext: 'mp4'
              }
            ]
          });
        }
      }
    };

    const docMock = {
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };

    const ctx = vm.createContext({
      document: docMock,
      window: {
        location: { href: 'https://67movies.st/watch/movie/1283515', hostname: '67movies.st' },
        top: null,
        self: null
      },
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      URL,
      setTimeout,
      clearTimeout
    });
    ctx.window.top = ctx.window;
    ctx.window.self = ctx.window;

    vm.runInContext(utilsSource + '\nthis.SmartDmUtils = SmartDmUtils;', ctx);
    vm.runInContext(formatSource + '\nthis.FormatRegistryEngine = FormatRegistryEngine;', ctx);

    const startTime = Date.now();
    ctx.FormatRegistryEngine.fetchMediaFormats('https://67movies.st/watch/movie/1283515', iframeEl, (res) => {
      const elapsed = Date.now() - startTime;
      assert.ok(elapsed < 1000, `Must deliver formats immediately (<1000ms), took ${elapsed}ms`);
      assert.equal(res.success, true);
      assert.equal(res.formats.length, 1);
      assert.equal(res.formats[0].height, 1080);
      done();
    });
  });
}
