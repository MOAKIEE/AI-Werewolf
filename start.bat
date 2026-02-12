@echo off
chcp 65001 >nul 2>nul

echo.
echo ========================================
echo    AI Werewolf Demo - Start Script
echo ========================================
echo.

where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo [1/4] Installing Bun...
    npm install -g bun
) else (
    echo [1/4] Bun already installed
)

if not exist "node_modules" (
    echo [2/4] Installing dependencies...
    bun install
) else (
    echo [2/4] Dependencies already installed
)

if not exist ".env" (
    if exist ".env.example" (
        echo [3/4] Creating .env file...
        copy .env.example .env >nul
    )
) else (
    echo [3/4] .env file exists
)

echo [4/4] Starting services...
echo.
echo ========================================
echo    Services starting...
echo ========================================
echo.
echo    Frontend: http://localhost:3000/werewolf/
echo    Backend:  http://localhost:3001
echo.
echo    Press Ctrl+C to stop
echo ========================================
echo.

start /b bun run dev:player

ping -n 4 127.0.0.1 >nul

bun run dev:game-master
