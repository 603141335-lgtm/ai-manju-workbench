@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-build-environment.ps1"
set "RC=%errorlevel%"
echo.
if not "%RC%"=="0" (echo Missing required build tool. See checklist above.) else (echo Build tool check passed.)
pause
exit /b %RC%
