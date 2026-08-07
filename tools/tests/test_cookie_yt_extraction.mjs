import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fileSystem from 'node:fs';

console.log('====================================================');
console.log('Running Cookie & YT Extraction Automated Tests');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. Netscape Cookie Formatting Logic Test
// ----------------------------------------------------
function formatNetscapeCookies(cookies) {
  let cookieStr = '# Netscape HTTP Cookie File\n';
  cookieStr += cookies.map(c => {
    const domain = c.domain;
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const path = c.path || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    return `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`;
  }).join('\n') + '\n';
  return cookieStr;
}

function parseNetscapeCookies(netscapeCookies) {
  if (!netscapeCookies || !netscapeCookies.trim()) return '';
  let cleaned = netscapeCookies.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const lines = cleaned.split(/\r?\n/);
  const pairs = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const name = parts[5];
      const value = parts[6];
      if (name) pairs.push(`${name}=${value}`);
    }
  }
  return pairs.join('; ');
}

console.log('Testing Netscape Cookie Formatting...');

const sampleCookies = [
  {
    domain: '.youtube.com',
    path: '/',
    secure: true,
    expirationDate: 1780000000.951,
    name: 'LOGIN_INFO',
    value: 'AFmmF28wRQIhAN...'
  },
  {
    domain: 'youtube.com',
    path: '/watch',
    secure: false,
    expirationDate: null,
    name: 'VISITOR_INFO1_LIVE',
    value: 's_xyz123abc'
  },
  {
    domain: '.google.com',
    path: '/',
    secure: true,
    expirationDate: 1800000000,
    name: 'SID',
    value: 's_val_999'
  }
];

const formattedNetscape = formatNetscapeCookies(sampleCookies);
console.log('Generated Netscape Cookies:\n' + formattedNetscape);

// Assertion 1: Must start with Netscape HTTP Cookie File header
assert.ok(formattedNetscape.startsWith('# Netscape HTTP Cookie File\n'), 'Header must be # Netscape HTTP Cookie File');

const lines = formattedNetscape.trim().split('\n');
// Header line + 3 cookie lines = 4 lines total
assert.strictEqual(lines.length, 4, 'Should produce exactly 4 lines (1 header + 3 cookies)');

// Line 1 check (.youtube.com)
const cookie1Parts = lines[1].split('\t');
assert.strictEqual(cookie1Parts.length, 7, 'Cookie line 1 must have 7 tab-separated fields');
assert.strictEqual(cookie1Parts[0], '.youtube.com', 'Domain should match');
assert.strictEqual(cookie1Parts[1], 'TRUE', 'Domain starting with . must have subdomains TRUE');
assert.strictEqual(cookie1Parts[2], '/', 'Path should match');
assert.strictEqual(cookie1Parts[3], 'TRUE', 'Secure flag should be TRUE');
assert.strictEqual(cookie1Parts[4], '1780000000', 'Expiration timestamp must be Math.floor integer');
assert.strictEqual(cookie1Parts[5], 'LOGIN_INFO', 'Cookie name should match');
assert.strictEqual(cookie1Parts[6], 'AFmmF28wRQIhAN...', 'Cookie value should match');

// Line 2 check (youtube.com)
const cookie2Parts = lines[2].split('\t');
assert.strictEqual(cookie2Parts.length, 7, 'Cookie line 2 must have 7 tab-separated fields');
assert.strictEqual(cookie2Parts[0], 'youtube.com', 'Domain should match');
assert.strictEqual(cookie2Parts[1], 'FALSE', 'Domain not starting with . must have subdomains FALSE');
assert.strictEqual(cookie2Parts[2], '/watch', 'Path should match');
assert.strictEqual(cookie2Parts[3], 'FALSE', 'Secure flag should be FALSE');
assert.strictEqual(cookie2Parts[4], '0', 'Null expirationDate must be 0');
assert.strictEqual(cookie2Parts[5], 'VISITOR_INFO1_LIVE', 'Cookie name should match');
assert.strictEqual(cookie2Parts[6], 's_xyz123abc', 'Cookie value should match');

// Test Round-Trip Parsing
const parsedHeaderStr = parseNetscapeCookies(formattedNetscape);
assert.strictEqual(parsedHeaderStr, 'LOGIN_INFO=AFmmF28wRQIhAN...; VISITOR_INFO1_LIVE=s_xyz123abc; SID=s_val_999');

console.log('✓ Netscape Cookie Formatting Logic: PASSED\n');

// ----------------------------------------------------
// 2. YtDlpExtractor Java Integration Verification
// ----------------------------------------------------
console.log('Testing Java YtDlpExtractor cookie handling & execution arguments via Gradle...');

const projectRoot = path.resolve(import.meta.dirname, '../../');
const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

try {
  const output = execSync(`${gradlewCmd} :modules:media-ytdlp:test`, {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log('Gradle Test Output:\n' + output);
  assert.ok(output.includes('BUILD SUCCESSFUL'), 'Gradle test build must be successful');
  console.log('✓ YtDlpExtractor Java Cookie Extraction & Argument Test: PASSED\n');
} catch (err) {
  console.error('Error running YtDlpExtractor Java Test:', err.stdout || err.message);
  process.exit(1);
}

console.log('====================================================');
console.log('ALL COOKIE & YT EXTRACTION TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
