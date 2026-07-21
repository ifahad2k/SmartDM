@echo off
REG DELETE "HKCU\Software\Google\Chrome\NativeMessagingHosts\io.smartdm.host" /f
echo Uninstalled Chrome Native Messaging Host.
