# ==============================================================================
# SmartDM Single-EXE Installer Build Script
# Creates a standalone SmartDM-Setup-v1.0.0.exe under build/release/
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $ProjectRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Building SmartDM Single-EXE Standalone Installer" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ReleaseDir = "$ProjectRoot\build\release"
$StagingDir = "$ProjectRoot\build\installer-staging"
$AppImageDir = "$StagingDir\SmartDM"
$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
if (Test-Path $ReleaseDir) { Remove-Item -Recurse -Force $ReleaseDir }
if (Test-Path "$ProjectRoot\apps\desktop\build\distributions") { Remove-Item -Recurse -Force "$ProjectRoot\apps\desktop\build\distributions\*" }
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
New-Item -ItemType Directory -Path $AppImageDir -Force | Out-Null

# 1. Run Gradle to build distribution zip
Write-Host "`n[1/6] Compiling SmartDM Desktop App..." -ForegroundColor Yellow
& "$ProjectRoot\gradlew.bat" :apps:desktop:distZip
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed!" }

$DistZip = (Get-ChildItem "$ProjectRoot\apps\desktop\build\distributions\*.zip" | Sort-Object LastWriteTime -Descending)[0].FullName
Write-Host "Unpacking distribution zip: $DistZip" -ForegroundColor Yellow
Expand-Archive -Path $DistZip -DestinationPath $StagingDir -Force

# Rename unpacked folder to SmartDM standard app layout
$UnpackedName = (Get-ChildItem $StagingDir -Directory | Where-Object { $_.Name -ne "SmartDM" })[0].FullName
Copy-Item -Path "$UnpackedName\*" -Destination $AppImageDir -Recurse -Force
Remove-Item -Recurse -Force $UnpackedName

# 2. Compile native SmartDM.exe executable launcher into installation folder
Write-Host "`n[2/6] Compiling native SmartDM.exe executable launcher..." -ForegroundColor Yellow
$AppLauncherCs = "$ProjectRoot\tools\scripts\AppLauncher.cs"
$TargetAppExe = "$AppImageDir\SmartDM.exe"
$AppIcon = "$ProjectRoot\tools\scripts\app.ico"
& $CscPath /target:winexe /out:$TargetAppExe /win32icon:$AppIcon /reference:System.Windows.Forms.dll $AppLauncherCs
if ($LASTEXITCODE -ne 0) { throw "SmartDM.exe compilation failed!" }
Write-Host "  + Created: $TargetAppExe" -ForegroundColor Green

# 3. Copy tools (yt-dlp.exe, ffmpeg.exe) into tools/ directory
Write-Host "`n[3/6] Bundling native tools (yt-dlp, ffmpeg)..." -ForegroundColor Yellow
$ToolsDir = "$AppImageDir\tools"
New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null

Get-ChildItem -Path "$ProjectRoot\tools" -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName -Destination $ToolsDir -Force
    Write-Host "  + Bundled: $($_.Name)" -ForegroundColor Green
}

# 4. Copy Browser Extensions into extensions/ directory
Write-Host "`n[4/6] Bundling Browser Extensions..." -ForegroundColor Yellow
$ExtDir = "$AppImageDir\extensions"
New-Item -ItemType Directory -Path "$ExtDir\chrome" -Force | Out-Null
New-Item -ItemType Directory -Path "$ExtDir\firefox" -Force | Out-Null

Copy-Item -Path "$ProjectRoot\extensions\chrome\*" -Destination "$ExtDir\chrome" -Recurse -Force
Copy-Item -Path "$ProjectRoot\extensions\firefox\*" -Destination "$ExtDir\firefox" -Recurse -Force
Write-Host "  + Bundled Chrome Extension" -ForegroundColor Green
Write-Host "  + Bundled Firefox Extension" -ForegroundColor Green

# 5. Create Native Host Registration Script inside App Directory
Write-Host "`n[5/6] Creating Native Host Registry Auto-Installer..." -ForegroundColor Yellow
$RegisterScript = @"
@echo off
setlocal
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:\=/%"

echo { > "%~dp0io.smartdm.host.json"
echo   "name": "io.smartdm.host", >> "%~dp0io.smartdm.host.json"
echo   "description": "SmartDM Browser Native Host", >> "%~dp0io.smartdm.host.json"
echo   "path": "%APP_DIR%SmartDM.exe", >> "%~dp0io.smartdm.host.json"
echo   "type": "stdio", >> "%~dp0io.smartdm.host.json"
echo   "allowed_origins": [ >> "%~dp0io.smartdm.host.json"
echo     "chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/", >> "%~dp0io.smartdm.host.json"`necho     "chrome-extension://lkbiimagmeaefiedjigomffpophipmck/" >> "%~dp0io.smartdm.host.json"
echo   ] >> "%~dp0io.smartdm.host.json"
echo } >> "%~dp0io.smartdm.host.json"

echo { > "%~dp0io.smartdm.host.firefox.json"
echo   "name": "io.smartdm.host", >> "%~dp0io.smartdm.host.firefox.json"
echo   "description": "SmartDM Browser Native Host", >> "%~dp0io.smartdm.host.firefox.json"
echo   "path": "%APP_DIR%SmartDM.exe", >> "%~dp0io.smartdm.host.firefox.json"
echo   "type": "stdio", >> "%~dp0io.smartdm.host.firefox.json"
echo   "allowed_extensions": [ >> "%~dp0io.smartdm.host.firefox.json"
echo     "smartdm@smartdm.io" >> "%~dp0io.smartdm.host.firefox.json"
echo   ] >> "%~dp0io.smartdm.host.firefox.json"
echo } >> "%~dp0io.smartdm.host.firefox.json"

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%~dp0io.smartdm.host.json" /f >nul 2>&1
reg add "HKCU\Software\Mozilla\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%~dp0io.smartdm.host.firefox.json" /f >nul 2>&1
exit /b 0
"@

Set-Content -Path "$AppImageDir\register-native-host.bat" -Value $RegisterScript -Encoding ASCII

# Zip app image into payload.zip
$PayloadZip = "$StagingDir\payload.zip"
Write-Host "Compressing payload zip..." -ForegroundColor Yellow
Compress-Archive -Path "$AppImageDir\*" -DestinationPath $PayloadZip -Force

# 6. Compile Installer.cs into Single-EXE Installer
$VersionProps = Get-Content "$ProjectRoot\modules\domain\src\main\resources\smartdm-version.properties" | ConvertFrom-StringData
$AppVersion = $VersionProps.version.Trim()
Write-Host "`n[6/6] Compiling Single-EXE Installer (SmartDM-Setup-v$AppVersion.exe)..." -ForegroundColor Yellow

$InstallerCsRaw = Get-Content "$ProjectRoot\tools\scripts\Installer.cs" -Raw
$InstallerCsGen = $InstallerCsRaw -replace '__APP_VERSION__', $AppVersion
$GenCsFile = "$StagingDir\Installer_generated.cs"
Set-Content -Path $GenCsFile -Value $InstallerCsGen -Encoding UTF8

$TargetExe = "$ReleaseDir\SmartDM-Setup-v$AppVersion.exe"
$ManifestPath = "$ProjectRoot\tools\scripts\app.manifest"
$SetupIcon = "$ProjectRoot\tools\scripts\setup.ico"

& $CscPath /target:winexe /out:$TargetExe /win32icon:$SetupIcon /resource:$PayloadZip,payload.zip /win32manifest:$ManifestPath /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll $GenCsFile
if ($LASTEXITCODE -ne 0) { throw "Installer C# compilation failed!" }

# Generate SHA256SUMS.txt
Write-Host "`nGenerating Cryptographic SHA256 Release Manifest..." -ForegroundColor Yellow
$Sha = Get-FileHash -Algorithm SHA256 $TargetExe
Set-Content -Path "$ReleaseDir\SHA256SUMS.txt" -Value "$($Sha.Hash)  $($Sha.Path | Split-Path -Leaf)"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Single-EXE Installer Generated!" -ForegroundColor Green
Write-Host "  1. $TargetExe" -ForegroundColor Green
Write-Host "  2. $ReleaseDir\SHA256SUMS.txt" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
