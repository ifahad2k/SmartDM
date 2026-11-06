const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {this.children = []; this.style = {}; this.dataset = {}; this.listeners = {};}
  set innerHTML(value) {this.children = []; this.html = value;}
  get innerHTML() {return this.html || '';}
  appendChild(node) {this.children.push(node); node.parent = this;}
  insertBefore(node, before) {this.children.splice(this.children.indexOf(before), 0, node); node.parent = this;}
  replaceChildren(...nodes) {this.children = []; nodes.forEach(node => this.appendChild(node));}
  remove() {this.parent?.children.splice(this.parent.children.indexOf(this), 1);}
  setAttribute(name, value) {this[name] = value;}
  addEventListener(name, fn) {this.listeners[name] = fn;}
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.className === selector.slice(1)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) {
    const key = selector.match(/data-format-key="([^"]+)"/)?.[1];
    return key ? this.children.find(child => child.dataset.formatKey === key) : this.querySelectorAll(selector)[0] || null;
  }
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: an existing menu row sends the latest video/audio snapshots and title`, () => {
    const context = vm.createContext({document: {createElement: () => new Element()},
      window: {location: {hostname: 'player.invalid'}}, URL, CSS: {escape: value => value},
      FormatRegistryEngine: {drainStashedManifests() {}}});
    for (const [file, name] of [['utils.js', 'SmartDmUtils'], ['overlay_ui.js', 'OverlayUiRenderer']])
      vm.runInContext(fs.readFileSync(`extensions/${browser}/modules/${file}`, 'utf8') + `\nthis.${name}=${name};`, context);
    const container = new Element(), popover = {};
    const first = {formatId: 'captured_hls_1080', url: 'https://cdn.invalid/video.m3u8', ext: 'mp4',
      height: 1080, title: 'Initial title', mediaKind: 'hls', manifestText: 'first-video-snapshot'};
    let sent;
    const download = (formats, target, title) => {sent = {formats, target, title};};
    context.OverlayUiRenderer.renderFormatDropdown(container, [first], 'https://player.invalid/e/1', popover, 'Initial title', false, download);
    const existingRow = container.children[0];
    const updated = {...first, title: 'Resolved episode title', manifestText: 'latest-video-snapshot',
      audioUrl: 'https://cdn.invalid/audio.m3u8', audioManifestText: 'latest-audio-snapshot'};
    context.OverlayUiRenderer.renderFormatDropdown(container, [updated], 'https://player.invalid/e/1', popover, 'Resolved episode title', false, download);
    assert.equal(container.children[0], existingRow);
    existingRow.listeners.click({preventDefault() {}, stopPropagation() {}});
    assert.equal(sent.target.audioUrl, updated.audioUrl);
    assert.equal(sent.formats[0].audioManifestText, updated.audioManifestText);
    assert.equal(sent.formats[0].manifestText, updated.manifestText);
    assert.equal(sent.title, updated.title);
  });
}
