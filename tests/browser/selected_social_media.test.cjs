const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const browser of ['chrome','firefox']){
 const ctx=vm.createContext({window:{location:{hostname:'tiktok.com'}},URL});
 for(const [file,name] of [['utils.js','SmartDmUtils'],['visual_mount.js','VisualMountDetector'],['format_engine.js','FormatRegistryEngine'],['overlay_ui.js','OverlayUiRenderer']])vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`,'utf8')+`\nthis.${name}=${name};`,ctx);
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
 test(`${browser}: Instagram muted feed video binding allows download and pairs author title`,()=>{
  ctx.window.location.hostname='instagram.com';
  const attrs={'data-smartdm-bound-src':'blob:insta-1','data-smartdm-video-url':'https://scontent.cdninstagram.com/v/t16/feed.mp4','data-smartdm-separate-audio':'1'};
  const p={currentSrc:'blob:insta-1',videoWidth:1080,videoHeight:1920,getAttribute:k=>attrs[k],closest(){return {querySelector(s){return s==='header a, h2 a, a[role="link"][tabindex="0"]'?{textContent:'athiiiiiiiiiiii'}:null;},querySelectorAll(){return [];}};}};
  const result=engine.selectedSocialFormats(p,[]);
  assert.equal(result.length,1);
  assert.equal(result[0].url,'https://scontent.cdninstagram.com/v/t16/feed.mp4');
  assert.equal(result[0].title,'athiiiiiiiiiiii');
  assert.equal(result[0].audioUrl,null);
  ctx.window.location.hostname='tiktok.com';
 });
 test(`${browser}: Instagram active player falls back to recent Instagram CDN media when unbound`,()=>{
  ctx.window.location.hostname='instagram.com';
  const p={currentSrc:'blob:unbound-insta',videoWidth:720,videoHeight:1280,getAttribute:()=>null,closest:()=>null};
  const media=[
    {url:'https://scontent.cdninstagram.com/v/t16/older.mp4',timestamp:1000},
    {url:'https://scontent.cdninstagram.com/v/t16/active.mp4',timestamp:2000,fbVideoId:'123'},
    {url:'https://scontent.cdninstagram.com/v/t16/audio.mp4',isAudio:true,fbVideoId:'123',timestamp:2050}
  ];
  const result=engine.selectedSocialFormats(p,media);
  assert.equal(result.length,1);
  assert.equal(result[0].url,'https://scontent.cdninstagram.com/v/t16/active.mp4');
  assert.equal(result[0].audioUrl,'https://scontent.cdninstagram.com/v/t16/audio.mp4');
  ctx.window.location.hostname='tiktok.com';
 });
  test(`${browser}: Instagram feed without article extracts post caption via parent container and strips byte-range`, () => {
   ctx.window.location.hostname = 'instagram.com';
   const parentContainer = {
    querySelectorAll(sel) {
     if (sel === 'video') return [{}];
     if (sel === 'div[class*="_a9zs"]') return [{ textContent: 'athiiiiiiiiiiii Intense workout routine for beginners', closest: () => null }];
     return [];
    },
    querySelector(sel) {
     if (sel.includes('header a')) return { textContent: 'athiiiiiiiiiiii', getAttribute: () => '/athiiiiiiiiiiii/' };
     if (sel.includes('Like')) return {};
     return null;
    }
   };
   const p = {
    currentSrc: 'blob:insta-feed-2',
    videoWidth: 1080,
    videoHeight: 1920,
    parentElement: parentContainer,
    closest: () => null,
    getAttribute: k => ({
     'data-smartdm-bound-src': 'blob:insta-feed-2',
     'data-smartdm-video-url': 'https://instagram.fdac14-1.fna.fbcdn.net/v/t50.2886-16/123.mp4?bytestart=0&byteend=1032877&_nc_cat=100',
     'data-smartdm-separate-audio': '0'
    }[k])
   };
   const result = engine.selectedSocialFormats(p, []);
   assert.equal(result.length, 1);
   assert.equal(result[0].title, 'Intense workout routine for beginners');
   assert.equal(result[0].url, 'https://instagram.fdac14-1.fna.fbcdn.net/v/t50.2886-16/123.mp4?_nc_cat=100');
   assert.ok(!result[0].url.includes('bytestart'));
   assert.ok(!result[0].url.includes('byteend'));
   ctx.window.location.hostname = 'tiktok.com';
  });


   test(`${browser}: Instagram feed with multi-line bilingual Japanese caption and author link extracts full caption`, () => {
    ctx.window.location.hostname = 'instagram.com';
    const captionText = 'waiting for summer to cool down.\n夏が少し涼しくなるのを待ってる。... more';
    const captionNode = {
      textContent: `naomiii.live ${captionText}`,
      closest: () => null,
      parentElement: null
    };
    const authorLinkInCaption = {
      getAttribute: (k) => k === 'href' ? '/naomiii.live/' : null,
      closest: () => null,
      parentElement: captionNode
    };
    const feedPostContainer = {
      querySelectorAll(sel) {
        if (sel === 'video') return [{}];
        if (sel.includes('header a')) return [{ textContent: 'naomiii.live', getAttribute: () => '/naomiii.live/' }];
        if (sel.includes('a[href*="/naomiii.live"]')) return [authorLinkInCaption];
        if (sel === 'span[dir="auto"]') {
          return [
            { textContent: 'Sabrina Carpenter • Original audio', closest: () => null },
            { textContent: 'Liked by alex and 5,432 others', closest: () => null },
            { textContent: `naomiii.live ${captionText}`, closest: () => null },
            { textContent: 'View all 88 comments', closest: () => null }
          ];
        }
        return [];
      },
      querySelector(sel) {
        if (sel.includes('header a')) return { textContent: 'naomiii.live', getAttribute: () => '/naomiii.live/' };
        if (sel.includes('Like')) return {};
        return null;
      }
    };
    const p = {
      currentSrc: 'blob:insta-feed-naomi',
      videoWidth: 1080,
      videoHeight: 1920,
      parentElement: feedPostContainer,
      closest: () => null,
      getAttribute: k => ({
        'data-smartdm-bound-src': 'blob:insta-feed-naomi',
        'data-smartdm-video-url': 'https://scontent.cdninstagram.com/v/t16/summer.mp4',
        'data-smartdm-separate-audio': '0'
      }[k])
    };
    const result = engine.selectedSocialFormats(p, []);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'waiting for summer to cool down. 夏が少し涼しくなるのを待ってる。');
    ctx.window.location.hostname = 'tiktok.com';
   });

   test(`${browser}: Instagram post header containing juiceditup • 1 w and caption resolves to caption and rejects 1 w`, () => {
     ctx.window.location.hostname = 'instagram.com';
     const headerTimeNode = {
       tagName: 'TIME',
       textContent: '1 w',
       closest: (sel) => sel === 'time' ? headerTimeNode : null,
       querySelector: () => null
     };
     const headerTimeLink = {
       tagName: 'A',
       textContent: '1 w',
       getAttribute: (k) => k === 'href' ? '/juiceditup/p/DF123/' : null,
       closest: (sel) => sel === 'header' ? headerEl : null,
       querySelector: (sel) => sel === 'time' ? headerTimeNode : null
     };
     const headerAuthorLink = {
       tagName: 'A',
       textContent: 'juiceditup',
       getAttribute: (k) => k === 'href' ? '/juiceditup/' : null,
       closest: (sel) => sel === 'header' ? headerEl : null,
       querySelector: () => null
     };
     const headerEl = {
       tagName: 'HEADER',
       textContent: 'juiceditup • 1 w',
       querySelectorAll(sel) {
         if (sel.includes('a')) return [headerAuthorLink, headerTimeLink];
         return [];
       },
       querySelector(sel) {
         if (sel.includes('a')) return headerAuthorLink;
         if (sel === 'time') return headerTimeNode;
         return null;
       },
       closest: () => null
     };

     const captionNode = {
       tagName: 'DIV',
       textContent: 'juiceditup average teen experience in writing an essay',
       closest: () => null,
       querySelector: () => null
     };

     const postContainer = {
       querySelectorAll(sel) {
         if (sel === 'video') return [{}];
         if (sel.includes('header a')) return [headerAuthorLink, headerTimeLink];
         if (sel === 'div[class*="_a9zs"]') return [captionNode];
         if (sel === 'span[dir="auto"]') {
           return [
             { textContent: 'juiceditup', closest: (s) => s === 'header' ? headerEl : null },
             { textContent: '1 w', closest: (s) => s === 'header' ? headerEl : null, querySelector: (s) => s === 'time' ? headerTimeNode : null },
             { textContent: 'juiceditup average teen experience in writing an essay', closest: () => null }
           ];
         }
         return [];
       },
       querySelector(sel) {
         if (sel.includes('header a')) return headerAuthorLink;
         if (sel.includes('Like')) return {};
         if (sel === 'header') return headerEl;
         return null;
       }
     };

     const p = {
       currentSrc: 'blob:insta-feed-juiced',
       videoWidth: 1080,
       videoHeight: 1920,
       parentElement: postContainer,
       closest: () => null,
       getAttribute: (k) => ({
         'data-smartdm-bound-src': 'blob:insta-feed-juiced',
         'data-smartdm-video-url': 'https://scontent.cdninstagram.com/v/t16/juiced.mp4',
         'data-smartdm-separate-audio': '0'
       }[k])
     };

     const result = engine.selectedSocialFormats(p, []);
     assert.equal(result.length, 1);
     assert.equal(result[0].title, 'average teen experience in writing an essay');
     assert.notEqual(result[0].title, '1 w');
     assert.notEqual(result[0].title, '1 w.mp4');

     // Direct VisualMountDetector extraction
     const directTitle = ctx.VisualMountDetector.extractInstagramMediaTitle(p, postContainer);
     assert.equal(directTitle, 'average teen experience in writing an essay');
     assert.notEqual(directTitle, '1 w');

     // Header with div container (non-semantic header) also rejects 1 w and extracts caption
     const postContainerDivHeader = {
       querySelectorAll(sel) {
         if (sel === 'video') return [{}];
         if (sel.includes('header a')) return [headerAuthorLink, headerTimeLink];
         if (sel === 'div[class*="_a9zs"]') return [captionNode];
         return [];
       },
       querySelector(sel) {
         if (sel.includes('header a')) return headerAuthorLink;
         if (sel.includes('Like')) return {};
         return null;
       }
     };
     const divHeaderTitle = ctx.VisualMountDetector.extractInstagramMediaTitle(p, postContainerDivHeader);
     assert.equal(divHeaderTitle, 'average teen experience in writing an essay');
     assert.notEqual(divHeaderTitle, '1 w');

     // Post with no caption falls back to author - Instagram Video, never timestamp
     const postContainerNoCaption = {
       querySelectorAll(sel) {
         if (sel === 'video') return [{}];
         if (sel.includes('header a')) return [headerAuthorLink, headerTimeLink];
         if (sel === 'span[dir="auto"]') {
           return [
             { textContent: 'juiceditup', closest: (s) => s === 'header' ? headerEl : null },
             { textContent: '1 w', closest: (s) => s === 'header' ? headerEl : null, querySelector: (s) => s === 'time' ? headerTimeNode : null }
           ];
         }
         return [];
       },
       querySelector(sel) {
         if (sel.includes('header a')) return headerAuthorLink;
         if (sel.includes('Like')) return {};
         if (sel === 'header') return headerEl;
         return null;
       }
     };
     const fallbackTitle = ctx.VisualMountDetector.extractInstagramMediaTitle(p, postContainerNoCaption);
     assert.equal(fallbackTitle, 'juiceditup - Instagram Video');
     assert.notEqual(fallbackTitle, '1 w');
     assert.notEqual(fallbackTitle, '1 w - Instagram Video');

     // Caption container with <time> child node must NOT be skipped as a timestamp node
     const captionWithTimeChild = {
       tagName: 'DIV',
       textContent: 'juiceditup average teen experience in writing an essay 1 w',
       closest: () => null,
       querySelector: (s) => s === 'time' ? headerTimeNode : null,
       querySelectorAll: (s) => s === 'time' ? [headerTimeNode] : [],
       cloneNode: () => ({
         innerText: 'juiceditup average teen experience in writing an essay',
         querySelectorAll: () => [headerTimeNode]
       })
     };
     const postContainerCaptionWithTime = {
       querySelectorAll(sel) {
         if (sel === 'video') return [{}];
         if (sel.includes('header a')) return [headerAuthorLink, headerTimeLink];
         if (sel === 'div[class*="_a9zs"]') return [captionWithTimeChild];
         return [];
       },
       querySelector(sel) {
         if (sel.includes('header a')) return headerAuthorLink;
         if (sel.includes('Like')) return {};
         return null;
       }
     };
     const captionWithTimeTitle = ctx.VisualMountDetector.extractInstagramMediaTitle(p, postContainerCaptionWithTime);
     assert.equal(captionWithTimeTitle, 'average teen experience in writing an essay');
     assert.notEqual(captionWithTimeTitle, '1 w');

     // Author link text containing relative timestamp "juiceditup • 1 w" is sanitized to "juiceditup"
     const authorLinkWithTimestamp = {
       tagName: 'A',
       textContent: 'juiceditup • 1 w',
       getAttribute: (k) => k === 'href' ? '/juiceditup/' : null,
       closest: (sel) => sel === 'header' ? headerEl : null,
       querySelector: () => null
     };
     const postContainerAuthorWithTimestamp = {
       querySelectorAll(sel) {
         if (sel === 'video') return [{}];
         if (sel.includes('header a')) return [authorLinkWithTimestamp];
         return [];
       },
       querySelector(sel) {
         if (sel.includes('header a')) return headerAuthorLink;
         if (sel.includes('Like')) return {};
         return null;
       }
     };
     const authorWithTimeTitle = ctx.VisualMountDetector.extractInstagramMediaTitle(p, postContainerAuthorWithTimestamp);
     assert.equal(authorWithTimeTitle, 'juiceditup - Instagram Video');
     assert.notEqual(authorWithTimeTitle, 'juiceditup • 1 w - Instagram Video');
     assert.notEqual(authorWithTimeTitle, '1 w');

     ctx.window.location.hostname = 'tiktok.com';
   });

   test(`${browser}: Instagram generic titles are correctly identified by SmartDmUtils`, () => {
     assert.equal(ctx.SmartDmUtils.isGenericTitle('Instagram Video'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('Instagram Reel'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('Instagram Reels'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('Instagram'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('video'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 w'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 w.mp4'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1w'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('2 d'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('2d'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('3 h'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('3h'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('45 m'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('45m'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('10 s'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('10s'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 y'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1y'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('• 1 w'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 w •'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('• 1 w •'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 wk'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1wk'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 mo'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1mo'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 yr'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1yr'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('juiceditup • 1 w'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('juiceditup • 1w'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('juiceditup • 1 w.mp4'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1 w - Instagram Video'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('1w - Instagram Video'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('2 weeks ago'), true);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('naomiii.live'), false);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('juiceditup'), false);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('waiting for summer to cool down. 夏が少し涼しくなるのを待ってる。'), false);
     assert.equal(ctx.SmartDmUtils.isGenericTitle('average teen experience in writing an essay'), false);
   });

}
