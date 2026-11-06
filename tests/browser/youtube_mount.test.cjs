const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser} YouTube video player banner and thumbnail badge attachment`, () => {
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

    const body = { appendChild(node) { node.parentNode = this; } };
    const document = {
      body,
      createElement(tag) { return tag === 'button' ? { addEventListener() {} } : makeHost(); },
      querySelectorAll() { return []; }
    };

    const context = vm.createContext({
      document,
      window: {
        innerWidth: 1200,
        innerHeight: 800,
        location: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test12345', assign() {} },
        getComputedStyle() { return { position: 'static' }; }
      },
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      SmartDmUtils: {
        isGenericTitle() { return false; },
        extractWatchPageTitle() { return 'Test YouTube Video'; },
        getCanonicalUrl(url) { return url; }
      },
      FormatRegistryEngine: {
        getInstantYouTubeFormats(url, title) {
          return [{ formatId: '1080p', resolution: '1080p Full HD', height: 1080, ext: 'mp4' }];
        },
        fetchMediaFormats() {}
      },
      setTimeout,
      clearTimeout
    });

    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');
    vm.runInContext(`${source}\nthis.MediaWatcher = MediaWatcher;`, context);
    const watcher = context.MediaWatcher;

    // 1. YouTube Player Detection Tests
    // Unrendered video: w=0, h=0 -> returns 'unrendered'
    const unrenderedVideo = {
      tagName: 'VIDEO',
      closest() { return null; },
      getBoundingClientRect() { return { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }; },
      getAttribute() { return null; },
      setAttribute() {},
      addEventListener() {}
    };
    assert.equal(watcher.isThumbnailOrPreviewMedia(unrenderedVideo), 'unrendered');

    // YouTube Movie Player video -> returns false (dedicated primary player)
    const ytWatchVideo = {
      tagName: 'VIDEO',
      closest(selector) {
        if (selector.includes('#movie_player')) return { id: 'movie_player' };
        return null;
      },
      getBoundingClientRect() { return { width: 1280, height: 720, top: 100, bottom: 820, left: 100, right: 1380 }; },
      getAttribute() { return null; },
      setAttribute(attr, val) { this[attr] = val; },
      addEventListener() {}
    };
    assert.equal(watcher.isThumbnailOrPreviewMedia(ytWatchVideo), false);

    // YouTube Inline Preview Player -> returns true (preview thumbnail)
    const ytPreviewVideo = {
      tagName: 'VIDEO',
      closest(selector) {
        if (selector.includes('ytd-inline-preview-player')) return { tagName: 'YTD-INLINE-PREVIEW-PLAYER' };
        return null;
      },
      getBoundingClientRect() { return { width: 360, height: 202, top: 100, bottom: 302, left: 100, right: 460 }; },
      getAttribute() { return null; },
      setAttribute() {},
      addEventListener() {}
    };
    assert.equal(watcher.isThumbnailOrPreviewMedia(ytPreviewVideo), true);

    // 2. Attach Banner to YouTube Video Player
    watcher.attachPlayerBanner(ytWatchVideo);
    assert.equal(ytWatchVideo[watcher.ATTR_PLAYER_ATTACHED], 'true');
    assert.equal(createdHost.parentNode, body);
    assert.equal(createdHost.style.position, 'fixed');

    // 3. YouTube Thumbnail Badge Attachment Tests
    const mountChildren = [];
    const targetMount = {
      tagName: 'YTD-THUMBNAIL',
      style: {},
      isConnected: true,
      appendChild(node) {
        node.parentNode = this;
        mountChildren.push(node);
      },
      getBoundingClientRect() { return { left: 400, right: 760, top: 100, bottom: 300, width: 360, height: 200 }; }
    };

    watcher.attachThumbnailBadge(targetMount, 'https://www.youtube.com/watch?v=thumb123', 'Sample Card Video');
    assert.equal(createdHost.parentNode, targetMount);
    assert.equal(createdHost.style.position, 'absolute');
    assert.equal(createdHost.style.top, '6px');
    assert.equal(createdHost.style.right, '6px');
    assert.equal(targetMount.style.position, 'relative');
    assert.equal(popover.style.position, 'fixed');

    // Click badge -> Popover opens with instant formats
    let prevented = false;
    listeners.click({ preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.equal(popover.classList.contains('active'), true);
    assert.equal(popover.style.left, '610px');
    assert.equal(popover.style.top, '136px');

    // Scrolling does NOT hide or clip the YouTube thumbnail badge
    watcher.syncVisibleThumbnails();
    assert.notEqual(createdHost.style.display, 'none');
  });
}
