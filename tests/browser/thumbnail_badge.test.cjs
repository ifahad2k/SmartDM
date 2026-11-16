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

  test(`${browser}: Bilibili numeric video anchors mount without legacy card classes`, () => {
    const dom = createDOM({hostname: 'www.bilibili.tv', href: 'https://www.bilibili.tv/en/search-result?q=selected'});
    const link = dom.makeElement('a', {href: 'https://www.bilibili.tv/en/video/123456789', class: 'search-cover'}, [
      dom.makeElement('img', {src: 'selected.jpg', width: 320, height: 180})
    ]);
    const tile = dom.makeElement('div', {class: 'search-result-tile'}, [link]);
    dom.body.appendChild(tile);
    const c = vm.createContext({URL,window:dom.window,document:dom.document, setTimeout, clearTimeout,
      OverlayUiRenderer:{getStyles(){return '';},renderFormatDropdown(){}},FormatRegistryEngine:{fetchMediaFormats(){}}});
    for(const f of ['utils','visual_mount','watcher']) vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${f}.js`,'utf8'),c);
    vm.runInContext('MediaWatcher.scanThumbnails()',c);
    assert.equal(dom.hostsCreated.length,1);
  });

  test(`${browser} excludes Pornhub tag/search suggestion pills and mounts only legitimate video cards`, () => {
    const dom = createDOM({ hostname: 'www.pornhub.com', href: 'https://www.pornhub.com/video' });
    const tagWrapper = dom.makeElement('div', { class: 'tagsWrapper' }, [
      dom.makeElement('a', { class: 'tag', href: 'https://www.pornhub.com/video/search?search=solo', textContent: 'solo' }),
      dom.makeElement('a', { class: 'tag', href: 'https://www.pornhub.com/video/search?search=property+sex', textContent: 'property sex' })
    ]);
    const videoBox = dom.makeElement('div', { class: 'videoBox' }, [
      dom.makeElement('div', { class: 'phimage' }, [
        dom.makeElement('a', { href: 'https://www.pornhub.com/view_video.php?viewkey=ph12345' }, [
          dom.makeElement('img', { src: 'https://ci.phncdn.com/thumb.jpg', width: 280, height: 160 })
        ])
      ])
    ]);
    dom.body.appendChild(tagWrapper);
    dom.body.appendChild(videoBox);

    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');

    const context = vm.createContext({
      document: dom.document,
      window: dom.window,
      URL,
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: { fetchMediaFormats() {} },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(`${utilsSource}\n${visualMountSource}\n${watcherSource}\nthis.MediaWatcher = MediaWatcher;\nthis.VisualMountDetector = VisualMountDetector;\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const watcher = context.MediaWatcher;
    const detector = context.VisualMountDetector;

    // Unit checks on detector methods
    assert.equal(detector.isCategoryOrTagPill(tagWrapper.children[0]), true);
    assert.equal(detector.isCategoryOrTagPill(tagWrapper.children[1]), true);
    assert.equal(detector.isCategoryOrTagPill(null, 'https://www.pornhub.com/video/search?search=solo'), true);
    assert.equal(detector.isCategoryOrTagPill(null, 'https://www.pornhub.com/video?c=123'), true);
    assert.equal(detector.isLegitimateThumbnailCard(tagWrapper.children[0]), false);
    assert.equal(detector.isLegitimateThumbnailCard(videoBox), true);

    // Run scanner
    watcher.scanThumbnails();
    assert.equal(tagWrapper.children[0].getAttribute('data-smartdm-thumb-attached'), null);
    assert.equal(tagWrapper.children[1].getAttribute('data-smartdm-thumb-attached'), null);
    assert.equal(videoBox.getAttribute('data-smartdm-thumb-attached'), 'true');
    assert.equal(dom.hostsCreated.length, 1);
  });

  test(`${browser} excludes Aniwave PLAY NOW hero button, catalog posters, sidebar rankings, and episode buttons`, () => {
    const dom = createDOM({ hostname: 'aniwave.gr', href: 'https://aniwave.gr/home' });
    const heroBtn = dom.makeElement('a', { class: 'btn btn-primary play-now', href: '/watch/one-piece.109/ep-1', textContent: 'PLAY NOW' });
    const catalogItem = dom.makeElement('div', { class: 'film-list' }, [
      dom.makeElement('div', { class: 'item' }, [
        dom.makeElement('div', { class: 'poster' }, [
          dom.makeElement('a', { href: '/watch/one-piece.109/ep-1' }, [
            dom.makeElement('img', { src: 'poster.jpg', width: 180, height: 260 })
          ])
        ])
      ])
    ]);
    const sidebarItem = dom.makeElement('div', { class: 'top-anime' }, [
      dom.makeElement('div', { class: 'item' }, [
        dom.makeElement('a', { href: '/watch/naruto.42/ep-1', textContent: 'Naruto' })
      ])
    ]);
    const episodeBtn = dom.makeElement('div', { class: 'episodes-list' }, [
      dom.makeElement('a', { class: 'ep-item', href: '/watch/one-piece.109/ep-2', textContent: 'Ep 2' })
    ]);

    dom.body.appendChild(heroBtn);
    dom.body.appendChild(catalogItem);
    dom.body.appendChild(sidebarItem);
    dom.body.appendChild(episodeBtn);

    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');

    const context = vm.createContext({
      document: dom.document,
      window: dom.window,
      URL,
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: { fetchMediaFormats() {} },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(`${utilsSource}\n${visualMountSource}\n${watcherSource}\nthis.MediaWatcher = MediaWatcher;\nthis.VisualMountDetector = VisualMountDetector;\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const watcher = context.MediaWatcher;
    const detector = context.VisualMountDetector;

    assert.equal(detector.isActionElement(heroBtn), true);
    assert.equal(detector.isAnimeCatalogOrEpisode(heroBtn), true);
    assert.equal(detector.isAnimeCatalogOrEpisode(catalogItem), true);
    assert.equal(detector.isAnimeCatalogOrEpisode(sidebarItem), true);
    assert.equal(detector.isAnimeCatalogOrEpisode(episodeBtn), true);

    watcher.scanThumbnails();

    // ZERO badges should be mounted across hero button, catalog, sidebar, and episode lists
    assert.equal(dom.hostsCreated.length, 0);
  });

  test(`${browser} excludes Facebook Reel carousel shelves while mounting standalone legitimate cards across feed posts`, () => {
    const dom = createDOM({ hostname: 'www.facebook.com', href: 'https://www.facebook.com/' });
    // Carousel inside region aria-label="Reels"
    const carouselShelf = dom.makeElement('div', { role: 'region', 'aria-label': 'Reels' }, [
      dom.makeElement('div', { class: 'shelf' }, [
        dom.makeElement('div', { role: 'listitem' }, [
          dom.makeElement('a', { href: 'https://www.facebook.com/reel/1001' }, [
            dom.makeElement('img', { src: 'reel1.jpg', width: 180, height: 320 })
          ])
        ]),
        dom.makeElement('div', { role: 'listitem' }, [
          dom.makeElement('a', { href: 'https://www.facebook.com/reel/1002' }, [
            dom.makeElement('img', { src: 'reel2.jpg', width: 180, height: 320 })
          ])
        ])
      ])
    ]);

    // Feed with TWO standalone posts containing reels
    const feed = dom.makeElement('div', { role: 'feed' }, [
      dom.makeElement('div', { role: 'article' }, [
        dom.makeElement('div', { role: 'listitem' }, [
          dom.makeElement('a', { href: 'https://www.facebook.com/reel/2001' }, [
            dom.makeElement('img', { src: 'standalone1.jpg', width: 360, height: 640 })
          ])
        ])
      ]),
      dom.makeElement('div', { role: 'article' }, [
        dom.makeElement('div', { role: 'listitem' }, [
          dom.makeElement('a', { href: 'https://www.facebook.com/reel/2002' }, [
            dom.makeElement('img', { src: 'standalone2.jpg', width: 360, height: 640 })
          ])
        ])
      ])
    ]);

    dom.body.appendChild(carouselShelf);
    dom.body.appendChild(feed);

    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');

    const context = vm.createContext({
      document: dom.document,
      window: dom.window,
      URL,
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: { fetchMediaFormats() {} },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(`${utilsSource}\n${visualMountSource}\n${watcherSource}\nthis.MediaWatcher = MediaWatcher;\nthis.VisualMountDetector = VisualMountDetector;\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const watcher = context.MediaWatcher;
    const detector = context.VisualMountDetector;

    const reel1Anchor = carouselShelf.children[0].children[0].children[0];
    const post1Anchor = feed.children[0].children[0].children[0];
    const post2Anchor = feed.children[1].children[0].children[0];

    assert.equal(detector.isFacebookCarouselOrShelf(reel1Anchor), true);
    assert.equal(detector.isFacebookCarouselOrShelf(post1Anchor), false);
    assert.equal(detector.isFacebookCarouselOrShelf(post2Anchor), false);

    watcher.scanThumbnails();
    assert.equal(reel1Anchor.getAttribute('data-smartdm-thumb-attached'), null);
    assert.equal(post1Anchor.getAttribute('data-smartdm-thumb-attached'), 'true');
    assert.equal(post2Anchor.getAttribute('data-smartdm-thumb-attached'), 'true');
    assert.equal(dom.hostsCreated.length, 2);
  });

  test(`${browser} allows YouTube video cards inside category-feed without being rejected as pills`, () => {
    const dom = createDOM({ hostname: 'www.youtube.com', href: 'https://www.youtube.com/' });
    const categoryFeed = dom.makeElement('div', { class: 'category-feed' }, [
      dom.makeElement('div', { class: 'videoCard' }, [
        dom.makeElement('ytd-thumbnail', { class: 'thumb' }, [
          dom.makeElement('a', { href: 'https://www.youtube.com/watch?v=catVideo123' }, [
            dom.makeElement('img', { src: 'thumb.jpg', width: 320, height: 180 }),
            dom.makeElement('span', { class: 'duration', textContent: '12:34' })
          ])
        ])
      ])
    ]);
    dom.body.appendChild(categoryFeed);

    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');

    const context = vm.createContext({
      document: dom.document,
      window: dom.window,
      URL,
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: { fetchMediaFormats() {} },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(`${utilsSource}\n${visualMountSource}\n${watcherSource}\nthis.MediaWatcher = MediaWatcher;\nthis.VisualMountDetector = VisualMountDetector;\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const watcher = context.MediaWatcher;
    const detector = context.VisualMountDetector;

    const card = categoryFeed.children[0];
    const link = card.children[0].children[0];

    assert.equal(detector.isCategoryOrTagPill(card), false);
    assert.equal(detector.isLegitimateThumbnailCard(card, link), true);

    watcher.scanThumbnails();
    assert.equal(card.getAttribute('data-smartdm-thumb-attached'), 'true');
    assert.equal(dom.hostsCreated.length, 1);
  });

  test(`${browser} supports generic video card with thumbnail image and duration`, () => {
    const dom = createDOM({ hostname: 'www.example-videos.com', href: 'https://www.example-videos.com/' });
    const videoCard = dom.makeElement('div', { class: 'video-card' }, [
      dom.makeElement('a', { href: 'https://www.example-videos.com/video/item987' }, [
        dom.makeElement('img', { src: 'preview.jpg', width: 300, height: 170 }),
        dom.makeElement('span', { class: 'duration', textContent: '05:20' })
      ])
    ]);
    dom.body.appendChild(videoCard);

    const utilsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'utils.js'), 'utf8');
    const visualMountSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'visual_mount.js'), 'utf8');
    const watcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'watcher.js'), 'utf8');

    const context = vm.createContext({
      document: dom.document,
      window: dom.window,
      URL,
      OverlayUiRenderer: { getStyles() { return ''; }, renderFormatDropdown() {} },
      FormatRegistryEngine: { fetchMediaFormats() {} },
      setTimeout,
      clearTimeout
    });

    vm.runInContext(`${utilsSource}\n${visualMountSource}\n${watcherSource}\nthis.MediaWatcher = MediaWatcher;\nthis.VisualMountDetector = VisualMountDetector;\nthis.SmartDmUtils = SmartDmUtils;`, context);
    const watcher = context.MediaWatcher;
    const detector = context.VisualMountDetector;

    assert.equal(detector.isLegitimateThumbnailCard(videoCard), true);

    watcher.scanThumbnails();
    assert.equal(videoCard.getAttribute('data-smartdm-thumb-attached'), 'true');
    assert.equal(dom.hostsCreated.length, 1);
  });
}

function createDOM(windowLocation) {
  function matchSingle(node, sel) {
    sel = sel.trim();
    if (!sel) return false;
    const nonAttr = sel.replace(/\[[^\]]*\]/g, '');
    const tagMatch = nonAttr.match(/^[a-zA-Z0-9_-]+/);
    if (tagMatch) {
      if ((node.tagName || '').toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    }
    const classMatches = Array.from(nonAttr.matchAll(/\.([a-zA-Z0-9_-]+)/g));
    for (const cm of classMatches) {
      if (!node.classList?.contains(cm[1])) return false;
    }
    const idMatch = nonAttr.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      if (node.getAttribute?.('id') !== idMatch[1]) return false;
    }
    const attrRegex = /\[([a-zA-Z0-9_-]+)(?:([*~|^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?(\s+i)?\]/g;
    let am;
    while ((am = attrRegex.exec(sel)) !== null) {
      const attrName = am[1];
      const op = am[2];
      const expectedRaw = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : (am[5] !== undefined ? am[5] : ''));
      const isCaseInsensitive = !!am[6];
      const actualRaw = node.getAttribute?.(attrName);
      if (actualRaw === null || actualRaw === undefined) return false;
      if (!op) continue;
      const actual = isCaseInsensitive ? actualRaw.toLowerCase() : actualRaw;
      const expected = isCaseInsensitive ? expectedRaw.toLowerCase() : expectedRaw;
      if (op === '=' && actual !== expected) return false;
      if (op === '*=' && !actual.includes(expected)) return false;
      if (op === '^=' && !actual.startsWith(expected)) return false;
      if (op === '$=' && !actual.endsWith(expected)) return false;
    }
    return true;
  }

  function matches(node, selector) {
    if (!node || typeof node !== 'object') return false;
    const parts = selector.split(/,(?![^[]*\])/);
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      const segs = part.split(/\s+(?![^[]*\])/).filter(Boolean);
      if (segs.length > 1) {
        let curr = node;
        let matched = true;
        for (let i = segs.length - 1; i >= 0; i--) {
          if (!curr || !matchSingle(curr, segs[i])) {
            matched = false;
            break;
          }
          curr = curr.parentElement;
        }
        if (matched) return true;
      } else {
        if (matchSingle(node, segs[0])) return true;
      }
    }
    return false;
  }

  function queryAll(root, selector) {
    const list = [];
    function walk(node) {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (matches(child, selector)) list.push(child);
        walk(child);
      }
    }
    walk(root);
    return list;
  }

  const hostsCreated = [];

  function makeElement(tag, attrs = {}, children = []) {
    const classes = new Set((attrs.className || attrs.class || '').split(/\s+/).filter(Boolean));
    const attrMap = { ...attrs };
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      children: [],
      parentElement: null,
      parentNode: null,
      isConnected: true,
      href: attrs.href || '',
      textContent: attrs.textContent || '',
      offsetWidth: attrs.width !== undefined ? attrs.width : 200,
      offsetHeight: attrs.height !== undefined ? attrs.height : 120,
      naturalWidth: attrs.width !== undefined ? attrs.width : 200,
      naturalHeight: attrs.height !== undefined ? attrs.height : 120,
      clientHeight: attrs.height !== undefined ? attrs.height : 120,
      clientWidth: attrs.width !== undefined ? attrs.width : 200,
      getAttribute(name) {
        if (name === 'class') return Array.from(classes).join(' ');
        if (name === 'href') return this.href;
        return attrMap[name] !== undefined ? attrMap[name] : null;
      },
      setAttribute(name, val) {
        attrMap[name] = String(val);
        if (name === 'class') {
          classes.clear();
          String(val).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
        }
        if (name === 'href') this.href = String(val);
      },
      hasAttribute(name) { return name in attrMap; },
      removeAttribute(name) { delete attrMap[name]; },
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); },
        toggle(c) { classes.has(c) ? classes.delete(c) : classes.add(c); }
      },
      addEventListener() {},
      getBoundingClientRect() {
        const w = attrs.width !== undefined ? attrs.width : 200;
        const h = attrs.height !== undefined ? attrs.height : 120;
        return { width: w, height: h, top: 100, bottom: 100 + h, left: 100, right: 100 + w };
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector(sel) {
        return queryAll(this, sel)[0] || null;
      },
      querySelectorAll(sel) {
        return queryAll(this, sel);
      },
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        child.parentNode = this;
        return child;
      }
    };
    Object.defineProperty(el, 'className', {
      get() { return Array.from(classes).join(' '); },
      set(v) {
        classes.clear();
        String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    });
    for (const c of children) {
      el.appendChild(c);
    }
    return el;
  }

  const body = makeElement('body');
  const documentMock = {
    body,
    createElement(tag) {
      if (tag === 'button') {
        return { addEventListener() {}, setAttribute() {}, getAttribute() { return null; } };
      }
      const host = makeElement(tag);

      host.attachShadow = function() {
        this.shadowRoot = {
          innerHTML: '',
          querySelector() { return { addEventListener() {}, classList: { contains: () => false, add() {}, remove() {} }, style: {} }; }
        };
        return this.shadowRoot;
      };
      hostsCreated.push(host);
      return host;
    },
    querySelector(sel) {
      return queryAll(body, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(body, sel);
    }
  };

  const windowMock = {
    innerWidth: 1200,
    innerHeight: 800,
    location: {
      hostname: windowLocation.hostname || 'localhost',
      pathname: windowLocation.pathname || '/',
      href: windowLocation.href || 'http://localhost/',
      origin: windowLocation.origin || 'http://localhost'
    },
    top: windowLocation.top !== undefined ? windowLocation.top : null,
    self: windowLocation.self !== undefined ? windowLocation.self : null,
    getComputedStyle() { return { position: 'relative' }; }
  };
  if (windowMock.top === null && windowMock.self === null) {
    windowMock.top = windowMock;
    windowMock.self = windowMock;
  }

  return { document: documentMock, window: windowMock, body, makeElement, hostsCreated };
}

