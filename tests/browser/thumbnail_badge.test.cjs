const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser} Facebook Reel badge stays clickable outside the card`, () => {
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
    const host = {
      style: {},
      addEventListener() {},
      attachShadow() {
        this.shadowRoot = {
          innerHTML: '',
          querySelector(selector) {
            return { '.thumb-btn': button, '.popover': popover, '.popover-content': content }[selector];
          }
        };
        return this.shadowRoot;
      },
      getBoundingClientRect() { return { left: 640, right: 740, top: 90, bottom: 120, width: 100, height: 30 }; },
      remove() { this.removed = true; }
    };
    const body = { appendChild(node) { node.parentNode = this; } };
    const document = { body, createElement(tag) { return tag === 'button' ? { addEventListener() {} } : host; }, querySelectorAll() { return []; } };
    let rect = { left: 400, right: 640, top: 120, bottom: 460, width: 240, height: 340 };
    const mount = { style: {}, isConnected: true, getBoundingClientRect() { return rect; } };
    let fetches = 0;
    const context = vm.createContext({
      document,
      window: { innerWidth: 1200, innerHeight: 800, location: { assign() {} }, getComputedStyle() { return { position: 'relative' }; } },
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      SmartDmUtils: { isGenericTitle() { return false; } },
      FormatRegistryEngine: { fetchMediaFormats() { fetches++; } },
      setTimeout,
      clearTimeout
    });
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');
    vm.runInContext(`${source}\nthis.MediaWatcher = MediaWatcher;`, context);
    const watcher = context.MediaWatcher;

    watcher.attachThumbnailBadge(mount, 'https://www.facebook.com/reel/123', 'Reel');
    assert.equal(host.parentNode, body);
    assert.equal(host.style.position, 'fixed');
    assert.equal(host.style.top, '126px');
    assert.equal(popover.style.position, 'absolute');
    let prevented = false;
    listeners.click({ preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.equal(popover.classList.contains('active'), true);
    assert.equal(popover.style.left, '-190px');
    assert.equal(popover.style.top, '36px');
    assert.match(content.innerHTML, /Open this Reel/);
    assert.equal(content.children.length, 1);
    assert.equal(fetches, 0);

    mount.parentElement = {
      parentElement: null,
      getBoundingClientRect() { return { left: 0, right: 500, top: 0, bottom: 800 }; }
    };
    context.window.getComputedStyle = () => ({ overflowX: 'hidden' });
    watcher.syncVisibleThumbnails();
    assert.equal(host.style.display, 'none');
    mount.parentElement = null;

    rect = { ...rect, top: 200, bottom: 540 };
    watcher.syncVisibleThumbnails();
    assert.equal(host.style.top, '206px');
    mount.isConnected = false;
    watcher.syncVisibleThumbnails();
    assert.equal(host.removed, true);
  });
}
