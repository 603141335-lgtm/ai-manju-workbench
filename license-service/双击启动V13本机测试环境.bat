@echo off
setlocal
cd /d "%~dp0"
title DuduAI V1.3 Local Test Environment
chcp 65001 >nul
echo ===============================================
echo DuduAI V1.3 LOCAL-ONLY TEST ENVIRONMENT
echo No remote D1. No Cloudflare deployment.
echo No real WeChat or Alipay payment or refund.
echo ===============================================
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 goto old_node
echo.
echo [1/4] Installing locked dependencies...
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo [2/4] Checking JavaScript syntax...
call npm run check
if errorlevel 1 goto failed
echo.
echo [3/4] Running automated tests...
call npm test
if errorlevel 1 goto failed
echo.
echo [4/4] Initializing isolated local D1 and starting Worker...
call npm run test:env
if errorlevel 1 goto failed
echo.
echo Local test server has stopped.
goto finish

:missing_node
echo.
echo Node.js was not found. Install Node.js 22 or newer, then retry.
goto failed

:old_node
echo.
echo Node.js 22 or newer is required.
node -v
goto failed

:failed
echo.
echo ===============================================
echo STARTUP FAILED. THIS WINDOW WILL STAY OPEN.
echo Copy the error text above and send it to support.
echo ===============================================
pause
exit /b 1

:finish
echo.
echo Press any key to close this window.
pause
exit /b 0
