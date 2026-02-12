@echo off
chcp 65001 >nul 2>nul

echo.
echo ========================================
echo    AI Werewolf Demo - Stop Script
echo ========================================
echo.

echo Stopping services and releasing ports...
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 3000,3001,3002,3003,3004 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Ports 3000-3004 released.
echo.
echo Thank you for using AI Werewolf Demo!
echo ========================================
