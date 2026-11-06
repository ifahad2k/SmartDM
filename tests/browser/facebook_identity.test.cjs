const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser} Facebook formats require the selected Reel identity`, () => {
    let media = [];
    const runtime = {
      sendMessage(request, callback) {
        assert.equal(request.type, 'GET_DETECTED_MEDIA');
        callback({ media });
      }
    };
    const context = vm.createContext({
      window: { location: { hostname: 'www.facebook.com', pathname: '/reel/222', href: 'https://www.facebook.com/reel/222' } },
      chrome: { runtime },
      SmartDmUtils: {
        getMediaCacheKey(url) { return url; },
        isGenericTitle() { return true; },
        extractWatchPageTitle() { return 'facebook_video'; },
        isFacebookAudioStream(url, contentType, isAudio) { return !!isAudio; },
        isFacebookVideoStream(url, contentType, isVideo) { return !!isVideo; }
      },
      VisualMountDetector: { extractFacebookMediaTitle() { return 'Selected Reel'; } },
      Date,
      URL,
      setTimeout,
      clearTimeout
    });
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'modules', 'format_engine.js'), 'utf8');
    vm.runInContext(`${source}\nthis.FormatRegistryEngine = FormatRegistryEngine;`, context);
    const engine = context.FormatRegistryEngine;
    let result;
    media = [{ url: 'https://video.xx.fbcdn.net/other.mp4', isVideo: true, pageReelId: '111', timestamp: Date.now() }];
    engine.buildFallbackFormats('https://www.facebook.com/reel/222', null, value => { result = value; });
    assert.equal(result.success, false);
    assert.equal(result.formats, undefined);
    let callbackCount = 0;
    engine.fetchMediaFormats('https://www.facebook.com/reel/222', null, value => {
      callbackCount++;
      result = value;
    });
    assert.equal(callbackCount, 1);
    assert.equal(result.success, false);

    media = [{ url: 'https://video.xx.fbcdn.net/selected.mp4', isVideo: true, pageReelId: '222', timestamp: Date.now() }];
    engine.buildFallbackFormats('https://www.facebook.com/reel/222', null, value => { result = value; });
    assert.equal(result.success, true);
    assert.ok(result.formats.every(item => item.url.includes('selected.mp4')));
  });
}
