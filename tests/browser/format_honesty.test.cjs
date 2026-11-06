const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const browser of ['chrome','firefox']) {
 const context=vm.createContext({window:{location:{href:'https://fixture.invalid',hostname:'fixture.invalid'}},URL});
 for(const [file,name] of [['utils.js','SmartDmUtils'],['format_engine.js','FormatRegistryEngine']])
  vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`,'utf8')+`\nthis.${name}=${name};`,context);
 const engine=context.FormatRegistryEngine;
 test(`${browser}: unverified YouTube quality menu stays empty`,()=>assert.equal(engine.getInstantYouTubeFormats('https://www.youtube.com/watch?v=abcdef12345').length,0));
 test(`${browser}: codec/container representations at the same height stay distinct`,()=>{
  const a={formatId:'137+140',height:1080,ext:'mp4',url:'https://cdn.invalid/mp4'};
  const b={formatId:'248+251',height:1080,ext:'webm',url:'https://cdn.invalid/webm'};
  assert.equal(engine.mergeFormatLists([a],[b]).length,2);
 });
 test(`${browser}: incoming verified URL replaces an expired representation`,()=>{
  const base={formatId:'137+140',height:1080,ext:'mp4',url:'https://cdn.invalid/expired'};
  assert.equal(engine.mergeFormatLists([base],[{...base,url:'https://cdn.invalid/fresh'}])[0].url,'https://cdn.invalid/fresh');
  assert.equal(engine.mergeFormatLists([{...base,provisional:true}],[]).length,0);
 });
 test(`${browser}: bitrate alone never fabricates resolution`,()=>{
  const formats=engine.parseM3u8Formats('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000\nchild.m3u8','https://cdn.invalid/master.m3u8');
  assert.equal(formats.length,1);assert.equal(formats[0].height,0);
 });
}
