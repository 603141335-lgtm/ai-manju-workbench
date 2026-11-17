@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-python312.ps1"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
