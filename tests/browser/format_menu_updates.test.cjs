const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {this.children = []; this.style = {}; this.dataset = {}; this.listeners = {};}
  set innerHTML(value) {this.children = []; this.html = value;}
  get innerHTML() {return this.html || '';}
  appendChild(node) {this.children.push(node); node.parent = this;}
  insertBefore(node, before) {this.children.splice(this.children.indexOf(before), 0, node); node.parent = this;}
  replaceChildren(...nodes) {this.children = []; nodes.forEach(node => this.appendChild(node));}
  remove() {this.parent?.children.splice(this.parent.children.indexOf(this), 1);}
  setAttribute(name, value) {this[name] = value;}
  addEventListener(name, fn) {this.listeners[name] = fn;}
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.className === selector.slice(1)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) {
    const key = selector.match(/data-format-key="([^"]+)"/)?.[1];
    return key ? this.children.find(child => child.dataset.formatKey === key) : this.querySelectorAll(selector)[0] || null;
  }
}

for (const browser of ['chrome', 'firefox']) {
  const sizeFixture = () => {
    const requests=[];
    const context=vm.createContext({document:{createElement:()=>new Element()},window:{location:{hostname:'player.invalid'}},URL,CSS:{escape:v=>v},
      chrome:{runtime:{sendMessage:(request,reply)=>requests.push({request,reply})}},FormatRegistryEngine:{drainStashedManifests(){}}});
    for(const [file,name] of [['utils.js','SmartDmUtils'],['overlay_ui.js','OverlayUiRenderer']])
      vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`,'utf8')+`\nthis.${name}=${name};`,context);
    const container=new Element(),format={formatId:'quality',height:720,ext:'mp4',url:'https://cdn.invalid/file.mp4'};
    const render=fmt=>context.OverlayUiRenderer.renderFormatDropdown(container,[fmt],'https://page.invalid/video',{},'Movie');
    return {context,container,format,requests,render};
  };

  test(`${browser}: exact sizes remain visible beside separate format text, including small media`,()=>{
    const f=sizeFixture();f.render({...f.format,fileSize:200*1024});
    assert.equal(f.container.children[0].querySelector('.format-size').textContent,'200 KB');
    assert.equal(f.container.children[0].querySelector('.format-badge').textContent,'MP4');
    assert.equal(f.requests.length,0);
  });

  test(`${browser}: unknown sizes resolve without changing the download snapshot and survive refresh`,()=>{
    const f=sizeFixture();f.render(f.format);
    const row=f.container.children[0];assert.equal(row.querySelector('.format-size').textContent,'Checking size…');
    assert.equal(f.requests[0].request.type,'GET_MEDIA_SIZE');
    f.requests[0].reply({success:true,fileSize:8*1024*1024});
    assert.equal(row.querySelector('.format-size').textContent,'8 MB');
    assert.equal(f.format.fileSize,undefined);
    f.render(f.format);assert.equal(f.requests.length,1);
    assert.equal(row.querySelector('.format-size').textContent,'8 MB');
  });

  test(`${browser}: estimates are marked and converted audio/cover do not inherit video bytes`,()=>{
    const f=sizeFixture();f.render({...f.format,url:'https://cdn.invalid/master.m3u8',mediaKind:'hls',fileSize:3*1024*1024});
    assert.equal(f.container.children[0].querySelector('.format-size').textContent,'≈ 3 MB');
    const audio=f.container.children.find(row=>row.dataset.isAudio==='true');
    assert.equal(audio.querySelector('.format-size').textContent,'Size after conversion');
    const cover=f.container.children.find(row=>row.dataset.isThumb==='true');
    assert.equal(cover.querySelector('.format-size').textContent,'Size unknown');
    assert.equal(f.requests.length,0);
  });

  test(`${browser}: a late size reply cannot label the next selected source`,()=>{
    const f=sizeFixture();f.render(f.format);f.render({...f.format,url:'https://cdn.invalid/next.mp4'});
    f.requests[0].reply({success:true,fileSize:1024});assert.equal(f.requests.length,2);
    assert.equal(f.requests[1].request.url,'https://cdn.invalid/next.mp4');
    f.requests[1].reply({success:true,fileSize:2*1024*1024});
    assert.equal(f.container.children[0].querySelector('.format-size').textContent,'2 MB');
    const g=sizeFixture();g.render({...g.format,audioUrl:'https://cdn.invalid/a1.mp4'});g.render({...g.format,audioUrl:'https://cdn.invalid/a2.mp4'});
    g.requests[0].reply({success:true,fileSize:1024});assert.equal(g.requests.length,2);
    assert.equal(g.requests[1].request.audioUrl,'https://cdn.invalid/a2.mp4');
  });

  test(`${browser}: HLS quality labels never replace the selected movie filename`, () => {
    const context = vm.createContext({document: {createElement: () => new Element()},
      window: {location: {hostname: 'player.invalid'}}, URL, CSS: {escape: value => value},
      FormatRegistryEngine: {drainStashedManifests() {}}});
    for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['overlay_ui.js', 'OverlayUiRenderer']])
      vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
    for (const label of ['1080p Full HD (MP4)', '720p HD (MP4)', '360p SD (MP4)', '4K UHD (MP4)', 'Playing quality (MP4)']) {
      const container = new Element(); let sent;
      const format = {formatId: 'quality', title: label, resolution: label, ext: 'mp4', height: 1080, url: 'https://cdn.invalid/content?v=selected'};
      context.OverlayUiRenderer.renderFormatDropdown(container, [format], 'https://page.invalid/movie', {}, 'The Odyssey', false,
        (_, target, title) => {sent = {target, title};});
      container.children[0].listeners.click({preventDefault() {}, stopPropagation() {}});
      assert.equal(sent.target.fileName, 'The Odyssey.mp4');
      assert.equal(sent.title, 'The Odyssey');
    }
    assert.equal(context.SmartDmUtils.isGenericTitle('1080p: A Film About Cameras'), false);
  });
  test(`${browser}: an existing menu row sends the latest video/audio snapshots and title`, () => {
    const context = vm.createContext({document: {createElement: () => new Element()},
      window: {location: {hostname: 'player.invalid'}}, URL, CSS: {escape: value => value},
      FormatRegistryEngine: {drainStashedManifests() {}}});
    for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['overlay_ui.js', 'OverlayUiRenderer']])
      vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
    const container = new Element(), popover = {};
    const first = {formatId: 'captured_hls_1080', url: 'https://cdn.invalid/video.m3u8', ext: 'mp4',
      height: 1080, title: 'Initial title', mediaKind: 'hls', manifestText: 'first-video-snapshot'};
    let sent;
    const download = (formats, target, title) => {sent = {formats, target, title};};
    context.OverlayUiRenderer.renderFormatDropdown(container, [first], 'https://player.invalid/e/1', popover, 'Initial title', false, download);
    const existingRow = container.children[0];
    const updated = {...first, title: 'Resolved episode title', manifestText: 'latest-video-snapshot',
      audioUrl: 'https://cdn.invalid/audio.m3u8', audioManifestText: 'latest-audio-snapshot'};
    context.OverlayUiRenderer.renderFormatDropdown(container, [updated], 'https://player.invalid/e/1', popover, 'Resolved episode title', false, download);
    assert.equal(container.children[0], existingRow);
    existingRow.listeners.click({preventDefault() {}, stopPropagation() {}});
    assert.equal(sent.target.audioUrl, updated.audioUrl);
    assert.equal(sent.formats[0].audioManifestText, updated.audioManifestText);
    assert.equal(sent.formats[0].manifestText, updated.manifestText);
    assert.equal(sent.title, updated.title);
  });
  test(`${browser}: selected measured 576p is not advertised as 720p`, () => {
    const context = vm.createContext({document: {createElement: () => new Element()},
      window: {location: {hostname: 'www.tiktok.com'}}, URL, CSS: {escape: value => value},
      FormatRegistryEngine: {drainStashedManifests() {}}});
    for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['overlay_ui.js', 'OverlayUiRenderer']])
      vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
    const container = new Element();
    context.OverlayUiRenderer.renderFormatDropdown(container,
      [{formatId:'selected_576_0',height:576,resolution:'576p (captured stream)',url:'https://cdn.invalid/selected.mp4'}],
      'https://www.tiktok.com/', {}, 'Actual caption');
    assert.equal(container.children[0].querySelector('.format-title').textContent, '576p');
    assert.equal(container.children[0].querySelector('.format-badge').textContent, 'MP4');
    assert.equal(container.children[0].dataset.height, '576');
  });
}
