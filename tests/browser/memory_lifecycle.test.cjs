const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = (browser, file) => fs.readFileSync(`extensions/${browser}/${file}`, 'utf8');
const load = (context, text, name) => {
  vm.runInContext(text + `\nthis.Subject = ${name};`, context);
  return context.Subject;
};
function events(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, value) { for (const fn of [...(listeners.get(type) || [])]) fn(value); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); }
  });
}
function watcherFixture(browser) {
  const hosts = new Set(), observed = new Set();
  let mutation, sheets = 0;
  const body = {
    appendChild(host) { hosts.add(host); host.parentNode = body; },
    removeChild(host) { hosts.delete(host); host.parentNode = null; }
  };
  const document = events({
    body, querySelectorAll: () => [],
    createElement() {
      const host = events({style: {}, remove() { this.parentNode?.removeChild(this); }});
      host.attachShadow = () => {
        const popover = {classList: {contains: () => false}};
        host.shadowRoot = {adoptedStyleSheets: [], querySelector(selector) {
          return selector === '.banner-btn' ? events() : selector === '.popover' ? popover : {};
        }};
        return host.shadowRoot;
      };
      return host;
    }
  });
  const window = events({location: {hostname: 'player.invalid', href: 'https://player.invalid/e/1'}, innerWidth: 1200, innerHeight: 800});
  window.top = window.self = window;
  const context = vm.createContext({
    window, document, setTimeout, clearTimeout, setInterval, clearInterval,
    CSSStyleSheet: class {replaceSync() { sheets++; }},
    IntersectionObserver: class {
      observe(el) { observed.add(el); }
      unobserve(el) { observed.delete(el); }
    },
    MutationObserver: class {constructor(fn) { mutation = fn; } observe() {}},
    OverlayUiRenderer: {getStyles: () => '.banner-btn {color:blue}'},
    SmartDmUtils: {getMediaCacheKey: (_, el) => el.key},
    FormatRegistryEngine: {mediaFormatCache: {}}
  });
  const watcher = load(context, source(browser, 'modules/watcher.js'), 'MediaWatcher');
  watcher.init(() => {});
  watcher.isThumbnailOrPreviewMedia = () => false;
  const player = key => {
    const attrs = new Map();
    return events({key, isConnected: true, videoHeight: 1080,
      getAttribute: key => attrs.get(key), setAttribute: (key, val) => attrs.set(key, val), removeAttribute: key => attrs.delete(key),
      getBoundingClientRect: () => ({width: 800, height: 450, top: 20, bottom: 470, right: 880})});
  };
  return {watcher, player, document, hosts, observed, mutation: records => mutation(records), sheets: () => sheets};
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: 500 recycled players release DOM, listeners and observer targets`, () => {
    const f = watcherFixture(browser);
    const baseListeners = f.document.listenerCount();
    const player = f.player('selected');
    for (let i = 0; i < 500; i++) {
      player.isConnected = true;
      f.watcher.attachPlayerBanner(player);
      assert.equal(f.hosts.size, 1);
      assert.equal(player.listenerCount(), 9);
      player.isConnected = false;
      // The removed node is a parent post, not the <video> itself.
      f.mutation([{removedNodes: [{nodeType: 1, tagName: 'ARTICLE'}], addedNodes: []}]);
      assert.equal(player.listenerCount(), 0);
      assert.equal(f.document.listenerCount(), baseListeners);
      assert.equal(f.watcher.activePlayers.size, 0);
      assert.equal(f.hosts.size, 0);
      assert.equal(f.observed.size, 0);
    }
    assert.equal(f.sheets(), 1);
  });

  test(`${browser}: repeated scans of unready media install one readiness listener set`, () => {
    const f = watcherFixture(browser), player = f.player('waiting');
    f.watcher.isThumbnailOrPreviewMedia = () => 'unrendered';
    for (let i = 0; i < 1000; i++) f.watcher.attachPlayerBanner(player);
    assert.equal(player.listenerCount(), 4);
    f.watcher.isThumbnailOrPreviewMedia = () => false;
    player.emit('loadedmetadata');
    assert.equal(player.listenerCount(), 9);
    f.watcher.cleanupPlayer(player);
    assert.equal(player.listenerCount(), 0);
  });

  test(`${browser}: shared overlay styles eliminate per-card CSS copies with fallback`, () => {
    const f = watcherFixture(browser);
    let sheet;
    for (let i = 0; i < 1000; i++) {
      const shadow = {adoptedStyleSheets: []};
      assert.equal(f.watcher.styleMarkup(shadow), '');
      sheet ||= shadow.adoptedStyleSheets[0];
      assert.equal(shadow.adoptedStyleSheets[0], sheet);
    }
    assert.equal(f.sheets(), 1);
    assert.match(f.watcher.styleMarkup({}), /<style>.*color:blue.*<\/style>/);
  });

  test(`${browser}: 1000 media discoveries bound caches at insertion, including Facebook TTL`, () => {
    let now = 1000;
    const c = vm.createContext({Date: {now: () => now}});
    const engine = load(c, source(browser, 'modules/format_engine.js'), 'FormatRegistryEngine');
    for (let i = 0; i < 1000; i++) {
      engine.streamHeightRegistry.set('stream-' + i, 1080);
      engine.rememberFormats('asset-' + i, [{url: `https://cdn.invalid/${i}.mp4`}]);
      engine.rememberFacebook('reel-' + i, {formats: []});
    }
    assert.equal(engine.accumulatedFormatsByCacheKey.size, 30);
    assert.equal(engine.streamHeightRegistry.size, 50);
    assert.equal(engine.fbDomCache.size, 20);
    assert.equal(engine.accumulatedFormatsByCacheKey.has('asset-999'), true);
    now += 15000;
    engine.pruneCache();
    assert.equal(engine.fbDomCache.size, 0);
  });

  test(`${browser}: pending format lookup coalesces 100 polls and delivers the selected result`, () => {
    const url = 'https://www.youtube.com/watch?v=abcdefghijk';
    let requests = 0, reply;
    const c = vm.createContext({
      window: {location: {hostname: 'www.youtube.com', href: url, pathname: '/watch'}}, document: {},
      SmartDmUtils: {getMediaCacheKey: () => url},
      chrome: {runtime: {sendMessage(_, cb) { requests++; reply = cb; }}},
      setTimeout: () => 1, clearTimeout() {}
    });
    const engine = load(c, source(browser, 'modules/format_engine.js'), 'FormatRegistryEngine');
    engine.isSocialFeed = () => false;
    engine.buildFallbackFormats = (_, __, cb) => cb(null);
    let received;
    engine.fetchMediaFormats(url, null, r => {received = r;});
    for (let i = 0; i < 100; i++) engine.fetchMediaFormats(url, null, () => {}, true);
    assert.equal(requests, 1);
    assert.equal(engine.mediaFormatCache[url].callbacks.length, 1);
    reply({success: true, formats: [{url: 'https://cdn.invalid/selected.mp4'}]});
    assert.equal(received.formats[0].url, 'https://cdn.invalid/selected.mp4');
    assert.equal(engine.mediaFormatCache[url].callbacks.length, 0);
  });

  test(`${browser}: failed in-page probe stays deduplicated until desktop reply or timeout`, async () => {
    const timers = new Map();
    let nextTimer = 0, reply, requests = 0;
    const c = vm.createContext({AbortController, TextDecoder,
      fetch: async () => {throw new Error('not available in frame');},
      setTimeout(fn) {const id = ++nextTimer; timers.set(id, fn); return id;},
      clearTimeout(id) {timers.delete(id);},
      chrome: {runtime: {sendMessage(_, cb) {requests++; reply = cb;}}}
    });
    const engine = load(c, source(browser, 'modules/format_engine.js'), 'FormatRegistryEngine');
    const url = 'https://cdn.invalid/master.m3u8';
    const first = engine.resolveM3u8VariantsInPage(url);
    await new Promise(setImmediate);
    assert.equal(await engine.resolveM3u8VariantsInPage(url), null);
    assert.equal(requests, 1);
    reply({success: true, formats: [{url: 'https://cdn.invalid/selected.m3u8'}]});
    assert.equal((await first)[0].url, 'https://cdn.invalid/selected.m3u8');
    assert.equal(engine.activeProbes.size, 0);
    assert.equal(timers.size, 0);
    const retry = engine.resolveM3u8VariantsInPage(url);
    await new Promise(setImmediate);
    for (const fn of [...timers.values()]) fn();
    assert.equal(await retry, null);
    assert.equal(engine.activeProbes.size, 0);
  });

  test(`${browser}: late lookup reply cannot complete a replacement player's lookup`, () => {
    const url = 'https://www.youtube.com/watch?v=abcdefghijk', replies = [];
    const c = vm.createContext({
      window: {location: {hostname: 'www.youtube.com', href: url, pathname: '/watch'}}, document: {},
      SmartDmUtils: {getMediaCacheKey: () => url},
      chrome: {runtime: {sendMessage(_, cb) {replies.push(cb);}}}, setTimeout: () => 1, clearTimeout() {}
    });
    const engine = load(c, source(browser, 'modules/format_engine.js'), 'FormatRegistryEngine');
    engine.isSocialFeed = () => false;
    engine.buildFallbackFormats = (_, __, cb) => cb(null);
    engine.fetchMediaFormats(url, null, () => {});
    delete engine.mediaFormatCache[url];
    let selected;
    engine.fetchMediaFormats(url, null, result => {selected = result;});
    replies[0]({success: true, formats: [{url: 'https://cdn.invalid/stale.mp4'}]});
    assert.equal(selected, undefined);
    assert.equal(engine.mediaFormatCache[url].status, 'pending');
    replies[1]({success: true, formats: [{url: 'https://cdn.invalid/selected.mp4'}]});
    assert.equal(selected.formats[0].url, 'https://cdn.invalid/selected.mp4');
    assert.equal(engine.mediaFormatCache[url].data.formats[0].url, 'https://cdn.invalid/selected.mp4');
  });

  test(`${browser}: player-bound manifest event refreshes without copying or reprobe`, () => {
    const handlers = {};
    let refreshes = 0, probes = 0;
    const window = {location: {hostname: 'player.invalid', href: 'https://player.invalid/e/1'},
      addEventListener(type, fn) {handlers[type] = fn;}};
    window.top = window.self = window;
    const document = {readyState: 'complete', documentElement: {hasAttribute: () => true},
      addEventListener() {}, querySelectorAll: () => [{shadowRoot: {querySelector: () => ({_smartdm_refresh() {refreshes++;}})}}]};
    const c = vm.createContext({window, document, MediaWatcher: {init() {}},
      chrome: {runtime: {onMessage: {addListener() {}}}},
      FormatRegistryEngine: {drainStashedManifests() {}, processCapturedManifest(_, __, cb) {probes++; cb();}}});
    vm.runInContext(source(browser, 'smartdm_overlay.js'), c);
    handlers.__smartdm_manifest_captured__({detail: {playerId: 'hls-1', text: null}});
    assert.equal(refreshes, 1);
    assert.equal(probes, 0);
    handlers.__smartdm_manifest_captured__({detail: {url: 'https://cdn.invalid/master.m3u8', text: '#EXTM3U'}});
    assert.equal(refreshes, 2);
    assert.equal(probes, 1);
  });

  test(`${browser}: discovery bounds chunked probe bodies and preserves valid master qualities`, async () => {
    let oversized = true, aborted = false, reads = 0;
    const master = new TextEncoder().encode('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nselected.m3u8');
    const c = vm.createContext({URL, AbortController, TextDecoder, setTimeout, clearTimeout,
      window: {location: {href: 'https://player.invalid/e/1', origin: 'https://player.invalid'}},
      SmartDmUtils: {normalizeVideoResolution: (_, h) => Number(h), getResolutionLabel: h => `${h}p`},
      chrome: {runtime: {sendMessage(_, cb) {cb(null);}}},
      fetch: async (_, options) => {
        options.signal.addEventListener('abort', () => {aborted = true;});
        let once = false;
        return {ok: true, body: {getReader: () => ({
          async read() {
            reads++;
            if (oversized) return {value: new Uint8Array(100000), done: false};
            if (once) return {done: true};
            once = true;
            return {value: master, done: false};
          }, releaseLock() {}
        })}};
      }
    });
    const engine = load(c, source(browser, 'modules/format_engine.js'), 'FormatRegistryEngine');
    assert.equal(await engine.resolveM3u8VariantsInPage('https://cdn.invalid/master.m3u8'), null);
    assert.equal(reads, 6);
    assert.equal(aborted, true);
    oversized = false;
    const formats = await engine.resolveM3u8VariantsInPage('https://cdn.invalid/master.m3u8');
    assert.equal(formats[0].height, 1080);
    assert.equal(formats[0].url, 'https://cdn.invalid/selected.m3u8');
  });

  function snifferFixture(fetch) {
    const nodes = [], captured = [];
    const root = {setAttribute() {}, querySelector: () => null, querySelectorAll: () => nodes,
      appendChild(node) { nodes.push(node); }};
    const document = {documentElement: root, head: root, createElement: () => ({style: {}, setAttribute() {}})};
    const window = {fetch, location: {hostname: 'player.invalid', href: 'https://player.invalid/e/1'},
      dispatchEvent: e => captured.push(e.detail)};
    window.top = window.self = window;
    class Xhr {
      constructor() { this.handlers = []; this.responseText = ''; }
      open() {} send() {}
      addEventListener(_, fn) { this.handlers.push(fn); }
    }
    const c = vm.createContext({window, document, XMLHttpRequest: Xhr, setTimeout, clearTimeout, TextDecoder,
      CSS: {escape: s => s}, CustomEvent: class {constructor(_, data) {this.detail = data.detail;}}});
    vm.runInContext(source(browser, 'sniffer.js'), c);
    return {window, Xhr, nodes, captured};
  }

  test(`${browser}: reused XHR has one manifest listener and ordinary requests have none`, () => {
    const f = snifferFixture();
    const xhr = new f.Xhr();
    for (let i = 0; i < 1000; i++) {xhr.open('GET', 'https://cdn.invalid/list.m3u8'); xhr.send();}
    assert.equal(xhr.handlers.length, 1);
    const api = new f.Xhr();
    for (let i = 0; i < 1000; i++) {api.open('GET', 'https://player.invalid/api'); api.send();}
    assert.equal(api.handlers.length, 0);
  });

  test(`${browser}: oversized chunked playlist clone cancels early without touching original`, async () => {
    let reads = 0, cancelled = 0;
    const response = {headers: {get: () => null}, clone: () => ({body: {getReader: () => ({
      async read() {reads++; return {value: new Uint8Array(100000), done: false};},
      cancel() {cancelled++; return Promise.resolve();}, releaseLock() {}
    })}})};
    const f = snifferFixture(async () => response);
    assert.equal(await f.window.fetch('https://cdn.invalid/list.m3u8'), response);
    await new Promise(setImmediate);
    assert.equal(reads, 6);
    assert.equal(cancelled, 1);
    assert.equal(f.nodes.length, 0);
  });

  test(`${browser}: manifest sniffing bounds concurrent reads and still captures valid VOD`, async () => {
    const pending = [];
    let clones = 0;
    const manifest = new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST');
    const f = snifferFixture(async () => ({headers: {get: () => null}, clone() {
      clones++;
      let once = false;
      return {body: {getReader: () => ({
        read() {
          if (once) return Promise.resolve({done: true});
          once = true;
          return new Promise(resolve => pending.push(() => resolve({value: manifest, done: false})));
        }, cancel: () => Promise.resolve(), releaseLock() {}
      })}};
    }}));
    for (let i = 0; i < 30; i++) await f.window.fetch(`https://cdn.invalid/${i}.m3u8`);
    assert.equal(clones, 4);
    pending.forEach(finish => finish());
    await new Promise(setImmediate);
    assert.equal(f.captured.length, 4);
    assert.match(f.captured[0].text, /#EXT-X-ENDLIST/);
    await f.window.fetch('https://cdn.invalid/next.m3u8');
    assert.equal(clones, 5);
    pending.at(-1)();
    await new Promise(setImmediate);
  });
}
