const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {randomFillSync} = require('node:crypto');

for (const browser of ['chrome', 'firefox']) {
  function fixture() {
    const players = [];
    class Response {
      constructor(url, data, type = 'video/mp4', total = 20000000) {
        this.url = url; this.data = data;
        this.status = 206;
        this.headers = {get: key => key === 'content-type' ? type : key === 'content-range' ? `bytes 0-${data.byteLength - 1}/${total}` : key === 'content-length' ? String(total) : null};
      }
      arrayBuffer() {return Promise.resolve(this.data);}
      get body() {return this.stream ??= new ReadableStream(this.data);}
    }
    class ReadableStreamDefaultReader {
      constructor(data) {this.data = data;}
      read() {return Promise.resolve({done: false, value: new Uint8Array(this.data)});}
    }
    class ReadableStream {constructor(data) {this.data = data;} getReader() {return new ReadableStreamDefaultReader(this.data);}}
    class SourceBuffer {appendBuffer(bytes) {this.lastBytes = bytes;}}
    class MediaSource {addSourceBuffer() {return new SourceBuffer();}}
    let next = 0;
    const url = {createObjectURL: () => 'blob:player-' + ++next};
    const root = {setAttribute() {}};
    const document = {documentElement: root, querySelectorAll: () => players};
    const window = {location: {hostname: 'player.invalid'}}; window.top = window.self = window;
    class Xhr {open() {} send() {}}
    const c = vm.createContext({window, document, Response, SourceBuffer, MediaSource, URL: url, XMLHttpRequest: Xhr,
      ReadableStream, ReadableStreamDefaultReader});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`, 'utf8'), c);
    const copy = vm.runInContext(`(bytes, padding = 0) => {
      const output = new Uint8Array(bytes.byteLength + padding);
      output.set(bytes, padding);
      return output.slice();
    }`, c);
    const join = vm.runInContext(`(...parts) => {
      const output = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
      let offset = 0;
      for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
      return output;
    }`, c);
    function player() {
      const attrs = new Map(), source = new MediaSource();
      const el = {currentSrc: url.createObjectURL(source), getAttribute: name => attrs.get(name),
        setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name)};
      players.push(el);
      return {el, source};
    }
    return {player, Response, copy, join};
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

  test(`${browser}: streamed range survives player copies and remux headers without borrowing prefetched media`, async () => {
    const f = fixture(), a = f.player(), b = f.player();
    const video = a.source.addSourceBuffer('video/mp4'), audio = a.source.addSourceBuffer('audio/mp4');
    const other = b.source.addSourceBuffer('video/mp4');
    const read = async (url, type = 'video/mp4') => (await new f.Response(url, new ArrayBuffer(1024), type).body.getReader().read()).value;
    const selected = await read('https://cdn.invalid/selected-video');
    const later = await read('https://cdn.invalid/prefetched-video');
    const sound = await read('https://cdn.invalid/selected-audio', 'audio/mp4');
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    video.appendBuffer(f.copy(f.copy(selected), 24));
    audio.appendBuffer(f.copy(sound, 16));
    other.appendBuffer(f.copy(later));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/selected-video');
    assert.equal(a.el.getAttribute('data-smartdm-audio-url'), 'https://cdn.invalid/selected-audio');
    assert.equal(b.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/prefetched-video');
  });

  test(`${browser}: unknown overwrite clears copied provenance and an unrelated subview cannot bind`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const data = await new f.Response('https://cdn.invalid/selected-video', new ArrayBuffer(1024)).arrayBuffer();
    const copy = f.copy(new Uint8Array(data), 64);
    buffer.appendBuffer(copy.subarray(0, 64));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    copy.set(new Uint8Array(copy.byteLength));
    buffer.appendBuffer(copy);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  test(`${browser}: mixed-source append clears an old binding rather than selecting the last network request`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const read = async name => new Uint8Array(await new f.Response('https://cdn.invalid/' + name, new ArrayBuffer(1024)).arrayBuffer());
    const first = await read('first'), second = await read('second');
    buffer.appendBuffer(f.copy(first));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/first');
    buffer.appendBuffer(f.join(first, second));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  test(`${browser}: range checks survive streaming, pool clearing and audio being attached after video`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const incomplete = new f.Response('https://cdn.invalid/fragment', new ArrayBuffer(1024), 'video/mp4', 1024);
    buffer.appendBuffer(f.copy((await incomplete.body.getReader().read()).value));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    const bytes = f.copy((await new f.Response('https://cdn.invalid/selected', new ArrayBuffer(1024)).body.getReader().read()).value);
    buffer.appendBuffer(bytes);
    assert.equal(a.el.getAttribute('data-smartdm-separate-audio'), '0');
    a.source.addSourceBuffer('audio/mp4');
    assert.equal(a.el.getAttribute('data-smartdm-separate-audio'), '1');
    bytes.fill(0);
    buffer.appendBuffer(bytes);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  test(`${browser}: provenance fanout is bounded and overflowing a buffer cannot resurrect a stale source`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const parts = [];
    for (let i = 0; i < 40; i++) parts.push(new Uint8Array(await new f.Response('https://cdn.invalid/' + i, new ArrayBuffer(1024)).arrayBuffer()));
    const mixed = f.join(...parts);
    buffer.appendBuffer(mixed);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    mixed.set(parts[0]);
    buffer.appendBuffer(mixed);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  function remux(payload) {
    // A new allocation mimics a worker boundary: no WeakMap identity or wrapped
    // typed-array copy survives. The compressed mdat payload itself is unchanged.
    const output = new Uint8Array(payload.byteLength + 8);
    new DataView(output.buffer).setUint32(0, output.byteLength);
    output.set([109, 100, 97, 116], 4); output.set(new Uint8Array(payload), 8);
    return output;
  }

  test(`${browser}: exact payload samples bind remuxed worker output when Content-Range is hidden`, async () => {
    const f = fixture(), a = f.player(), b = f.player();
    const first = randomFillSync(new Uint8Array(32768)).buffer, later = randomFillSync(new Uint8Array(32768)).buffer;
    const response = new f.Response('https://cdn.invalid/current', first);
    const headers = response.headers.get; response.headers.get = key => key === 'content-range' ? null : headers(key);
    await response.body.getReader().read();
    await new f.Response('https://cdn.invalid/prefetch', later).body.getReader().read();
    a.source.addSourceBuffer('video/mp4').appendBuffer(remux(first));
    b.source.addSourceBuffer('video/mp4').appendBuffer(remux(later));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/current');
    assert.equal(b.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/prefetch');
  });

  test(`${browser}: prefetch does not evict initial evidence and a new initialization clears the old session`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const first = randomFillSync(new Uint8Array(32768)).buffer;
    await new f.Response('https://cdn.invalid/current', first).body.getReader().read();
    // The full file can reach the player before it appends its initial fragment.
    for (let i = 0; i < 30; i++) await new f.Response('https://cdn.invalid/current', randomFillSync(new Uint8Array(32768)).buffer).body.getReader().read();
    buffer.appendBuffer(remux(first));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/current');
    buffer.appendBuffer(remux(randomFillSync(new Uint8Array(4096)).buffer));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), 'https://cdn.invalid/current');
    const init = remux(first); init.set([109, 111, 111, 118], 4);
    buffer.appendBuffer(init);
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
  });

  test(`${browser}: sample resource eviction, short matches and ordinary copy errors fail closed`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const first = randomFillSync(new Uint8Array(32768)).buffer;
    await new f.Response('https://cdn.invalid/current', first).body.getReader().read();
    buffer.appendBuffer(remux(first.slice(0, 32)));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    for (let i = 0; i < 16; i++) await new f.Response('https://cdn.invalid/prefetch-' + i, randomFillSync(new Uint8Array(4096)).buffer).body.getReader().read();
    buffer.appendBuffer(remux(first));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    const bytes = f.copy(new Uint8Array(16));
    assert.throws(() => bytes.set(new Uint8Array(32)), {name: 'RangeError'});
  });

  test(`${browser}: codec headers, a single sample, small fragments and ambiguous payloads never identify a stream`, async () => {
    const f = fixture(), a = f.player(), buffer = a.source.addSourceBuffer('video/mp4');
    const first = randomFillSync(new Uint8Array(4096)).buffer;
    await new f.Response('https://cdn.invalid/a', first).body.getReader().read();
    await new f.Response('https://cdn.invalid/b', first).body.getReader().read();
    buffer.appendBuffer(remux(first));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    const fragment = randomFillSync(new Uint8Array(4096)).buffer;
    await new f.Response('https://cdn.invalid/chunk.m4s', fragment).body.getReader().read();
    buffer.appendBuffer(remux(fragment));
    assert.equal(a.el.getAttribute('data-smartdm-video-url'), undefined);
    const init = remux(first); init.set([109, 111, 111, 118], 4); // moov, not mdat
    buffer.appendBuffer(init);
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
