const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {backgroundBundle, build} = require('../../tools/build-extensions.cjs');

test('both browser packages contain the current shared background implementation', () => {
  assert.doesNotThrow(() => build(true));
  new vm.Script(backgroundBundle());
});

test('manifest parsing works without browser event wiring or desktop services', () => {
  const context = vm.createContext({URL, console});
  for (const name of ['metadata.js', 'manifest_parsers.js'])
    vm.runInContext(fs.readFileSync(`extensions/shared/background/${name}`, 'utf8'), context);
  const formats = context.parseM3u8Formats('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,AUDIO="a"\nvideo.m3u8', 'https://cdn.invalid/master.m3u8');
  assert.equal(formats.length, 1);
  assert.equal(formats[0].audioUrl, 'https://cdn.invalid/audio.m3u8');
  assert.equal(formats[0].height, 1080);
});

test('the tab cache keeps separate HLS sources at the same quality and removes only exact duplicates', () => {
  const context = vm.createContext({isGenericTitle: () => false});
  const runtime = fs.readFileSync('extensions/shared/background/runtime.js', 'utf8');
  vm.runInContext(runtime.slice(runtime.indexOf('function pushToMediaList'), runtime.indexOf('function pushToMediaList') + runtime.slice(runtime.indexOf('function pushToMediaList')).indexOf('\n}\n') + 2), context);
  for (const height of [0, 1080]) {
    const list = [];
    const newItem = url => ({url, contentType:'application/x-mpegurl', height});
    context.pushToMediaList(list, newItem('https://cdn.invalid/preview.m3u8'));
    context.pushToMediaList(list, newItem('https://cdn.invalid/movie.m3u8'));
    context.pushToMediaList(list, newItem('https://cdn.invalid/movie.m3u8'));
    assert.deepEqual(list.map(item => item.url), ['https://cdn.invalid/preview.m3u8', 'https://cdn.invalid/movie.m3u8']);
  }
});
