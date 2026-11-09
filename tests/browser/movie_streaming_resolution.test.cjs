const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: SmartDmUtils.sanitizeCleanTitle cleans movie boilerplate and SEO spam while preserving Free Guy`, () => {
    const c = vm.createContext({ URL });
    const code = fs.readFileSync(`extensions/${browser}/modules/utils.js`, 'utf8');
    vm.runInContext(`${code}\nthis.SmartDmUtils = SmartDmUtils;`, c);
    const utils = c.SmartDmUtils;

    assert.equal(
      utils.sanitizeCleanTitle('The Musical - RamoFlix - Unlimited Movies & TV Shows Online.mp4'),
      'The Musical'
    );
    assert.equal(
      utils.sanitizeCleanTitle('Stream Resident Evil (2026) Online Free Watch Full Now HD - HydraHD.mp4'),
      'Resident Evil (2026)'
    );
    assert.equal(
      utils.sanitizeCleanTitle('Watch Klara and the Sun (2026) Full Movie HD - Wmovies'),
      'Klara and the Sun (2026)'
    );
    assert.equal(
      utils.sanitizeCleanTitle('Runner (2026) Online Free Watch Full Now HD - Goojara'),
      'Runner (2026)'
    );
    assert.equal(
      utils.sanitizeCleanTitle('Free Guy (2021)'),
      'Free Guy (2021)'
    );
  });

  test(`${browser}: MediaWatcher.isPlayerIframe identifies movie streaming iframes`, () => {
    const c = vm.createContext({ URL, window: { location: { pathname: '/watch/movie' } } });
    const code = fs.readFileSync(`extensions/${browser}/modules/watcher.js`, 'utf8');
    vm.runInContext(`${code}\nthis.MediaWatcher = MediaWatcher;`, c);
    const mw = c.MediaWatcher;

    const ifrJabroni = {
      tagName: 'IFRAME',
      src: 'https://drw.jabroni.mov/embed/runner',
      getAttribute(name) { return name === 'src' ? this.src : null; }
    };
    assert.equal(mw.isPlayerIframe(ifrJabroni), true);

    const ifrGoldenkite = {
      tagName: 'IFRAME',
      src: 'https://moon.goldenkite.top/player/the-musical',
      getAttribute(name) { return name === 'src' ? this.src : null; }
    };
    assert.equal(mw.isPlayerIframe(ifrGoldenkite), true);
  });

  test(`${browser}: FormatRegistryEngine.extractInPageMovieStreams detects script, iframe query params, and packed streams before playback`, () => {
    const fakeScripts = [
      { textContent: 'jwplayer("player").setup({ file: "https://moon.goldenkite.top/stream/the-musical.m3u8" });' }
    ];
    const fakeIframes = [
      {
        src: 'https://player.example.com/embed?file=https%3A%2F%2Fstellarconductornexus.com%2Fhls%2Fresident-evil.m3u8',
        getAttribute(name) { return name === 'src' ? this.src : null; }
      }
    ];
    const c = vm.createContext({
      URL,
      window: { location: { href: 'https://wmovies.nl/klara-and-the-sun/' } },
      document: {
        querySelectorAll(sel) {
          if (sel === 'video') return [];
          if (sel === 'script') return fakeScripts;
          if (sel === 'iframe') return fakeIframes;
          return [];
        }
      }
    });

    const utilsCode = fs.readFileSync(`extensions/${browser}/modules/utils.js`, 'utf8');
    const fmtCode = fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8');
    vm.runInContext(`${utilsCode}\nthis.SmartDmUtils = SmartDmUtils;\n${fmtCode}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, c);
    const fe = c.FormatRegistryEngine;

    const streams = fe.extractInPageMovieStreams(null, 'Klara and the Sun (2026)');
    assert.ok(streams.length >= 2);
    assert.ok(streams.some(s => s.url === 'https://moon.goldenkite.top/stream/the-musical.m3u8'));
    assert.ok(streams.some(s => s.url === 'https://stellarconductornexus.com/hls/resident-evil.m3u8'));
  });

  test(`${browser}: background.js getAnimeCdnDefaultReferer resolves movie streaming CDNs`, () => {
    const chromeMock = {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
        lastError: null
      },
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} }
      },
      contextMenus: { create() {}, onClicked: { addListener() {} } },
      action: { onClicked: { addListener() {} } },
      downloads: { onCreated: { addListener() {} }, onDeterminingFilename: { addListener() {} } },
      webRequest: {
        onSendHeaders: { addListener() {} },
        onHeadersReceived: { addListener() {} }
      }
    };
    const c = vm.createContext({ URL, chrome: chromeMock, browser: chromeMock, console });
    const bgCode = fs.readFileSync(`extensions/${browser}/background.js`, 'utf8');
    vm.runInContext(`${bgCode}\nthis.getAnimeCdnDefaultReferer = getAnimeCdnDefaultReferer;`, c);
    const getRef = c.getAnimeCdnDefaultReferer;

    assert.equal(getRef('https://drw.jabroni.mov/media/stream.ts', null), 'https://ww1.goojara.to/');
    assert.equal(getRef('https://stellarconductornexus.com/hls/master.m3u8', null), 'https://hydrahd.gd/');
    assert.equal(getRef('https://moon.goldenkite.top/stream/index.m3u8', null), 'https://ramoflix.net/');
    assert.equal(getRef('https://wmovies.nl/stream.m3u8', null), 'https://wmovies.nl/');
  });
}
