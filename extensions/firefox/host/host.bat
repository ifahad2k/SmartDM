@echo off
set "DIR=%~dp0"
set "LIB_DIR=%DIR%..\..\..\modules\browser-native-host\build\install\browser-native-host\lib"
java -cp "%LIB_DIR%\*" io.smartdm.browser.host.NativeHostMain %*
