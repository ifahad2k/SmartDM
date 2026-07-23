const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });
  
  const result = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a#thumbnail');
    if (anchors.length === 0) return { error: 'No thumbnails found' };
    
    const anchor = anchors[0];
    const wrapper = anchor.closest('ytd-thumbnail') || anchor;
    let attachTarget = wrapper.querySelector('#overlays');
    if (!attachTarget) attachTarget = wrapper;
    
    const host = document.createElement('div');
    host.className = 'smartdm-host';
    host.style.position = 'absolute';
    host.style.top = '6px';
    host.style.right = '6px';
    host.style.zIndex = '99999';
    host.style.width = '50px';
    host.style.height = '20px';
    host.style.backgroundColor = 'red';
    
    attachTarget.appendChild(host);
    
    const rect = host.getBoundingClientRect();
    const computed = window.getComputedStyle(host);
    
    return {
      wrapperTag: wrapper.tagName,
      targetTag: attachTarget.tagName,
      targetId: attachTarget.id,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      zIndex: computed.zIndex
    };
  });
  
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
