const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real badge mount and renderer together: the previous fixtures
// replaced getStyles() with an empty string, hiding an unstyled native button.
function mountedBadge(browser, adopted) {
  const sheetTexts = [];
  const button = {addEventListener() {}};
  const popover = {style: {}, classList: {contains() {return false;}}};
  const shadow = {
    innerHTML: '',
    querySelector(selector) {
      return {'.thumb-btn': button, '.popover': popover, '.popover-content': {}}[selector];
    }
  };
  if (adopted) shadow.adoptedStyleSheets = [];
  const host = {style: {}, addEventListener() {}, attachShadow() {return shadow;}};
  const mount = {
    style: {},
    appendChild(node) {node.parentNode = this;},
    getBoundingClientRect() {return {left: 30, right: 478, top: 20, bottom: 272, width: 448, height: 252};}
  };
  const context = vm.createContext({
    document: {createElement() {return host;}, body: {appendChild() {}}},
    window: {location: {hostname: 'www.youtube.com'}, getComputedStyle() {return {position: 'relative'};}},
    CSSStyleSheet: class {replaceSync(css) {sheetTexts.push(css);}},
    setTimeout, clearTimeout
  });
  for (const [file, name] of [['overlay_ui.js', 'OverlayUiRenderer'], ['watcher.js', 'MediaWatcher']])
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
  context.MediaWatcher.attachThumbnailBadge(mount, 'https://www.youtube.com/watch?v=selected', 'Selected video');
  const tag = shadow.innerHTML.match(/<button\b[^>]*>/)?.[0];
  assert.ok(tag, 'the thumbnail mount must create its control');
  const classes = new Set(tag.match(/class="([^"]+)"/)[1].split(/\s+/));
  const css = adopted ? sheetTexts.join('\n') : shadow.innerHTML.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(css, 'the mounted shadow root must receive the real stylesheet');
  return {tag, classes, css, shadow, sheetTexts};
}

function baseDeclarations(css, classes) {
  const result = {};
  for (const [, selectorList, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const matches = selectorList.split(',').some(selector => {
      selector = selector.trim();
      return /^(\.[\w-]+)+$/.test(selector) && selector.slice(1).split('.').every(name => classes.has(name));
    });
    if (!matches) continue;
    for (const declaration of body.split(';')) {
      const pair = declaration.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (pair) result[pair[1]] = pair[2];
    }
  }
  return result;
}

for (const browser of ['chrome', 'firefox']) {
  for (const adopted of [true, false]) {
    test(`${browser}: thumbnail control receives its dark button styling through ${adopted ? 'shared CSS' : 'inline CSS fallback'}`, () => {
      const mounted = mountedBadge(browser, adopted);
      const style = baseDeclarations(mounted.css, mounted.classes);
      assert.match(style.background || '', /color-mix.*--sdm-button-opacity/);
      assert.equal(style.display, 'flex');
      assert.equal(style.cursor, 'grab');
      assert.equal(style['touch-action'], 'none');
      assert.equal(style['font-size'], '11px');
      assert.match(style.font || '', /Segoe UI/);
      assert.equal(style.border, '0');
      assert.match(mounted.tag, /type="button"/);
      assert.ok(mounted.classes.has('thumb-btn'), 'keep the existing thumbnail listener selector');
      if (adopted) {
        assert.equal(mounted.shadow.adoptedStyleSheets.length, 1);
        assert.equal(mounted.sheetTexts.length, 1);
      }
    });
  }
}
