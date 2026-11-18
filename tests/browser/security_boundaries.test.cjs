const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

for(const browser of ['chrome','firefox']) {
  const source=fs.readFileSync(`extensions/${browser}/background.js`,'utf8');
  test(`${browser}: credential handoff uses native messaging and never probes HTTP ports`,async()=>{
    const start=source.indexOf('async function appendCookiesAndSend(');
    const end=source.indexOf('\nfunction getYouTubeCookiesHeader',start);
    let received,fetches=0;
    const runtime={lastError:null,sendNativeMessage(host,message,callback){
      assert.equal(host,'io.smartdm.host');received=message;callback({success:true,status:'ok'});
    }};
    const context=vm.createContext({URL,Map,Set,Date,console,navigator:{userAgent:'Fixture'},
      NATIVE_HOST_NAME:'io.smartdm.host',getCachedStreamHeaders:()=>null,getAnimeCdnDefaultReferer:()=>null,
      fetch:()=>{fetches++;throw Error('HTTP recipient must never receive secrets');},
      chrome:{runtime,cookies:{getAll(_,callback){callback([{domain:'cdn.invalid',path:'/media',secure:true,name:'session',value:'secret-canary'}]);}}}});
    vm.runInContext(source.slice(start,end)+'\nthis.send=appendCookiesAndSend;',context);
    let reply;await context.send({type:'ADD_DOWNLOAD',url:'https://cdn.invalid/media/video.mp4'},value=>reply=value);
    assert.equal(reply.success,true);assert.equal(received.protocolVersion,1);
    assert.match(received.cookies,/cdn\.invalid\tFALSE\t\/media\tTRUE/);
    assert.equal(fetches,0);
    runtime.lastError={message:'Native host missing'};
    await context.send({type:'ADD_DOWNLOAD',url:'https://cdn.invalid/media/video.mp4'},value=>reply=value);
    assert.equal(reply.success,false);assert.equal(fetches,0);
  });
  test(`${browser}: DASH and HLS share bounded, coalesced manifest readers`,async()=>{
    const functionSource=source.slice(source.indexOf('async function fetchM3u8Text('),source.indexOf('\nfunction inheritQueryTokens'));
    let fetches=0,releases=[];
    const context=vm.createContext({AbortController,TextDecoder,setTimeout,clearTimeout,
      fetch:async()=>{fetches++;await new Promise(resolve=>releases.push(resolve));let done=false;
        return {ok:true,body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('<MPD/>')}),cancel:async()=>{},releaseLock(){}})}};}});
    vm.runInContext(functionSource+'\nthis.probe=fetchM3u8Text;',context);
    const first=context.probe('https://cdn.invalid/one.mpd');
    const duplicate=context.probe('https://cdn.invalid/one.mpd');
    const pending=[first,duplicate,...[2,3,4].map(i=>context.probe(`https://cdn.invalid/${i}.mpd`))];
    assert.equal(await context.probe('https://cdn.invalid/overflow.mpd'),null);
    assert.equal(fetches,4);releases.forEach(resolve=>resolve());
    assert.deepEqual(await Promise.all(pending),Array(5).fill('<MPD/>'));
    // The automatic MPD entry point must use this reader, not Response.text().
    const dash=source.slice(source.indexOf('// Try DASH'),source.indexOf('// Try DASH')+1800);
    if(dash) assert.doesNotMatch(dash,/\.text\(\)/);
  });
}
