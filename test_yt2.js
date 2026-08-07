async function run() {
  const r = await fetch('https://www.youtube.com/watch?v=Wp_w0_d-3W8');
  const text = await r.text();
  
  let i = 0;
  let matches = [];
  while (true) {
    let idx = text.indexOf('ytInitialPlayerResponse', i);
    if (idx < 0) break;
    matches.push(text.substring(idx - 20, idx + 100));
    i = idx + 1;
  }
  console.log('Matches:', matches.length);
  matches.forEach((m, index) => {
    console.log(`\nMatch ${index}:`);
    console.log(m);
  });
}
run();
