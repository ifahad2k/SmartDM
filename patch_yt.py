import re

with open('modules/media-ytdlp/src/main/java/io/smartdm/media/ytdlp/YtDlpExtractor.java', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded UA
content = re.sub(
    r'cmd\.add\("--user-agent"\);\s*cmd\.add\("Mozilla/5\.0[^"]+"\);',
    'String ua = (userAgent != null && !userAgent.isBlank()) ? userAgent : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";\n                    cmd.add("--user-agent");\n                    cmd.add(ua);',
    content, count=1
)
content = re.sub(
    r'fallbackCmd\.add\("--user-agent"\);\s*fallbackCmd\.add\("Mozilla/5\.0[^"]+"\);',
    'fallbackCmd.add("--user-agent");\n                        fallbackCmd.add(ua);',
    content, count=1
)

# Strip cookies for facebook
content = re.sub(
    r'if \(cookies != null && !cookies\.isBlank\(\)\) \{',
    'boolean isFacebook = url != null && (url.contains("facebook.com") || url.contains("fbcdn.net"));\n            if (cookies != null && !cookies.isBlank() && !isFacebook) {',
    content, count=1
)

# Fix literal newline bug
content = re.sub(
    r'cookieFile = java\.nio\.file\.Files\.createTempFile\("smartdm_cookies_", "\.txt"\);\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*java\.nio\.file\.Files\.writeString\(cookieFile, cookies, StandardCharsets\.UTF_8\);',
    'String normalizedCookies = cookies.contains("\\\\n") ? cookies.replace("\\\\n", "\\n").replace("\\\\t", "\\t") : cookies;\n                    cookieFile = java.nio.file.Files.createTempFile("smartdm_cookies_", ".txt");\n                    if (System.getProperty("os.name").toLowerCase().contains("linux") || System.getProperty("os.name").toLowerCase().contains("mac")) {\n                        java.nio.file.Files.setPosixFilePermissions(cookieFile, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));\n                    }\n                    java.nio.file.Files.writeString(cookieFile, normalizedCookies, StandardCharsets.UTF_8);',
    content, count=1
)

with open('modules/media-ytdlp/src/main/java/io/smartdm/media/ytdlp/YtDlpExtractor.java', 'w', encoding='utf-8') as f:
    f.write(content)
