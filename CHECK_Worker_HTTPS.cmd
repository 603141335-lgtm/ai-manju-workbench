@echo off
setlocal EnableExtensions
chcp 65001 >nul
title DuduAI V1.3 Worker HTTPS network test
echo =========================================
echo  DuduAI - read-only Worker connectivity
 echo  No admin tokens, signing private keys or payments needed.
echo =========================================
set "URL=https://dudu-ai-license.dushuaishuai089.workers.dev/v1/license/attest"
echo [TARGET] %URL%
echo [1/2] Windows curl.exe GET (TLS verification enabled)
curl.exe --silent --show-error --output NUL --write-out "[CURL RESULT] HTTP %%{http_code}; duration %%{time_total}s\n" --connect-timeout 10 --max-time 25 "%URL%"
echo [CURL EXIT CODE] %ERRORLEVEL%
echo.
echo [2/2] Node.js HTTPS fetch GET (20 second maximum)
node.exe -e "fetch(process.argv[1],{signal:AbortSignal.timeout(20000),headers:{'user-agent':'DuduAI-ReleaseBuilder/1.3','accept':'application/json'}}).then(r=>{console.log('[NODE HTTP]',r.status);process.exitCode=r.ok?0:1}).catch(e=>{console.error('[NODE ERROR]',e.cause&&e.cause.code||e.name||'network-error');process.exitCode=1})" "%URL%"
echo [NODE EXIT CODE] %ERRORLEVEL%
echo.
echo HTTP 200 = endpoint reachable; build still verifies a FRESH Ed25519 proof.
echo CURL 6 = DNS; 28 = timeout; 60 = TLS trust error.
echo If curl=200 but Node fails, try V8 release builder curl fallback.
echo If both fail, check Worker route / network / proxy settings first.
echo.
pause
