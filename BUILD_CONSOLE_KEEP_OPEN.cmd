@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title DuduAI V1.3 - Full Build Console (persistent)
echo Source directory: %CD%
echo.
if not exist "scripts\build-release-win.ps1" (
 echo [ERROR] Missing Windows release script.
 goto :stay
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release-win.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
echo ==============================================
echo [RESULT] Build exited with code %RESULT%
echo Logs: %~dp0build-logs
echo ==============================================
:stay
echo.
echo The command window will stay open for inspection.
cmd /k
