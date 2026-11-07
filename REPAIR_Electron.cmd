@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Doubao Creative Hub - Repair Electron

echo.
echo [Doubao] Checking runtime and dependencies...
where node.exe >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Node.js not found. Install Node.js LTS from https://nodejs.org/
 goto :fail
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
 echo [ERROR] npm not found. Repair your Node.js installation.
 goto :fail
)

if exist "node_modules\electron\dist\electron.exe" goto :ok

rem Use the mirror recommended by Electron's official installation documentation.
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_CUSTOM_DIR=v{{ version }}"

if not exist "node_modules\electron\install.js" (
 echo [1/3] Installing npm packages with your configured registry...
 call npm install --no-audit --no-fund
 if not exist "node_modules\electron\install.js" (
   echo [INFO] Retrying npm packages using npmmirror...
   call npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
 )
)
if not exist "node_modules\electron\install.js" (
 echo [ERROR] Electron npm package is missing. Verify your Internet access.
 goto :fail
)

if exist "node_modules\electron\dist\electron.exe" goto :ok

echo [2/3] Downloading missing Electron for Windows from mirror...
rem Call install.js explicitly so it also works with npm versions that block install scripts.
call node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" goto :ok

echo [3/3] Mirror did not complete. Retrying the official release server...
set "ELECTRON_MIRROR="
set "ELECTRON_CUSTOM_DIR="
call node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" goto :ok

echo [ERROR] Download still failed. This is typically a network or proxy issue.
echo [TIP] Try a different network or use a Windows EXE from GitHub Actions.
goto :fail

:ok
echo [OK] Electron binary exists and is ready.
exit /b 0

:fail
echo.
echo [FAIL] Electron repair was not completed.
echo [TIP] This does NOT mean your Doubao accounts are broken.
if /I "%~1"=="/quiet" exit /b 1
pause
exit /b 1
