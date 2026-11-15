@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer first.
  pause
  exit /b 1
)

pushd "%ROOT%"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [1/3] Installing workbench dependencies...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :failed
  if not exist "node_modules\electron\dist\electron.exe" (
    call npm install-scripts approve electron
    if errorlevel 1 goto :failed
    call npm rebuild electron --foreground-scripts
    if errorlevel 1 goto :failed
  )
)

echo [2/3] Checking isolated local license test dependencies...
pushd "license-service"
if not exist "node_modules\wrangler\bin\wrangler.js" (
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    popd
    goto :failed
  )
)
call npm install-scripts approve esbuild workerd
if errorlevel 1 (
  popd
  goto :failed
)
call npm rebuild esbuild workerd --foreground-scripts
if errorlevel 1 (
  popd
  goto :failed
)
popd

echo [3/3] Starting the local-only license backend in a separate window...
start "DuduAI Local License Worker" cmd.exe /k "cd /d ""%ROOT%license-service"" && npm run test:env"
timeout /t 10 /nobreak >nul

echo.
echo Starting the workbench development build.
echo Local test service: http://127.0.0.1:8788/admin
echo Close the separate Worker window to stop the test backend.
call npm start
set "APP_EXIT=%ERRORLEVEL%"
popd
if not "%APP_EXIT%"=="0" (
  echo Workbench exited with code %APP_EXIT%.
  pause
)
exit /b %APP_EXIT%

:failed
echo.
echo Startup failed. No production Worker or remote D1 was deployed.
popd
pause
exit /b 1
