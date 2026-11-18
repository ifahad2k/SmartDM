const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const browser of ['chrome','firefox']) {
  function fixture(extra = {}) {
    const nodes=[],captured=[];
    const node=()=>({attrs:{},style:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;},remove(){nodes.splice(nodes.indexOf(this),1);}});
    const root={setAttribute(){},querySelector(s){return nodes.find(n=>s.includes(n.attrs['data-smartdm-url']))||null;},querySelectorAll(){return nodes;},appendChild(n){nodes.push(n);}};
    const document={head:root,documentElement:root,createElement:node,querySelectorAll(){return [...nodes];}};
    const window={location:{href:'https://player.invalid/e/1',hostname:'player.invalid'},dispatchEvent(e){captured.push(e.detail);}};
    window.top=window.self=window;
    const context=vm.createContext({window,document,CSS:{escape:s=>s},XMLHttpRequest:function(){},CustomEvent:function(_,options){this.detail=options.detail;},...extra});
    context.XMLHttpRequest.prototype.open=function(){};context.XMLHttpRequest.prototype.send=function(){};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`,'utf8'),context);
    class Hls {
      static Events={LEVEL_LOADED:'level',MEDIA_ATTACHED:'attached',MANIFEST_LOADING:'loading',DESTROYING:'destroy',MANIFEST_PARSED:'parsed',AUDIO_TRACK_LOADED:'audio',AUDIO_TRACKS_UPDATED:'tracks'};
      constructor(){this.listeners={};}
      on(e,f){this.listeners[e]=f;}
      emit(e,data){this.listeners[e]?.(e,data);}
    }
    window.Hls=Hls;
    const player=()=>Object.assign(node(),{isConnected:true,videoHeight:1080});
    return {window,document,nodes,player,captured};
  }
  const manifest='#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST';
  test(`${browser}: captures the playlist the player reads from an opaque successful response`, async () => {
    class PlayerResponse {
      constructor(url, body, ok) {Object.assign(this, {url, body, ok});}
      async text() {return this.body;}
    }
    const f = fixture({Response: PlayerResponse});
    const url = 'https://cdn.invalid/a383d917';
    const incomplete = manifest.replace('#EXT-X-ENDLIST', '');
    assert.equal(await new PlayerResponse(url, incomplete, true).text(), incomplete);
    assert.equal(await new PlayerResponse(url, manifest, true).text(), manifest);
    assert.equal(f.nodes.length, 1);
    assert.equal(f.nodes[0].getAttribute('data-smartdm-url'), url);
    assert.equal(f.nodes[0].textContent, manifest);
    await new PlayerResponse('https://cdn.invalid/denied', manifest, false).text();
    assert.equal(f.nodes.length, 1);
  });
  const movieManifest = '#EXTM3U\n' + Array.from({length: 974}, (_, i) =>
    `#EXTINF:6,\nhttps://cdn.invalid/${i}.m4s?token=${'s'.repeat(700)}\n`).join('') + '#EXT-X-ENDLIST';
  test(`${browser}: long movie playlist stays bound to the selected player through discovery`, () => {
    assert.ok(movieManifest.length > 700000);
    const f=fixture(),h=new f.window.Hls(); h.media=f.player(); h.emit('attached');
    h.emit('level',{details:{url:'https://cdn.invalid/movie/v1.m3u8',m3u8:movieManifest,live:false},levelInfo:{height:1080}});
    const c=vm.createContext({window:f.window,document:f.document,SmartDmUtils:{extractWatchPageTitle:()=> 'Movie'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    assert.ok(c.Engine.capturedPlayerFormats(h.media), 'the playing movie must have a retained playlist');
    let result; c.Engine.fetchMediaFormats('https://page.invalid/movie',h.media,r=>{result=r;});
    assert.equal(result?.formats[0].manifestText,movieManifest);
    assert.equal(result.formats[0].directUrl,'https://cdn.invalid/movie/v1.m3u8');
    assert.equal(result.formats[0].mediaKind,'hls');
    assert.equal(f.captured[0].text,null); // Retain one DOM snapshot, not another event copy.
  });
  test(`${browser}: large captures remain bounded by size and total retained characters`, () => {
    const f=fixture();
    const emit=(id,text)=>{
      const h=new f.window.Hls(); h.media=f.player(); h.emit('attached');
      h.emit('level',{details:{url:`https://cdn.invalid/${id}.m3u8`,m3u8:text,live:false},levelInfo:{height:1080}});
    };
    const large=manifest+'\n#'+ 's'.repeat(3*1024*1024);
    for(let i=0;i<6;i++) emit(i,large);
    assert.ok(f.nodes.length>0);
    assert.ok(f.nodes.reduce((sum,n)=>sum+n.textContent.length,0)<=8*1024*1024);
    assert.ok(f.nodes.length<=3);
    const before=f.nodes.map(n=>n.getAttribute('data-smartdm-url'));
    emit('oversize',manifest+'\n#'+'s'.repeat(4*1024*1024));
    assert.deepEqual(f.nodes.map(n=>n.getAttribute('data-smartdm-url')),before);
  });
  test(`${browser}: background probes accept long movie playlists and cancel oversized bodies`, async () => {
    const source=fs.readFileSync(`extensions/${browser}/background.js`,'utf8');
    const functionSource=source.slice(source.indexOf('async function fetchM3u8Text('),source.indexOf('\nfunction inheritQueryTokens'));
    let oversized=false,reads=0,cancels=0,aborts=0;
    const bytes=new TextEncoder().encode(movieManifest);
    const c=vm.createContext({AbortController,TextDecoder,setTimeout,clearTimeout,
      fetch:async(_,options)=>{
        options.signal.addEventListener('abort',()=>aborts++);
        let offset=0;
        return {ok:true,body:{getReader:()=>({
          async read(){
            reads++;
            if(oversized)return {done:false,value:new Uint8Array(100000)};
            if(offset>=bytes.length)return {done:true};
            const value=bytes.subarray(offset,offset+=100000);return {done:false,value};
          },cancel(){cancels++;return Promise.resolve();},releaseLock(){}
        })}};
      }});
    vm.runInContext(functionSource+'\nthis.probe=fetchM3u8Text;',c);
    assert.equal(await c.probe('https://cdn.invalid/movie.m3u8'),movieManifest);
    assert.equal(cancels,1);
    reads=cancels=0; oversized=true;
    assert.equal(await c.probe('https://cdn.invalid/movie.m3u8'),null);
    assert.equal(aborts,2); // Two existing fallback policies, both bounded.
    assert.equal(cancels,2);
    assert.equal(reads,2*(Math.floor(4*1024*1024/100000)+1));
  });
  test(`${browser}: unchanged player playlist does not emit repeated copies or refresh events`,()=>{
    const f=fixture(),h=new f.window.Hls();h.media=f.player();h.emit('attached');
    const data={details:{url:'https://cdn.invalid/opaque',m3u8:manifest,live:false},levelInfo:{height:1080}};
    for(let i=0;i<1000;i++) h.emit('level',data);
    assert.equal(f.nodes.length,1);assert.equal(f.nodes[0].textContent,manifest);
    assert.equal(f.captured.length,1);assert.equal(f.captured[0].text,null);
    assert.equal(f.captured[0].playerId,h.media.getAttribute('data-smartdm-hls-player'));
  });
  test(`${browser}: captures parsed HLS against its own media element and clears stale episode`,()=>{
    const f=fixture(); const h=new f.window.Hls();h.media=f.player();h.emit('attached');
    h.emit('level',{details:{url:'https://cdn.invalid/opaque',m3u8:manifest,live:false},levelInfo:{height:1080}});
    assert.equal(f.nodes.length,1);assert.equal(f.nodes[0].textContent,manifest);
    assert.equal(f.nodes[0].getAttribute('data-smartdm-player'),h.media.getAttribute('data-smartdm-hls-player'));
    const second=new f.window.Hls();second.media=f.player();second.emit('attached');
    assert.notEqual(second.media.getAttribute('data-smartdm-hls-player'),h.media.getAttribute('data-smartdm-hls-player'));
    h.emit('loading');assert.equal(f.nodes.length,0);
  });
  test(`${browser}: does not capture detached or live players`,()=>{
    const f=fixture();const h=new f.window.Hls();h.media=f.player();h.media.isConnected=false;
    h.emit('level',{details:{url:'https://cdn.invalid/opaque',m3u8:manifest,live:false}});
    h.media.isConnected=true;h.emit('level',{details:{url:'https://cdn.invalid/opaque',m3u8:manifest,live:true}});
    assert.equal(f.nodes.length,0);
  });
  test(`${browser}: pairs the selected audio URL before its body arrives and rejects an unrelated rendition`,()=>{
    const f=fixture(),h=new f.window.Hls();h.media=f.player();h.audioTracks=[{url:'https://cdn.invalid/audio'}];h.audioTrack=0;h.emit('attached');h.emit('parsed');
    h.emit('level',{details:{url:'https://cdn.invalid/video',m3u8:manifest,live:false},levelInfo:{height:1080}});
    const c=vm.createContext({window:f.window,document:f.document,SmartDmUtils:{extractWatchPageTitle:()=> 'Episode 5'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].audioUrl,'https://cdn.invalid/audio');
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].audioManifestText,null);
    h.emit('audio',{id:1,details:{url:'https://cdn.invalid/wrong-audio',m3u8:manifest,live:false}});
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].audioUrl,'https://cdn.invalid/audio');
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].audioManifestText,null);
    h.emit('audio',{id:0,details:{url:'https://cdn.invalid/audio',m3u8:manifest,live:false}});
    const result=c.Engine.capturedPlayerFormats(h.media);
    assert.equal(result.formats[0].audioUrl,'https://cdn.invalid/audio');assert.equal(result.formats[0].audioManifestText,manifest);
    h.audioTracks.push({url:'https://cdn.invalid/audio-two'});
    h.audioTrack=1;h.emit('tracks',{audioTracks:h.audioTracks});
    const switched = c.Engine.capturedPlayerFormats(h.media).formats[0];
    assert.equal(switched.audioUrl,'https://cdn.invalid/audio-two');
    assert.equal(switched.audioManifestText,null);
  });
  test(`${browser}: late rendition groups cannot silently become a video-only download`,()=>{
    const f=fixture(),h=new f.window.Hls();h.media=f.player();h.audioTracks=[];h.audioTrack=0;h.emit('attached');
    h.emit('parsed',{audioTracks:[{id:7,groupId:'aud',url:'https://cdn.invalid/audio'}]});
    h.emit('level',{details:{url:'https://cdn.invalid/video',m3u8:manifest,live:false}});
    const c=vm.createContext({window:f.window,document:f.document,SmartDmUtils:{extractWatchPageTitle:()=> 'Movie'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    assert.equal(c.Engine.capturedPlayerFormats(h.media).success,false);
    h.audioTracks=[{id:7,groupId:'aud',url:'https://cdn.invalid/audio'}];h.emit('tracks',{audioTracks:h.audioTracks});
    h.emit('audio',{id:7,groupId:'wrong',details:{m3u8:manifest,live:false}});
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].audioManifestText,null);
    h.emit('audio',{id:7,groupId:'aud',details:{m3u8:manifest,live:false}});
    const format=c.Engine.capturedPlayerFormats(h.media).formats[0];
    assert.equal(format.audioUrl,'https://cdn.invalid/audio');
    assert.equal(format.audioManifestText,manifest);
  });
  test(`${browser}: extensionless typed source routes as HLS without tab-wide candidates`,()=>{
    const c=vm.createContext({window:{location:{href:'https://player.invalid/embed'}},document:{},SmartDmUtils:{normalizeVideoResolution:()=>1080,extractWatchPageTitle:()=> 'Episode 5'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    const player={getAttribute:()=>null,querySelector:()=>({src:'https://cdn.invalid/opaque',type:'application/x-mpegurl'}),videoWidth:1920,videoHeight:1080};
    let result;c.Engine.fetchMediaFormats('https://player.invalid/embed',player,r=>result=r);
    assert.equal(result.formats[0].mediaKind,'hls');assert.equal(result.formats[0].directUrl,'https://cdn.invalid/opaque');
  });
  test(`${browser}: captured format bypasses stale network cache and keeps playlist identity`,()=>{
    const f=fixture(),h=new f.window.Hls();h.media=f.player();h.emit('attached');
    h.emit('level',{details:{url:'https://cdn.invalid/exact',m3u8:manifest,live:false},levelInfo:{height:1080}});
    const c=vm.createContext({window:f.window,document:f.document,SmartDmUtils:{extractWatchPageTitle:()=> 'Episode 5'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    let result;c.Engine.fetchMediaFormats('https://page.invalid',h.media,r=>{result=r;});
    c.Engine.drainStashedManifests();
    assert.equal(f.nodes.length,1);
    assert.equal(c.Engine.capturedPlayerFormats(h.media).formats[0].manifestText,manifest);
    assert.equal(result.formats[0].url,'https://cdn.invalid/exact');assert.equal(result.formats[0].manifestText,manifest);
    assert.equal(result.formats[0].mediaKind,'hls');assert.equal(result.formats[0].height,1080);
    assert.equal(c.Engine.capturedPlayerFormats(f.player()),null);
  });
  test(`${browser}: movie streaming site with blob player falls back to candidate HLS streams from network detection`, () => {
    const runtimeMock = {
      sendMessage(msg, cb) {
        if (msg.type === 'GET_DETECTED_MEDIA') {
          cb({
            success: true,
            tabTitle: 'Heart of the Beast',
            media: [
              {
                url: 'https://movy.sx/stream-embed/playlist/1263337',
                height: 1080,
                contentType: 'application/vnd.apple.mpegurl',
                contentLength: 0,
                timestamp: Date.now()
              }
            ]
          });
        }
      }
    };
    const c = vm.createContext({
      window: {
        location: { href: 'https://movy.sx/movie/1263337?play=true', origin: 'https://movy.sx', hostname: 'movy.sx' },
        top: null,
        self: null
      },
      document: { title: 'Heart of the Beast', querySelectorAll: () => [] },
      URL,
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      SmartDmUtils: {
        extractWatchPageTitle: () => 'Heart of the Beast',
        getCanonicalUrl: u => u,
        getMediaCacheKey: u => u,
        extractResolutionNumber: () => 1080,
        normalizeVideoResolution: (_, h) => h || 1080,
        getResolutionLabel: (h) => `${h}p (MP4)`,
        isGenericTitle: () => false,
        sanitizeCleanTitle: s => s
      }
    });
    c.window.top = c.window.self = c.window;
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8') + '\nthis.Engine=FormatRegistryEngine;', c);
    const blobPlayer = {
      tagName: 'VIDEO',
      currentSrc: 'blob:https://movy.sx/9b27dc75-684c-47bc-8777-6ef184a4ec41',
      videoWidth: 1920,
      videoHeight: 1080,
      getAttribute: () => null,
      querySelector: () => null
    };
    let result = null;
    c.Engine.buildFallbackFormats('https://movy.sx/movie/1263337?play=true', blobPlayer, r => { result = r; });
    assert.ok(result && result.success, 'fallback formats must succeed for blob player with detected network streams');
    assert.equal(result.formats.length, 1);
    assert.equal(result.formats[0].url, 'https://movy.sx/stream-embed/playlist/1263337');
    assert.equal(result.formats[0].mediaKind, 'hls');
    assert.equal(result.formats[0].height, 1080);
  });
  test(`${browser}: unattached master playlist stash parses multi-resolution formats without requiring EXT-X-ENDLIST`, () => {
    const masterManifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n1080p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\n720p.m3u8';
    const stashNode = {
      attrs: { 'data-smartdm-url': 'https://moviebite.org/stream-embed/playlist/master' },
      textContent: masterManifest,
      getAttribute(k) { return this.attrs[k] || null; }
    };
    let playerVideo = null;
    const c = vm.createContext({
      window: {
        location: { href: 'https://moviebite.org/watch/movie/1792170/model-citizen', origin: 'https://moviebite.org', hostname: 'moviebite.org' },
        top: null,
        self: null
      },
      document: {
        title: 'Model Citizen',
        querySelectorAll: s => s === 'smartdm-manifest-stash' ? [stashNode] : (s === 'video' ? [playerVideo] : [])
      },
      URL,
      SmartDmUtils: {
        extractWatchPageTitle: () => 'Model Citizen',
        getCanonicalUrl: u => u,
        getMediaCacheKey: u => u,
        extractResolutionNumber: (u) => u.includes('1080') ? 1080 : 720,
        normalizeVideoResolution: (w, h) => Number(h),
        getResolutionLabel: (h) => `${h}p (MP4)`,
        isGenericTitle: () => false,
        sanitizeCleanTitle: s => s
      }
    });
    c.window.top = c.window.self = c.window;
    playerVideo = {
      tagName: 'VIDEO',
      currentSrc: 'blob:https://moviebite.org/1234',
      videoWidth: 1920,
      videoHeight: 1080,
      getAttribute: () => null
    };
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8') + '\nthis.Engine=FormatRegistryEngine;', c);
    const res = c.Engine.capturedPlayerFormats(playerVideo);
    assert.ok(res && res.success, 'master playlist must resolve successfully');
    assert.equal(res.formats.length, 2);
    assert.equal(res.formats[0].height, 1080);
    assert.equal(res.formats[1].height, 720);
    assert.equal(res.formats[0].url, 'https://moviebite.org/stream-embed/playlist/1080p.m3u8');

    const base = 'https://cdn.invalid/';
    const preview = {textContent: manifest, getAttribute: k => k === 'data-smartdm-url' ? base + 'preview.m3u8' : null};
    const movie = {
      textContent: '#EXTM3U\n#EXTINF:3600,\nmovie.ts\n#EXT-X-ENDLIST',
      getAttribute: k => k === 'data-smartdm-url' ? base + '1080p.m3u8' : null
    };
    c.document.querySelectorAll = selector => selector === 'video' ? [playerVideo] : [preview, movie];
    playerVideo.duration = 3600;
    const selected = c.Engine.capturedPlayerFormats(playerVideo);
    assert.deepEqual(Array.from(selected.formats, f => f.url), [base + '1080p.m3u8']);
    assert.equal(selected.formats[0].totalDuration, 3600);

    stashNode.attrs['data-smartdm-url'] = base + 'master.m3u8';
    stashNode.textContent = [
      '#EXTM3U', '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="main",DEFAULT=YES,URI="main-audio.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="main",DEFAULT=NO,URI="dub.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sd",URI="sd-audio.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="main"', '1080p.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="sd"', '720p.m3u8'
    ].join('\n');
    playerVideo.getAttribute = k => k === 'data-smartdm-hls-external-audio' ? '1' : null;
    c.document.querySelectorAll = selector => selector === 'video' ? [playerVideo] : [stashNode, movie];
    const paired = c.Engine.capturedPlayerFormats(playerVideo);
    assert.deepEqual(Array.from(paired.formats, f => f.audioUrl), [base + 'main-audio.m3u8', base + 'sd-audio.m3u8']);
    assert.equal(paired.formats[0].manifestText, movie.textContent);
    assert.equal(paired.formats[1].manifestText, undefined);
    assert.equal(paired.formats[0].audioManifestText, null);
  });
  test(`${browser}: in-page variant probe uses _smartdm_probe flag without sending CORS-triggering wire header`, async () => {
    let capturedOptions = null;
    const c = vm.createContext({
      window: { location: { href: 'https://movy.sx/movie/1263337?play=true' } },
      document: { title: 'Movie' },
      URL,
      TextDecoder,
      AbortController,
      setTimeout,
      clearTimeout,
      SmartDmUtils: {
        extractResolutionNumber: (u) => u.includes('1080') ? 1080 : 720,
        normalizeVideoResolution: (_, h) => Number(h),
        getResolutionLabel: (h) => `${h}p (MP4)`
      },
      fetch: async (url, opts) => {
        capturedOptions = opts;
        return {
          ok: true,
          body: {
            getReader: () => {
              let done = false;
              return {
                read: async () => {
                  if (done) return { done: true };
                  done = true;
                  return { done: false, value: new TextEncoder().encode('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n1080.m3u8') };
                },
                releaseLock: () => {}
              };
            }
          }
        };
      }
    });
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8') + '\nthis.Engine=FormatRegistryEngine;', c);
    const variants = await c.Engine.resolveM3u8VariantsInPage('https://movy.sx/stream-embed/playlist/1263337');
    assert.ok(variants && variants.length === 1);
    assert.equal(capturedOptions?._smartdm_probe, true);
    assert.equal(capturedOptions?.headers?.['x-smartdm-probe'], undefined);
  });
  test(`${browser}: sniffer preserves master multivariant stash when subsequent child segments arrive`, () => {
    const f = fixture();
    const emit = (url, text, height = 0) => {
      const h = new f.window.Hls();
      h.media = f.player();
      h.emit('attached');
      h.emit('level', { details: { url, m3u8: text, live: false }, levelInfo: { height } });
    };
    const masterText = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nv1.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\nv2.m3u8';
    emit('https://cdn.invalid/master.m3u8', masterText);
    for (let i = 1; i <= 6; i++) {
      emit(`https://cdn.invalid/chunk_${i}.m3u8`, `#EXTM3U\n#EXTINF:6,\nseg_${i}.ts`, 1080);
    }
    const masterStash = f.nodes.find(n => (n.textContent || '').includes('#EXT-X-STREAM-INF'));
    assert.ok(masterStash, 'master stash must be preserved and not evicted by non-master chunk updates');
    assert.equal(masterStash.getAttribute('data-smartdm-url'), 'https://cdn.invalid/master.m3u8');
  });
  test(`${browser}: sniffer captures XHR manifest with responseType arraybuffer and octet-stream MIME`, () => {
    let capturedStash = null;
    const documentMock = {
      createElement: (t) => ({
        tagName: t,
        style: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k] || null; }
      }),
      head: {
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: (el) => { capturedStash = el; return el; }
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {}
    };
    const c = vm.createContext({
      window: {
        location: { href: 'https://moviebite.org/watch/123' },
        addEventListener() {},
        dispatchEvent() {}
      },
      document: documentMock,
      CSS: { escape: s => s },
      CustomEvent: class {},
      TextDecoder,
      ArrayBuffer,
      Uint8Array
    });
    class MockXhr {
      constructor() {
        this._listeners = {};
        this._headers = { 'content-type': 'application/octet-stream' };
        this.responseURL = 'https://moviebite.org/stream-embed/playlist/1792170';
        this.responseType = 'arraybuffer';
        const txt = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080.m3u8\n';
        const bytes = new TextEncoder().encode(txt);
        this.response = bytes.buffer;
      }
      open(m, u) { this._smartdm_req_url = u; }
      send() { this._listeners['load']?.(); }
      addEventListener(e, fn) { this._listeners[e] = fn; }
      getResponseHeader(h) { return this._headers[h.toLowerCase()] || null; }
    }
    c.XMLHttpRequest = MockXhr;
    vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`, 'utf8'), c);
    const xhr = new c.XMLHttpRequest();
    xhr.open('GET', 'https://moviebite.org/stream-embed/playlist/1792170');
    xhr.send();
    assert.ok(capturedStash, 'stash element must be created for arraybuffer octet-stream manifest');
    assert.equal(capturedStash.getAttribute('data-smartdm-url'), 'https://moviebite.org/stream-embed/playlist/1792170');
    assert.ok(capturedStash.textContent.includes('#EXT-X-STREAM-INF'));
  });
  test(`${browser}: fetchMediaFormats does not wipe detected instant formats after safety timeout`, (t, done) => {
    const runtimeMock = {
      sendMessage(msg, cb) {
        if (msg.type === 'GET_DETECTED_MEDIA') {
          cb({
            success: true,
            tabTitle: 'Flixer Stream',
            media: [
              {
                url: 'https://flixer.su/stream-embed/playlist/1375441',
                height: 1080,
                contentType: 'application/vnd.apple.mpegurl',
                contentLength: 0,
                timestamp: Date.now()
              }
            ]
          });
        }
      }
    };
    const c = vm.createContext({
      window: {
        location: { href: 'https://flixer.su/watch/movie/1375441', origin: 'https://flixer.su', hostname: 'flixer.su' },
        top: null,
        self: null
      },
      document: { title: 'Flixer Stream', querySelectorAll: () => [] },
      URL,
      setTimeout,
      clearTimeout,
      chrome: { runtime: runtimeMock },
      browser: { runtime: runtimeMock },
      SmartDmUtils: {
        extractWatchPageTitle: () => 'Flixer Stream',
        getCanonicalUrl: u => u,
        getMediaCacheKey: u => u,
        extractResolutionNumber: () => 1080,
        normalizeVideoResolution: (_, h) => h || 1080,
        getResolutionLabel: (h) => `${h}p (MP4)`,
        isGenericTitle: () => false,
        sanitizeCleanTitle: s => s
      }
    });
    c.window.top = c.window.self = c.window;
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`, 'utf8') + '\nthis.Engine=FormatRegistryEngine;', c);
    const blobPlayer = {
      tagName: 'VIDEO',
      currentSrc: 'blob:https://flixer.su/5555',
      videoWidth: 1920,
      videoHeight: 1080,
      getAttribute: () => null,
      querySelector: () => null
    };

    let deliveredResult = null;
    c.Engine.fetchMediaFormats('https://flixer.su/watch/movie/1375441', blobPlayer, (res, hasMore) => {
      deliveredResult = res;
    });

    assert.ok(deliveredResult?.success, 'instant formats must be delivered');
    assert.equal(deliveredResult.formats[0].url, 'https://flixer.su/stream-embed/playlist/1375441');

    setTimeout(() => {
      assert.ok(deliveredResult.success, 'format result must remain successful after safety timer');
      assert.notEqual(deliveredResult.status, 'error');
      done();
    }, 2700);
  });
  test(`${browser}: findActiveVideoElement discovers video element inside open shadow roots`, () => {
    const shadowVideo = {
      tagName: 'VIDEO',
      currentTime: 10,
      paused: false,
      ended: false,
      getBoundingClientRect: () => ({ top: 100, bottom: 500, width: 800, height: 450 })
    };
    const customHost = {
      shadowRoot: {
        querySelectorAll: (sel) => sel === 'video' ? [shadowVideo] : []
      }
    };
    const c = vm.createContext({
      window: { innerHeight: 900 },
      document: {
        querySelectorAll: (sel) => {
          if (sel === 'video') return [];
          if (sel === '*') return [customHost];
          return [];
        }
      }
    });
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/utils.js`, 'utf8') + '\nthis.Utils=SmartDmUtils;', c);
    const active = c.Utils.findActiveVideoElement();
    assert.equal(active, shadowVideo, 'video in shadowRoot must be discovered');
  });

}
