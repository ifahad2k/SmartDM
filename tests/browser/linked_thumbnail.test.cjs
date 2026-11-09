const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const watch = id => `https://catalog.invalid/view_video.php?viewkey=${id}`;
function fixture(browser, pathname = '/video/search') {
  const requests = [], timers = new Map();
  let nextTimer = 0, now = 1000;
  const context = vm.createContext({URL, Date: {now: () => now},
    window: {location: {hostname: 'catalog.invalid', pathname, href: `https://catalog.invalid${pathname}`, origin: 'https://catalog.invalid'}},
    document: {querySelectorAll: () => []},
    chrome: {runtime: {sendMessage(request, reply) {requests.push({request, reply});}}},
    setTimeout(fn) {const id = ++nextTimer; timers.set(id, fn); return id;},
    clearTimeout(id) {timers.delete(id);}
  });
  for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['format_engine.js', 'FormatRegistryEngine']])
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
  const engine = context.FormatRegistryEngine;
  engine.buildFallbackFormats = (_, __, callback) => callback({success: true, title: 'Search preview',
    formats: [{formatId: 'wrong-preview', url: 'https://cdn.invalid/preview.mp4', height: 0, ext: 'mp4'}]});
  const result = id => ({success: true, title: `Selected ${id}`, formats: [
    {formatId: 'selected-1080', height: 1080, ext: 'm3u8', url: `https://cdn.invalid/${id}/master.m3u8`}
  ]});
  return {engine, context, requests, timers, result, advance(ms) {now += ms;}};
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: mounted search-card button requests the linked page rather than listing media`, () => {
    const f = fixture(browser), classes = new Set(), button = {addEventListener(type, fn) {this[type] = fn;}};
    const popover = {style: {}, classList: {contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c)}};
    const content = {innerHTML: ''}, rendered = [];
    const shadow = {querySelector(selector) {return {'.thumb-btn': button, '.popover': popover, '.popover-content': content}[selector];}};
    const host = {style: {}, addEventListener() {}, attachShadow() {return shadow;},
      getBoundingClientRect() {return {left: 200, right: 480, top: 40, bottom: 70, width: 280, height: 30};}};
    const card = {style: {}, appendChild() {}};
    Object.assign(f.context.document, {createElement() {return host;}});
    Object.assign(f.context.window, {innerWidth: 1000, innerHeight: 800, getComputedStyle() {return {position: 'relative'};}});
    f.context.OverlayUiRenderer = {getStyles: () => '', renderFormatDropdown(_, formats) {rendered.push(formats);}};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8') + '\nthis.MediaWatcher=MediaWatcher;', f.context);
    f.context.MediaWatcher.attachThumbnailBadge(card, watch('selected'), 'Selected card');
    button.click({preventDefault() {}, stopPropagation() {}});
    assert.equal(rendered.length, 0);
    assert.equal(f.requests[0].request.type, 'GET_PAGE_MEDIA_FORMATS');
    assert.equal(f.requests[0].request.url, watch('selected'));
    f.requests[0].reply(f.result('selected'));
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][0].url, 'https://cdn.invalid/selected/master.m3u8');
  });

  for (const pathname of ['/', '/video/search']) {
    test(`${browser}: thumbnail on ${pathname} fetches its selected watch page before showing formats`, () => {
      const f = fixture(browser, pathname), deliveries = [];
      f.engine.fetchMediaFormats(watch('selected'), null, r => deliveries.push(r), false, {fromThumbnail: true});
      assert.equal(deliveries.length, 0, 'a preview captured on the listing must not become this video');
      assert.equal(f.requests.length, 1);
      assert.equal(f.requests[0].request.type, 'GET_PAGE_MEDIA_FORMATS');
      assert.equal(f.requests[0].request.url, watch('selected'));
      f.requests[0].reply(f.result('selected'));
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].formats[0].url, 'https://cdn.invalid/selected/master.m3u8');
      assert.equal(deliveries[0].formats[0].assetId, watch('selected'));
      assert.equal(f.timers.size, 0);
    });
  }

  test(`${browser}: listing capture is never substituted when the selected watch page fails; reopen retries`, () => {
    const f = fixture(browser), results = [];
    const lookup = () => f.engine.fetchMediaFormats(watch('selected'), null, r => results.push(r), false, {fromThumbnail: true});
    lookup();
    f.requests[0].reply({success: false, message: 'No selected video'});
    assert.equal(results.at(-1).success, false);
    assert.equal(results.at(-1).formats?.length || 0, 0);
    lookup();
    assert.equal(f.requests.length, 2, 'failed page results must not poison the cache');
    f.requests[1].reply(f.result('selected'));
    assert.equal(results.at(-1).formats[0].url, 'https://cdn.invalid/selected/master.m3u8');
  });

  test(`${browser}: different search cards and concurrent clicks keep separate identities and coalesce one card`, () => {
    const f = fixture(browser), received = [];
    for (const id of ['one', 'one', 'two'])
      f.engine.fetchMediaFormats(watch(id), null, r => received.push(r), false, {fromThumbnail: true});
    assert.equal(f.requests.length, 2);
    f.requests[1].reply(f.result('two'));
    f.requests[0].reply(f.result('one'));
    assert.deepEqual(received.map(r => r.formats[0].url), [
      'https://cdn.invalid/two/master.m3u8', 'https://cdn.invalid/one/master.m3u8', 'https://cdn.invalid/one/master.m3u8'
    ]);
  });

  test(`${browser}: timeout completes once, late replies cannot overwrite a retry, and completed links expire`, () => {
    const f = fixture(browser), received = [];
    const lookup = () => f.engine.fetchMediaFormats(watch('one'), null, r => received.push(r), false, {fromThumbnail: true});
    lookup();
    for (const callback of [...f.timers.values()]) callback();
    assert.equal(received.length, 1);
    assert.equal(received[0].success, false);
    lookup();
    f.requests[0].reply(f.result('stale'));
    assert.equal(received.length, 1);
    f.requests[1].reply(f.result('one'));
    assert.equal(received.length, 2);
    lookup();
    assert.equal(f.requests.length, 2, 'completed lookup should be reused synchronously');
    f.advance(60001); lookup();
    assert.equal(f.requests.length, 3, 'expired links need a fresh page resolution');
  });
}
