@echo off
REG DELETE "HKCU\Software\Mozilla\NativeMessagingHosts\io.smartdm.host" /f
echo Uninstalled Firefox Native Messaging Host.
