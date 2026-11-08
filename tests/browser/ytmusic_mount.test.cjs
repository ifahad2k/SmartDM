const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// 1. Verify 100% SHA-256 Byte Parity across shared files
test('Extension SHA-256 byte parity between chrome and firefox across shared files', () => {
  const shared = [
    'background.js',
    'smartdm_overlay.js',
    'sniffer.js',
    'modules/format_engine.js',
    'modules/overlay_ui.js',
    'modules/utils.js',
    'modules/visual_mount.js',
    'modules/watcher.js'
  ];

  for (const file of shared) {
    const hashC = crypto.createHash('sha256').update(fs.readFileSync(path.join('extensions', 'chrome', file))).digest('hex');
    const hashF = crypto.createHash('sha256').update(fs.readFileSync(path.join('extensions', 'firefox', file))).digest('hex');
    assert.equal(hashC, hashF, `Mismatch on shared file: ${file}`);
  }
});

for (const browser of ['chrome', 'firefox']) {
  // 2. Manifest test for music.youtube.com
  test(`${browser}: manifest includes *://music.youtube.com/* in permissions and content_scripts`, () => {
    const root = path.resolve('extensions', browser);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

    // Check permissions / host_permissions
    assert.ok(manifest.permissions.includes('*://music.youtube.com/*'), 'permissions must include music.youtube.com');
    assert.ok(manifest.host_permissions.includes('*://music.youtube.com/*'), 'host_permissions must include music.youtube.com');

    // Check content_scripts matches
    for (const entry of manifest.content_scripts) {
      assert.ok(entry.matches.includes('*://music.youtube.com/*'), 'content_scripts matches must include music.youtube.com');
    }

    // Check web_accessible_resources
    if (manifest.web_accessible_resources) {
      for (const entry of manifest.web_accessible_resources) {
        assert.ok(entry.matches.includes('*://music.youtube.com/*'), 'web_accessible_resources must include music.youtube.com');
      }
    }
  });

  // 3. YouTube Music Single Track and Playlist Tests
  test(`${browser}: YouTube Music single track extraction and player bar mount`, () => {
    const listeners = {};
    const classes = new Set();
    const popover = {
      style: {},
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); }
      }
    };
    const button = {
      addEventListener(name, callback) { listeners[name] = callback; },
      getBoundingClientRect() { return { top: 900, bottom: 930, left: 1000, right: 1100, width: 100, height: 30 }; }
    };
    const content = {
      innerHTML: '',
      children: [],
      appendChild(node) { this.children.push(node); },
      querySelector(sel) { return null; }
    };

    let createdHost = null;
    const makeHost = () => {
      const h = {
        style: {},
        className: '',
        addEventListener() {},
        attachShadow() {
          this.shadowRoot = {
            innerHTML: '',
            querySelector(selector) {
              return { '.banner-btn': button, '.popover': popover, '.popover-content': content }[selector];
            }
          };
          return this.shadowRoot;
        },
        getBoundingClientRect() { return { left: 950, right: 1050, top: 900, bottom: 940, width: 100, height: 40 }; },
        remove() { this.removed = true; }
      };
      createdHost = h;
      return h;
    };

    // Construct mock YouTube Music DOM
    const playerBarTitle = {
      getAttribute(k) { return k === 'title' ? 'Blinding Lights' : null; },
      textContent: 'Blinding Lights'
    };
    const artistLink = { textContent: 'The Weeknd' };
    const albumLink = { textContent: 'After Hours' };
    const playerBarByline = {
      getAttribute(k) { return k === 'title' ? 'The Weeknd • After Hours • 2020' : null; },
      textContent: 'The Weeknd • After Hours • 2020',
      querySelectorAll(sel) {
        if (sel === 'a') return [artistLink, albumLink];
        return [];
      }
    };
    const timeInfo = { textContent: '1:15 / 3:20' };
    const trackLink = {
      getAttribute(k) { return k === 'href' ? 'watch?v=4NRXx6U8ABQ&list=RDAMVM4NRXx6U8ABQ' : null; },
      href: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ&list=RDAMVM4NRXx6U8ABQ'
    };
    const rightControls = {
      children: [],
      insertBefore(node) { this.children.unshift(node); node.parentNode = this; },
      appendChild(node) { this.children.push(node); node.parentNode = this; }
    };
    const middleControls = {
      children: [],
      insertBefore(node, ref) {
        const idx = this.children.indexOf(ref);
        if (idx !== -1) this.children.splice(idx, 0, node);
        else this.children.unshift(node);
        node.parentNode = this;
      },
      appendChild(node) { this.children.push(node); node.parentNode = this; }
    };
    const menuButton = {
      tagName: 'YTMUSIC-MENU-RENDERER',
      parentNode: middleControls,
      nextSibling: null
    };
    middleControls.children.push(menuButton);
    middleControls.querySelector = (sel) => {
      if (sel.includes('ytmusic-menu-renderer') || sel.includes('.menu')) return menuButton;
      return null;
    };

    const attributes = {};
    const playerBar = {
      tagName: 'YTMUSIC-PLAYER-BAR',
      getAttribute(k) { return attributes[k] || null; },
      setAttribute(k, v) { attributes[k] = v; },
      hasAttribute(k) { return !!attributes[k]; },
      querySelector(sel) {
        if (sel.includes('.title')) return playerBarTitle;
        if (sel.includes('.byline')) return playerBarByline;
        if (sel.includes('.time-info')) return timeInfo;
        if (sel.includes('watch?v=')) return trackLink;
        if (sel.includes('.middle-controls')) return middleControls;
        if (sel.includes('.right-controls')) return rightControls;
        return null;
      }
    };

    const documentMock = {
      body: { appendChild(node) { node.parentNode = this; } },
      createElement(tag) { return makeHost(); },
      querySelector(sel) {
        if (sel === 'ytmusic-player-bar') return playerBar;
        return null;
      },
      querySelectorAll() { return []; }
    };

    const context = vm.createContext({
      document: documentMock,
      window: {
        innerWidth: 1920,
        innerHeight: 1080,
        location: {
          hostname: 'music.youtube.com',
          pathname: '/watch',
          href: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ',
          search: '?v=4NRXx6U8ABQ'
        },
        getComputedStyle() { return { position: 'static' }; },
        addEventListener() {}
      },
      URL,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    });

    for (const [file, name] of [
      ['utils.js', 'SmartDmUtils'],
      ['visual_mount.js', 'VisualMountDetector'],
      ['format_engine.js', 'FormatRegistryEngine'],
      ['overlay_ui.js', 'OverlayUiRenderer'],
      ['watcher.js', 'MediaWatcher']
    ]) {
      const src = fs.readFileSync(path.join('extensions', browser, 'modules', file), 'utf8');
      vm.runInContext(`${src}\nthis.${name} = ${name};`, context);
    }

    const { VisualMountDetector, MediaWatcher, SmartDmUtils, FormatRegistryEngine } = context;

    // A. Verify Metadata Extraction from <ytmusic-player-bar>
    const meta = VisualMountDetector.extractYouTubeMusicTrackMetadata(playerBar);
    assert.ok(meta, 'Metadata must not be null');
    assert.equal(meta.title, 'Blinding Lights');
    assert.equal(meta.artist, 'The Weeknd');
    assert.equal(meta.album, 'After Hours');
    assert.equal(meta.duration, '3:20');
    assert.equal(meta.videoId, '4NRXx6U8ABQ');
    assert.equal(meta.trackUrl, 'https://music.youtube.com/watch?v=4NRXx6U8ABQ');
    assert.equal(meta.fullTitle, 'Blinding Lights - The Weeknd');

    // B. Verify active video element on YouTube Music is not marked preview/thumbnail
    const ytMusicVideo = {
      tagName: 'VIDEO',
      classList: { contains(c) { return c === 'html5-main-video'; } },
      closest(sel) {
        if (sel.includes('ytmusic-player') || sel.includes('ytmusic-player-bar')) return playerBar;
        return null;
      },
      getBoundingClientRect() { return { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }; },
      getAttribute() { return null; },
      setAttribute() {},
      addEventListener() {}
    };
    assert.equal(MediaWatcher.isThumbnailOrPreviewMedia(ytMusicVideo), false, 'Active YouTube Music video stream must not be flagged as preview/thumbnail');

    // C. Verify MediaWatcher mounts button cleanly in .middle-controls adjacent to menu
    MediaWatcher.scanYouTubeMusic();
    assert.equal(playerBar.getAttribute('data-smartdm-mounted'), 'true');
    assert.ok(createdHost, 'Host must be created');
    assert.equal(createdHost.parentNode, middleControls, 'Must mount into middleControls action area');
    assert.equal(middleControls.children.indexOf(createdHost), middleControls.children.indexOf(menuButton) + 1, 'Must mount immediately adjacent to menu button');
    assert.ok(createdHost.shadowRoot.innerHTML.includes('<svg class="ytmusic-svg-icon"'), 'SVG icon must use ytmusic-svg-icon');
    assert.ok(!createdHost.shadowRoot.innerHTML.includes('play-icon download-icon'), 'SVG icon must not retain legacy triangle border hack classes');

    // Priority test: when middle-controls has both like-button and menu-button, button must mount next to menu button
    const likeButton = { tagName: 'YTMUSIC-LIKE-BUTTON-RENDERER', parentNode: middleControls };
    middleControls.children = [likeButton, menuButton];
    middleControls.querySelector = (sel) => {
      if (sel.includes('ytmusic-menu-renderer') || sel.includes('.menu')) return menuButton;
      if (sel.includes('ytmusic-like-button-renderer')) return likeButton;
      return null;
    };
    createdHost.isConnected = false;
    playerBar.removeAttribute?.('data-smartdm-mounted');
    delete attributes['data-smartdm-mounted'];
    MediaWatcher.attachYouTubeMusicPlayerBar(playerBar);
    assert.equal(middleControls.children.indexOf(createdHost), middleControls.children.indexOf(menuButton) + 1, 'Must prioritize menu button and mount adjacent to it');

    // Fallback: when middle-controls is absent, verify mounting into right-controls
    const fallbackPlayerBar = {
      tagName: 'YTMUSIC-PLAYER-BAR',
      getAttribute(k) { return null; },
      setAttribute() {},
      querySelector(sel) {
        if (sel.includes('.right-controls')) return rightControls;
        return null;
      }
    };
    MediaWatcher.attachYouTubeMusicPlayerBar(fallbackPlayerBar);
    assert.equal(createdHost.parentNode, rightControls, 'Must fallback to right-controls when middle-controls is absent');

    // D. Click button -> Popover opens and requests formats with composite title
    let fetchedUrl = null;
    FormatRegistryEngine.fetchMediaFormats = (url, mediaEl, callback) => {
      fetchedUrl = url;
      callback({
        success: true,
        title: meta.fullTitle,
        formats: [
          { formatId: 'bestaudio/best', resolution: 'Audio (MP3 / High Quality)', isAudioOnly: true, ext: 'mp3' },
          { formatId: '1080p', resolution: '1080p Full HD', isAudioOnly: false, ext: 'mp4', height: 1080 }
        ]
      }, false);
    };

    listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(popover.classList.contains('active'), true);
    assert.equal(fetchedUrl, 'https://music.youtube.com/watch?v=4NRXx6U8ABQ');
    if (createdHost && createdHost._smartdm_stop_poll) createdHost._smartdm_stop_poll();
  });

  test(`${browser}: YouTube Music playlist extraction and full playlist download queueing`, () => {
    // Construct mock Playlist page DOM
    const headerTitle = {
      getAttribute(k) { return k === 'title' ? 'Global Top 50' : null; },
      textContent: 'Global Top 50'
    };
    const headerSubtitle = { textContent: 'Playlist • 2 songs • 6 minutes' };
    const buttonsContainer = {
      children: [],
      appendChild(node) { this.children.push(node); node.parentNode = this; }
    };
    const headerAttrs = {};
    const header = {
      tagName: 'YTMUSIC-RESPONSIVE-HEADER-RENDERER',
      getAttribute(k) { return headerAttrs[k] || null; },
      setAttribute(k, v) { headerAttrs[k] = v; },
      hasAttribute(k) { return !!headerAttrs[k]; },
      querySelector(sel) {
        if (sel.includes('.title') || sel.includes('h1')) return headerTitle;
        if (sel.includes('.subtitle')) return headerSubtitle;
        if (sel.includes('.buttons') || sel.includes('#buttons')) return buttonsContainer;
        return null;
      }
    };

    // Track 1
    const track1Title = { textContent: 'Starboy' };
    const track1Artist = { textContent: 'The Weeknd' };
    const track1Album = { textContent: 'Starboy' };
    const track1Duration = { textContent: '3:50' };
    const track1Link = {
      getAttribute(k) { return k === 'href' ? 'watch?v=34Na4j8AVgA&list=PL123' : null; },
      href: 'https://music.youtube.com/watch?v=34Na4j8AVgA&list=PL123'
    };
    const item1 = {
      querySelector(sel) {
        if (sel.includes('.title')) return track1Title;
        if (sel.includes('.byline')) return track1Artist;
        if (sel.includes('.fixed-column') || sel.includes('duration')) return track1Duration;
        if (sel.includes('watch?v=')) return track1Link;
        return null;
      },
      querySelectorAll(sel) {
        if (sel.includes('.byline')) return [track1Artist, track1Album];
        return [];
      }
    };

    // Track 2
    const track2Title = { textContent: 'Levitating' };
    const track2Artist = { textContent: 'Dua Lipa' };
    const track2Album = { textContent: 'Future Nostalgia' };
    const track2Duration = { textContent: '3:23' };
    const track2Link = {
      getAttribute(k) { return k === 'href' ? 'watch?v=TUVcZfQe-Kw&list=PL123' : null; },
      href: 'https://music.youtube.com/watch?v=TUVcZfQe-Kw&list=PL123'
    };
    const item2 = {
      querySelector(sel) {
        if (sel.includes('.title')) return track2Title;
        if (sel.includes('.byline')) return track2Artist;
        if (sel.includes('.fixed-column') || sel.includes('duration')) return track2Duration;
        if (sel.includes('watch?v=')) return track2Link;
        return null;
      },
      querySelectorAll(sel) {
        if (sel.includes('.byline')) return [track2Artist, track2Album];
        return [];
      }
    };

    const listeners = {};
    const classes = new Set();
    const popover = {
      style: {},
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); }
      }
    };
    const headerBtn = {
      addEventListener(name, callback) { listeners[name] = callback; },
      getBoundingClientRect() { return { top: 200, bottom: 230, left: 300, right: 420, width: 120, height: 30 }; }
    };
    let contentListeners = {};
    const content = {
      _html: '',
      set innerHTML(val) { this._html = val; },
      get innerHTML() { return this._html; },
      querySelector(sel) {
        if (sel === '.download-playlist-audio' || sel === '.download-playlist-video') {
          return {
            addEventListener(evName, cb) { contentListeners[sel] = cb; }
          };
        }
        return null;
      }
    };

    let createdHost = null;
    const makeHost = () => {
      const h = {
        style: {},
        className: '',
        addEventListener() {},
        attachShadow() {
          this.shadowRoot = {
            innerHTML: '',
            querySelector(selector) {
              return { '.banner-btn': headerBtn, '.popover': popover, '.popover-content': content }[selector];
            }
          };
          return this.shadowRoot;
        },
        getBoundingClientRect() { return { left: 300, right: 420, top: 200, bottom: 230, width: 120, height: 30 }; }
      };
      createdHost = h;
      return h;
    };

    const documentMock = {
      title: 'Global Top 50 - YouTube Music',
      body: { appendChild(node) { node.parentNode = this; } },
      createElement(tag) { return makeHost(); },
      querySelector(sel) {
        if (sel.includes('ytmusic-header-renderer') || sel.includes('ytmusic-responsive-header-renderer')) return header;
        if (sel === 'ytmusic-responsive-list-item-renderer') return item1;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'ytmusic-responsive-list-item-renderer') return [item1, item2];
        return [];
      }
    };

    const context = vm.createContext({
      document: documentMock,
      window: {
        innerWidth: 1920,
        innerHeight: 1080,
        location: {
          hostname: 'music.youtube.com',
          pathname: '/playlist',
          href: 'https://music.youtube.com/playlist?list=PL123',
          search: '?list=PL123'
        },
        getComputedStyle() { return { position: 'static' }; },
        addEventListener() {}
      },
      URL,
      IntersectionObserver: class { observe() {} unobserve() {} },
      MutationObserver: class { observe() {} disconnect() {} },
      setTimeout,
      clearTimeout
    });

    for (const [file, name] of [
      ['utils.js', 'SmartDmUtils'],
      ['visual_mount.js', 'VisualMountDetector'],
      ['format_engine.js', 'FormatRegistryEngine'],
      ['overlay_ui.js', 'OverlayUiRenderer'],
      ['watcher.js', 'MediaWatcher']
    ]) {
      const src = fs.readFileSync(path.join('extensions', browser, 'modules', file), 'utf8');
      vm.runInContext(`${src}\nthis.${name} = ${name};`, context);
    }

    const { VisualMountDetector, MediaWatcher } = context;

    // A. Verify Playlist Metadata Extraction
    const playlist = VisualMountDetector.extractYouTubeMusicPlaylistMetadata(header);
    assert.ok(playlist, 'Playlist metadata must not be null');
    assert.equal(playlist.title, 'Global Top 50');
    assert.equal(playlist.trackCount, 2);
    assert.equal(playlist.playlistId, 'PL123');

    // First track verification
    assert.equal(playlist.tracks[0].title, 'Starboy');
    assert.equal(playlist.tracks[0].artist, 'The Weeknd');
    assert.equal(playlist.tracks[0].duration, '3:50');
    assert.equal(playlist.tracks[0].videoId, '34Na4j8AVgA');
    assert.equal(playlist.tracks[0].trackUrl, 'https://music.youtube.com/watch?v=34Na4j8AVgA');
    assert.equal(playlist.tracks[0].fullTitle, 'Starboy - The Weeknd');

    // Second track verification
    assert.equal(playlist.tracks[1].title, 'Levitating');
    assert.equal(playlist.tracks[1].artist, 'Dua Lipa');
    assert.equal(playlist.tracks[1].videoId, 'TUVcZfQe-Kw');
    assert.equal(playlist.tracks[1].fullTitle, 'Levitating - Dua Lipa');

    // B. Verify MediaWatcher mounts "Download Playlist" button in header
    MediaWatcher.scanYouTubeMusic();
    assert.equal(header.getAttribute('data-smartdm-playlist-mounted'), 'true');
    assert.ok(createdHost, 'Playlist host must be created');
    assert.equal(createdHost.parentNode, buttonsContainer);

    // C. Click "Download Playlist" -> Popover opens with Audio & Video options
    const queuedTracks = [];
    MediaWatcher.onDownloadHandler = (formats, item, title) => {
      queuedTracks.push({ formats, item, title });
    };

    listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(popover.classList.contains('active'), true);
    assert.ok(content.innerHTML.includes('Download All as Audio'));
    assert.ok(content.innerHTML.includes('Download All as Video'));
    assert.ok(content.innerHTML.includes('Starboy - The Weeknd'));
    assert.ok(content.innerHTML.includes('Levitating - Dua Lipa'));

    // D. Trigger "Download All as Audio" -> Queues all tracks as MP3
    assert.ok(contentListeners['.download-playlist-audio'], 'Audio download listener must be registered');
    contentListeners['.download-playlist-audio']({ preventDefault() {}, stopPropagation() {} });

    assert.equal(queuedTracks.length, 2, 'Must queue all 2 tracks');
    assert.equal(queuedTracks[0].title, 'Starboy - The Weeknd');
    assert.equal(queuedTracks[0].item.formatId, 'bestaudio/best');
    assert.equal(queuedTracks[0].item.ext, 'mp3');
    assert.equal(queuedTracks[0].item.url, 'https://music.youtube.com/watch?v=34Na4j8AVgA');

    assert.equal(queuedTracks[1].title, 'Levitating - Dua Lipa');
    assert.equal(queuedTracks[1].item.formatId, 'bestaudio/best');
    assert.equal(queuedTracks[1].item.url, 'https://music.youtube.com/watch?v=TUVcZfQe-Kw');

    // E. Verify MediaWatcher.onBatchDownloadHandler receives structured ADD_MEDIA_BATCH payload
    let receivedBatch = null;
    MediaWatcher.onBatchDownloadHandler = (batch) => {
      receivedBatch = batch;
    };
    contentListeners['.download-playlist-audio']({ preventDefault() {}, stopPropagation() {} });
    assert.ok(receivedBatch, 'Batch handler must be invoked');
    assert.equal(receivedBatch.type, 'ADD_MEDIA_BATCH');
    assert.equal(receivedBatch.batchTitle, 'Global Top 50');
    assert.equal(receivedBatch.playlistId, 'PL123');
    assert.equal(receivedBatch.isAudio, true);
    assert.equal(receivedBatch.items.length, 2);
    assert.equal(receivedBatch.items[0].title, 'Starboy - The Weeknd');
    assert.equal(receivedBatch.items[0].formatId, 'bestaudio/best');
    assert.equal(receivedBatch.items[0].ext, 'mp3');
    assert.equal(receivedBatch.items[0].url, 'https://music.youtube.com/watch?v=34Na4j8AVgA');
  });

  test(`${browser}: YouTube Music multi-artist extraction, editable playlist header, and queue exclusion`, () => {
    // 1. Multi-artist player bar test
    const multiArtistPlayerBarTitle = { textContent: 'I Feel It Coming' };
    const multiArtistByline = {
      getAttribute(k) { return k === 'title' ? 'The Weeknd, Daft Punk • Starboy • 2016' : null; },
      textContent: 'The Weeknd, Daft Punk • Starboy • 2016',
      querySelectorAll() { return [{ textContent: 'The Weeknd' }, { textContent: 'Daft Punk' }, { textContent: 'Starboy' }]; }
    };
    const trackLink = {
      href: 'https://music.youtube.com/watch?v=qFLhGq0060w'
    };
    const playerBar = {
      tagName: 'YTMUSIC-PLAYER-BAR',
      getAttribute(k) { return null; },
      setAttribute() {},
      appendChild(node) { node.parentNode = this; },
      querySelector(sel) {
        if (sel.includes('.title')) return multiArtistPlayerBarTitle;
        if (sel.includes('.byline')) return multiArtistByline;
        if (sel.includes('watch?v=')) return trackLink;
        return null;
      }
    };

    // 2. Editable Playlist Header Test
    const editableHeaderTitle = { textContent: 'My Favorite Jams' };
    const actionButtonsContainer = {
      children: [],
      insertBefore(node, ref) {
        const idx = this.children.indexOf(ref);
        if (idx !== -1) this.children.splice(idx, 0, node);
        else this.children.unshift(node);
        node.parentNode = this;
      },
      appendChild(n) { this.children.push(n); n.parentNode = this; }
    };
    const playlistMenuButton = {
      tagName: 'YTMUSIC-MENU-RENDERER',
      parentNode: actionButtonsContainer,
      parentElement: actionButtonsContainer
    };
    actionButtonsContainer.children.push(playlistMenuButton);

    const editableHeaderAttrs = {};
    const editableHeader = {
      tagName: 'YTMUSIC-EDITABLE-PLAYLIST-DETAIL-HEADER-RENDERER',
      getAttribute(k) { return editableHeaderAttrs[k] || null; },
      setAttribute(k, v) { editableHeaderAttrs[k] = v; },
      querySelector(sel) {
        if (sel.includes('.title') || sel.includes('h1')) return editableHeaderTitle;
        if (sel.includes('.action-buttons') || sel.includes('#top-level-buttons-computed') || sel.includes('.buttons')) return actionButtonsContainer;
        if (sel.includes('ytmusic-menu-renderer') || sel.includes('.menu')) return playlistMenuButton;
        return null;
      }
    };

    // 3. Playlist items in #contents + Queue items in #queue
    const legitimateTrack = {
      querySelector(sel) {
        if (sel.includes('.title')) return { textContent: 'Blinding Lights' };
        if (sel.includes('.byline')) return { textContent: 'The Weeknd • After Hours' };
        if (sel.includes('watch?v=')) return { href: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ' };
        return null;
      },
      closest(sel) { return null; }
    };

    const queueTrack = {
      querySelector(sel) {
        if (sel.includes('.title')) return { textContent: 'Unrelated Queue Song' };
        if (sel.includes('.byline')) return { textContent: 'Other Artist' };
        if (sel.includes('watch?v=')) return { href: 'https://music.youtube.com/watch?v=queue123' };
        return null;
      },
      closest(sel) {
        if (sel.includes('#queue')) return { id: 'queue' };
        return null;
      }
    };

    let createdHost = null;
    const documentMock = {
      body: { appendChild() {} },
      createElement() {
        const btn = { addEventListener() {}, getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0 }; } };
        const pop = { classList: { add() {}, remove() {}, contains() { return false; } }, style: {} };
        const cont = { appendChild() {}, querySelector() { return null; } };
        const host = {
          style: {},
          setAttribute() {},
          attachShadow() {
            createdHost = this;
            this.shadowRoot = {
              innerHTML: '',
              querySelector(sel) {
                if (sel.includes('.banner-btn')) return btn;
                if (sel.includes('.popover-content')) return cont;
                if (sel.includes('.popover')) return pop;
                return null;
              }
            };
            return this.shadowRoot;
          }
        };
        return host;
      },
      querySelector(sel) {
        if (sel.includes('ytmusic-player-bar')) return playerBar;
        if (sel.includes('ytmusic-editable-playlist-detail-header-renderer')) return editableHeader;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'ytmusic-responsive-list-item-renderer') {
          return [legitimateTrack, queueTrack];
        }
        return [];
      }
    };

    const context = vm.createContext({
      document: documentMock,
      window: {
        location: { hostname: 'music.youtube.com', pathname: '/playlist', href: 'https://music.youtube.com/playlist?list=PLxyz', search: '?list=PLxyz' },
        getComputedStyle() { return { position: 'static' }; },
        addEventListener() {}
      },
      URL,
      setTimeout,
      clearTimeout
    });

    for (const [file, name] of [
      ['utils.js', 'SmartDmUtils'],
      ['visual_mount.js', 'VisualMountDetector'],
      ['format_engine.js', 'FormatRegistryEngine'],
      ['overlay_ui.js', 'OverlayUiRenderer'],
      ['watcher.js', 'MediaWatcher']
    ]) {
      const src = fs.readFileSync(path.join('extensions', browser, 'modules', file), 'utf8');
      vm.runInContext(`${src}\nthis.${name} = ${name};`, context);
    }

    const { VisualMountDetector, MediaWatcher } = context;

    // A. Verify multi-artist extraction
    const trackMeta = VisualMountDetector.extractYouTubeMusicTrackMetadata(playerBar);
    assert.equal(trackMeta.artist, 'The Weeknd, Daft Punk');
    assert.equal(trackMeta.album, 'Starboy');
    assert.equal(trackMeta.fullTitle, 'I Feel It Coming - The Weeknd, Daft Punk');

    // B. Verify editable playlist header is mounted cleanly into action buttons before the menu
    MediaWatcher.scanYouTubeMusic();
    assert.equal(editableHeader.getAttribute('data-smartdm-playlist-mounted'), 'true');
    assert.equal(actionButtonsContainer.children.length, 2);
    assert.equal(actionButtonsContainer.children[0], createdHost, 'Must be inserted before the menu button in action buttons');
    assert.equal(createdHost.parentNode, actionButtonsContainer);

    // C. Verify SPA navigation re-mount when header content updates (host cleared from DOM)
    actionButtonsContainer.children = [playlistMenuButton];
    createdHost.isConnected = false;
    MediaWatcher.scanYouTubeMusic();
    assert.equal(actionButtonsContainer.children.length, 2, 'Must re-attach host after SPA DOM refresh');

    // D. Verify queue exclusion in playlist extraction
    const playlistMeta = VisualMountDetector.extractYouTubeMusicPlaylistMetadata(editableHeader);
    assert.equal(playlistMeta.title, 'My Favorite Jams');
    assert.equal(playlistMeta.trackCount, 1, 'Queue track must be excluded');
    assert.equal(playlistMeta.tracks[0].title, 'Blinding Lights');
    assert.equal(playlistMeta.tracks[0].artist, 'The Weeknd');

    // E. Verify playlist SVG icon does not have legacy triangle border hack classes
    assert.ok(createdHost.shadowRoot.innerHTML.includes('<svg class="ytmusic-svg-icon"'), 'Playlist button must use ytmusic-svg-icon');
    assert.ok(!createdHost.shadowRoot.innerHTML.includes('class="ytmusic-svg-icon download-icon"'), 'Playlist button must not have legacy download-icon class on SVG');

    // F. Verify nested container: when action-buttons wraps #top-level-buttons-computed, host mounts inside top-level-buttons before menu
    const innerTopLevelButtons = {
      children: [playlistMenuButton],
      insertBefore(node, ref) {
        const idx = this.children.indexOf(ref);
        if (idx !== -1) this.children.splice(idx, 0, node);
        else this.children.unshift(node);
        node.parentNode = this;
      },
      appendChild(n) { this.children.push(n); n.parentNode = this; }
    };
    playlistMenuButton.parentNode = innerTopLevelButtons;
    playlistMenuButton.parentElement = innerTopLevelButtons;

    const outerActionButtons = {
      children: [innerTopLevelButtons],
      appendChild(n) { this.children.push(n); n.parentNode = this; }
    };
    innerTopLevelButtons.parentNode = outerActionButtons;
    innerTopLevelButtons.parentElement = outerActionButtons;

    const nestedHeader = {
      tagName: 'YTMUSIC-EDITABLE-PLAYLIST-DETAIL-HEADER-RENDERER',
      getAttribute() { return null; },
      setAttribute() {},
      querySelector(sel) {
        if (sel.includes('.action-buttons')) return outerActionButtons;
        if (sel.includes('#top-level-buttons-computed')) return innerTopLevelButtons;
        if (sel.includes('ytmusic-menu-renderer') || sel.includes('.menu')) return playlistMenuButton;
        return null;
      }
    };
    createdHost.isConnected = false;
    MediaWatcher.attachYouTubeMusicPlaylistHeader(nestedHeader);
    assert.equal(innerTopLevelButtons.children[0], createdHost, 'Must insert cleanly before menu inside inner top level buttons container');
  });
}
