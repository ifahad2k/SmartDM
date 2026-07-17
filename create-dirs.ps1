$modules = @('domain','application','download-engine','download-http','persistence-api','persistence-sqlcipher','secure-storage','file-catalog','search-local','organization-local','ai-api','ai-gemini','safety-api','safety-rules','safety-windows-defender','safety-clamav','media-api','media-ytdlp','media-ffmpeg','browser-protocol','browser-native-host','platform-api','platform-windows','platform-linux','desktop-ui')
foreach ($m in $modules) {
    New-Item -ItemType Directory -Force -Path "modules/$m/src/main/java" | Out-Null
    New-Item -ItemType Directory -Force -Path "modules/$m/src/test/java" | Out-Null
}
New-Item -ItemType Directory -Force -Path 'apps/desktop/src/main/java' | Out-Null
New-Item -ItemType Directory -Force -Path 'apps/desktop/src/test/java' | Out-Null
$tools = @('test-http-server','test-media-fixtures','catalog-benchmark')
foreach ($t in $tools) {
    New-Item -ItemType Directory -Force -Path "tools/$t/src/main/java" | Out-Null
    New-Item -ItemType Directory -Force -Path "tools/$t/src/test/java" | Out-Null
}
# Architecture test directory for domain
New-Item -ItemType Directory -Force -Path 'modules/domain/src/architectureTest/java/io/smartdm/architecture' | Out-Null
Write-Host 'All source directories created successfully'
