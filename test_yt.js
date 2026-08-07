async function run() {
  const r = await fetch('https://www.youtube.com/watch?v=Wp_w0_d-3W8', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const text = await r.text();
  console.log('Length:', text.length);
  
  let idx1 = text.indexOf('ytInitialPlayerResponse');
  console.log('Index:', idx1);
  if (idx1 >= 0) {
    console.log('Context:', text.substring(idx1, idx1 + 100));
  }
}
run();
