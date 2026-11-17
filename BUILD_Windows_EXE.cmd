@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if not exist "scripts\build-release-win.ps1" (
  echo ERROR: Missing Windows release builder. Extract the FULL developer package first.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release-win.ps1" %*
set "RC=%errorlevel%"
echo.
if not "%RC%"=="0" (echo FAILED - see build-logs. exit=%RC%) else (echo SUCCESS - check release folder.)
pause
exit /b %RC%
