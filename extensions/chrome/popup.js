(() => {
  const form = document.getElementById('appearance-form');
  const theme = document.getElementById('theme');
  const menu = document.getElementById('menu-opacity');
  const button = document.getElementById('button-opacity');
  const status = document.getElementById('save-status');
  const render = value => {
    theme.value = value.theme; menu.value = value.menuOpacity; button.value = value.buttonOpacity;
    document.getElementById('menu-value').textContent = value.menuOpacity + '%';
    document.getElementById('button-value').textContent = value.buttonOpacity + '%';
    document.documentElement.style.colorScheme = value.theme === 'auto' ? 'light dark' : value.theme;
  };
  let pending = null, saving = false;
  const persist = async () => {
    if (saving) return;
    saving = true;
    try {
      while (pending) { const value = pending; pending = null; await OverlayAppearance.save(value); }
      status.textContent = 'Saved';
    } catch (_) { status.textContent = 'Could not save. Try again.'; }
    finally { saving = false; }
  };
  const change = value => {
    OverlayAppearance.update(value); render(OverlayAppearance.value);
    pending = {...OverlayAppearance.value}; status.textContent = 'Saving…'; persist();
  };
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', () => change({theme:theme.value, menuOpacity:Number(menu.value), buttonOpacity:Number(button.value)}));
  document.getElementById('reset').addEventListener('click', () => change(OverlayAppearance.defaults));
  OverlayAppearance.init().then(() => render(OverlayAppearance.value));

  document.getElementById('download-page').addEventListener('click', async () => {
    const feedback = document.getElementById('download-status');
    const api = OverlayAppearance.api();
    try {
      const [tab] = await api.tabs.query({active:true, currentWindow:true});
      if (!tab?.url || !/^https?:\/\//i.test(tab.url)) { feedback.textContent = 'Open a website first.'; return; }
      feedback.textContent = 'Sending…';
      const result = await api.runtime.sendMessage({type:'ADD_DOWNLOAD', url:tab.url, referer:tab.url});
      feedback.textContent = result?.success || result?.status === 'ok' ? 'Sent to SmartDM.' : 'Check that SmartDM is running.';
    } catch (_) { feedback.textContent = 'Could not reach SmartDM.'; }
  });
})();
