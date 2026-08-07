
async function run() {
  const r = await fetch('https://www.youtube.com/watch?v=Lj38nWZiA1o');
  const html = await r.text();
  const text = html;
  let idx = text.indexOf('ytInitialPlayerResponse');
  if (idx >= 0) {
    let firstBrace = text.indexOf('{', idx);
    let openCount = 0, lastBrace = -1, inString = false, escape = false;
    for (let i = firstBrace; i < text.length; i++) {
      let c = text.charAt(i);
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
      } else {
        if (c === '"') inString = true;
        else if (c === '{') openCount++;
        else if (c === '}') {
          openCount--;
          if (openCount === 0) { lastBrace = i; break; }
        }
      }
    }
    if (lastBrace > firstBrace) {
      const jsonStr = text.substring(firstBrace, lastBrace + 1);
      const j = JSON.parse(jsonStr);
      console.log('Formats:', j.streamingData?.formats?.length, 'Adaptive:', j.streamingData?.adaptiveFormats?.length);
    } else { console.log('Brace failed'); }
  } else { console.log('Not found'); }
}
run();
