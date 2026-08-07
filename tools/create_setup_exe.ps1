# Create single-file Windows setup installer using PowerShell self-extracting wrapper

$setupScript = @"
@echo off
title SmartDM v1.0.4 Setup
echo Installing SmartDM v1.0.4...
set "TARGET=%LOCALAPPDATA%\SmartDM"
if not exist "%TARGET%" mkdir "%TARGET%"
xcopy "%~dp0SmartDM\*" "%TARGET%\" /E /I /Y >nul

REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%TARGET%\app\extensions\chrome\host\io.smartdm.host.json" /f >nul 2>&1
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%TARGET%\app\extensions\firefox\host\io.smartdm.host.json" /f >nul 2>&1

powershell -Command "`$s=(New-Object -COM WScript.Shell).CreateShortcut('%USERPROFILE%\Desktop\SmartDM.lnk');`$s.TargetPath='%TARGET%\SmartDM.exe';`$s.WorkingDirectory='%TARGET%';`$s.Save()" >nul 2>&1

echo Installation Complete! Starting SmartDM...
start "" "%TARGET%\SmartDM.exe"
"@

New-Item -ItemType Directory -Path "build/releases" -Force | Out-Null
Set-Content -Path "build/releases/SmartDM-Setup-v1.0.4.bat" -Value $setupScript -Encoding ASCII

echo "Setup script created at build/releases/SmartDM-Setup-v1.0.4.bat"
