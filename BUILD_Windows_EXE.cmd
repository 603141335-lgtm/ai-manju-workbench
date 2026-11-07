@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Doubao Creative Hub - Build Windows EXE

echo ========================================
echo Build standalone Windows portable EXE
echo ========================================
call "%~dp0REPAIR_Electron.cmd" /quiet
if errorlevel 1 goto :failed
call npm run check
if errorlevel 1 goto :failed
call npm run dist:win
if errorlevel 1 goto :failed

echo.
echo [SUCCESS] Find your portable EXE inside the release folder.
pause
exit /b 0

:failed
echo.
echo [ERROR] Build failed. Try using GitHub Actions with a new repository.
pause
exit /b 1
