@echo off
setlocal
cd /d "%~dp0"
echo ===============================================
echo 独独AI V1.3 本机隔离测试环境
echo 不连接远程 D1，不部署 Cloudflare Worker
echo 不调用微信/支付宝，不发生真实扣款或退款
echo ===============================================
if not exist "node_modules\wrangler" (
  echo 请先在当前目录运行 npm ci
  pause
  exit /b 1
)
npm run test:env
echo.
echo 本机测试服务已退出。
pause
