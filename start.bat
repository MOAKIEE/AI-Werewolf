@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    🐺 AI 狼人杀 Demo - 启动脚本
echo ========================================
echo.

REM 检查 Bun 是否安装
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo [1/4] 正在安装 Bun...
    npm install -g bun
) else (
    echo [1/4] Bun 已安装
)

REM 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [2/4] 正在安装依赖...
    bun install
) else (
    echo [2/4] 依赖已安装
)

REM 创建 .env 文件（如果不存在）
if not exist ".env" (
    if exist ".env.example" (
        echo [3/4] 创建 .env 配置文件...
        copy .env.example .env >nul
        echo       请编辑 .env 文件配置您的 API Key
    ) else (
        echo [3/4] .env.example 不存在，跳过
    )
) else (
    echo [3/4] .env 文件已存在
)

echo [4/4] 启动服务...
echo.
echo ========================================
echo    服务启动中...
echo ========================================
echo.
echo    前端地址: http://localhost:3000/werewolf/
echo    后端地址: http://localhost:3001
echo.
echo    按 Ctrl+C 停止服务
echo ========================================
echo.

REM 启动后端服务（后台运行）
start /b bun run dev:player

REM 等待后端启动
timeout /t 3 /nobreak >nul

REM 启动前端服务
bun run dev:game-master
