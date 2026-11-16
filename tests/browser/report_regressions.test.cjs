const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function background(browser, fetchImpl=async()=>null) {
 const sent=[], listeners={}; const event=name=>({addListener(fn){listeners[name]=fn;}});
 const chrome={runtime:{onInstalled:event('installed'),onMessage:event('message'),lastError:null},
  tabs:{onActivated:event('activated'),onUpdated:event('updated'),onRemoved:event('removed'),sendMessage(){}},
  contextMenus:{create(){},onClicked:event('context')},action:{onClicked:event('action')},
  downloads:{onDeterminingFilename:event('download'),onCreated:event('created')},
  webRequest:{onSendHeaders:event('headers'),onHeadersReceived:event('response'),onBeforeRedirect:event('redirect'),onCompleted:event('completed'),onErrorOccurred:event('error')}};
 const c=vm.createContext({URL,URLSearchParams,TextDecoder,TextEncoder,AbortController,console,setTimeout,clearTimeout,
  navigator:{userAgent:'Browser-UA'},chrome,fetch:fetchImpl});
 vm.runInContext(fs.readFileSync(`extensions/${browser}/background.js`,'utf8')+'\nthis.cache=streamHeadersCache; this.tokens=streamTokenCache; this.getHeaders=getCachedStreamHeaders;this.media=detectedMediaMap;',c);
 return {c,listeners,sent};
}
function engine(browser,hostname='x.com') {
 const c=vm.createContext({URL,URLSearchParams,window:{location:{hostname,href:`https://${hostname}/home`,origin:`https://${hostname}`}},document:{title:'Home / X',querySelectorAll:()=>[]},setTimeout,clearTimeout});
 for(const [f,n] of [['utils.js','SmartDmUtils'],['format_engine.js','FormatRegistryEngine']])vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${f}`,'utf8')+`\nthis.${n}=${n};`,c);
 return c;
}
function response(text,type='text/html',status=200){return new Response(text,{status,headers:{'Content-Type':type}});}
for(const browser of ['chrome','firefox']) {
 test(`${browser}: social lookup cannot be hijacked by an unrelated captured HLS snapshot`,()=>{
  const c=engine(browser);const e=c.FormatRegistryEngine;let result;
  e.capturedPlayerFormats=()=>({success:true,title:'video',formats:[{url:'https://wrong.invalid/old.m3u8',mediaKind:'hls'}]});
  e.buildFallbackFormats=(_,__,cb)=>cb({success:true,title:'Selected post caption',formats:[{url:'https://cdn.invalid/current.mp4'}]});
  e.fetchMediaFormats('https://x.com/home',{},r=>result=r);
  assert.equal(result.title,'Selected post caption');assert.equal(result.formats[0].url,'https://cdn.invalid/current.mp4');
 });
 test(`${browser}: master references to complete MP4 are not dispatched as HLS`,()=>{
  const c=engine(browser), f=c.FormatRegistryEngine.parseM3u8Formats('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nhttps://cdn.invalid/clip.mp4\n','https://cdn.invalid/list.m3u8');
  assert.equal(f.length,1);assert.notEqual(f[0].mediaKind,'hls');
 });
 test(`${browser}: signed query bytes survive sanitization; only numeric range hints are removed`,()=>{
  const c=engine(browser),u='https://cdn.invalid/video?token=a%20b~c&signature=x%2fy&range=original';
  assert.equal(c.SmartDmUtils.sanitizeStreamUrl(u),u);
  assert.equal(c.SmartDmUtils.sanitizeStreamUrl('https://cdn.invalid/video?token=a%20b~c&bytestart=0&byteend=99&x=%2f'),'https://cdn.invalid/video?token=a%20b~c&x=%2f');
 });
 test(`${browser}: exact request header cache does not borrow another subdomain's cookies`,()=>{
  const {c,listeners}=background(browser);
  listeners.headers({url:'https://one.cdn.invalid/a.mp4',requestHeaders:[{name:'Cookie',value:'secret=one'},{name:'Referer',value:'https://one.invalid/'}]});
  assert.equal(c.getHeaders('https://two.cdn.invalid/b.mp4'),null);
  const sibling=c.getHeaders('https://one.cdn.invalid/b.mp4');assert.ok(!sibling?.cookie,'cookies require exact resource observation or cookie-jar matching');
 });
 test(`${browser}: failed preload responses are excluded; successful redirect keeps its actual entry point`,()=>{
  const {c,listeners}=background(browser);
  const headers=[{name:'Content-Type',value:'video/mp4'},{name:'Content-Length',value:'2097152'}];
  listeners.response({tabId:7,requestId:'failed',statusCode:403,url:'https://cdn.invalid/denied.mp4',responseHeaders:headers});
  assert.equal(c.media.get(7)?.length||0,0);
  listeners.redirect({tabId:7,requestId:'valid',url:'https://site.invalid/play?id=selected',redirectUrl:'https://cdn.invalid/current.mp4'});
  listeners.response({tabId:7,requestId:'valid',statusCode:206,url:'https://cdn.invalid/current.mp4',responseHeaders:headers,initiator:'https://site.invalid'});
  assert.equal(c.media.get(7)?.[0]?.originalUrl,'https://site.invalid/play?id=selected');
  listeners.completed({requestId:'valid'});
 });
 test(`${browser}: selected feed retains a proven original request URL and unique rendition IDs`,()=>{
  const c=engine(browser,'www.tiktok.com'), e=c.FormatRegistryEngine;
  const p={currentSrc:'https://cdn.invalid/current.mp4',videoWidth:720,videoHeight:1280,getAttribute:()=>null,closest:()=>({querySelector:()=>({textContent:'Selected caption'})})};
  const f=e.selectedSocialFormats(p,[{url:p.currentSrc,originalUrl:'https://site.invalid/play?id=selected',height:720}]);
  assert.equal(f[0].url,'https://site.invalid/play?id=selected');
  const x=engine(browser,'x.com');
  p.poster='https://images.invalid/amplify_video_thumb/12345/a.jpg';
  const variants=x.FormatRegistryEngine.selectedSocialFormats(p,[{url:'https://cdn.invalid/amplify_video/12345/a.mp4',height:720},{url:'https://cdn.invalid/amplify_video/12345/b.mp4',height:720}]);
  assert.equal(new Set(variants.map(v=>v.formatId)).size,variants.length);
 });
 test(`${browser}: page metadata embedding a watch document is never a downloadable media URL`,async()=>{
  const {c}=background(browser,async()=>response('<meta property="og:video" content="https://www.bilibili.tv/en/video/123"><title>Selected title</title>'));
  const result=await c.fetchPageMediaFormats('https://www.bilibili.tv/en/video/123');
  assert.ok(!result?.formats?.length);
 });
 test(`${browser}: structured player source arrays expose actual qualities and expand HLS; stale sources are omitted`,async()=>{
  const calls=[];
  const {c}=background(browser,async(u)=>{
   calls.push(u);
   if(u==='https://catalog.invalid/watch/selected') return response('<title>Selected clip</title><script>window.initials={"xplayerSettings":{"sources":{"standard":{"h264":[{"url":"https://cdn.invalid/stale.mp4","quality":"144p"}],"hls":[{"url":"https://cdn.invalid/master.m3u8","quality":"auto"}]}}}};</script>');
   if(u.endsWith('stale.mp4'))return response('', 'video/mp4',410);
   if(u.endsWith('master.m3u8'))return response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080\n1080.m3u8\n','application/vnd.apple.mpegurl');
   return response('#EXTM3U\n#EXTINF:1,\npart.ts\n#EXT-X-ENDLIST','application/vnd.apple.mpegurl');
  });
  const result=await c.fetchPageMediaFormats('https://catalog.invalid/watch/selected');
  assert.ok(result?.success); assert.deepEqual(Array.from(result.formats,f=>f.height),[1080,720]);
  assert.ok(result.formats.every(f=>!f.url.includes('stale')&&!f.manifestText?.includes('#EXT-X-STREAM-INF')));
  assert.ok(calls.length<=8);
 });
 test(`${browser}: remote media-definition JSON is resolved to media, never offered as a download`,async()=>{
  const {c}=background(browser,async u=>{
   if(u.includes('/watch'))return response('<title>Selected</title><script>const p={"mediaDefinitions":[{"format":"mp4","remote":true,"videoUrl":"https://catalog.invalid/video/get_media?selected=1"}]};</script>');
   if(u.includes('/get_media'))return response(JSON.stringify([{quality:'1080',videoUrl:'https://cdn.invalid/full.mp4'}]),'application/json');
   return response(new Uint8Array(64),'video/mp4');
  });
  const result=await c.fetchPageMediaFormats('https://catalog.invalid/watch/1');
  assert.equal(result?.formats[0]?.url,'https://cdn.invalid/full.mp4');assert.equal(result.formats[0].height,1080);
 });
 test(`${browser}: Bilibili thumbnail resolution uses selected API identity without current-page state`,async()=>{
  const c=engine(browser,'www.bilibili.tv');c.window.location.href='https://www.bilibili.tv/en/search-result?q=test';c.window.location.pathname='/en/search-result';
  c.FormatRegistryEngine.queryBilibiliPlayurlApi=async url=>[{url:'https://cdn.invalid/selected.mp4',height:1080,title:'Selected API',ext:'mp4'}];
  c.FormatRegistryEngine.fetchLinkedPageFormats=()=>{throw new Error('HTML embedding is not Bilibili media');};
  const r=await new Promise(resolve=>c.FormatRegistryEngine.fetchMediaFormats('https://www.bilibili.tv/en/video/123',null,resolve,false,{fromThumbnail:true}));
  assert.equal(r.formats[0].url,'https://cdn.invalid/selected.mp4');
 });
}
