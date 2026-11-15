@echo off
setlocal
cd /d "%~dp0"
title 独独AI V1.3 本机隔离测试环境
echo ===============================================
echo 独独AI V1.3 本机隔离测试环境
echo 不连接远程 D1，不部署 Cloudflare Worker
echo 不调用微信/支付宝，不发生真实扣款或退款
echo ===============================================
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 goto old_node
if not exist "node_modules\wrangler" (
  echo.
  echo [1/3] 首次运行，正在自动安装项目依赖，请稍候...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo.
echo [2/3] 检查启动代码...
call npm run check
if errorlevel 1 goto failed
echo.
echo [3/3] 启动本机测试 Worker...
call npm run test:env
if errorlevel 1 goto failed
echo.
echo 本机测试服务已退出。
goto finish

:missing_node
echo.
echo 未检测到 Node.js。请先安装 Node.js 22 LTS x64，然后重新双击本文件。
goto failed

:old_node
echo.
echo 当前 Node.js 版本过低。此测试环境要求 Node.js 22 或更高版本。
node -v
goto failed

:failed
echo.
echo ===============================================
echo 启动失败，窗口将保持打开。
echo 请截图或复制上方完整错误信息发给开发人员。
echo ===============================================
pause
exit /b 1

:finish
echo.
echo 按任意键关闭窗口。
pause
