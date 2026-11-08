const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const html = fs.readFileSync(
  "tools/testing-desk/smartdm_testing_checklist.html",
  "utf8",
);
const context = vm.createContext({
  crypto: webcrypto,
  URL,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  Blob,
  atob,
  console,
});
vm.runInContext(
  html.match(/<script id="testing-core">([\s\S]*?)<\/script>/)[1],
  context,
);
new vm.Script(html.match(/<script id="testing-app">([\s\S]*?)<\/script>/)[1]);
const C = context.TestingDeskCore,
  plain = (x) => JSON.parse(JSON.stringify(x));
const seeds = JSON.parse(
  html.match(
    /<script id="seed-data" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
function sample() {
  const w = C.createWorkspace();
  w.sites.push(
    C.makeSite("Movie test", "https://movie.invalid/watch/1", "Movies"),
  );
  w.selectedSiteId = w.sites[0].id;
  return w;
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7zsAAAAASUVORK5CYII=",
  "base64",
);
function screenshot() {
  return {
    id: C.id("img"),
    name: "test screenshot.png",
    type: "image/png",
    size: png.length,
    caption: "Download error",
    createdAt: C.now(),
  };
}

test("preserves all 49 original sites and 102 checks without claiming a whole-site pass", () => {
  const w = C.createWorkspace(seeds);
  assert.equal(w.sites.length, 49);
  assert.equal(
    w.sites.reduce((n, s) => n + s.checks.length, 0),
    102,
  );
  const checks = Array.from({ length: 102 }, (_, i) => i % 2 === 0);
  assert.equal(C.migrateLegacy(w, checks), 51);
  assert.ok(w.sites.every((s) => s.status === "untested"));
  assert.equal(C.summary(w.sites).pass, 0);
  assert.equal(C.migrateLegacy(w, [true]), 0);
});
test("imports pipe, tab, CSV, Markdown and name/URL pairs with useful error rows", () => {
  assert.equal(
    C.parseSites(
      "Name | URL | Category\nExample | https://example.com | Movies",
    ).valid[0].category,
    "Movies",
  );
  assert.equal(
    C.parseSites("Name\tURL\nExample\thttps://example.com").valid[0].name,
    "Example",
  );
  assert.equal(
    C.parseSites(
      'Name,URL,Category\n"Example, One",https://example.com,"Movies, TV"',
    ).valid[0].name,
    "Example, One",
  );
  assert.equal(
    C.parseSites("[Example](https://example.com)").valid[0].name,
    "Example",
  );
  assert.equal(
    C.parseSites("Example\nhttps://example.com").valid[0].name,
    "Example",
  );
  assert.equal(
    C.parseSites("Example https://example.com").valid[0].name,
    "Example",
  );
  assert.equal(
    C.parseSites("https://example.com/watch?a=1,b=2").valid[0].url,
    "https://example.com/watch?a=1,b=2",
  );
  const bad = C.parseSites(
    "Bad | javascript:alert(1)\nGood | https://good.invalid",
  );
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.errors[0].line, 1);
  assert.equal(bad.valid.length, 1);
});
test("duplicate site imports retain existing results and exact query/hash identities", () => {
  const w = sample();
  C.result(w.sites[0], "pass");
  const rows = C.parseSites(
    "Again | https://movie.invalid/watch/1\nNew | https://movie.invalid/watch/1?server=2#player",
    w.sites,
  );
  assert.equal(rows.duplicates.length, 1);
  assert.equal(rows.valid.length, 1);
  assert.equal(w.sites[0].status, "pass");
});
test("one site supports several distinct bugs and an honest retest/pass workflow", () => {
  const s = sample().sites[0];
  s.bugs.push(C.makeBug(s.url), C.makeBug(s.url));
  C.result(s, "fail");
  assert.throws(() => C.result(s, "pass"), /open bugs/);
  s.bugs[0].status = "fixed";
  s.bugs[1].status = "verified";
  assert.throws(() => C.result(s, "pass"), /open bugs/);
  s.bugs[0].status = "verified";
  s.checks[0].result = "fail";
  assert.throws(() => C.result(s, "pass"), /failed checks/);
  s.checks[0].result = "pass";
  C.result(s, "pass");
  assert.equal(s.history.length, 2);
  assert.equal(s.history[0].status, "pass");
  assert.equal(s.history[1].status, "fail");
});
test("AI reports retain exact reproduction details, successes and site-specific screenshot links", () => {
  const w = sample(),
    s = w.sites[0];
  s.bugs.push({
    ...C.makeBug(s.url),
    title: "Wrong movie",
    actual: "Different media, no audio",
    steps: "1. Play\n2. Download",
    expected: "Selected movie with sound",
    server: "HD-2",
    evidence: [screenshot()],
  });
  s.checks[0].result = "pass";
  C.result(s, "fail");
  const passed = C.makeSite("Passing site", "https://pass.invalid", "Video");
  C.result(passed, "pass");
  w.sites.push(passed);
  const all = C.report(w, w.sites);
  assert.equal(all.data.summary.pass, 1);
  assert.equal(all.data.summary.fail, 1);
  assert.match(all.markdown, /Different media, no audio/);
  assert.match(all.markdown, /\[Passed\] Media is detected/);
  assert.match(
    all.markdown,
    new RegExp(C.imagePath(s.bugs[0].evidence[0]).replaceAll(".", "\\.")),
  );
  const one = C.report(w, [s]);
  assert.equal(one.data.sites.length, 1);
  assert.doesNotMatch(one.markdown, /Passing site/);
  assert.equal(
    one.data.sites[0].bugs[0].evidence[0].file,
    C.imagePath(s.bugs[0].evidence[0]),
  );
  assert.equal(
    C.report(w, [s], false).data.sites[0].bugs[0].evidence[0].file,
    null,
  );
});
test("backup restores multiple bugs, draft URLs, Unicode and original screenshot bytes", async () => {
  const w = sample(),
    s = w.sites[0];
  s.name = "বাংলা / Movie";
  s.bugs.push(
    {
      ...C.makeBug(),
      title: "Audio missing",
      url: "partially typed URL",
      evidence: [screenshot()],
    },
    C.makeBug(),
  );
  const backup = {
    schemaVersion: 2,
    kind: "smartdm-testing-backup",
    workspace: plain(w),
    assets: [
      {
        id: s.bugs[0].evidence[0].id,
        dataUrl: "data:image/png;base64," + png.toString("base64"),
      },
    ],
  };
  const restored = C.validateBackup(backup);
  assert.equal(restored.workspace.sites[0].name, s.name);
  assert.equal(restored.workspace.sites[0].bugs.length, 2);
  assert.equal(restored.workspace.sites[0].bugs[0].url, "partially typed URL");
  assert.deepEqual(
    Buffer.from(
      await restored.assets.get(s.bugs[0].evidence[0].id).arrayBuffer(),
    ),
    png,
  );
});
test("rejects corrupt or executable screenshot backups and unsafe site links", () => {
  const w = sample(),
    e = screenshot();
  w.sites[0].evidence.push(e);
  const backup = {
    schemaVersion: 2,
    kind: "smartdm-testing-backup",
    workspace: plain(w),
    assets: [
      { id: e.id, dataUrl: "data:image/png;base64," + png.toString("base64") },
    ],
  };
  const missing = plain(backup);
  missing.assets = [];
  assert.throws(() => C.validateBackup(missing), /inventory/);
  const corrupt = plain(backup);
  corrupt.assets[0].dataUrl =
    "data:image/png;base64," + Buffer.alloc(png.length).toString("base64");
  assert.throws(() => C.validateBackup(corrupt), /contents/);
  const svg = plain(backup);
  svg.assets[0].dataUrl = "data:image/svg+xml;base64,PHN2Zz4=";
  assert.throws(() => C.validateBackup(svg), /Invalid screenshot/);
  const unsafe = plain(w);
  unsafe.sites[0].url = "https://secret:password@example.com";
  assert.throws(() => C.validateWorkspace(unsafe), /credentials/);
  assert.equal(
    C.esc('<img onerror="alert(1)">'),
    "&lt;img onerror=&quot;alert(1)&quot;&gt;",
  );
});
test("duplicate record IDs and forged passed states do not survive backup validation", () => {
  const w = sample();
  w.sites.push(plain(w.sites[0]));
  assert.throws(() => C.validateWorkspace(w), /duplicate/);
  w.sites.pop();
  w.sites[0].status = "pass";
  w.sites[0].bugs.push(C.makeBug());
  assert.equal(C.validateWorkspace(w).sites[0].status, "fail");
});
test("ZIP export is readable by an independent ZIP implementation with exact screenshot bytes", async () => {
  const w = sample(),
    s = w.sites[0],
    e = screenshot();
  s.evidence.push(e);
  const r = C.report(w, [s]);
  const data = await C.zip([
    { name: "report.md", data: r.markdown },
    { name: "report.json", data: JSON.stringify(r.data) },
    { name: C.imagePath(e), data: new Uint8Array(png) },
  ]).arrayBuffer();
  const python = spawnSync(
    "python",
    [
      "-c",
      "import zipfile,io,sys,json,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({'bad':z.testzip(),'files':z.namelist(),'report':json.loads(z.read('report.json')),'image':base64.b64encode(z.read(next(n for n in z.namelist() if n.startswith('screenshots/')))).decode()}))",
    ],
    { input: Buffer.from(data), encoding: "utf8" },
  );
  assert.equal(python.status, 0, python.stderr);
  const decoded = JSON.parse(python.stdout);
  assert.equal(decoded.bad, null);
  assert.equal(decoded.report.sites[0].id, s.id);
  assert.equal(decoded.image, png.toString("base64"));
  assert.equal(decoded.files.length, 3);
  assert.throws(
    () => C.zip([{ name: "../escape.txt", data: "bad" }]),
    /archive path/,
  );
});
