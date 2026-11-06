const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  function fixture() {
    const players = [];
    class Response {
      constructor(url, data, type = 'video/mp4', total = 20000000) {
        this.url = url; this.data = data;
        this.headers = {get: key => key === 'content-type' ? type : key === 'content-range' ? `bytes 0-${data.byteLength - 1}/${total}` : null};
      }
      arrayBuffer() {return Promise.resolve(this.data);}
    }
    class SourceBuffer {appendBuffer(bytes) {this.lastBytes = bytes;}}
    class MediaSource {addSourceBuffer() {return new SourceBuffer();}}
    let next = 0;
    const url = {createObjectURL: () => 'blob:player-' + ++next};
    const root = {setAttribute() {}};
    const document = {documentElement: root, querySelectorAll: () => players};
    const window = {location: {hostname: 'player.invalid'}}; window.top = window.self = window;
    class Xhr {open() {} send() {}}
    const c = vm.createContext({window, document, Response, SourceBuffer, MediaSource, URL: url, XMLHttpRequest: Xhr});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`, 'utf8'), c);
    function player() {
      const attrs = new Map(), source = new MediaSource();
      const el = {currentSrc: url.createObjectURL(source), getAttribute: name => attrs.get(name),
        setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name)};
      players.push(el);
      return {el, source};
    }
    return {player, Response};
  }

  test(`${browser}: MSE binds only appended response bytes to their own player with audio`, async () => {
    const f = fixture(), a = f.player(), b = f.player();
    const av = a.source.addSourceBuffer('video/mp4'), aa = a.source.addSourceBuffer('audio/mp4');
    const bv = b.source.addSourceBuffer('video/mp4');
    const current = new ArrayBuffer(1024), later = new ArrayBuffer(1024), audio = new ArrayBuffer(1024);
    await new f.Response('https://cdn.invalid/selected-video.m4s', current).arrayBuffer();
    await new f.Response('https://cdn.invalid/later-video.m4s', later).arrayBuffer();
    await new f.Response('https://cdn.invalid/selected-audio.m4s', audio, 'audio/mp4').arrayBuffer();
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    av.appendBuffer(new Uint8Array(current));
    assert.equal(av.lastBytes.buffer, current);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/selected-video.m4s');
    assert.equal(a.el.getAttribute('data-smartdm-separate-audio'), '1');
    assert.equal(b.el.getAttribute('data-smartdm-video-url'), undefined);
    bv.appendBuffer(later);
    aa.appendBuffer(audio);
    assert.equal(a.el.getAttribute('data-smartdm-audio-url'), 'https://cdn.invalid/selected-audio.m4s');
    assert.equal(b.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/later-video.m4s');
    assert.equal(a.el.getAttribute('data-smartdm-bound-src'), a.el.currentSrc);
  });

  test(`${browser}: MSE ignores isolated initialization/fragments and unknown transformed buffers`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const init = new ArrayBuffer(128);
    await new f.Response('https://cdn.invalid/init.mp4', init, 'video/mp4', init.byteLength).arrayBuffer();
    buffer.appendBuffer(init);
    buffer.appendBuffer(new ArrayBuffer(1024));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    const fragment = new ArrayBuffer(2000000);
    await new f.Response('https://cdn.invalid/segment.m4s', fragment, 'video/mp4', fragment.byteLength).arrayBuffer();
    buffer.appendBuffer(fragment);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  test(`${browser}: recycled blob binding is rejected and missing separate audio cannot become silent output`, () => {
    const window = {location: {hostname: 'tiktok.com'}};
    const c = vm.createContext({window, SmartDmUtils: {sanitizeCleanTitle: x => x}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8') + '\nthis.Engine=FormatRegistryEngine;', c);
    const attrs = {'data-smartdm-bound-src': 'blob:first', 'data-smartdm-video-url': 'https://cdn.invalid/selected.mp4', 'data-smartdm-separate-audio': '1'};
    const player = {currentSrc: 'blob:first', videoWidth: 1920, videoHeight: 1080, getAttribute: key => attrs[key]};
    assert.equal(c.Engine.selectedSocialFormats(player, []).length, 0);
    attrs['data-smartdm-audio-url'] = 'https://cdn.invalid/audio.m4a';
    assert.equal(c.Engine.selectedSocialFormats(player, [])[0].audioUrl, 'https://cdn.invalid/audio.m4a');
    player.currentSrc = 'blob:second';
    assert.equal(c.Engine.playerBinding(player), null);
    assert.equal(c.Engine.selectedSocialFormats(player, []).length, 0);
    assert.equal(c.Engine.mediaExtension('https://cdn.invalid/video.random-token', 'application/x-mpegurl'), 'm3u8');
    assert.equal(c.Engine.mediaExtension('https://cdn.invalid/video.random-token', 'video/mp4'), 'mp4');
  });
}
