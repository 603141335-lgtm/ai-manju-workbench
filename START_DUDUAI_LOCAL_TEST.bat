@echo off
setlocal
cd /d "%~dp0"
title DuduAI Workbench - Isolated Local Integration Test
chcp 65001 >nul
echo ===============================================
echo DuduAI Workbench + V1.3 Admin - LOCAL TEST
echo All production Worker, D1, license keys and sessions stay unchanged.
echo ===============================================
where node >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\start-local-dev.cjs
set "STATUS=%ERRORLEVEL%"
if not "%STATUS%"=="0" goto failed
echo.
echo Workbench closed normally.
goto finish
:missing_node
echo Node.js 22+ was not found on PATH.
goto failed
:failed
echo.
echo Startup failed. This console is kept open for diagnosis.
echo Copy the error above but NEVER share any test admin token.
set "STATUS=1"
:finish
echo.
pause
exit /b %STATUS%
