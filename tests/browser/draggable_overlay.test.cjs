const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Target {
  listeners = new Map();
  addEventListener(name, fn, options) {
    const list = this.listeners.get(name) || [];
    list.push({fn, capture: options === true || options?.capture === true});
    this.listeners.set(name, list);
  }
  removeEventListener(name, fn) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item.fn !== fn));
  }
  fire(name, data = {}) {
    const event = {button: 0, pointerId: 1, clientX: 120, clientY: 100, detail: 1,
      preventDefault() {this.prevented = true;}, stopPropagation() {},
      stopImmediatePropagation() {this.stopped = true;}, ...data};
    for (const {fn} of [...(this.listeners.get(name) || [])].sort((a,b) => b.capture - a.capture)) {
      fn(event);
      if (event.stopped) break;
    }
    return event;
  }
  count() {return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);}
}

function fixture(browser) {
  const document = new Target(), window = new Target(), button = new Target();
  Object.assign(window, {innerWidth: 800, innerHeight: 600});
  const body = {appendChild(host) {host.parentNode = this;}};
  Object.assign(document, {body});
  const card = {};
  const host = {style: {}, parentNode: card};
  const classes = new Set(['active']);
  const popover = {style: {}, classList: {remove: name => classes.delete(name), contains: name => classes.has(name)}};
  let pollsStopped = 0, menuClicks = 0;
  host._smartdm_stop_poll = () => pollsStopped++;
  button.getBoundingClientRect = () => {
    const left = parseFloat(host.style.left) || 100, top = parseFloat(host.style.top) || 80;
    return {left, top, right: left + 120, bottom: top + 30, width: 120, height: 30};
  };
  button.setPointerCapture = () => {};
  button.releasePointerCapture = () => {};
  const context = vm.createContext({window, document});
  vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/overlay_ui.js`, 'utf8') +
    '\nthis.renderer = OverlayUiRenderer;', context);
  const cleanup = context.renderer.makeDraggable(host, button, popover);
  button.addEventListener('click', () => menuClicks++);
  return {document, window, button, body, card, host, popover, cleanup, context,
    polls: () => pollsStopped, clicks: () => menuClicks};
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: clicks and small pointer jitter still open the menu`, () => {
    const f = fixture(browser);
    f.button.fire('pointerdown');
    f.document.fire('pointermove', {clientX: 123, clientY: 102});
    f.document.fire('pointerup');
    f.button.fire('click');
    assert.equal(f.clicks(), 1);
    assert.equal(f.host.parentNode, f.card);
    assert.equal(f.host._smartdm_drag_position, undefined);
    assert.equal(f.document.count(), 0);
    assert.equal(f.window.count(), 0);
  });

  test(`${browser}: dragging escapes clipped cards, clamps to the viewport and suppresses the drag click`, () => {
    const f = fixture(browser);
    f.button.fire('pointerdown');
    f.document.fire('pointermove', {clientX: 1500, clientY: -500});
    assert.equal(f.host.parentNode, f.body);
    assert.equal(f.host.style.left, '674px');
    assert.equal(f.host.style.top, '6px');
    assert.equal(f.host.style.position, 'fixed');
    assert.equal(f.popover.classList.contains('active'), false);
    assert.equal(f.polls(), 1);
    f.document.fire('pointerup');
    assert.equal(f.button.fire('click').prevented, true);
    assert.equal(f.clicks(), 0);
    f.button.fire('pointerdown');
    f.document.fire('pointerup');
    f.button.fire('click');
    assert.equal(f.clicks(), 1, 'the next deliberate click still works');
    f.window.innerWidth = 400;
    f.window.innerHeight = 200;
    f.host._smartdm_apply_drag_position();
    assert.equal(f.host.style.left, '274px');
    assert.equal(f.host.style.top, '6px');
  });

  test(`${browser}: unrelated pointers and right-clicks cannot move the button`, () => {
    const f = fixture(browser);
    f.button.fire('pointerdown', {button: 2});
    assert.equal(f.document.count(), 0);
    f.button.fire('pointerdown');
    f.document.fire('pointermove', {pointerId: 2, clientX: 400});
    f.document.fire('pointerup', {pointerId: 2});
    assert.equal(f.host._smartdm_drag_position, undefined);
    assert.equal(f.document.count(), 3);
    f.document.fire('pointercancel');
    assert.equal(f.document.count(), 0);
  });

  test(`${browser}: keyboard moves and touch drags use the same fullscreen-safe position`, () => {
    const f = fixture(browser);
    const fullscreen = {appendChild(host) {host.parentNode = this;}};
    f.document.fullscreenElement = fullscreen;
    assert.equal(f.button.fire('keydown', {key: 'ArrowRight', altKey: true}).prevented, true);
    assert.equal(f.host.style.left, '110px');
    assert.equal(f.host.parentNode, fullscreen);
    f.button.fire('pointerdown', {pointerType: 'touch'});
    f.document.fire('pointermove', {clientX: 160, clientY: 150, pointerType: 'touch'});
    f.document.fire('pointerup', {pointerType: 'touch'});
    assert.equal(f.host.style.left, '150px');
    assert.equal(f.host.style.top, '130px');
    f.button.fire('click', {detail: 0});
    assert.equal(f.clicks(), 1, 'keyboard activation is never swallowed');
  });

  test(`${browser}: blur and removal during a drag release document listeners`, () => {
    const f = fixture(browser);
    f.button.fire('pointerdown');
    f.window.fire('blur');
    assert.equal(f.document.count(), 0);
    f.button.fire('pointerdown');
    f.cleanup();
    assert.equal(f.document.count(), 0);
    assert.equal(f.window.count(), 0);
    assert.equal(f.button.count(), 1, 'only the unrelated menu click remains');
  });

  test(`${browser}: watcher synchronization retains the chosen position and pruning ends a drag`, () => {
    const f = fixture(browser);
    f.window.location = {hostname: 'example.test'};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8') +
      '\nthis.watcher = MediaWatcher;', f.context);
    const watcher = f.context.watcher;
    const media = {isConnected: true, getBoundingClientRect: () => ({left: 20, right: 620, top: 30, bottom: 330, width: 600, height: 300})};
    watcher.activePlayers.set(media, {host: f.host, isVisible: true});
    f.button.fire('pointerdown');
    f.document.fire('pointermove', {clientX: 400, clientY: 300});
    watcher.syncVisiblePlayers();
    assert.equal(f.host.style.left, '380px');
    assert.equal(f.host.style.top, '280px');
    f.host._smartdm_drag_cleanup = f.cleanup;
    f.host.remove = () => {f.host.removed = true;};
    watcher.thumbnailHosts.set({isConnected: false}, f.host);
    watcher.pruneDisconnectedThumbnails();
    assert.equal(f.host.removed, true);
    assert.equal(f.document.count(), 0);
    assert.equal(f.window.count(), 0);
    assert.equal(watcher.thumbnailHosts.size, 0);
  });
}
