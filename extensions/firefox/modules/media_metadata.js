// Bounded data-only extraction of item descriptions and advertised media renditions.
// No feed-wide "latest video" fallback and no guessed quality URLs.
class SmartDmMediaMetadata {
  static parse(data) {
    const items = [], ids = new Set(); let visited = 0;
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 14 || ++visited > 5000 || items.length >= 20) return;
      const video = value.video || value.videoInfo;
      const id = String(value.id || value.itemId || value.item_id || '');
      if (video && /^\d{5,30}$/.test(id) && !ids.has(id)) {
        const streams = [], seen = new Set();
        const add = (address, width = 0, height = 0, bitrate = 0) => {
          const urls = typeof address === 'string' ? [address] : address?.urlList || address?.UrlList || address?.url_list || [];
          for (const url of urls.slice(0, 3)) {
            if (typeof url !== 'string' || url.length > 8192 || !/^https?:\/\//i.test(url) || seen.has(url) || streams.length >= 16) continue;
            seen.add(url); streams.push({url, width: Number(width) || 0, height: Number(height) || 0, bitrate: Number(bitrate) || 0});
          }
        };
        for (const rendition of (video.bitrateInfo || video.bit_rate || video.bitrate_info || []).slice(0, 12)) {
          const address = rendition.PlayAddr || rendition.playAddr || rendition.play_addr;
          add(address, address?.Width || address?.width || rendition.width, address?.Height || address?.height || rendition.height,
            rendition.Bitrate || rendition.bit_rate || rendition.bitrate);
        }
        add(video.playAddr || video.play_addr || video.PlayAddr, video.width, video.height, video.bitrate);
        if (streams.length) {
          ids.add(id);items.push({id, description: String(value.desc || value.description || '').slice(0, 2000), streams});
        }
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, depth + 1);
    };
    walk(data); return items;
  }
}
