const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(browser, subframe = false) {
  const listeners = new Map(), parentMessages = [], hosts = [];
  const body = {appendChild(host) {host.parentNode = this;}, removeChild(host) {host.parentNode = null;}};
  const document = {body, createElement() {
    const classes = new Set(['active']);
    const popover = {style: {}, classList: {contains: n => classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n)}};
    const host = {style: {}, attachShadow() {
      return this.shadowRoot = {innerHTML: '', querySelector: s => s === '.popover' ? popover : {addEventListener() {}}};
    }};
    hosts.push(host);
    return host;
  }, addEventListener() {}, removeEventListener() {}};
  const window = {location: {hostname: 'example.test', href: 'https://example.test/video/selected'}, innerWidth: 1200, innerHeight: 800,
    addEventListener(name, fn) {listeners.set(name, fn);}};
  window.self = window;
  window.top = subframe ? {} : window;
  window.parent = subframe ? {postMessage: message => parentMessages.push(message)} : window;
  const context = vm.createContext({window, document, OverlayUiRenderer: {getStyles: () => ''},
    FormatRegistryEngine: {mediaFormatCache: {}}, SmartDmUtils: {getMediaCacheKey: () => 'selected'}});
  vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8') + '\nthis.watcher=MediaWatcher;', context);
  const watcher = context.watcher;
  watcher.isThumbnailOrPreviewMedia = media => media.preview || false;
  watcher.initFrameOwnership();
  const media = tagName => {
    const attributes = new Map(), events = new Map(), children = new Set(), requests = [];
    return {tagName, isConnected: true, children, events, requests,
      contentWindow: {postMessage: message => requests.push(message)},
      contains: other => children.has(other),
      getAttribute: name => attributes.get(name), setAttribute: (name,value) => attributes.set(name,value), removeAttribute: name => attributes.delete(name),
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
      getBoundingClientRect: () => ({left: 100, right: 900, top: 50, bottom: 500, width: 800, height: 450})};
  };
  return {watcher, media, window, listeners, parentMessages, hosts};
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: actual media replaces a wrapper banner, and re-scans cannot add it back`, () => {
    const f = fixture(browser), wrapper = f.media('DIV'), video = f.media('VIDEO');
    wrapper.children.add(video);
    f.watcher.attachPlayerBanner(wrapper);
    const oldHost = f.hosts[0];
    f.watcher.attachPlayerBanner(video);
    assert.equal(f.watcher.activePlayers.size, 1);
    assert.equal(f.watcher.activePlayers.has(video), true);
    assert.equal(oldHost.parentNode, null);
    f.watcher.attachPlayerBanner(wrapper);
    assert.equal(f.watcher.activePlayers.size, 1);
    assert.equal(f.hosts.length, 2);
  });

  test(`${browser}: media-first nesting deduplicates but independent players remain independent`, () => {
    const f = fixture(browser), wrapper = f.media('DIV'), first = f.media('VIDEO'), second = f.media('VIDEO');
    wrapper.children.add(first);
    f.watcher.attachPlayerBanner(first);
    f.watcher.attachPlayerBanner(wrapper);
    f.watcher.attachPlayerBanner(second);
    assert.equal(f.watcher.activePlayers.size, 2);
    assert.equal(f.watcher.activePlayers.has(wrapper), false);
    assert.equal(f.watcher.activePlayers.has(second), true);
  });

  test(`${browser}: an unready or rejected preview does not remove the working wrapper`, () => {
    const f = fixture(browser), wrapper = f.media('DIV'), preview = f.media('VIDEO');
    wrapper.children.add(preview);
    preview.preview = true;
    f.watcher.attachPlayerBanner(wrapper);
    f.watcher.attachPlayerBanner(preview);
    assert.equal(f.watcher.activePlayers.has(wrapper), true);
    assert.equal(f.hosts.length, 1);
  });

  test(`${browser}: only its exact child window can suppress the iframe fallback, including during sync`, () => {
    const f = fixture(browser), frame = f.media('IFRAME');
    f.watcher.attachPlayerBanner(frame);
    const item = f.watcher.activePlayers.get(frame), host = item.host;
    let stopped = 0;
    host._smartdm_stop_poll = () => stopped++;
    assert.equal(frame.requests[0].type, 'SMARTDM_OVERLAY_OWNER_QUERY');
    f.listeners.get('message')({source: {}, data: {type: 'SMARTDM_OVERLAY_OWNER', active: true}});
    assert.notEqual(host.style.display, 'none');
    f.listeners.get('message')({source: frame.contentWindow, data: {type: 'SMARTDM_OVERLAY_OWNER', active: 'true'}});
    assert.notEqual(host.style.display, 'none');
    f.listeners.get('message')({source: frame.contentWindow, data: {type: 'SMARTDM_OVERLAY_OWNER', active: true}});
    assert.equal(host.style.display, 'none');
    assert.equal(host.shadowRoot.querySelector('.popover').classList.contains('active'), false);
    assert.equal(stopped, 1);
    f.watcher.syncVisiblePlayers();
    assert.equal(host.style.display, 'none');
    f.listeners.get('message')({source: frame.contentWindow, data: {type: 'SMARTDM_OVERLAY_OWNER', active: false}});
    assert.equal(host.style.display, '');
    f.listeners.get('message')({source: frame.contentWindow, data: {type: 'SMARTDM_OVERLAY_OWNER', active: true}});
    frame.events.get('load')();
    assert.equal(host.style.display, '');
    assert.equal(frame.requests.length, 2);
  });

  test(`${browser}: a child answers ownership queries and releases its parent on removal/pagehide`, () => {
    const f = fixture(browser, true), video = f.media('VIDEO');
    f.listeners.get('message')({source: f.window.parent, data: {type: 'SMARTDM_OVERLAY_OWNER_QUERY'}});
    assert.equal(f.parentMessages.at(-1).active, false);
    f.watcher.attachPlayerBanner(video);
    assert.equal(f.parentMessages.at(-1).active, true);
    f.listeners.get('pagehide')();
    assert.equal(f.parentMessages.at(-1).active, false);
    f.listeners.get('pageshow')();
    assert.equal(f.parentMessages.at(-1).active, true);
    f.watcher.cleanupPlayer(video);
    assert.equal(f.parentMessages.at(-1).active, false);
  });
}
