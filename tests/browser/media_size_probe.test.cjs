const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture(reply) {
  const calls=[];
  const context=vm.createContext({AbortController,setTimeout,clearTimeout,Date,Map,Number,
    fetch:async(url,options)=>{calls.push({url,options});return reply(url,options);}});
  vm.runInContext(fs.readFileSync('extensions/shared/background/manifest_reader.js','utf8'),context);
  return {context,calls,probe:context.probeMediaSize};
}
function response(status,headers={}) {
  const record={cancelled:0,reads:0};
  return {record,status,ok:status>=200&&status<300,headers:{get:key=>headers[key]??null},
    body:{cancel:async()=>{record.cancelled++;},getReader:()=>{record.reads++;throw Error('Size probing must not read bodies');}}};
}

test('size probe uses the full Content-Range total and always cancels its body',async()=>{
  const r=response(206,{'content-range':'bytes 0-0/686329621','content-length':'1'});
  const f=fixture(()=>r);
  assert.equal(await f.probe('https://cdn.invalid/file.mp4'),686329621);
  assert.equal(f.calls[0].options.headers.Range,'bytes=0-0');
  assert.equal(r.record.cancelled,1);assert.equal(r.record.reads,0);assert.equal(f.calls[0].options.signal.aborted,true);
});

test('a server ignoring Range is measured by headers and cancelled without receiving its file',async()=>{
  const r=response(200,{'content-length':'12345678','content-type':'video/mp4'}),f=fixture(()=>r);
  assert.equal(await f.probe('https://cdn.invalid/file'),12345678);
  assert.equal(r.record.cancelled,1);assert.equal(r.record.reads,0);
});

test('documents, fragments and malformed/encoded totals are not advertised as file sizes',async()=>{
  for(const r of [response(200,{'content-length':'100','content-type':'text/html'}),response(206,{'content-range':'bytes 0-100/999'}),response(200,{'content-length':'999','content-encoding':'gzip'})]) {
    const f=fixture(()=>r);assert.equal(await f.probe('https://cdn.invalid/file'),0);assert.equal(r.record.cancelled,1);
  }
  const f=fixture(()=>{throw Error('Fragments must not be probed');});
  for(const url of ['file:///tmp/a','https://cdn.invalid/segment.m4s','https://cdn.invalid/master.m3u8']) assert.equal(await f.probe(url),0);
  assert.equal(f.calls.length,0);
});

test('repeated menu polls coalesce and cache probes with bounded admission',async()=>{
  const releases=[];const f=fixture(()=>new Promise(resolve=>releases.push(resolve)));
  const requests=[];for(let i=0;i<4;i++)requests.push(f.probe(`https://cdn.invalid/${i}.mp4`));
  const same=f.probe('https://cdn.invalid/0.mp4');
  assert.equal(await f.probe('https://cdn.invalid/overflow.mp4'),0);assert.equal(f.calls.length,4);
  releases.forEach(resolve=>resolve(response(206,{'content-range':'bytes 0-0/1024'})));
  assert.deepEqual(await Promise.all(requests),[1024,1024,1024,1024]);assert.equal(await same,1024);
  assert.equal(await f.probe('https://cdn.invalid/0.mp4'),1024);assert.equal(f.calls.length,4);
});

test('completed size cache cannot grow with an infinite feed',async()=>{
  const f=fixture(()=>response(206,{'content-range':'bytes 0-0/100'}));
  for(let i=0;i<100;i++)await f.probe(`https://cdn.invalid/${i}.mp4`);
  assert.equal(f.context.probeMediaSize.cache.size,64);assert.equal(f.context.probeMediaSize.active,0);
});

test('failed access releases the response and does not expose error text',async()=>{
  const r=response(403),f=fixture(()=>r);
  assert.equal(await f.probe('https://cdn.invalid/file','https://page.invalid'),0);
  assert.equal(r.record.cancelled,2);assert.equal(f.context.probeMediaSize.active,0);
});

test('size messages reject foreign senders and require complete safe track totals',async()=>{
  const source=fs.readFileSync('extensions/shared/background/runtime.js','utf8');
  const start=source.indexOf('chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {');
  const end=source.indexOf("  if (request.type === 'UPDATE_TAB_TITLE'",start);
  let handler,calls=0,response,size=100;
  vm.runInNewContext(source.slice(start,end)+'return false;});',{
    chrome:{runtime:{id:'self',onMessage:{addListener:fn=>{handler=fn;}}}},
    probeMediaSize:async()=>{calls++;return size;}
  });
  assert.equal(handler({type:'GET_MEDIA_SIZE',url:'https://cdn.invalid/file'},{id:'foreign'},r=>{response=r;}),false);
  assert.equal(response.success,false);assert.equal(calls,0);
  handler({type:'GET_MEDIA_SIZE',url:'https://cdn.invalid/file',audioUrl:'https://cdn.invalid/audio'},{id:'self'},r=>{response=r;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(response.fileSize,200);assert.equal(calls,2);
  size=Number.MAX_SAFE_INTEGER;
  handler({type:'GET_MEDIA_SIZE',url:'https://cdn.invalid/file',audioUrl:'https://cdn.invalid/audio'},{id:'self'},r=>{response=r;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(response.success,false);assert.equal(response.fileSize,0);
});
