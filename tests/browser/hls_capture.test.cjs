const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const browser of ['chrome','firefox']) {
  function fixture() {
    const nodes=[],captured=[];
    const node=()=>({attrs:{},style:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;},remove(){nodes.splice(nodes.indexOf(this),1);}});
    const root={setAttribute(){},querySelector(s){return nodes.find(n=>s.includes(n.attrs['data-smartdm-url']))||null;},querySelectorAll(){return nodes;},appendChild(n){nodes.push(n);}};
    const document={head:root,documentElement:root,createElement:node,querySelectorAll(){return [...nodes];}};
    const window={location:{href:'https://player.invalid/e/1',hostname:'player.invalid'},dispatchEvent(e){captured.push(e.detail);}};
    window.top=window.self=window;
    const context=vm.createContext({window,document,CSS:{escape:s=>s},XMLHttpRequest:function(){},CustomEvent:function(_,options){this.detail=options.detail;}});
    context.XMLHttpRequest.prototype.open=function(){};context.XMLHttpRequest.prototype.send=function(){};
    vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`,'utf8'),context);
    class Hls {
      static Events={LEVEL_LOADED:'level',MEDIA_ATTACHED:'attached',MANIFEST_LOADING:'loading',DESTROYING:'destroy',MANIFEST_PARSED:'parsed',AUDIO_TRACK_LOADED:'audio'};
      constructor(){this.listeners={};}
      on(e,f){this.listeners[e]=f;}
      emit(e,data){this.listeners[e]?.(e,data);}
    }
    window.Hls=Hls;
    const player=()=>Object.assign(node(),{isConnected:true,videoHeight:1080});
    return {window,document,nodes,player,captured};
  }
  const manifest='#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST';
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
  test(`${browser}: pairs the selected audio playlist and refuses silent fallback while audio is pending`,()=>{
    const f=fixture(),h=new f.window.Hls();h.media=f.player();h.audioTracks=[{url:'https://cdn.invalid/audio'}];h.audioTrack=0;h.emit('attached');h.emit('parsed');
    h.emit('level',{details:{url:'https://cdn.invalid/video',m3u8:manifest,live:false},levelInfo:{height:1080}});
    const c=vm.createContext({window:f.window,document:f.document,SmartDmUtils:{extractWatchPageTitle:()=> 'Episode 5'}});
    vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/format_engine.js`,'utf8')+'\nthis.Engine=FormatRegistryEngine;',c);
    assert.equal(c.Engine.capturedPlayerFormats(h.media).success,false);
    h.emit('audio',{id:1,details:{url:'https://cdn.invalid/wrong-audio',m3u8:manifest,live:false}});
    assert.equal(c.Engine.capturedPlayerFormats(h.media).success,false);
    h.emit('audio',{id:0,details:{url:'https://cdn.invalid/audio',m3u8:manifest,live:false}});
    const result=c.Engine.capturedPlayerFormats(h.media);
    assert.equal(result.formats[0].audioUrl,'https://cdn.invalid/audio');assert.equal(result.formats[0].audioManifestText,manifest);
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
}
