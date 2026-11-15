@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title DuduAI V1.3 Preflight
set "LOG_FILE=%TEMP%\DuduAI_V13_Check_Last.log"
set "CHECK_RESULT=1"
set "SERVICE_DIR="

>"%LOG_FILE%" echo [INFO] DuduAI V1.3 local read-only preflight
>>"%LOG_FILE%" echo [INFO] Launcher: %~f0
>>"%LOG_FILE%" echo [INFO] This tool does NOT modify Cloudflare, D1, keys, orders or refunds.

call :find_project "%~dp0"
if not defined SERVICE_DIR call :find_project "%USERPROFILE%\Downloads\"
if not defined SERVICE_DIR goto missing_project

>>"%LOG_FILE%" echo [INFO] Project folder: %SERVICE_DIR%
cd /d "%SERVICE_DIR%"
if errorlevel 1 goto missing_project

where.exe node >nul 2>nul
if errorlevel 1 goto missing_node
where.exe npm >nul 2>nul
if errorlevel 1 goto missing_npm

>>"%LOG_FILE%" echo [INFO] Node version:
node --version >>"%LOG_FILE%" 2>&1
>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [1/3] npm run check
call npm run check >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto command_failed

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [2/3] npm test
call npm test >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto command_failed

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [3/3] npm run deploy:preflight
call npm run deploy:preflight >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto backup_not_ready

set "CHECK_RESULT=0"
>>"%LOG_FILE%" echo [PASS] Local preflight passed. Online checks and merchant acceptance are still required.
goto report

:find_project
if defined SERVICE_DIR exit /b 0
set "SEARCH_ROOT=%~1"
call :try_service "%SEARCH_ROOT%"
call :try_service "%SEARCH_ROOT%license-service"
for /d %%D in ("%SEARCH_ROOT%ai-manju-workbench*") do (
  call :try_service "%%~fD\license-service"
  for /d %%E in ("%%~fD\*") do call :try_service "%%~fE\license-service"
)
exit /b 0

:try_service
if defined SERVICE_DIR exit /b 0
if exist "%~1\package.json" if exist "%~1\scripts\preflight-v1.3.mjs" set "SERVICE_DIR=%~1"
exit /b 0

:missing_project
>>"%LOG_FILE%" echo [FAIL] Could not find license-service\package.json and scripts\preflight-v1.3.mjs.
>>"%LOG_FILE%" echo [HINT] Unzip the GitHub ZIP. Keep the launcher in Downloads or put it directly inside license-service.
>>"%LOG_FILE%" echo [HINT] Automatic search covers Downloads and up to 2 levels of ai-manju-workbench* folders.
>>"%LOG_FILE%" echo [HINT] NEVER create new keys to fix a missing project folder.
goto report

:missing_node
>>"%LOG_FILE%" echo [FAIL] Node.js was not found. Install or enable Node.js 22+.
goto report

:missing_npm
>>"%LOG_FILE%" echo [FAIL] npm was not found.
goto report

:command_failed
>>"%LOG_FILE%" echo [FAIL] Source syntax check or automated tests failed. Check the details above.
goto report

:backup_not_ready
>>"%LOG_FILE%" echo [NOT READY] Original keys, D1 identity or backup are missing or invalid.
>>"%LOG_FILE%" echo [HINT] This is EXPECTED when testing a ZIP from GitHub without original .private files.
>>"%LOG_FILE%" echo [HINT] Do not generate replacement signing keys. Do not run production deployment.
goto report

:report
echo.
echo =============================================================
echo DuduAI V1.3 - Read-only Windows Validation
echo =============================================================
type "%LOG_FILE%"
echo =============================================================
echo.
echo Report saved to:
echo %LOG_FILE%
echo.
echo This window will stay open. Type exit when finished.
cmd.exe /d /k
exit /b %CHECK_RESULT%
