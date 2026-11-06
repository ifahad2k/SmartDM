const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser} media download reports desktop acknowledgement and failure`, () => {
    let dispatch;
    let sent;
    let reply = { success: true, status: 'ok' };
    const runtime = {
      lastError: null,
      onMessage: { addListener() {} },
      sendMessage(message, callback) { sent = message; callback(reply); }
    };
    const window = {
      location: { href: 'https://www.facebook.com/reel/123', origin: 'https://www.facebook.com', hostname: 'www.facebook.com' },
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    };
    window.top = window.self = window;
    const document = {
      readyState: 'complete',
      documentElement: { hasAttribute() { return true; } },
      referrer: '',
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };
    const context = vm.createContext({
      window, document, chrome: { runtime },
      FormatRegistryEngine: { drainStashedManifests() {} },
      MediaWatcher: { init(handler) { dispatch = handler; } },
      SmartDmUtils: { isGenericTitle() { return false; } },
      setTimeout, clearTimeout
    });
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'smartdm_overlay.js'), 'utf8');
    vm.runInContext(source, context);
    assert.equal(typeof dispatch, 'function');

    const format = { formatId: 'hd', url: 'https://cdn.example/video.mp4', ext: 'mp4', mediaKind: 'hls', manifestText: '#EXTM3U\n#EXTINF:6,\npart.ts\n#EXT-X-ENDLIST' };
    let result;
    dispatch([format], format, 'Video', value => { result = value; });
    assert.equal(sent.type, 'START_MEDIA_DOWNLOAD');
    assert.equal(sent.formats[0].mediaKind, 'hls');
    assert.equal(sent.formats[0].manifestText, format.manifestText);
    assert.equal(result.success, true);

    const mse = {formatId: 'selected-mse', directUrl: 'https://cdn.example/selected.m4s', ext: 'mp4'};
    dispatch([mse], mse, 'Selected video', value => { result = value; });
    assert.equal(sent.url, mse.directUrl);
    assert.equal(sent.formatId, mse.formatId);
    sent = null;
    const page = {formatId: 'bad-page', url: window.location.href};
    dispatch([page], page, 'Video', value => { result = value; });
    assert.equal(sent, null);
    assert.equal(result.success, false);

    runtime.lastError = { message: 'disconnected' };
    reply = undefined;
    dispatch([format], format, 'Video', value => { result = value; });
    assert.equal(result.success, false);
  });
}
