@echo off
set "DIR=%~dp0"

if exist "%DIR%..\..\..\lib\*" (
    set "LIB_DIR=%DIR%..\..\..\lib"
) else if exist "%DIR%..\..\..\modules\browser-native-host\build\install\browser-native-host\lib\*" (
    set "LIB_DIR=%DIR%..\..\..\modules\browser-native-host\build\install\browser-native-host\lib"
) else if exist "%DIR%..\..\lib\*" (
    set "LIB_DIR=%DIR%..\..\lib"
) else if exist "%DIR%lib\*" (
    set "LIB_DIR=%DIR%lib"
) else (
    set "LIB_DIR=%DIR%..\.."
)

java -cp "%LIB_DIR%\*" io.smartdm.browser.host.NativeHostMain %*
