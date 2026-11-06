const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: manifest references all required local discovery assets`, () => {
    const root = path.resolve('extensions', browser);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts.flatMap(entry => entry.js || []);
    scripts.push(...(manifest.background.scripts || []));
    if (manifest.background.service_worker) scripts.push(manifest.background.service_worker);
    for (const file of scripts) {
      const resolved = path.resolve(root, file);
      assert.ok(resolved.startsWith(root + path.sep));
      assert.ok(fs.statSync(resolved).isFile(), file);
    }
    const sniffer = manifest.content_scripts.find(entry => entry.js.includes('sniffer.js'));
    assert.equal(sniffer.world, 'MAIN');
    assert.equal(sniffer.run_at, 'document_start');
    assert.equal(sniffer.all_frames, true);
  });
}

test('Firefox uses its background page, Gecko identity and native host registration', () => {
  const manifest = JSON.parse(fs.readFileSync('extensions/firefox/manifest.json', 'utf8'));
  assert.deepEqual(manifest.background.scripts, ['background.js']);
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.key, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, 'smartdm-extension@smartdm.io');
  assert.ok(Number.parseInt(manifest.browser_specific_settings.gecko.strict_min_version) >= 128);
  const host = JSON.parse(fs.readFileSync('extensions/firefox/host/io.smartdm.host.firefox.json', 'utf8'));
  assert.deepEqual(host.allowed_extensions, [manifest.browser_specific_settings.gecko.id]);
  const install = fs.readFileSync('extensions/firefox/host/install.bat', 'utf8');
  const uninstall = fs.readFileSync('extensions/firefox/host/uninstall.bat', 'utf8');
  assert.match(install, /Software\\Mozilla\\NativeMessagingHosts/);
  assert.match(install, /io\.smartdm\.host\.firefox\.json/);
  assert.match(uninstall, /Software\\Mozilla\\NativeMessagingHosts/);
  const linuxInstall = fs.readFileSync('extensions/firefox/host/install.sh', 'utf8');
  const linuxUninstall = fs.readFileSync('extensions/firefox/host/uninstall.sh', 'utf8');
  assert.match(linuxInstall, /\.mozilla\/native-messaging-hosts/);
  assert.match(linuxInstall, /"allowed_extensions"/);
  assert.match(linuxInstall, /smartdm-extension@smartdm\.io/);
  assert.match(linuxUninstall, /\.mozilla\/native-messaging-hosts/);
  assert.doesNotMatch(linuxInstall + linuxUninstall, /google-chrome|allowed_origins|chrome-extension:\/\//);
});
