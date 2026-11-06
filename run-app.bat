@echo off
cd /d "%~dp0"
echo ========================================
echo Starting SmartDM 2.0 Desktop Application
echo ========================================
dotnet run --project apps/desktop-avalonia
if errorlevel 1 (
    echo.
    echo Application exited with error code %errorlevel%.
    pause
)
