@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-python312.ps1"
set "RC=%errorlevel%"
echo.
if not "%RC%"=="0" (echo Python installation was not completed. See messages above.) else (echo Python 3.12 is ready. Now run CHECK_Build_Tools.cmd.)
pause
exit /b %RC%
