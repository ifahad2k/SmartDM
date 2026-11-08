const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: Google Sheets export passes authoritative filename, MIME, referer, and Google cookies`, async () => {
    let sentNativeMessage = null;
    let cancelledId = null;
    let erasedId = null;

    const runtime = {
      lastError: null,
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      connectNative() {
        return {
          postMessage(msg) { sentNativeMessage = msg; },
          onMessage: { addListener() {} },
          onDisconnect: { addListener() {} }
        };
      },
      sendMessage(msg, cb) { if (cb) cb({ status: 'ok', success: true }); },
      sendNativeMessage(host, msg, cb) {
        sentNativeMessage = msg;
        if (cb) cb({ status: 'ok', success: true });
      }
    };

    const listeners = {
      onDeterminingFilename: [],
      onCreated: []
    };

    const downloads = {
      onDeterminingFilename: browser === 'chrome' ? {
        addListener(fn) { listeners.onDeterminingFilename.push(fn); }
      } : undefined,
      onCreated: {
        addListener(fn) { listeners.onCreated.push(fn); }
      },
      cancel(id, cb) {
        cancelledId = id;
        if (cb) cb();
      },
      erase(query, cb) {
        erasedId = query && query.id;
        if (cb) cb([erasedId]);
      },
      download() {}
    };

    const tabs = {
      query(q, cb) {
        cb([
          {
            id: 101,
            title: 'Q4 Budget Report - Google Sheets',
            url: 'https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit'
          }
        ]);
      },
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
      sendMessage() {}
    };

    const queriedCookieDomains = [];
    const queriedCookieUrls = [];

    const cookies = {
      getAll(details, cb) {
        if (details.domain) queriedCookieDomains.push(details.domain);
        if (details.url) queriedCookieUrls.push(details.url);

        if (details.domain && (details.domain === 'docs.google.com' || details.domain === '.docs.google.com')) {
          cb([
            { domain: 'docs.google.com', name: 'OSID', value: 'docs_token_456', path: '/', secure: true }
          ]);
        } else if (details.domain && (details.domain === 'google.com' || details.domain === '.google.com')) {
          cb([
            { domain: '.google.com', name: 'SID', value: 'google_session_token_123', path: '/', secure: true }
          ]);
        } else {
          cb([]);
        }
      }
    };

    const window = {
      location: { href: 'https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit', origin: 'https://docs.google.com', hostname: 'docs.google.com' },
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    };
    window.top = window.self = window;

    const document = {
      readyState: 'complete',
      documentElement: { hasAttribute() { return true; } },
      referrer: '',
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };

    const context = vm.createContext({
      window,
      document,
      navigator: { userAgent: 'Mozilla/5.0 Chrome/131.0.0.0' },
      chrome: {
        runtime,
        downloads,
        tabs,
        cookies,
        contextMenus: { create() {}, onClicked: { addListener() {} } },
        action: { onClicked: { addListener() {} } },
        webRequest: {
          onSendHeaders: { addListener() {} },
          onHeadersReceived: { addListener() {} }
        }
      },
      setTimeout,
      clearTimeout,
      URL,
      decodeURIComponent
    });

    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');
    vm.runInContext(bgSource, context);

    // Simulate a Google Sheets download interception
    const downloadItem = {
      id: 999,
      state: 'in_progress',
      url: 'https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=xlsx',
      finalUrl: 'https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b',
      filename: browser === 'chrome' ? 'C:\\Users\\User\\Downloads\\Q4 Budget Report.xlsx' : '',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      referrer: 'https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit',
      byExtensionId: null
    };

    if (browser === 'chrome') {
      assert.equal(listeners.onDeterminingFilename.length, 1);
      let suggested = false;
      await listeners.onDeterminingFilename[0](downloadItem, () => { suggested = true; });
    } else {
      assert.equal(listeners.onCreated.length, 1);
      await listeners.onCreated[0](downloadItem);
    }

    // Wait a tick for async tab & cookie querying
    await new Promise(r => setTimeout(r, 50));

    assert.equal(cancelledId, 999, 'Browser download must be immediately cancelled');
    assert.equal(erasedId, 999, 'Browser download must be erased from download shelf');

    assert.ok(sentNativeMessage, 'Native message must be sent to desktop');
    assert.equal(sentNativeMessage.type, 'ADD_DOWNLOAD');
    assert.equal(sentNativeMessage.url, downloadItem.finalUrl);

    // In Chrome, authoritative filename from onDeterminingFilename is preserved
    // In Firefox, inferred from active tab and format=xlsx
    if (browser === 'chrome') {
      assert.equal(sentNativeMessage.fileName, 'Q4 Budget Report.xlsx');
    } else {
      assert.ok(sentNativeMessage.fileName.endsWith('.xlsx'), `FileName should end with .xlsx, got: ${sentNativeMessage.fileName}`);
    }

    assert.ok(sentNativeMessage.referer.includes('docs.google.com'), 'Referer must point to Google Docs');
    assert.ok(sentNativeMessage.cookies, 'Cookies must be attached');
    assert.ok(sentNativeMessage.cookies.includes('SID'), 'Must include google.com SID cookie');
    assert.ok(sentNativeMessage.cookies.includes('OSID'), 'Must include docs.google.com OSID cookie');

    // Confirm that Google domains were queried for cookies
    assert.ok(queriedCookieDomains.includes('google.com') || queriedCookieDomains.includes('.google.com'));
    assert.ok(queriedCookieDomains.includes('docs.google.com') || queriedCookieDomains.includes('.docs.google.com'));
    assert.ok(queriedCookieDomains.includes('googleusercontent.com') || queriedCookieDomains.includes('.googleusercontent.com'));
  });

  test(`${browser}: Google Sheets export with .html suggested filename strips .html and uses format/mime extension`, async () => {
    let sentNativeMessage = null;

    const runtime = {
      lastError: null,
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      connectNative() {
        return {
          postMessage(msg) { sentNativeMessage = msg; },
          onMessage: { addListener() {} },
          onDisconnect: { addListener() {} }
        };
      },
      sendMessage(msg, cb) { if (cb) cb({ status: 'ok', success: true }); },
      sendNativeMessage(host, msg, cb) {
        sentNativeMessage = msg;
        if (cb) cb({ status: 'ok', success: true });
      }
    };

    const listeners = {
      onDeterminingFilename: [],
      onCreated: []
    };

    const downloads = {
      onDeterminingFilename: browser === 'chrome' ? {
        addListener(fn) { listeners.onDeterminingFilename.push(fn); }
      } : undefined,
      onCreated: {
        addListener(fn) { listeners.onCreated.push(fn); }
      },
      cancel(id, cb) { if (cb) cb(); },
      erase(query, cb) { if (cb) cb(); },
      download() {}
    };

    const tabs = {
      query(q, cb) {
        cb([
          {
            id: 102,
            title: 'Q4 Budget Report · Google Spreadsheets',
            url: 'https://docs.google.com/spreadsheets/u/1/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit'
          }
        ]);
      },
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
      sendMessage() {}
    };

    const cookies = {
      getAll(details, cb) { cb([]); }
    };

    const window = {
      location: { href: 'https://docs.google.com/spreadsheets/u/1/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit', origin: 'https://docs.google.com', hostname: 'docs.google.com' },
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    };
    window.top = window.self = window;

    const document = {
      readyState: 'complete',
      documentElement: { hasAttribute() { return true; } },
      referrer: '',
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };

    const context = vm.createContext({
      window,
      document,
      navigator: { userAgent: 'Mozilla/5.0 Chrome/131.0.0.0' },
      chrome: {
        runtime,
        downloads,
        tabs,
        cookies,
        contextMenus: { create() {}, onClicked: { addListener() {} } },
        action: { onClicked: { addListener() {} } },
        webRequest: {
          onSendHeaders: { addListener() {} },
          onHeadersReceived: { addListener() {} }
        }
      },
      setTimeout,
      clearTimeout,
      URL,
      decodeURIComponent
    });

    const bgSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extensions', browser, 'background.js'), 'utf8');
    vm.runInContext(bgSource, context);

    // Browser suggested .html filename, but export is PDF
    const downloadItem = {
      id: 1001,
      state: 'in_progress',
      url: 'https://docs.google.com/spreadsheets/u/1/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=pdf',
      finalUrl: 'https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b',
      filename: 'C:\\Users\\User\\Downloads\\1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.html',
      mime: 'application/pdf',
      referrer: 'https://docs.google.com/spreadsheets/u/1/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/edit',
      byExtensionId: null
    };

    if (browser === 'chrome') {
      await listeners.onDeterminingFilename[0](downloadItem, () => {});
    } else {
      await listeners.onCreated[0](downloadItem);
    }

    await new Promise(r => setTimeout(r, 50));

    assert.ok(sentNativeMessage, 'Native message must be sent to desktop');
    assert.equal(sentNativeMessage.type, 'ADD_DOWNLOAD');
    assert.ok(sentNativeMessage.fileName.endsWith('.pdf'), `FileName must end with .pdf, got: ${sentNativeMessage.fileName}`);
    assert.ok(!sentNativeMessage.fileName.endsWith('.html'), `FileName must not end with .html, got: ${sentNativeMessage.fileName}`);
    assert.equal(sentNativeMessage.mime, 'application/pdf');
  });
}

