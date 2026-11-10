@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 機密代碼：暗線任務 (Codenames: Darkline Protocol)

echo ========================================================
echo   機密代碼：暗線任務 ^| CODENAMES: DARKLINE PROTOCOL
echo   現代情報中心戰術桌遊系統啟動程序
echo ========================================================
echo.

REM 檢查並載入本機 Node.js 環境
where node >nul 2>nul
if not errorlevel 1 goto :node_ok

if exist "%LOCALAPPDATA%\nodejs\node-v22.14.0-win-x64\node.exe" set "PATH=%LOCALAPPDATA%\nodejs\node-v22.14.0-win-x64;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if not errorlevel 1 goto :node_ok

echo [錯誤] 找不到 Node.js 執行環境，請先安裝 Node.js LTS。
pause
exit /b 1

:node_ok
echo [情報中心] 偵測到 Node.js 版本：
node -v

if exist ".env" goto :env_ok
if not exist ".env.example" goto :env_ok
echo [情報中心] 正在建立預設 .env 環境設定檔...
copy /Y ".env.example" ".env" >nul

:env_ok
if exist "node_modules" goto :deps_ok
echo [情報中心] 首次啟動，正在安裝相依套件 (npm install)...
call npm.cmd install
if not errorlevel 1 goto :deps_ok
echo [錯誤] 套件安裝失敗。
pause
exit /b 1

:deps_ok
echo.
echo [情報中心] 正在啟動伺服器於 http://localhost:3000 ...
echo [提示] 同一區網內的其他電腦可使用螢幕顯示之 LAN 網址連線加入房間。
echo.

if not defined AUTO_OPEN_BROWSER set "AUTO_OPEN_BROWSER=1"
call npm.cmd run dev
pause
