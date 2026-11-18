// Local presentation preferences only; never carries media URLs or credentials.
class OverlayAppearance {
  static key = 'smartdmAppearance';
  static defaults = {theme: 'auto', menuOpacity: 100, buttonOpacity: 0};
  static value = {...this.defaults};
  static ready = null;
  static revision = 0;
  static api() { return globalThis.chrome || globalThis.browser; }

  static normalize(value) {
    const percent = (key) => typeof value?.[key] === 'number' && Number.isFinite(value[key])
      ? Math.round(Math.max(0, Math.min(100, value[key]))) : this.defaults[key];
    return {theme: ['auto', 'light', 'dark'].includes(value?.theme) ? value.theme : 'auto',
      menuOpacity: percent('menuOpacity'), buttonOpacity: percent('buttonOpacity')};
  }

  static apply(host) {
    if (!host) return;
    host.setAttribute('data-smartdm-theme', this.value.theme);
    host.style.setProperty('--sdm-menu-opacity', this.value.menuOpacity + '%');
    host.style.setProperty('--sdm-button-opacity', this.value.buttonOpacity + '%');
    host.style.setProperty('--sdm-button-foreground', this.value.buttonOpacity < 45 ? 'var(--sdm-ink)' : 'light-dark(#ffffff,#25303c)');
  }

  static update(value) {
    this.value = this.normalize(value);
    this.revision++;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.smartdm-player-host, .smartdm-thumb-host, [data-smartdm-theme]').forEach(host => this.apply(host));
    }
  }

  static init() {
    if (this.ready) return this.ready;
    const api = this.api();
    if (!api?.storage?.local) return this.ready = Promise.resolve(this.value);
    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[this.key]) this.update(changes[this.key].newValue);
    });
    const revision = this.revision;
    this.ready = Promise.resolve(api.storage.local.get(this.key)).then(result => {
      if (this.revision === revision) this.update(result[this.key]);
      return this.value;
    }).catch(() => this.value);
    return this.ready;
  }

  static async save(value) {
    const normalized = this.normalize(value);
    await this.api().storage.local.set({[this.key]: normalized});
    this.update(normalized);
  }
}

OverlayAppearance.init();
