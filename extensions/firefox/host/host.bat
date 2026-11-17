@echo off
setlocal
set "APP=%~dp0..\..\..\SmartDm.Desktop.Avalonia.exe"
if not exist "%APP%" set "APP=%~dp0..\..\..\apps\desktop-avalonia\bin\Debug\net9.0\SmartDm.Desktop.Avalonia.exe"
if not exist "%APP%" set "APP=%~dp0..\..\..\apps\desktop-avalonia\bin\Release\net9.0\SmartDm.Desktop.Avalonia.exe"
if not exist "%APP%" exit /b 1
"%APP%" --browser-native-host %*
