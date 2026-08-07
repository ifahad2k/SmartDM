async function run() {
  const r = await fetch('https://www.youtube.com/watch?v=Wp_w0_d-3W8');
  const html = await r.text();
  console.log(html.substring(0, 1000));
  let idx = html.indexOf('streamingData');
  if (idx > 0) {
    console.log('Found streamingData at', idx);
    console.log(html.substring(idx - 50, idx + 100));
  } else {
    console.log('streamingData not found');
  }
}
run();
