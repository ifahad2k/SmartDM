const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const browser of ['chrome','firefox']){
 const ctx=vm.createContext({window:{location:{hostname:'tiktok.com'}},URL});
 for(const [file,name] of [['utils.js','SmartDmUtils'],['format_engine.js','FormatRegistryEngine'],['overlay_ui.js','OverlayUiRenderer']])vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`,'utf8')+`\nthis.${name}=${name};`,ctx);
 const engine=ctx.FormatRegistryEngine;
 vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/watcher.js`,'utf8')+'\nthis.MediaWatcher=MediaWatcher;',ctx);
 test(`${browser}: only one visible reel overlay survives viewport sync`,()=>{
  ctx.window.innerWidth=800;ctx.window.innerHeight=800;
  const watcher=ctx.MediaWatcher;const a={isConnected:true,getBoundingClientRect:()=>({left:0,right:200,top:0,bottom:200,width:200,height:200})};
  const b={isConnected:true,getBoundingClientRect:()=>({left:0,right:500,top:0,bottom:700,width:500,height:700})};
  const first={isVisible:true,host:{style:{}}},second={isVisible:true,host:{style:{}}};
  watcher.activePlayers.set(a,first);watcher.activePlayers.set(b,second);watcher.syncVisiblePlayers();
  assert.equal(first.host.style.opacity,'0');assert.equal(second.host.style.opacity,'1');watcher.activePlayers.clear();
 });

 function player(src){return {currentSrc:src,videoWidth:1080,videoHeight:1920,getAttribute(){return null;},closest(){return {querySelector(s){return s==='[data-e2e="video-desc"]'?{textContent:'Selected caption'}:null;}};}};}
 test(`${browser}: selected source excludes prefetched feed videos and keeps caption`,()=>{
  const result=engine.selectedSocialFormats(player('https://cdn.invalid/current.mp4'),[{url:'https://cdn.invalid/later.mp4',height:2160},{url:'https://cdn.invalid/current.mp4'}]);
  assert.equal(result.length,1);assert.equal(result[0].url,'https://cdn.invalid/current.mp4');assert.equal(result[0].title,'Selected caption');assert.equal(result[0].height,1080);
 });
 test(`${browser}: ambiguous blob player never borrows tab media`,()=>assert.equal(engine.selectedSocialFormats(player('blob:opaque'),[{url:'https://cdn.invalid/later.mp4'}]).length,0));
 test(`${browser}: unknown quality is not fabricated as 720p`,()=>{const p=player('https://cdn.invalid/current.mp4');p.videoWidth=p.videoHeight=0;const r=engine.selectedSocialFormats(p,[]);assert.equal(r[0].height,0);assert.match(r[0].resolution,/unknown/);});
 test(`${browser}: known video-only stream requires paired audio`,()=>{const p=player('https://cdn.invalid/current.mp4');assert.equal(engine.selectedSocialFormats(p,[{url:p.currentSrc,hasAudio:false}]).length,0);assert.equal(engine.selectedSocialFormats(p,[{url:p.currentSrc,hasAudio:false,audioUrl:'https://cdn.invalid/audio.m4a'}])[0].audioUrl,'https://cdn.invalid/audio.m4a');});
 test(`${browser}: iframe popover fits narrow player viewport`,()=>{const p={style:{}};ctx.OverlayUiRenderer.positionPopover(p,{right:690,bottom:390},700,400);assert.ok(parseFloat(p.style.left)+parseFloat(p.style.width)<=692);assert.ok(parseFloat(p.style.top)+parseFloat(p.style.maxHeight)<=392);});
}
