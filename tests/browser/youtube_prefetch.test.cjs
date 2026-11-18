const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const video = n => `https://www.youtube.com/watch?v=${String(n).padStart(11, 'a')}`;
const manifest = n => ({success: true, title: `Video ${n}`, formats: [
  {formatId: '137+140', height: 1080, ext: 'mp4', url: `https://cdn.invalid/${n}/1080`, audioUrl: `https://cdn.invalid/${n}/audio`},
  {formatId: '22', height: 720, ext: 'mp4', url: `https://cdn.invalid/${n}/720`},
  {formatId: 'audio', ext: 'mp3', isAudioOnly: true, url: `https://cdn.invalid/${n}/audio`},
  {formatId: 'thumbnail', ext: 'jpg', url: `https://cdn.invalid/${n}/cover`}
]});

test('YouTube background gives the delayed HD source a chance after a 360p desktop response', async () => {
  const runtime = fs.readFileSync('extensions/shared/background/runtime.js', 'utf8');
  const block = runtime.slice(runtime.indexOf('function bestYouTubeHeight('), runtime.indexOf("  if (request.type === 'RESOLVE_M3U8_VARIANTS')"));
  let desktopReply, browserReply, response;
  const context = vm.createContext({
    setTimeout, clearTimeout, ytBackgroundFormatCache: new Map(), extractYouTubeVideoId: () => 'aaaaaaaaaa1',
    appendCookiesAndSend: (_, callback) => {desktopReply = callback;},
    fetchYouTubeFormatsInServiceWorker: () => new Promise(resolve => {browserReply = resolve;})
  });
  const request = vm.runInContext(`(function(request, sender, sendResponse) { ${block} })`, context);
  request({type:'GET_MEDIA_FORMATS', url:video(1)}, {}, result => {response = result;});
  desktopReply({status:'ok', formats:[{resolution:'360p', directUrl:'https://cdn.invalid/360'}]});
  assert.equal(response, undefined);
  browserReply(manifest(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.formats[0].height, 1080);
});

class MenuElement {
  constructor() {
    this.style = {}; this.dataset = {}; this.children = []; this.listeners = {}; this.isConnected = true;
    const classes = new Set();
    this.classList = {contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)};
    this.htmlHistory = [];
  }
  set innerHTML(value) {this.children = []; this.html = value; this.htmlHistory.push(value);}
  get innerHTML() {return this.html || '';}
  setAttribute(name, value) {this[name] = value;}
  addEventListener(type, fn) {this.listeners[type] = fn;}
  removeEventListener(type) {delete this.listeners[type];}
  appendChild(node) {this.children.push(node); node.parent = this;}
  remove() {this.parent?.children.splice(this.parent.children.indexOf(this), 1);}
  getBoundingClientRect() {return {left: 10, right: 450, top: 20, bottom: 270, width: 440, height: 250};}
  attachShadow() {
    const root = new MenuElement();
    root.parts = {'.thumb-btn': new MenuElement(), '.popover': new MenuElement(), '.popover-content': new MenuElement()};
    root.querySelector = selector => root.parts[selector];
    this.shadowRoot = root;
    return root;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.className === selector.slice(1) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) {
    const key = selector.match(/data-format-key="([^"]+)"/)?.[1];
    return key ? this.children.find(child => child.dataset.formatKey === key) : this.querySelectorAll(selector)[0] || null;
  }
}

function fixture(browser) {
  let now = 1000000, nextTimer = 0;
  const timers = new Map(), requests = [], observers = [];
  const document = {visibilityState: 'visible', querySelectorAll: () => []};
  const c = vm.createContext({URL, Date: {now: () => now}, document,
    window: {location: {hostname: 'www.youtube.com', href: video(1), pathname: '/watch'}},
    setTimeout(fn, ms) {const id = ++nextTimer; timers.set(id, {fn, ms}); return id;},
    clearTimeout(id) {timers.delete(id);},
    chrome: {runtime: {sendMessage(request, reply) {requests.push({request, reply});}}},
    IntersectionObserver: class {
      constructor(callback) {this.callback = callback; this.targets = new Set(); observers.push(this);}
      observe(target) {this.targets.add(target);}
      unobserve(target) {this.targets.delete(target);}
    }
  });
  for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['format_engine.js', 'FormatRegistryEngine'], ['watcher.js', 'MediaWatcher']])
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, c);
  const flush = ms => {
    const snapshot = [...timers].filter(([, t]) => t.ms === ms);
    for (const [id, t] of snapshot) {timers.delete(id); t.fn();}
  };
  const target = () => {
    const listeners = new Map();
    return {isConnected: true, listeners,
      addEventListener(type, fn) {listeners.set(type, fn);},
      removeEventListener(type) {listeners.delete(type);},
      emit(type) {listeners.get(type)?.();}
    };
  };
  return {c, engine: c.FormatRegistryEngine, watcher: c.MediaWatcher, document, requests, observers, timers, target, flush,
    advance(ms) {now += ms;}};
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: actual thumbnail mount and renderer open a prepared menu with no spinner flash and working audio pairing`, () => {
    const f = fixture(browser), mount = new MenuElement();
    f.c.document.createElement = () => new MenuElement();
    f.c.document.body = new MenuElement();
    f.c.window.getComputedStyle = () => ({position: 'relative'});
    f.c.window.innerWidth = 1200; f.c.window.innerHeight = 800;
    f.c.CSS = {escape: value => value};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/overlay_ui.js`, 'utf8') + '\nthis.OverlayUiRenderer=OverlayUiRenderer;', f.c);
    let sent;
    f.watcher.onDownloadHandler = (formats, item, title) => {sent = {formats, item, title};};
    f.watcher.attachThumbnailBadge(mount, video(1), 'Selected video');
    f.observers[0].callback([{target: mount, isIntersecting: true}]); f.flush(150);
    f.requests[0].reply(manifest(1));
    const root = mount.children[0].shadowRoot;
    const content = root.querySelector('.popover-content');
    root.querySelector('.thumb-btn').listeners.click({preventDefault() {}, stopPropagation() {}});
    const rows = content.querySelectorAll('.format-item');
    assert.deepEqual(rows.filter(row => Number(row.dataset.height) > 0).map(row => Number(row.dataset.height)), [1080, 720]);
    assert.ok(rows.some(row => row.dataset.isThumb === 'true'));
    assert.ok(rows.some(row => row.dataset.isAudio === 'true'));
    assert.equal(content.querySelector('.smartdm-pending-notice'), null);
    assert.ok(content.htmlHistory.every(html => !/spinner|Checking for higher/.test(html)));
    rows[0].listeners.click({preventDefault() {}, stopPropagation() {}});
    assert.equal(sent.item.audioUrl, manifest(1).formats[0].audioUrl);
    assert.equal(sent.item.fileName, 'Selected video.mp4');
    assert.equal(f.requests.filter(item => item.request.type !== 'GET_MEDIA_SIZE').length, 1);
    assert.ok(f.requests.filter(item => item.request.type === 'GET_MEDIA_SIZE').length <= 3);
    mount.isConnected = false; f.watcher.pruneDisconnectedThumbnails();
    assert.equal(f.observers[0].targets.size, 0);
    assert.equal(f.watcher.thumbnailHosts.size, 0);
  });

  test(`${browser}: visible card warms full menu and click gets all qualities synchronously without a second lookup`, () => {
    const f = fixture(browser), card = f.target();
    f.watcher.observeYouTubeFormats(card, () => video(1));
    assert.equal(f.requests.length, 0, 'mounting offscreen cards must not fetch');
    f.observers[0].callback([{target: card, isIntersecting: true}]);
    f.flush(150);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].request.url, video(1));
    f.requests[0].reply(manifest(1));
    assert.equal(f.watcher.youtubePrefetchActive, 0);
    assert.equal(f.engine.getInstantYouTubeFormats(video(1)).length, 4);
    let synchronous;
    f.engine.fetchMediaFormats(video(1), null, (r, pending) => {synchronous = r; assert.equal(pending, false);});
    assert.deepEqual(Array.from(synchronous.formats, f => f.formatId), ['137+140', '22', 'audio', 'thumbnail']);
    assert.equal(f.requests.length, 1);
    assert.equal(f.timers.size, 0);
  });

  test(`${browser}: a click during prefetch joins one request and receives only the complete selected result`, () => {
    const f = fixture(browser), card = f.target();
    f.watcher.observeYouTubeFormats(card, () => video(2));
    card.emit('pointerenter'); f.flush(150);
    const deliveries = [];
    f.engine.fetchMediaFormats(video(2), null, (r, pending) => deliveries.push({r, pending}));
    assert.equal(f.requests.length, 1);
    assert.equal(deliveries.length, 0);
    f.requests[0].reply(manifest(2));
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].pending, false);
    assert.equal(deliveries[0].r.formats.length, 4);
    assert.equal(f.engine.getInstantYouTubeFormats(video(1)).length, 0, 'another thumbnail must never use this result');
  });

  test(`${browser}: a YouTube thumbnail uses its manifest even when another player has captured HLS`, () => {
    const f = fixture(browser);
    f.engine.capturedPlayerFormats = () => {throw new Error('unrelated player capture must not be consulted');};
    let result;
    f.engine.fetchMediaFormats(video(3), null, r => {result = r;});
    f.requests[0].reply(manifest(3));
    assert.equal(result.title, 'Video 3');
    assert.equal(result.formats[0].assetId, video(3));
  });

  test(`${browser}: a resolver reply after nine seconds is still accepted within the desktop request budget`, () => {
    const f = fixture(browser);
    let result;
    f.engine.fetchMediaFormats(video(3), null, r => {result = r;});
    f.advance(12000);
    f.flush(9000);
    assert.equal(result, undefined, 'the previous deadline incorrectly turned a live request into an error');
    f.requests[0].reply(manifest(3));
    assert.equal(result.success, true);
    assert.equal(result.formats.length, 4);
    assert.equal(f.timers.size, 0);
  });

  test(`${browser}: the real desktop DTO shape uses directUrl and resolution, and a status-only success stays successful`, () => {
    const f = fixture(browser);
    let result;
    f.engine.fetchMediaFormats(video(3), null, r => {result = r;});
    f.requests[0].reply({status: 'ok', title: 'Selected video', formats: [
      {formatId: '315_webm_140', resolution: '2160p60', ext: 'webm', height: 0, directUrl: 'https://cdn.invalid/video', audioUrl: 'https://cdn.invalid/audio'},
      {formatId: '140', resolution: 'Audio (MP3 / High Quality)', ext: 'mp3', isAudioOnly: true, directUrl: 'https://cdn.invalid/audio'}
    ]});
    assert.equal(result.success, true);
    assert.equal(result.formats.length, 2);
    assert.equal(result.formats[0].resolution, '2160p60');
    assert.equal(result.formats[0].audioUrl, 'https://cdn.invalid/audio');
  });

  test(`${browser}: usable selected-player formats survive full-resolver failure and exclude unrelated tab media`, () => {
    const f = fixture(browser);
    const player = {currentSrc: 'https://cdn.invalid/selected', getAttribute() {return null;}};
    f.engine.playerBinding = () => null;
    f.engine.buildFallbackFormats = (_, element, callback) => {
      assert.equal(element, player);
      callback({success: true, formats: [
        {formatId: 'selected', height: 720, ext: 'mp4', url: player.currentSrc},
        {formatId: 'wrong-video', height: 1080, ext: 'mp4', url: 'https://cdn.invalid/unrelated'}
      ]});
    };
    const results = [];
    f.engine.fetchMediaFormats(video(3), player, r => results.push(r));
    assert.equal(results.length, 1);
    assert.equal(results[0].formats.length, 1);
    assert.equal(results[0].formats[0].url, player.currentSrc);
    f.requests[0].reply({success: false, formats: []});
    assert.equal(results.at(-1).success, true);
    assert.equal(results.at(-1).formats[0].url, player.currentSrc);
  });

  test(`${browser}: timeout releases callbacks and worker, retries after cooldown, and ignores late results`, () => {
    const f = fixture(browser), card = f.target();
    f.watcher.observeYouTubeFormats(card, () => video(1)); card.emit('focusin'); f.flush(150);
    let final;
    f.engine.fetchMediaFormats(video(1), null, (r, pending) => {final = r; assert.equal(pending, false);});
    f.flush(30000);
    assert.equal(final.success, false);
    assert.match(final.message, /reopen this menu/);
    assert.equal(f.watcher.youtubePrefetchActive, 0);
    assert.equal(f.engine.mediaFormatCache[video(1)].callbacks.length, 0);
    f.advance(5001);
    f.engine.fetchMediaFormats(video(1), null, r => {final = r;});
    assert.equal(f.requests.length, 2);
    f.requests[0].reply(manifest('stale'));
    assert.equal(final.success, false);
    f.requests[1].reply(manifest('fresh'));
    assert.equal(final.title, 'Video fresh');
  });

  test(`${browser}: cache identities ignore tracking but preserve case and reject spoofed hosts`, () => {
    const {engine} = fixture(browser);
    assert.equal(engine.youTubeCacheKey('https://youtu.be/abcdefghijk?t=15'), 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(engine.youTubeCacheKey('https://music.youtube.com/shorts/abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.notEqual(engine.youTubeCacheKey(video('A')), engine.youTubeCacheKey(video('a')));
    assert.equal(engine.youTubeCacheKey('https://youtube.com.evil.invalid/watch?v=abcdefghijk'), null);
    assert.equal(engine.youTubeCacheKey('https://evil.invalid/youtube.com/watch?v=abcdefghijk'), null);
    assert.equal(engine.youTubeCacheKey('https://user:password@youtube.com/watch?v=abcdefghijk'), null);
  });

  test(`${browser}: cached signed streams expire before their URL and old menus do not remain cached forever`, () => {
    const f = fixture(browser), res = manifest(1);
    res.formats[0].url += '?expire=1060';
    f.engine.fetchYouTubeFormats(video(1)); f.requests[0].reply(res);
    f.advance(30001);
    assert.equal(f.engine.getInstantYouTubeFormats(video(1)).length, 0);
    f.engine.fetchYouTubeFormats(video(1)); assert.equal(f.requests.length, 2);
    f.requests[1].reply(manifest(2)); f.advance(120001);
    f.engine.pruneCache(); assert.equal(f.engine.mediaFormatCache[video(1)], undefined);
  });

  test(`${browser}: failed, provisional, or empty replies never become a fabricated instant menu`, () => {
    const f = fixture(browser);
    for (const [n, response] of [[1, null], [2, {success: true, formats: []}], [3, {success: true, formats: [{url: 'https://cdn.invalid/fake', provisional: true}]}],
      [4, {success: true, formats: 'malformed'}], [5, {success: true, formats: [null]}]]) {
      f.engine.fetchYouTubeFormats(video(n)); f.requests.at(-1).reply(response);
      assert.equal(f.engine.getInstantYouTubeFormats(video(n)).length, 0);
    }
  });

  test(`${browser}: infinite shelf has at most two active and eight queued lookups; removal releases targets/listeners`, () => {
    const f = fixture(browser), cleanups = [], cards = [];
    for (let n = 0; n < 100; n++) {
      const card = f.target(); cards.push(card);
      cleanups.push(f.watcher.observeYouTubeFormats(card, () => video(n)));
      f.observers[0].callback([{target: card, isIntersecting: true}]);
    }
    assert.equal(f.watcher.youtubePrefetchQueue.size, 8);
    f.flush(150);
    assert.equal(f.requests.length, 2); assert.equal(f.watcher.youtubePrefetchActive, 2);
    assert.equal(f.watcher.youtubePrefetchQueue.size, 6);
    cleanups.forEach(fn => fn());
    assert.equal(f.watcher.youtubePrefetchQueue.size, 0);
    assert.equal(f.observers[0].targets.size, 0);
    assert.ok(cards.every(card => card.listeners.size === 0));
    f.requests[0].reply(manifest(1)); f.requests[1].reply(manifest(2));
    assert.equal(f.requests.length, 2);
    assert.equal(f.watcher.youtubePrefetchActive, 0);
  });

  test(`${browser}: offscreen and hidden-tab work is skipped; focus prioritizes the intended video`, () => {
    const f = fixture(browser), cards = [f.target(), f.target(), f.target()];
    cards.forEach((card, n) => f.watcher.observeYouTubeFormats(card, () => video(n)));
    f.observers[0].callback(cards.map(target => ({target, isIntersecting: true})));
    f.observers[0].callback([{target: cards[0], isIntersecting: false}]);
    cards[2].emit('focusin'); f.flush(150);
    assert.equal(f.requests[0].request.url, video(2));
    assert.equal(f.requests[1].request.url, video(1));
    f.document.visibilityState = 'hidden';
    cards[0].emit('pointerenter'); f.flush(150);
    assert.equal(f.requests.length, 2);
  });

  test(`${browser}: format cache stays bounded when browsing many videos`, () => {
    const f = fixture(browser);
    for (let n = 0; n < 100; n++) {f.engine.fetchYouTubeFormats(video(n)); f.requests.at(-1).reply(manifest(n));}
    assert.equal(Object.keys(f.engine.mediaFormatCache).length, 30);
    assert.equal(f.engine.getInstantYouTubeFormats(video(99)).length, 4);
  });

  test(`${browser}: actual thumbnail menu clears a pending notice when partial discovery finishes without more formats`, () => {
    const f = fixture(browser), mount = new MenuElement();
    f.c.document.createElement = () => new MenuElement();
    f.c.document.body = new MenuElement();
    f.c.window.getComputedStyle = () => ({position: 'relative'});
    f.c.window.innerWidth = 1200; f.c.window.innerHeight = 800;
    f.c.CSS = {escape: value => value};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/overlay_ui.js`, 'utf8') + '\nthis.OverlayUiRenderer=OverlayUiRenderer;', f.c);
    let finish;
    f.engine.fetchMediaFormats = (_, __, callback) => {finish = callback; callback(manifest(1), true);};
    f.watcher.attachThumbnailBadge(mount, 'https://video.invalid/watch/selected', 'Selected video');
    const root = mount.children[0].shadowRoot;
    root.querySelector('.thumb-btn').listeners.click({preventDefault() {}, stopPropagation() {}});
    const content = root.querySelector('.popover-content');
    assert.ok(content.querySelector('.smartdm-pending-notice'));
    finish(null, false);
    assert.equal(content.querySelector('.smartdm-pending-notice'), null);
    assert.ok(content.querySelectorAll('.format-item').length > 0);
  });
}
