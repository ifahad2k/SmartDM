import re
import sys

def process(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Remove forceYtDlpTimeout from prefetchYtDlpFormats
    content = re.sub(
        r"      let forceYtDlpTimeout = null;.*?const finishFetching =.*?};.*?forceYtDlpTimeout = setTimeout[^\}]+\}, 3500\);.*?chrome\.runtime\.sendMessage\(\{ type: 'GET_MEDIA_FORMATS', url: url \}, \(res\) => \{\s*finishFetching\(res\);\s*\}\);",
        r"      chrome.runtime.sendMessage({ type: 'GET_MEDIA_FORMATS', url: url }, (res) => {\n        if (!ytDlpCache[url]) return;\n        \n        if (res && res.success && res.formats && res.formats.length > 0) {\n          ytDlpCache[url].status = 'done';\n          ytDlpCache[url].formats = res;\n          ytDlpCache[url].callbacks.forEach(cb => cb(res));\n          ytDlpCache[url].callbacks = [];\n        } else {\n          const cbs = ytDlpCache[url].callbacks || [];\n          delete ytDlpCache[url];\n          cbs.forEach(cb => cb(res));\n        }\n      });",
        content,
        flags=re.DOTALL
    )

    # 2. Add lastKnownNetMedia
    content = content.replace("let isYtDlpPending = true;", "let isYtDlpPending = true;\n      let lastKnownNetMedia = [];")

    # 3. Update checkFormats to store lastKnownNetMedia
    content = re.sub(
        r"netMedia = netMedia\.filter\(m => \{.*?\}\);\s*(if \(netMedia\.length > 0)",
        r"netMedia = netMedia.filter(m => {\n            const urlLower = m.url.toLowerCase();\n            return !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.ts') && !urlLower.includes('/seg') && !urlLower.includes('chunk');\n          });\n\n          lastKnownNetMedia = netMedia;\n\n          \1",
        content,
        flags=re.DOTALL
    )

    # 4. Update formatSearchTimeout
    content = re.sub(
        r"formatSearchTimeout = setTimeout\(\(\) => \{\s*if \(formatSearchInterval\) clearInterval\(formatSearchInterval\);\s*if \(!hasFound\) \{\s*if \(directSrc.*?else \{\s*content\.innerHTML = '<div class=\"status-text\">No media formats detected\.</div>';\s*\}\s*\}\s*\}, 15000\);",
        r"formatSearchTimeout = setTimeout(() => {\n        if (formatSearchInterval) clearInterval(formatSearchInterval);\n        isYtDlpPending = false;\n        if (!hasFound) {\n          if (lastKnownNetMedia.length > 0) {\n            hasFound = true;\n            renderUniversalFormats(content, [], lastKnownNetMedia, pageUrl, popover);\n          } else if (directSrc && directSrc.startsWith('http')) {\n            hasFound = true;\n            const fallbackFormats = [{\n              format_id: 'direct_stream',\n              format_note: 'Direct Media Stream',\n              ext: directSrc.includes('.webm') ? 'webm' : 'mp4',\n              resolution: 'Direct Video Stream (HD)',\n              filesize: 0,\n              url: directSrc\n            }];\n            renderUniversalFormats(content, fallbackFormats, [], pageUrl, popover);\n          } else {\n            content.innerHTML = '<div class=\"status-text\">No media formats detected.</div>';\n          }\n        }\n      }, 10000);",
        content,
        flags=re.DOTALL
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process('extensions/chrome/universal_overlay.js')
process('extensions/firefox/universal_overlay.js')
