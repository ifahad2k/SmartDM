const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser} Anime subframe player detection, banner mounting, and episode title extraction`, () => {
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
    const fullscreenDiv = {
      contains(node) { return node.parentNode === this; },
      appendChild(node) { node.parentNode = this; },
      removeChild(node) { node.parentNode = null; node.removed = true; }
    };

    const documentMock = {
      body,
      fullscreenElement: null,
      createElement(tag) { return tag === 'button' ? { addEventListener() {} } : makeHost(); },
      querySelectorAll() { return []; },
      addEventListener(event, handler) { docListeners[event] = handler; },
      removeEventListener(event, handler) { if (docListeners[event] === handler) delete docListeners[event]; }
    };

    const windowMock = {
      innerWidth: 960,
      innerHeight: 540,
      location: {
        hostname: 'megaplay.buzz',
        pathname: '/stream/s-2/185497/sub',
        href: 'https://megaplay.buzz/stream/s-2/185497/sub',
        origin: 'https://megaplay.buzz'
      },
      top: {}, // window.top !== window.self -> Embed iframe!
      self: null,
      getComputedStyle() { return { position: 'static' }; }
    };
    windowMock.self = { notTop: true }; // Ensure window.top !== window.self

    // Load Utils
    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');
    const formatSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'format_engine.js'), 'utf8');

    let lastSentMessage = null;
    const runtimeMock = {
      sendMessage(msg, callback) {
        lastSentMessage = msg;
        if (msg.type === 'GET_DETECTED_MEDIA') {
          if (typeof callback === 'function') {
            callback({
              success: true,
              tabTitle: 'Watch Black Clover Season 2 Episode 2 English Sub/Dub online Free on Aniwave',
              media: [
                {
                  url: 'https://megaplay.buzz/stream/ep2.m3u8',
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

    vm.runInContext(`${utilsSource}\nthis.SmartDmUtils = SmartDmUtils;`, context);
    vm.runInContext(`${formatSource}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, context);
    vm.runInContext(`${watcherSource}\nthis.MediaWatcher = MediaWatcher;`, context);

    const watcher = context.MediaWatcher;
    const formatEngine = context.FormatRegistryEngine;
    const utils = context.SmartDmUtils;

    // 1. Title Sanitization Check for Anime Sites
    const rawAniwaveTitle = 'Watch Black Clover Season 2 Episode 2 English Sub/Dub online Free on Aniwave';
    const cleanedTitle = utils.sanitizeCleanTitle(rawAniwaveTitle);
    assert.equal(cleanedTitle, 'Black Clover Season 2 Episode 2');

    const rawHiAnimeTitle = 'The Cold Sato-san is Only Sweet to Me Episode 5 English Subbed at HiAnime';
    const cleanedHiAnime = utils.sanitizeCleanTitle(rawHiAnimeTitle);
    assert.equal(cleanedHiAnime, 'The Cold Sato-san is Only Sweet to Me Episode 5');

    // 2. Subframe Video Identification
    // Unrendered video: w=300, h=150, readyState=0 -> returns 'unrendered'
    const unrenderedVideo = {
      tagName: 'VIDEO',
      readyState: 0,
      closest() { return null; },
      getBoundingClientRect() { return { width: 300, height: 150, top: 0, bottom: 150, left: 0, right: 300 }; },
      getAttribute() { return null; },
      setAttribute() {},
      addEventListener() {}
    };
    assert.equal(watcher.isThumbnailOrPreviewMedia(unrenderedVideo), 'unrendered');

    // Rendered video in embed iframe: w=800, h=450, readyState=4 -> returns false (main player)
    const animePlayerVideo = {
      tagName: 'VIDEO',
      readyState: 4,
      videoWidth: 1920,
      videoHeight: 1080,
      closest() { return null; },
      getBoundingClientRect() { return { width: 800, height: 450, top: 20, bottom: 470, left: 80, right: 880 }; },
      getAttribute() { return null; },
      setAttribute(attr, val) { this[attr] = val; },
      addEventListener() {},
      removeEventListener() {}
    };
    assert.equal(watcher.isThumbnailOrPreviewMedia(animePlayerVideo), false);

    // 3. Attach Player Banner in Embed Iframe
    watcher.attachPlayerBanner(animePlayerVideo);
    assert.equal(animePlayerVideo[watcher.ATTR_PLAYER_ATTACHED], 'true');
    assert.equal(createdHost.parentNode, body);
    assert.equal(createdHost.style.position, 'fixed');
    assert.equal(createdHost.style.left, '735px'); // 880 - 145 = 735

    // 4. Fullscreen Transition Handling
    assert.equal(typeof docListeners.fullscreenchange, 'function');
    // Enter fullscreen
    documentMock.fullscreenElement = fullscreenDiv;
    docListeners.fullscreenchange();
    assert.equal(createdHost.parentNode, fullscreenDiv);

    // Exit fullscreen
    documentMock.fullscreenElement = null;
    docListeners.fullscreenchange();
    assert.equal(createdHost.parentNode, body);

    // Unbound tab-wide streams must not be attached to a blob player's title.
    formatEngine.buildFallbackFormats('https://megaplay.buzz/stream/s-2/185497/sub', animePlayerVideo, (res) => {
      assert.equal(res.success, false);
    });

    // 6. Cleanup Player cleans up host and fullscreen listeners
    watcher.cleanupPlayer(animePlayerVideo);
    assert.equal(createdHost.removed, true);
    assert.equal(docListeners.fullscreenchange, undefined);

    // 7. Coordinator Ad/Tracker Subframe Filtering
    const overlaySource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'smartdm_overlay.js'), 'utf8');

    // Case A: Ad / Tracker Hostname -> Aborts coordinator, MediaWatcher.init is NOT called
    let watcherInitCalled = false;
    const adContext = vm.createContext({
      document: { readyState: 'complete', addEventListener() {} },
      window: {
        top: {},
        self: { notTop: true },
        innerWidth: 800,
        innerHeight: 450,
        location: { hostname: 'googleads.g.doubleclick.net', pathname: '/pagead/adview' }
      },
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      MediaWatcher: { init() { watcherInitCalled = true; } },
      FormatRegistryEngine: { drainStashedManifests() {} }
    });
    vm.runInContext(overlaySource, adContext);
    assert.equal(watcherInitCalled, false, 'Ad hostname frame must be blocked from running coordinator');

    // Case B: Tiny ad dimensions -> Aborts coordinator, MediaWatcher.init is NOT called
    let tinyInitCalled = false;
    const tinyContext = vm.createContext({
      document: { readyState: 'complete', addEventListener() {} },
      window: {
        top: {},
        self: { notTop: true },
        innerWidth: 300,
        innerHeight: 50, // Tiny ad banner height < 120
        location: { hostname: 'unknown-embed-site.com', pathname: '/banner' }
      },
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      MediaWatcher: { init() { tinyInitCalled = true; } },
      FormatRegistryEngine: { drainStashedManifests() {} }
    });
    vm.runInContext(overlaySource, tinyContext);
    assert.equal(tinyInitCalled, false, 'Tiny ad frame must be blocked from running coordinator');

    // Case C: Legitimate Anime Video Player Iframe -> Runs coordinator, MediaWatcher.init IS called
    let animeInitCalled = false;
    const animeContext = vm.createContext({
      document: { readyState: 'complete', addEventListener() {}, querySelectorAll() { return []; } },
      window: {
        top: {},
        self: { notTop: true },
        innerWidth: 960,
        innerHeight: 540,
        location: { hostname: 'megaplay.buzz', pathname: '/stream/s-2/185497/sub' },
        addEventListener() {}
      },
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      MediaWatcher: { init() { animeInitCalled = true; } },
      FormatRegistryEngine: { drainStashedManifests() {} }
    });
    vm.runInContext(overlaySource, animeContext);
    assert.equal(animeInitCalled, true, 'Legitimate anime player iframe must run coordinator and initialize MediaWatcher');
  });
}
