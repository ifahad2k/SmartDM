import re

with open('modules/media-ytdlp/src/main/java/io/smartdm/media/ytdlp/YtDlpExtractor.java', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'String normalizedCookies = .*? : cookies;',
    'String normalizedCookies = cookies.contains("\\\\\\\\n") ? cookies.replace("\\\\\\\\n", "\\\\n").replace("\\\\\\\\t", "\\\\t") : cookies;',
    content, flags=re.DOTALL, count=1
)

with open('modules/media-ytdlp/src/main/java/io/smartdm/media/ytdlp/YtDlpExtractor.java', 'w', encoding='utf-8') as f:
    f.write(content)
