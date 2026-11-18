const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(browser, initial) {
  let changed, stored = initial;
  const hosts = [];
  const api = {storage:{local:{
    get: async () => ({smartdmAppearance: stored}),
    set: async payload => {stored = payload.smartdmAppearance;}
  },onChanged:{addListener: callback => {changed = callback;}}}};
  const context = vm.createContext({chrome:api,document:{querySelectorAll:()=>hosts}});
  const source = fs.readFileSync(`extensions/${browser}/modules/appearance.js`,'utf8');
  const load = () => vm.runInContext(source+'\nthis.Appearance=OverlayAppearance;',context);
  const host = () => {
    const attrs = {}, styles = {};
    const node={setAttribute:(name,value)=>{attrs[name]=value;},style:{setProperty:(name,value)=>{styles[name]=value;}}};
    hosts.push(node);
    return {node,attrs,styles};
  };
  return {api,context,load,host,get appearance(){return context.Appearance;},
    stored:()=>stored,emit:value=>changed({smartdmAppearance:{newValue:value}},'local')};
}

for(const browser of ['chrome','firefox']) {
  test(`${browser}: selected Graphite defaults and independent 0/100 opacity endpoints are preserved`,async()=>{
    const f=fixture(browser);f.load();await f.appearance.init();
    assert.equal(f.appearance.value.menuOpacity,100);
    assert.equal(f.appearance.value.buttonOpacity,0);
    const h=f.host();f.appearance.apply(h.node);
    assert.equal(h.styles['--sdm-menu-opacity'],'100%');
    assert.equal(h.styles['--sdm-button-opacity'],'0%');
    await f.appearance.save({theme:'dark',menuOpacity:0,buttonOpacity:100,secret:'must not persist'});
    assert.equal(f.stored().menuOpacity,0);assert.equal(f.stored().buttonOpacity,100);
    assert.deepEqual(Object.keys(f.stored()).sort(),['buttonOpacity','menuOpacity','theme']);
    assert.equal(h.attrs['data-smartdm-theme'],'dark');
  });

  test(`${browser}: malformed persisted settings are bounded and cannot inject CSS`,async()=>{
    const f=fixture(browser,{theme:'dark; color:red',menuOpacity:-5,buttonOpacity:Infinity});f.load();await f.appearance.init();
    assert.equal(f.appearance.value.theme,'auto');assert.equal(f.appearance.value.menuOpacity,0);
    assert.equal(f.appearance.value.buttonOpacity,0);
    const normalized=f.appearance.normalize({theme:'light',menuOpacity:101,buttonOpacity:'0;display:none'});
    assert.equal(normalized.menuOpacity,100);assert.equal(normalized.buttonOpacity,0);
  });

  test(`${browser}: browser storage changes update mounted hosts and newly mounted controls`,async()=>{
    const f=fixture(browser,{theme:'light',menuOpacity:45,buttonOpacity:67});f.load();await f.appearance.init();
    const first=f.host();f.appearance.apply(first.node);
    assert.equal(first.styles['--sdm-menu-opacity'],'45%');
    f.emit({theme:'dark',menuOpacity:23,buttonOpacity:8});
    assert.equal(first.styles['--sdm-menu-opacity'],'23%');
    assert.equal(first.attrs['data-smartdm-theme'],'dark');
    const second=f.host();f.appearance.apply(second.node);
    assert.equal(second.styles['--sdm-button-opacity'],'8%');
    f.emit(undefined);assert.equal(first.styles['--sdm-menu-opacity'],'100%');
  });

  test(`${browser}: an old startup read cannot overwrite a newer storage event`,async()=>{
    const f=fixture(browser);let resolve;
    f.api.storage.local.get=()=>new Promise(done=>{resolve=done;});f.load();
    f.emit({theme:'light',menuOpacity:12,buttonOpacity:34});
    resolve({smartdmAppearance:{theme:'dark',menuOpacity:88,buttonOpacity:99}});
    await f.appearance.init();assert.equal(f.appearance.value.menuOpacity,12);
  });

  test(`${browser}: storage failures retain defaults and failed saves are not reported as persisted`,async()=>{
    const f=fixture(browser);f.api.storage.local.get=async()=>{throw Error('unavailable');};
    f.api.storage.local.set=async()=>{throw Error('unavailable');};f.load();await f.appearance.init();
    assert.equal(f.appearance.value.menuOpacity,100);
    await assert.rejects(f.appearance.save({menuOpacity:5,buttonOpacity:8}));
  });

  test(`${browser}: packaged toolbar popup, local settings and styles are complete`,()=>{
    const base=`extensions/${browser}/`;
    const manifest=JSON.parse(fs.readFileSync(base+'manifest.json','utf8'));
    assert.ok(manifest.permissions.includes('storage'));
    assert.equal(manifest.action.default_popup,'popup.html');
    assert.equal(manifest.options_ui,undefined);
    const scripts=manifest.content_scripts.find(entry=>entry.js.includes('modules/overlay_ui.js')).js;
    assert.ok(scripts.indexOf('modules/appearance.js')<scripts.indexOf('modules/overlay_ui.js'));
    const html=fs.readFileSync(base+'popup.html','utf8');
    assert.equal((html.match(/type="range" min="0" max="100"/g)||[]).length,2);
    for(const file of ['popup.css','popup.js','modules/appearance.js']) assert.ok(fs.existsSync(base+file));
    const context=vm.createContext({});
    vm.runInContext(fs.readFileSync(base+'modules/overlay_ui.js','utf8')+'\nthis.Renderer=OverlayUiRenderer;',context);
    const css=context.Renderer.getStyles();
    assert.match(css,/border-radius:12px/);assert.match(css,/--sdm-menu-opacity/);
    assert.match(css,/--sdm-button-opacity/);assert.match(css,/color-scheme:light/);
    assert.doesNotMatch(css,/#38bdf8|0 12px 32px/);
  });

  const popup = async () => {
    const f=fixture(browser),nodes={};
    for(const id of ['appearance-form','theme','menu-opacity','button-opacity','save-status','menu-value','button-value','reset','download-page','download-status'])
      nodes[id]={value:'',textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
    f.context.document.getElementById=id=>nodes[id];
    f.context.document.documentElement={style:{}};
    f.load();await f.appearance.init();
    vm.runInContext(fs.readFileSync(`extensions/${browser}/popup.js`,'utf8'),f.context);
    await new Promise(resolve=>setImmediate(resolve));
    return {f,nodes};
  };

  test(`${browser}: toolbar controls save the last slider value and reset both values`,async()=>{
    const {f,nodes}=await popup();
    const releases=[],set=f.api.storage.local.set;
    f.api.storage.local.set=async payload=>{await new Promise(resolve=>releases.push(resolve));await set(payload);};
    nodes['menu-opacity'].value='40';nodes['button-opacity'].value='5';nodes['appearance-form'].listeners.input();
    nodes['menu-opacity'].value='7';nodes['button-opacity'].value='90';nodes['appearance-form'].listeners.input();
    assert.equal(releases.length,1);releases.shift()();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(releases.length,1);releases.shift()();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.stored().menuOpacity,7);assert.equal(f.stored().buttonOpacity,90);
    assert.equal(nodes['menu-value'].textContent,'7%');assert.equal(nodes['button-value'].textContent,'90%');
    assert.equal(nodes['save-status'].textContent,'Saved');
    f.api.storage.local.set=set;nodes.reset.listeners.click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.stored().menuOpacity,100);assert.equal(f.stored().buttonOpacity,0);
  });

  test(`${browser}: toolbar retains sending the active website through the existing download handoff`,async()=>{
    const {f,nodes}=await popup();let sent;
    f.api.tabs={query:async()=>[{url:'https://example.test/video/selected'}]};
    f.api.runtime={sendMessage:async message=>{sent=message;return {success:true};}};
    await nodes['download-page'].listeners.click();
    assert.equal(sent.type,'ADD_DOWNLOAD');assert.equal(sent.url,'https://example.test/video/selected');
    assert.equal(nodes['download-status'].textContent,'Sent to SmartDM.');
    sent=null;f.api.tabs.query=async()=>[{url:'chrome://extensions/'}];
    await nodes['download-page'].listeners.click();assert.equal(sent,null);
    assert.equal(nodes['download-status'].textContent,'Open a website first.');
  });

  test(`${browser}: toolbar reports storage and desktop failures`,async()=>{
    const {f,nodes}=await popup();
    f.api.storage.local.set=async()=>{throw Error('unavailable');};
    nodes['appearance-form'].listeners.input();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(nodes['save-status'].textContent,'Could not save. Try again.');
    f.api.tabs={query:async()=>[{url:'https://example.test'}]};
    f.api.runtime={sendMessage:async()=>({success:false})};
    await nodes['download-page'].listeners.click();assert.equal(nodes['download-status'].textContent,'Check that SmartDM is running.');
    f.api.runtime.sendMessage=async()=>{throw Error('unavailable');};
    await nodes['download-page'].listeners.click();assert.equal(nodes['download-status'].textContent,'Could not reach SmartDM.');
  });


}

test('Chrome and Firefox ship the same authored appearance components',()=>{
  for(const file of ['popup.html','popup.css','popup.js','modules/appearance.js','modules/overlay_ui.js','modules/watcher.js'])
    assert.equal(fs.readFileSync('extensions/chrome/'+file,'utf8'),fs.readFileSync('extensions/firefox/'+file,'utf8'),file);
});
