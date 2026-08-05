@echo off
set "DIR=%~dp0"
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%DIR%io.smartdm.host.json" /f
echo Installed Chrome Native Messaging Host.
