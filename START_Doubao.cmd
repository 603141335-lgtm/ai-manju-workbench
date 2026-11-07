@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Doubao Creative Hub v0.5.0

echo ========================================
echo Doubao Creative Hub v0.5.0
echo ========================================
if not exist "node_modules\electron\dist\electron.exe" (
 call "%~dp0REPAIR_Electron.cmd" /quiet
 if errorlevel 1 goto :failed
)

echo [OK] Launching the app...
call npm start
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo [ERROR] Unable to start. Check messages above.
pause
exit /b 1
