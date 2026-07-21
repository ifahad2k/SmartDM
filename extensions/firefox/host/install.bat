@echo off
set "DIR=%~dp0"
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\io.smartdm.host" /ve /t REG_SZ /d "%DIR%io.smartdm.host.json" /f
echo Installed Firefox Native Messaging Host.
