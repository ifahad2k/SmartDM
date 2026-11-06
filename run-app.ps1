Set-Location -Path $PSScriptRoot
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting SmartDM 2.0 Desktop Application" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
dotnet run --project apps/desktop-avalonia
