@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title DuduAI V1.3 Preflight
set "WORK_DIR=%~dp0"
set "LOG_FILE=%TEMP%\DuduAI_V13_Check_Last.log"
set "CHECK_RESULT=1"

> "%LOG_FILE%" echo [INFO] DuduAI V1.3 local preflight
>>"%LOG_FILE%" echo [INFO] Folder: %WORK_DIR%
>>"%LOG_FILE%" echo [INFO] This tool never changes Cloudflare, D1, or license keys.
echo.
echo =============================================
echo  DuduAI V1.3 - Read-only Preflight
echo =============================================
echo Checking locally. Details will be saved to:
echo %LOG_FILE%
echo.
cd /d "%WORK_DIR%"
if errorlevel 1 goto missing_project
if not exist "package.json" goto missing_project
if not exist "scripts\preflight-v1.3.mjs" goto missing_project

where.exe node >nul 2>nul
if errorlevel 1 goto missing_node
where.exe npm >nul 2>nul
if errorlevel 1 goto missing_npm
>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [INFO] Node version
node --version >>"%LOG_FILE%" 2>&1

echo [1/3] Checking source syntax...
>>"%LOG_FILE%" echo [1/3] npm run check
call npm run check >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto command_failed

echo [2/3] Running local tests...
>>"%LOG_FILE%" echo [2/3] npm test
call npm test >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto command_failed

echo [3/3] Checking original keys and backup...
>>"%LOG_FILE%" echo [3/3] npm run deploy:preflight
call npm run deploy:preflight >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto backup_not_ready

set "CHECK_RESULT=0"
>>"%LOG_FILE%" echo [PASS] Local checks passed. Online and merchant acceptance are still required.
goto report

:missing_project
>>"%LOG_FILE%" echo [FAIL] Run this file INSIDE the license-service folder containing package.json.
>>"%LOG_FILE%" echo [INFO] Do not try to repair this by creating new license keys.
goto report

:missing_node
>>"%LOG_FILE%" echo [FAIL] Node.js not found in PATH. Use Node.js 22 or newer.
goto report

:missing_npm
>>"%LOG_FILE%" echo [FAIL] npm not found in PATH.
goto report

:command_failed
>>"%LOG_FILE%" echo [FAIL] A source check or test failed. Read the details above.
goto report

:backup_not_ready
>>"%LOG_FILE%" echo [NOT READY] Backup preflight is incomplete.
>>"%LOG_FILE%" echo [INFO] A downloaded GitHub ZIP has no original .private keys or D1 deployment records.
>>"%LOG_FILE%" echo [INFO] This is expected in a test-only copy. Do not generate replacement keys.
goto report

:report
echo.
echo =============================================
type "%LOG_FILE%"
echo =============================================
echo.
echo Log saved at:
echo %LOG_FILE%
echo.
echo Window will stay open. Type exit to close it.
echo No Cloudflare deployment, payment or refund was performed.
cmd.exe /d /k
exit /b %CHECK_RESULT%
