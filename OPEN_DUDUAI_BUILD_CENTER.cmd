@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title DuduAI V1.3 - Windows EXE Builder
if not exist "scripts\build-gui.py" (
 echo [ERROR] Missing scripts\build-gui.py - extract the complete ZIP first.
 goto :error
)
where py >nul 2>&1
if errorlevel 1 (
 echo [ERROR] Python Launcher "py" not found. Install Python 3.12 x64.
 goto :error
)
echo [START] DuduAI V1.3 graphical build center.
echo [TIP] This console is only a launcher. The GUI stays open and logs failures.
py -3.12 "%~dp0scripts\build-gui.py"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :error
exit /b 0
:error
echo.
echo [BUILD UI ERROR] Start failed. Exit code=%RC%
echo Python: py -3.12 --version
echo Do not delete source files. Review the error above.
echo.
cmd /k
