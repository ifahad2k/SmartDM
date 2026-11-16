const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const browser of ['chrome','firefox']) {
 function fixture(){
  const nodes=[], root={setAttribute(){},querySelector(s){return nodes.find(n=>s.includes(n.attrs['data-smartdm-item-id']))||null;},querySelectorAll(s){return nodes.filter(n=>n.tagName===s);},appendChild(n){nodes.push(n);}};
  function node(tag){return {tagName:tag,attrs:{},style:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;},remove(){nodes.splice(nodes.indexOf(this),1);}};}
  const document={head:root,documentElement:root,querySelectorAll:s=>root.querySelectorAll(s),createElement:node};
  const window={location:{hostname:'www.tiktok.com',href:'https://www.tiktok.com/',origin:'https://www.tiktok.com'},dispatchEvent(){}};window.top=window.self=window;
  function Xhr(){this.events={};this.responseType='';this.responseURL='https://www.tiktok.com/api/recommend/item_list/';}
  Xhr.prototype.open=function(){};Xhr.prototype.send=function(){};Xhr.prototype.addEventListener=function(e,fn){this.events[e]=fn;};Xhr.prototype.getResponseHeader=()=> 'application/json';
  const c=vm.createContext({window,document,URL,TextDecoder,XMLHttpRequest:Xhr,CSS:{escape:x=>x},CustomEvent:function(){},setTimeout,clearTimeout});
  for(const [file,name] of [['modules/media_metadata.js','SmartDmMediaMetadata'],['modules/utils.js','SmartDmUtils'],['modules/format_engine.js','FormatRegistryEngine']])vm.runInContext(fs.readFileSync(`extensions/${browser}/${file}`,'utf8')+`\nthis.${name}=${name};`,c);
  vm.runInContext(fs.readFileSync(`extensions/${browser}/sniffer.js`,'utf8'),c);
  const record=(id,desc)=>({id,desc,video:{width:720,height:1280,playAddr:`https://cdn.invalid/${id}/720.mp4`,bitrateInfo:[{Bitrate:4000000,PlayAddr:{Width:1080,Height:1920,UrlList:[`https://cdn.invalid/${id}/1080.mp4`]}}]}});
  const emit=data=>{const x=new Xhr();x.open('GET',x.responseURL);x.responseText=JSON.stringify(data);x.send();x.events.load.call(x);};
  return {c,nodes,record,emit};
 }
 test(`${browser}: captured feed JSON yields selected caption and all advertised qualities, excludes prefetched items`,()=>{
  const f=fixture();f.emit({itemList:[f.record('111111','Caption for first'),f.record('222222','Caption for selected')]});
  assert.equal(f.nodes.filter(n=>n.tagName==='smartdm-media-metadata').length,2);
  assert.equal(f.nodes.filter(n=>n.tagName==='smartdm-manifest-stash').length,0,'direct files are not invented HLS manifests');
  const card={querySelector(s){return s.includes('/video/')?{getAttribute:()=>'/@user/video/222222'}:null;}};
  const p={currentSrc:'blob:selected',videoWidth:720,videoHeight:1280,getAttribute:()=>null,closest:()=>card};
  const formats=f.c.FormatRegistryEngine.selectedSocialFormats(p,[]);
  assert.equal(formats.length,2);assert.deepEqual(Array.from(formats,f=>f.height).sort((a,b)=>a-b),[720,1080]);
  assert.ok(formats.every(r=>r.url.includes('/222222/')&&r.title==='Caption for selected'));
 });
 test(`${browser}: DOM caption ancestry stays inside one player and supports the browse description`,()=>{
  const f=fixture();const caption={textContent:'The actual visible caption'};
  const card={querySelectorAll:()=>[{}],querySelector:s=>s.includes('browse-video-desc')?caption:null,parentElement:null};
  const p={currentSrc:'https://cdn.invalid/active.mp4',videoWidth:1080,videoHeight:1920,parentElement:card,getAttribute:()=>null,closest:()=>null};
  const formats=f.c.FormatRegistryEngine.selectedSocialFormats(p,[]);
  assert.equal(formats[0].title,'The actual visible caption');assert.equal(formats[0].height,1080);
  card.querySelectorAll=()=>[{},{}];
  assert.notEqual(f.c.FormatRegistryEngine.selectedSocialFormats(p,[])[0].title,'The actual visible caption');
 });
 test(`${browser}: selected playback item ID matches only its advertised metadata and retains observed redirects`,()=>{
  const f=fixture();f.emit({itemList:[f.record('111111','Other caption'),f.record('222222','Selected caption')]});
  const source='https://www.tiktok.com/play?item_id=222222';
  const card={querySelector:()=>null,querySelectorAll:()=>[{}]};
  const p={currentSrc:source,videoWidth:720,videoHeight:1280,getAttribute:()=>null,closest:()=>card};
  const formats=f.c.FormatRegistryEngine.selectedSocialFormats(p,[]);
  assert.ok(formats.some(r=>r.height===1080));assert.ok(formats.every(r=>r.title==='Selected caption'));
  const direct='https://cdn.invalid/222222/720.mp4';p.currentSrc=direct;
  const observed=f.c.FormatRegistryEngine.selectedSocialFormats(p,[{url:direct,originalUrl:source,height:720}]);
  assert.equal(observed.find(r=>r.height===720)?.url,source,'metadata must not overwrite a proven redirect entry point');
  p.currentSrc='https://cdn.invalid/unrelated.mp4?item_id=333333';
  assert.equal(f.c.FormatRegistryEngine.selectedFeedMetadata(p,p.currentSrc).streams,undefined);
 });
 test(`${browser}: metadata retention stays bounded across a long feed`,()=>{
  const f=fixture();for(let i=0;i<60;i++)f.emit({itemList:[f.record(String(100000+i),'x'.repeat(2000))]});
  assert.ok(f.nodes.length<=20);assert.ok(f.nodes.reduce((n,s)=>n+s.textContent.length,0)<=256000);
 });
 test(`${browser}: packaged metadata parser loads before both capture and isolated discovery`,()=>{
  const m=JSON.parse(fs.readFileSync(`extensions/${browser}/manifest.json`));
  for(const entry of m.content_scripts){const i=entry.js.indexOf('modules/media_metadata.js');assert.equal(i,0);}
 });
}
